import { Telegraf } from 'telegraf';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scanHistory } from './historyScanner.mjs';

const execAsync = promisify(exec);
const DEFAULT_SESSIONS_ROOT = path.join(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents/main/sessions');

// Performance optimization: HTTP-based session send instead of CLI spawn
// This eliminates per-message process spawn overhead (~500-2000ms)
const GATEWAY_BASE_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:8080';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;

// Rate limiting for hydrateOpenclawSessionIndex to reduce CPU load
let lastHydrateTime = 0;
const HYDRATE_DEBOUNCE_MS = 2000; // Max once every 2 seconds
let pendingHydrate = false;

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
 * Rate-limited to reduce CPU load from frequent calls.
 */
function hydrateOpenclawSessionIndex(force = false) {
    const now = Date.now();
    
    // Rate limiting: skip if called too recently (unless forced)
    if (!force && now - lastHydrateTime < HYDRATE_DEBOUNCE_MS) {
        if (!pendingHydrate) {
            pendingHydrate = true;
            setTimeout(() => {
                pendingHydrate = false;
                hydrateOpenclawSessionIndex(true);
            }, HYDRATE_DEBOUNCE_MS - (now - lastHydrateTime));
        }
        return;
    }
    
    lastHydrateTime = now;
    pendingHydrate = false;
    
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

function buildMsgObjFromGatewayLine(parsed) {
    if (!parsed || parsed.type !== 'message' || !parsed.message) return null;
    const data = parsed;
    const role = data.message.role;
    const contentBlocks = data.message.content || [];
    let text = '';
    contentBlocks.forEach((b) => {
        if (b.type === 'text') {
            text += b.text + '\n';
        } else if (b.type === 'toolCall') {
            text += `⚙️ [Tool Call: ${b.name}]\n`;
        } else if (b.type === 'toolResult') {
            text += `✅ [Tool Result: ${b.toolName}]\n`;
        }
    });
    text = text.trim();
    if (!text) return null;
    return {
        id: data.id || `gen_${Math.random()}`,
        text,
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
    hydrateOpenclawSessionIndex();
    const key = normalizeChatIdForBuffer(String(chatId));
    const sessionFile = telegramGroupIdToSessionFile.get(key);
    if (!sessionFile) {
        return;
    }
    replaceBufferFromSessionFile(key, sessionFile);
}

export function resolveCanonicalSession(chatId) {
    hydrateOpenclawSessionIndex();
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
    ['tg000_general_chat', '-1003752539559'],
    ['-3736210177', '-1003752539559']
]);

/**
 * Loads `name` → `id` from channel_config.json so labels (e.g. TTG001_Idea_Capture) map to the
 * real group id in this install — never a stale hardcoded id.
 */
function hydrateChannelAliasesFromDiskSync() {
    const tryPaths = [];
    if (process.env.WORKSPACE_ROOT) {
        tryPaths.push(
            path.join(process.env.WORKSPACE_ROOT, 'OpenClaw_Control_Center', 'Prototyp', 'channel_CHAT-manager', 'channel_config.json')
        );
    }
    tryPaths.push(path.join(process.cwd(), '..', '..', 'Prototyp', 'channel_CHAT-manager', 'channel_config.json'));

    for (const configPath of tryPaths) {
        try {
            if (!fs.existsSync(configPath)) continue;
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
            return;
        } catch (e) {
            console.warn(`[TelegramService] Could not hydrate aliases from ${configPath}:`, e.message);
        }
    }
    console.warn('[TelegramService] No channel_config.json found for alias hydration; label→id may be incomplete.');
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

let bot = null;         // TARS (Inbound)
let relayBot = null;    // CASE / Shedly (Outbound)

// Track file sizes to only read new lines
const fileOffsets = new Map();

export const initTelegramService = () => {
    hydrateChannelAliasesFromDiskSync();
    hydrateOpenclawSessionIndex();

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const relayToken = process.env.RELAY_BOT_TOKEN || process.env.SHEDLY_BOT_TOKEN;

    if (!token) {
        console.warn('[TelegramService] TELEGRAM_BOT_TOKEN not found in .env.');
    }
    
    if (!relayToken) {
        console.warn('[TelegramService] RELAY_BOT_TOKEN not found in .env. Cannot send answers!');
    } else {
        // relayBot = new Telegraf(relayToken); (Mirroring disabled to prevent Bot-on-Bot noise)
    }

    // Load historical messages from Markdown transcripts
    scanHistory().then(historyMap => {
        console.log(`[TelegramService] Hydrated history for ${historyMap.size} chats.`);
        for (const [chatId, messages] of historyMap) {
            const key = normalizeChatIdForBuffer(chatId);
            if (!messageBuffer.has(key)) {
                messageBuffer.set(key, messages);
            } else {
                const existing = messageBuffer.get(key);
                const merged = [...messages, ...existing].sort((a,b) => a.date - b.date);
                messageBuffer.set(key, merged.slice(-MAX_BUFFER_SIZE));
            }
        }
    });

    try {
        if (token) {
            // bot = new Telegraf(token);
            // NOTE: bot.launch() is INTENTIONALLY REMOVED to satisfy Phase 7 (Gateway-First)
        }

        // ==========================================
        // PHASE 7: Gateway-First Filesystem Bridge
        // ==========================================
        const agentsDir = path.resolve(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents');
        const sessionsJsonPath = process.env.OPENCLAW_SESSIONS_JSON_PATH || path.join(agentsDir, 'main/sessions/sessions.json');

        // Poll sessions.json for changes (Chokidar causes EBADF)
        let lastSessionsJsonMtime = 0;
        const pollSessionsJson = () => {
            try {
                if (fs.existsSync(sessionsJsonPath)) {
                    const stat = fs.statSync(sessionsJsonPath);
                    if (stat.mtimeMs > lastSessionsJsonMtime) {
                        lastSessionsJsonMtime = stat.mtimeMs;
                        hydrateOpenclawSessionIndex(true);
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        };
        setInterval(pollSessionsJson, 5000); // Poll every 5s to reduce CPU load
        pollSessionsJson(); // Initial check

        // ==========================================
        // PHASE 7: Simple Polling-Based Session Monitor
        // ==========================================
        // Chokidar causes EBADF errors on this system - using simple polling instead
        const sessionsDir = path.join(agentsDir, 'main/sessions');
        
        console.log(`[TelegramService] Initializing simple polling monitor on ${sessionsDir} ...`);
        
        // Track known files and their sizes
        const knownFiles = new Map(); // filePath -> { size, mtime }
        
        const pollSessions = () => {
            try {
                if (!fs.existsSync(sessionsDir)) return;
                
                const entries = fs.readdirSync(sessionsDir);
                const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));
                
                for (const filename of jsonlFiles) {
                    const filePath = path.join(sessionsDir, filename);
                    
                    try {
                        const stat = fs.statSync(filePath);
                        const known = knownFiles.get(filePath);
                        
                        if (!known) {
                            // New file - process initial content
                            knownFiles.set(filePath, { size: stat.size, mtime: stat.mtimeMs });
                            
                            const data = fs.readFileSync(filePath, 'utf8');
                            const lines = data.split('\n').filter(l => l.trim() !== '');
                            const recentLines = lines.slice(-200);
                            
                            for (const line of recentLines) {
                                try {
                                    const parsed = JSON.parse(line);
                                    if (parsed.type === 'message' && parsed.message) {
                                        processGatewayMessage(parsed, true, filePath);
                                    }
                                } catch(e) { }
                            }
                            
                            fileOffsets.set(filePath, stat.size);
                        } else if (stat.size > known.size) {
                            // File grew - read new content
                            const newSize = stat.size;
                            const prevSize = known.size;
                            
                            try {
                                const fd = fs.openSync(filePath, 'r');
                                const bufferSize = newSize - prevSize;
                                const buffer = Buffer.alloc(bufferSize);
                                
                                fs.readSync(fd, buffer, 0, bufferSize, prevSize);
                                fs.closeSync(fd);
                                
                                knownFiles.set(filePath, { size: newSize, mtime: stat.mtimeMs });
                                fileOffsets.set(filePath, newSize);
                                
                                const data = buffer.toString();
                                const lines = data.split('\n').filter(l => l.trim() !== '');
                                
                                for (const line of lines) {
                                    try {
                                        const parsed = JSON.parse(line);
                                        if (parsed.type === 'message' && parsed.message) {
                                            processGatewayMessage(parsed, false, filePath);
                                        }
                                    } catch(e) { }
                                }
                            } catch (readErr) {
                                // Skip this file on error
                            }
                        } else if (stat.size < known.size) {
                            // File truncated - reset
                            knownFiles.set(filePath, { size: stat.size, mtime: stat.mtimeMs });
                            fileOffsets.set(filePath, stat.size);
                        }
                    } catch (err) {
                        // Skip files we can't stat/read
                    }
                }
                
                // Clean up deleted files
                for (const [filePath] of knownFiles) {
                    if (!fs.existsSync(filePath)) {
                        knownFiles.delete(filePath);
                        fileOffsets.delete(filePath);
                    }
                }
            } catch (err) {
                // Directory might not exist
            }
        };
        
        // Poll every 2 seconds - balance between responsiveness and CPU usage
        setInterval(pollSessions, 2000);
        
        // Initial scan
        pollSessions();

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

/**
 * Send message via HTTP API to OpenClaw Gateway (fast path)
 * Falls back to CLI spawn only if HTTP is unavailable
 */
async function sendViaHttpGateway(sessionId, message, sessionKey) {
    // Use native fetch (Node.js 18+) or fall back to dynamic import
    const fetchFn = globalThis.fetch;
    if (!fetchFn) {
        throw new Error('fetch not available - Node.js 18+ required for HTTP gateway');
    }
    
    const url = `${GATEWAY_BASE_URL}/api/v1/sessions/${sessionId}/send`;
    const headers = {
        'Content-Type': 'application/json',
        ...(GATEWAY_TOKEN && { 'Authorization': `Bearer ${GATEWAY_TOKEN}` })
    };
    const body = JSON.stringify({ message, sessionKey });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
        const response = await fetchFn(url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

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

    // PHASE 4: Native OpenClaw session send via HTTP (fast path)
    // Eliminates per-message CLI spawn overhead
    if (canonical.sessionId) {
        try {
            const httpStartedAt = Date.now();
            const result = await sendViaHttpGateway(canonical.sessionId, text, canonical.sessionKey);
            const httpDoneAt = Date.now();
            
            logOpenclawCli('inject_http_ok', {
                transport: 'session-native-http',
                realChatId: String(realChatId),
                sessionId: canonical.sessionId,
                timing: {
                    httpCallMs: httpDoneAt - httpStartedAt,
                    totalAckMs: httpDoneAt - requestStartedAt
                }
            });
            
            return {
                message_id: result.messageId || `http-${httpDoneAt}`,
                transport: 'session-native-http',
                sessionKey: canonical.sessionKey,
                sessionId: canonical.sessionId,
                sessionFile: canonical.sessionFile,
                timing: {
                    totalAckMs: httpDoneAt - requestStartedAt,
                    httpCallMs: httpDoneAt - httpStartedAt
                }
            };
        } catch (httpErr) {
            // HTTP failed - fall back to CLI spawn but log the attempt
            logOpenclawCli('inject_http_fallback', {
                reason: httpErr.message,
                sessionId: canonical.sessionId,
                willTry: 'cli-spawn'
            });
            // Continue to CLI fallback below
        }
    }

    // CLI spawn fallback (legacy, slower)
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    let cmd = null;
    let transport = null;
    
    if (canonical.sessionId) {
        transport = 'session-native-cli';
        cmd = `export PATH=$PATH:/home/claw-agentbox/.npm-global/bin && nohup openclaw agent --session-id "${canonical.sessionId}" --message "${safeText}" --json >/tmp/openclaw-cm-send-${canonical.sessionId}.log 2>&1 & echo $!`;
    } else {
        transport = 'legacy-telegram-deliver';
        cmd = `export PATH=$PATH:/home/claw-agentbox/.npm-global/bin && nohup openclaw agent --channel telegram --to "${realChatId}" --message "${safeText}" --deliver >/tmp/openclaw-cm-send-${realChatId}.log 2>&1 & echo $!`;
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
            stderrPreview: clip(stderr, 400),
            timing: {
                spawnExecMs: ackedAt - spawnStartedAt,
                totalAckMs: ackedAt - requestStartedAt
            }
        });

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

let relayBotInfo = null;
let mainBotInfo = null;

export const getChatBots = async (chatId) => {
    if (!bot) return [];
    try {
        if (!mainBotInfo) mainBotInfo = await bot.telegram.getMe();
        
        const admins = await bot.telegram.getChatAdministrators(chatId);
        // Filter out human admins, keep only bots, AND hide the primary bot itself
        const bots = admins.filter(admin => admin.user.is_bot && admin.user.id !== mainBotInfo.id).map(admin => admin.user);

        if (relayBot) {
            try {
                if (!relayBotInfo) relayBotInfo = await relayBot.telegram.getMe();
                if (!bots.find(b => b.id === relayBotInfo.id)) {
                    const relayMember = await bot.telegram.getChatMember(chatId, relayBotInfo.id);
                    if (['creator', 'administrator', 'member', 'restricted'].includes(relayMember.status)) {
                        bots.push(relayMember.user);
                    }
                }
            } catch (err) {}
        }

        return bots;
    } catch (err) {
        console.error(`[TelegramService] Failed to fetch admins for ${chatId}:`, err.message);
        return [];
    }
};
