import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DEFAULT_SESSIONS_ROOT = path.join(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents/main/sessions');

// Resolve a Node binary that satisfies the openclaw CLI's minimum version
// (currently >=22.12). This is cached on first call. The box happens to
// ship with /usr/bin/node pointing at Node 24 (nodesource), but Cursor's
// bundled Node 20 lives earlier on PATH, so `#!/usr/bin/env node` inside
// the CLI shebang ends up picking 20 and the CLI immediately bails with
// "Node.js v22.12+ is required". We sidestep this by invoking the CLI
// script explicitly with a Node >=22 binary we resolved ourselves.
let _openclawRuntimeCache = null;
function resolveOpenclawRuntime() {
    if (_openclawRuntimeCache) return _openclawRuntimeCache;

    const nodeCandidates = [
        process.env.OPENCLAW_NODE_BIN,
        '/usr/bin/node',
        '/usr/local/bin/node'
    ].filter(Boolean);

    let nodeBin = null;
    let nodeVersion = null;
    for (const candidate of nodeCandidates) {
        try {
            const out = execSync(`${candidate} --version`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            const major = parseInt(String(out).replace(/^v/, '').split('.')[0], 10);
            if (Number.isFinite(major) && major >= 22) {
                nodeBin = candidate;
                nodeVersion = out;
                break;
            }
        } catch (_) {
            // candidate missing or not executable; try next
        }
    }

    const cliCandidates = [
        process.env.OPENCLAW_CLI_SCRIPT,
        '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/openclaw.mjs'
    ].filter(Boolean);
    let cliScript = null;
    for (const candidate of cliCandidates) {
        try {
            if (fs.existsSync(candidate)) {
                cliScript = candidate;
                break;
            }
        } catch (_) { /* ignore */ }
    }

    _openclawRuntimeCache = { nodeBin, nodeVersion, cliScript };
    logOpenclawCli('runtime_resolved', {
        nodeBin,
        nodeVersion,
        cliScript,
        fallbackToPath: !(nodeBin && cliScript)
    });
    return _openclawRuntimeCache;
}

/** One-line log helper for openclaw CLI (no secrets; truncate). */
function clip(s, max = 600) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .slice(0, max);
}

function logOpenclawCli(phase, payload) {
    console.log('[TelegramService][openclaw]', phase, JSON.stringify(payload));
}

export const telegramEvents = new EventEmitter();

// In-memory message store for Phase 3.1 (Buffer per chat)
const messageBuffer = new Map();
const MAX_BUFFER_SIZE = 500;

// Track processed message IDs to prevent duplicates from file replays
const processedMessageIds = new Set();
const MAX_PROCESSED_IDS = 2000; // Prevent unbounded growth

/** Maps OpenClaw session file UUID → canonical Telegram group id (numeric string). */
const sessionToCanonicalChat = new Map();

/**
 * From OpenClaw `sessions.json`: session UUID → Telegram group id (from key agent:main:telegram:group:<id>).
 * Fills gaps when JSONL lines are webchat/UI-only and never embed `Conversation info` + chat_id.
 */
const sessionUuidToTelegramGroupId = new Map();

/** Telegram group id (string) → absolute path to canonical `sessionFile` (current OpenClaw transcript). */
const telegramGroupIdToSessionFile = new Map();

/** Previous sessionFile per group — detect rebind and refresh buffer. */
let previousGroupIdToSessionFile = new Map();

const DEFAULT_SESSIONS_JSON = () => path.join(DEFAULT_SESSIONS_ROOT, 'sessions.json');

/**
 * Re-read OpenClaw session index so gateway lines can resolve group id without per-line metadata.
 * Also tracks canonical sessionFile per Telegram group (OpenClaw UI parity).
 *
 * Called once at startup and then only from the sessions.json chokidar watcher,
 * so no internal rate-limiting is needed here.
 */
function hydrateOpenclawSessionIndex() {
    const sessionsPath = process.env.OPENCLAW_SESSIONS_JSON_PATH || DEFAULT_SESSIONS_JSON();
    try {
        if (!fs.existsSync(sessionsPath)) {
            console.warn(`[TelegramService] sessions.json not found at ${sessionsPath} (set OPENCLAW_SESSIONS_JSON_PATH if non-default).`);
            return;
        }
        const raw = fs.readFileSync(sessionsPath, 'utf8');
        const parsed = JSON.parse(raw);
        let n = 0;
        sessionUuidToTelegramGroupId.clear();
        telegramGroupIdToSessionFile.clear();

        const nextGroupFile = new Map();
        for (const [sessionKey, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const m = sessionKey.match(/^agent:main:telegram:group:(-?\d+)$/);
            if (!m) continue;
            const gid = m[1];
            const sid = entry.sessionId;
            if (sid && typeof sid === 'string') {
                sessionUuidToTelegramGroupId.set(sid.toLowerCase(), gid);
                n++;
            }
            if (entry.sessionFile && typeof entry.sessionFile === 'string') {
                const abs = path.resolve(entry.sessionFile);
                nextGroupFile.set(gid, abs);
                telegramGroupIdToSessionFile.set(gid, abs);
            }
        }

        for (const [gid, newPath] of nextGroupFile) {
            const oldPath = previousGroupIdToSessionFile.get(gid);
            if (oldPath !== undefined && oldPath !== newPath) {
                console.log(`[TelegramService] Session file rebind for group ${gid}: ${oldPath} → ${newPath}`);
                replaceBufferFromSessionFile(gid, newPath);
                telegramEvents.emit('sessionRebound', { chatId: gid, sessionFile: newPath });
            }
        }
        previousGroupIdToSessionFile = nextGroupFile;

        console.log(
            `[TelegramService] Hydrated OpenClaw session index: ${n} session UUIDs, ${telegramGroupIdToSessionFile.size} sessionFile paths (${sessionsPath}).`
        );
    } catch (e) {
        console.warn('[TelegramService] Failed to hydrate sessions.json:', e.message);
    }
}

/**
 * Replace in-memory backlog for a group from the canonical session JSONL (same file OpenClaw UI uses).
 */
function replaceBufferFromSessionFile(groupId, sessionFilePath) {
    const key = normalizeChatIdForBuffer(String(groupId));
    if (!sessionFilePath || !fs.existsSync(sessionFilePath)) {
        messageBuffer.set(key, []);
        return;
    }
    const msgs = loadMessageHistoryFromSessionJsonl(sessionFilePath, key);
    messageBuffer.set(key, msgs);
}

/**
 * Parse message lines from a session JSONL into UI message objects (fixed group; no per-line routing).
 */
function loadMessageHistoryFromSessionJsonl(sessionFilePath, _chatIdKey, maxLines = 800) {
    try {
        const raw = fs.readFileSync(sessionFilePath, 'utf8');
        const lines = raw.split('\n').filter((l) => l.trim() !== '');
        const slice = lines.slice(-maxLines);
        const out = [];
        for (const line of slice) {
            try {
                const parsed = JSON.parse(line);
                const msgObj = buildMsgObjFromGatewayLine(parsed);
                if (msgObj && !out.find((m) => m.id === msgObj.id)) out.push(msgObj);
            } catch {
                /* skip bad line */
            }
        }
        out.sort((a, b) => a.date - b.date);
        if (out.length > MAX_BUFFER_SIZE) return out.slice(-MAX_BUFFER_SIZE);
        return out;
    } catch (e) {
        console.warn(`[TelegramService] Could not read session file ${sessionFilePath}:`, e.message);
        return [];
    }
}

/**
 * Flatten a single OpenClaw content block into a plain string, for the
 * collapsed text payload of a tool result bubble. The gateway sometimes
 * nests the actual output under `content[]` (text blocks only for now).
 */
function flattenToolResultContent(block) {
    if (!block) return '';
    if (typeof block.content === 'string') return block.content;
    if (Array.isArray(block.content)) {
        return block.content
            .map((inner) => {
                if (inner?.type === 'text' && typeof inner.text === 'string') return inner.text;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (typeof block.text === 'string') return block.text;
    return '';
}

function buildMsgObjFromGatewayLine(parsed) {
    if (!parsed || parsed.type !== 'message' || !parsed.message) return null;
    const data = parsed;
    const role = data.message.role;
    const contentBlocks = data.message.content || [];
    let text = '';
    const toolCalls = [];
    const toolResults = [];
    contentBlocks.forEach((b) => {
        if (b.type === 'text') {
            text += b.text + '\n';
        } else if (b.type === 'toolCall') {
            // Different gateway builds have shipped the args under
            // different keys; accept all of them and normalize to
            // `input` for the frontend. Real data today uses
            // `arguments` (`{"command": "..."}`).
            toolCalls.push({
                id: b.id || null,
                name: b.name || 'tool',
                input: b.input ?? b.arguments ?? b.args ?? null
            });
        } else if (b.type === 'toolResult') {
            toolResults.push({
                id: b.id || null,
                toolUseId: b.toolUseId || null,
                toolName: b.toolName || 'tool',
                output: flattenToolResultContent(b),
                isError: b.isError === true
            });
        }
    });
    text = text.trim();
    // A message with neither plain text nor any structured tool blocks
    // has nothing to render — drop it.
    if (!text && toolCalls.length === 0 && toolResults.length === 0) return null;
    return {
        id: data.id || `gen_${Math.random()}`,
        text,
        toolCalls,
        toolResults,
        sender: role === 'assistant' ? 'TARS (Engine)' : role === 'toolResult' ? 'System (Tool)' : 'User (Telegram)',
        senderId: role,
        senderRole: role,
        date: Math.floor(new Date(data.timestamp || Date.now()).getTime() / 1000),
        isBot: role === 'assistant' || role === 'toolResult',
        metrics: data.message.usage || null,
        model: data.message.model || ''
    };
}

/**
 * Variant A: re-resolve canonical sessionFile from sessions.json and refill buffer (call on each SSE connect).
 */
export function refreshChatMirrorFromCanonicalSession(chatId) {
    // The chokidar watcher on sessions.json keeps telegramGroupIdToSessionFile
    // current, so we no longer hydrate from disk on every SSE connect.
    const key = normalizeChatIdForBuffer(String(chatId));
    const sessionFile = telegramGroupIdToSessionFile.get(key);
    if (!sessionFile) {
        return;
    }
    replaceBufferFromSessionFile(key, sessionFile);
}

export function resolveCanonicalSession(chatId) {
    // Index is kept current by the sessions.json chokidar watcher; the
    // explicit per-call hydrate was a CPU hotspot when many routes chained
    // through here (e.g. every POST /send).
    let key = normalizeChatIdForBuffer(String(chatId));
    let inputSessionId = null;
    
    // Check if chatId is a UUID (session ID) - if so, resolve to Telegram group ID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(key)) {
        inputSessionId = key.toLowerCase();
        const telegramGroupId = sessionUuidToTelegramGroupId.get(inputSessionId);
        if (telegramGroupId) {
            key = telegramGroupId;
        }
    }
    
    const sessionFile = telegramGroupIdToSessionFile.get(key) || null;

    let sessionKey = null;
    let sessionId = inputSessionId; // Use the input UUID if it was a session ID
    let deliveryContext = null;
    const sessionsPath = process.env.OPENCLAW_SESSIONS_JSON_PATH || DEFAULT_SESSIONS_JSON();

    try {
        if (fs.existsSync(sessionsPath)) {
            const parsed = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
            const wantedKey = `agent:main:telegram:group:${key}`;
            const entry = parsed[wantedKey];
            if (entry) {
                sessionKey = wantedKey;
                sessionId = entry.sessionId || null;
                deliveryContext = entry.deliveryContext || null;
            }
        }
    } catch (e) {
        console.warn('[TelegramService] resolveCanonicalSession failed:', e.message);
    }

    return {
        chatId: key,
        sessionKey,
        sessionId,
        sessionFile,
        deliveryContext
    };
}

/** UI / legacy aliases → canonical Telegram chat id (same numeric id as openclaw --to). */
const CHAT_ID_ALIASES = new Map([
    ['TTG000_General_Chat', '-1003752539559'],
    ['TG000_General_Chat', '-1003752539559'],
    ['TSG003_General_Chat', '-1003752539559'],
    ['tg000_general_chat', '-1003752539559']
]);

/**
 * Loads `name` → `id` from channel_config.json so labels (e.g. TTG001_Idea_Capture) map to the
 * real group id in this install — never a stale hardcoded id.
 */
function hydrateChannelAliasesFromDiskSync() {
    // Only the WORKSPACE_ROOT-relative path is supported. The old
    // process.cwd()-relative fallback silently picked up whichever
    // channel_config.json happened to sit at "../../Prototyp/..." and
    // produced confusing "hydrated 0 aliases" logs whenever the backend
    // was started from a different directory.
    if (!process.env.WORKSPACE_ROOT) {
        console.warn('[TelegramService] WORKSPACE_ROOT is not set; skipping channel alias hydration.');
        return;
    }
    const configPath = path.join(
        process.env.WORKSPACE_ROOT,
        'OpenClaw_Control_Center',
        'Prototyp',
        'channel_CHAT-manager',
        'channel_config.json'
    );
    try {
        if (!fs.existsSync(configPath)) {
            console.warn(`[TelegramService] No channel_config.json at ${configPath}; label→id may be incomplete.`);
            return;
        }
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        let n = 0;
        for (const c of parsed.channels || []) {
            if (c?.id == null || !c?.name) continue;
            const id = String(c.id).trim();
            const name = String(c.name).trim();
            CHAT_ID_ALIASES.set(name, id);
            CHAT_ID_ALIASES.set(name.toLowerCase(), id);
            n++;
        }
        console.log(`[TelegramService] Hydrated ${n} channel id aliases from ${configPath}`);
    } catch (e) {
        console.warn(`[TelegramService] Could not hydrate aliases from ${configPath}:`, e.message);
    }
}

/**
 * Single storage key per Telegram group so SSE and buffers stay consistent.
 * Exported for the telegram route (SSE backlog + live) to match the same key.
 */
export function normalizeChatIdForBuffer(chatId) {
    const s = String(chatId ?? '').trim();
    if (!s) return s;
    return CHAT_ID_ALIASES.get(s) || s;
}

function extractSessionUuidFromPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;
    const m = filePath.match(/[/\\]sessions[/\\]([a-f0-9-]{36})\.jsonl$/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Reads Telegram group id from OpenClaw user envelope (Conversation info JSON).
 */
function extractTelegramGroupIdFromUserPayload(data) {
    const role = data.message?.role;
    if (role !== 'user') return null;
    const blocks = data.message.content || [];
    let fullText = '';
    for (const b of blocks) {
        if (b.type === 'text' && b.text) fullText += b.text;
    }
    const jsonMatch = fullText.match(/Conversation info \(untrusted metadata\):\s*```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return null;
    try {
        const meta = JSON.parse(jsonMatch[1]);
        if (meta.chat_id != null && String(meta.chat_id).trim() !== '') {
            return String(meta.chat_id).trim();
        }
        const label = meta.conversation_label;
        if (typeof label === 'string') {
            const idMatch = label.match(/\bid:(-?\d+)/);
            if (idMatch) return idMatch[1];
        }
    } catch {
        return null;
    }
    return null;
}

// Track file sizes to only read new lines on each chokidar change event.
const fileOffsets = new Map();

// ==========================================================================
// Chokidar-based session-file watching (Gateway-First, scoped)
// ==========================================================================
// Watch only the canonical session files currently bound to a Telegram
// group (plus sessions.json itself). This replaces the former 2s / 5s
// polling loops that drove measurable CPU and fan noise while idle — the
// two setInterval loops were doing readdirSync + statSync on every tick.

const watchedSessionFiles = new Set();
let sessionFilesWatcher = null;
let sessionsJsonWatcher = null;

/**
 * Lazily create the single chokidar instance we use for canonical session
 * transcripts. The set of watched paths is managed by
 * `reconcileWatchedSessionFiles` based on the current group → sessionFile
 * index (so we never watch orphan files).
 */
function ensureSessionFilesWatcher() {
    if (sessionFilesWatcher) return sessionFilesWatcher;
    sessionFilesWatcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
        alwaysStat: false
    });
    sessionFilesWatcher.on('add', handleSessionFileAppend);
    sessionFilesWatcher.on('change', handleSessionFileAppend);
    sessionFilesWatcher.on('unlink', (filePath) => {
        watchedSessionFiles.delete(filePath);
        fileOffsets.delete(filePath);
    });
    sessionFilesWatcher.on('error', (err) => {
        console.warn('[TelegramService] session files watcher error:', err.message);
    });
    return sessionFilesWatcher;
}

/**
 * Diff the currently-watched session files against
 * `telegramGroupIdToSessionFile`; add/seed newly-bound files and stop
 * watching files that are no longer referenced by any group.
 */
function reconcileWatchedSessionFiles() {
    const watcher = ensureSessionFilesWatcher();

    const nextSet = new Set();
    for (const filePath of telegramGroupIdToSessionFile.values()) {
        if (filePath && typeof filePath === 'string') nextSet.add(filePath);
    }

    for (const filePath of nextSet) {
        if (watchedSessionFiles.has(filePath)) continue;
        watchedSessionFiles.add(filePath);
        watcher.add(filePath);
        seedSessionFileBuffer(filePath);
    }

    for (const filePath of Array.from(watchedSessionFiles)) {
        if (nextSet.has(filePath)) continue;
        watchedSessionFiles.delete(filePath);
        try {
            watcher.unwatch(filePath);
        } catch {
            /* best effort — chokidar may have already detached */
        }
        fileOffsets.delete(filePath);
    }
}

/**
 * Seed fileOffsets and replay the tail of a session JSONL so the
 * in-memory buffer has recent history for this group on first watch.
 * Matches the behaviour the old poller used on its "new file" path.
 */
function seedSessionFileBuffer(filePath, tailLines = 200) {
    try {
        if (!fs.existsSync(filePath)) {
            fileOffsets.set(filePath, 0);
            return;
        }
        const stat = fs.statSync(filePath);
        fileOffsets.set(filePath, stat.size);

        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw.split('\n').filter((l) => l.trim() !== '');
        const recent = lines.slice(-tailLines);
        for (const line of recent) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message' && parsed.message) {
                    processGatewayMessage(parsed, true, filePath);
                }
            } catch {
                /* skip bad line */
            }
        }
    } catch (err) {
        console.warn(`[TelegramService] seedSessionFileBuffer failed for ${filePath}:`, err.message);
    }
}

/**
 * Chokidar change/add handler: read only the bytes appended since the
 * last offset, parse complete lines, leave a trailing partial line for
 * the next event. This keeps CPU proportional to actual writes rather
 * than to the polling interval.
 */
function handleSessionFileAppend(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            fileOffsets.delete(filePath);
            return;
        }
        const stat = fs.statSync(filePath);
        const prevOffset = fileOffsets.get(filePath) ?? 0;

        if (stat.size < prevOffset) {
            // File was truncated or rotated — reset and re-seed from tail.
            fileOffsets.set(filePath, 0);
            seedSessionFileBuffer(filePath);
            return;
        }
        if (stat.size === prevOffset) return;

        const delta = stat.size - prevOffset;
        const buf = Buffer.alloc(delta);
        const fd = fs.openSync(filePath, 'r');
        try {
            fs.readSync(fd, buf, 0, delta, prevOffset);
        } finally {
            fs.closeSync(fd);
        }

        const chunk = buf.toString('utf8');
        const lastNewline = chunk.lastIndexOf('\n');
        if (lastNewline < 0) {
            // No complete line yet — wait for more bytes before advancing.
            return;
        }

        const processable = chunk.slice(0, lastNewline);
        // Advance the offset by the UTF-8 byte length of the complete
        // lines plus the terminating \n. Partial trailing bytes stay
        // unread and will be consumed on the next change event.
        const consumedBytes = Buffer.byteLength(processable, 'utf8') + 1;
        fileOffsets.set(filePath, prevOffset + consumedBytes);

        const lines = processable.split('\n').filter((l) => l.trim() !== '');
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message' && parsed.message) {
                    processGatewayMessage(parsed, false, filePath);
                }
            } catch {
                /* skip bad line */
            }
        }
    } catch (err) {
        console.warn(`[TelegramService] handleSessionFileAppend failed for ${filePath}:`, err.message);
    }
}

export const initTelegramService = () => {
    hydrateChannelAliasesFromDiskSync();

    try {
        // ==========================================
        // PHASE 7: Gateway-First filesystem bridge (chokidar, scoped)
        // ==========================================
        // Two previous setInterval loops (5s on sessions.json, 2s on the
        // sessions directory) did readdirSync + statSync on every tick,
        // driving CPU and fan noise while idle. We now watch only:
        //   - sessions.json (to rebuild the group → sessionFile index)
        //   - each canonical sessionFile actually bound to a group.
        const agentsDir = path.resolve(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents');
        const sessionsJsonPath = process.env.OPENCLAW_SESSIONS_JSON_PATH || path.join(agentsDir, 'main/sessions/sessions.json');

        // Hydrate the group → sessionFile index up front, then attach
        // chokidar to the canonical files it references.
        hydrateOpenclawSessionIndex();
        reconcileWatchedSessionFiles();

        // Watcher on sessions.json → re-hydrate + reconcile on change.
        // Coalesce bursts with a 200ms debounce because the gateway
        // sometimes rewrites the file multiple times in quick succession.
        let sessionsJsonDebounce = null;
        const scheduleSessionsJsonRehydrate = () => {
            if (sessionsJsonDebounce) return;
            sessionsJsonDebounce = setTimeout(() => {
                sessionsJsonDebounce = null;
                hydrateOpenclawSessionIndex();
                reconcileWatchedSessionFiles();
            }, 200);
        };

        sessionsJsonWatcher = chokidar.watch(sessionsJsonPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
        });
        sessionsJsonWatcher.on('add', scheduleSessionsJsonRehydrate);
        sessionsJsonWatcher.on('change', scheduleSessionsJsonRehydrate);
        sessionsJsonWatcher.on('error', (err) => {
            console.warn('[TelegramService] sessions.json watcher error:', err.message);
        });

        console.log(
            `[TelegramService] Watching ${sessionsJsonPath} plus ${watchedSessionFiles.size} canonical session file(s).`
        );
        console.log('[TelegramService] Phase 7 Gateway Listener active. Bridging session transcripts to React SSE.');

    } catch (err) {
        console.error('[TelegramService] Initialization failed:', err.message);
    }
};

const processGatewayMessage = (data, isInit = false, filePath = '') => {
    const msgObj = buildMsgObjFromGatewayLine(data);
    if (!msgObj) return;

    // Deduplication: Skip if we've already processed this exact message ID
    if (processedMessageIds.has(msgObj.id)) {
        return;
    }
    
    // Add to processed set and maintain size limit
    processedMessageIds.add(msgObj.id);
    if (processedMessageIds.size > MAX_PROCESSED_IDS) {
        // Remove oldest entries (simple approach: clear and start fresh if too large)
        const entriesToKeep = Array.from(processedMessageIds).slice(-MAX_PROCESSED_IDS / 2);
        processedMessageIds.clear();
        entriesToKeep.forEach(id => processedMessageIds.add(id));
    }

    const sessionUuid = extractSessionUuidFromPath(filePath);
    let telegramFromUser = extractTelegramGroupIdFromUserPayload(data);
    if (telegramFromUser) {
        telegramFromUser = normalizeChatIdForBuffer(telegramFromUser);
        if (sessionUuid) sessionToCanonicalChat.set(sessionUuid, telegramFromUser);
    }

    let canonicalChatId = null;
    if (telegramFromUser) {
        canonicalChatId = telegramFromUser;
    } else if (sessionUuid && sessionToCanonicalChat.has(sessionUuid)) {
        canonicalChatId = sessionToCanonicalChat.get(sessionUuid);
    } else if (sessionUuid && sessionUuidToTelegramGroupId.has(sessionUuid)) {
        canonicalChatId = normalizeChatIdForBuffer(sessionUuidToTelegramGroupId.get(sessionUuid));
        sessionToCanonicalChat.set(sessionUuid, canonicalChatId);
    }

    // No Telegram routing for this line (e.g. IDE-only session) → do not mirror into any channel buffer.
    if (!canonicalChatId) {
        return;
    }

    /** Only ingest lines from the canonical sessionFile for this group (same as OpenClaw Control UI). */
    const expectedFile = telegramGroupIdToSessionFile.get(canonicalChatId);
    if (expectedFile && filePath) {
        try {
            if (path.resolve(filePath) !== path.resolve(expectedFile)) {
                return;
            }
        } catch {
            return;
        }
    }

    const chatId = canonicalChatId;
    if (!messageBuffer.has(chatId)) messageBuffer.set(chatId, []);
    const chatBuffer = messageBuffer.get(chatId);

    // Double-check deduplication within buffer
    if (!chatBuffer.find(m => m.id === msgObj.id)) {
        chatBuffer.push(msgObj);
        chatBuffer.sort((a,b) => a.date - b.date);
        if (chatBuffer.length > MAX_BUFFER_SIZE) {
            chatBuffer.splice(0, chatBuffer.length - MAX_BUFFER_SIZE);
        }

        if (!isInit) {
            telegramEvents.emit('newMessage', { chatId, message: msgObj });
        }
    }
};

export const getMessagesForChat = (chatId) => {
    const key = normalizeChatIdForBuffer(chatId.toString());
    return messageBuffer.get(key) || [];
};

export const sendMessageToChat = async (chatId, text) => {
    const requestStartedAt = Date.now();
    const canonical = resolveCanonicalSession(chatId);
    const realChatId = canonical.chatId;

    logOpenclawCli('inject_start', {
        rawChatId: String(chatId),
        realChatId: String(realChatId),
        sessionKey: canonical.sessionKey,
        sessionId: canonical.sessionId,
        textLen: String(text).length,
        requestStartedAt
    });

    if (!text || !text.trim()) {
        logOpenclawCli('inject_skip', { reason: 'empty_message', realChatId: String(realChatId) });
        return { message_id: `ui-empty-${Date.now()}`, transport: 'noop', timing: { totalMs: Date.now() - requestStartedAt } };
    }

    // Gateway send via openclaw CLI. There used to be an HTTP "fast path"
    // against the Gateway's /api/v1/sessions/:id/send endpoint, but in
    // practice the endpoint was never deployed on this machine, every
    // send fell straight into the CLI branch anyway, and the extra
    // try/catch added ~5s of HTTP timeout to every failed attempt.
    // Removed in Bundle A/P3.
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const runtime = resolveOpenclawRuntime();
    // Build the CLI invocation. When we have an explicit Node >=22 binary
    // and the resolved CLI script, invoke them directly so the shebang's
    // `env node` doesn't get stuck on Cursor's bundled Node 20. Otherwise
    // fall back to the PATH-based invocation (pre-fix behavior) so this
    // doesn't hard-fail on unfamiliar machines.
    const useExplicitRuntime = Boolean(runtime.nodeBin && runtime.cliScript);
    const invocation = useExplicitRuntime
        ? `"${runtime.nodeBin}" "${runtime.cliScript}"`
        : 'openclaw';
    const pathAugmentation = useExplicitRuntime
        ? ''
        : 'export PATH=$PATH:/home/claw-agentbox/.npm-global/bin && ';

    let cmd = null;
    let transport = null;
    let logPath = null;

    if (canonical.sessionId) {
        transport = 'session-native-cli';
        logPath = `/tmp/openclaw-cm-send-${canonical.sessionId}.log`;
        cmd = `${pathAugmentation}nohup ${invocation} agent --session-id "${canonical.sessionId}" --message "${safeText}" --json >${logPath} 2>&1 & echo $!`;
    } else {
        transport = 'legacy-telegram-deliver';
        logPath = `/tmp/openclaw-cm-send-${realChatId}.log`;
        cmd = `${pathAugmentation}nohup ${invocation} agent --channel telegram --to "${realChatId}" --message "${safeText}" --deliver >${logPath} 2>&1 & echo $!`;
    }

    try {
        const spawnStartedAt = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
        const ackedAt = Date.now();
        const spawnedPid = String(stdout || '').trim().split('\n').pop()?.trim() || null;

        logOpenclawCli('inject_spawned', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            spawnedPid,
            nodeBin: runtime.nodeBin,
            nodeVersion: runtime.nodeVersion,
            stderrPreview: clip(stderr, 400),
            timing: {
                spawnExecMs: ackedAt - spawnStartedAt,
                totalAckMs: ackedAt - requestStartedAt
            }
        });

        // The shebang-based invocation used to die asynchronously with
        // "Node.js v22.12+ is required" inside the redirected log file,
        // while we kept returning a clean 200. Peek at the log shortly
        // after spawn so any future startup failure is surfaced. This
        // runs async and never blocks the ack.
        setTimeout(() => {
            try {
                if (!logPath || !fs.existsSync(logPath)) return;
                const snapshot = fs.readFileSync(logPath, 'utf8');
                if (/Node\.js v\d+\.\d+\+? is required|Cannot find module|Error: |TypeError: |SyntaxError: /i.test(snapshot)) {
                    logOpenclawCli('inject_cli_startup_error', {
                        transport,
                        sessionId: canonical.sessionId,
                        spawnedPid,
                        logPath,
                        excerpt: clip(snapshot, 500)
                    });
                }
            } catch (_) { /* best-effort */ }
        }, 300);

        return {
            message_id: `${transport}-${ackedAt}`,
            transport,
            sessionKey: canonical.sessionKey,
            sessionId: canonical.sessionId,
            sessionFile: canonical.sessionFile,
            spawnedPid,
            timing: {
                totalAckMs: ackedAt - requestStartedAt,
                spawnExecMs: ackedAt - spawnStartedAt
            }
        };
    } catch (err) {
        logOpenclawCli('inject_err', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            message: clip(err?.message, 400),
            stderrPreview: clip(err?.stderr, 400),
            stdoutPreview: clip(err?.stdout, 400)
        });
        console.error('[TelegramService] openclaw agent failed to spawn:', err.message);
        const fail = new Error(
            `OpenClaw CLI spawn failed for chat ${realChatId} via ${transport}: ${clip(err?.message, 200)}`
        );
        fail.status = 502;
        fail.cause = err;
        throw fail;
    }
};

