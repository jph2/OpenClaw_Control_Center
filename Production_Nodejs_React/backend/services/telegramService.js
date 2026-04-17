import { Telegraf } from 'telegraf';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scanHistory } from './historyScanner.mjs';

const execAsync = promisify(exec);

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

const DEFAULT_SESSIONS_JSON = () =>
    path.join(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents/main/sessions/sessions.json');

/**
 * Re-read OpenClaw session index so gateway lines can resolve group id without per-line metadata.
 * Also tracks canonical sessionFile per Telegram group (OpenClaw UI parity).
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

        if (fs.existsSync(sessionsJsonPath)) {
            chokidar
                .watch(sessionsJsonPath, {
                    persistent: true,
                    ignoreInitial: true,
                    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 }
                })
                .on('add', () => hydrateOpenclawSessionIndex())
                .on('change', () => hydrateOpenclawSessionIndex());
        } else {
            console.warn(`[TelegramService] sessions.json not found yet at ${sessionsJsonPath}; session→group map will stay empty until file exists.`);
        }

        console.log(`[TelegramService] Initializing Chokidar Gateway Listener on ${agentsDir} ...`);
        
        const watcher = chokidar.watch(agentsDir, {
            persistent: true,
            ignoreInitial: false,
            usePolling: true,
            interval: 500
        });

        watcher.on('add', (filePath, stats) => {
            if (!filePath.endsWith('.jsonl') || !filePath.includes('/sessions/')) return;
            
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                const lines = data.split('\n').filter(l => l.trim() !== '');
                // Read last 200 lines of any loaded JSONL
                const recentLines = lines.slice(-200); 
                
                for (const line of recentLines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === 'message' && parsed.message) {
                            processGatewayMessage(parsed, true, filePath);
                        }
                    } catch(e) { }
                }
            } catch (err) {
                console.error(`[Chokidar ADD Error] ${err.message}`);
            }
            fileOffsets.set(filePath, stats ? stats.size : fs.statSync(filePath).size);
        });

        watcher.on('change', (filePath, stats) => {
            if (!filePath.endsWith('.jsonl') || !filePath.includes('/sessions/')) return;
            
            const currentSize = stats ? stats.size : fs.statSync(filePath).size;
            const previousSize = fileOffsets.get(filePath) || 0;
            
            if (currentSize > previousSize) {
                try {
                    const fd = fs.openSync(filePath, 'r');
                    const bufferSize = currentSize - previousSize;
                    const buffer = Buffer.alloc(bufferSize);
                    
                    fs.readSync(fd, buffer, 0, bufferSize, previousSize);
                    fs.closeSync(fd);
                    
                    fileOffsets.set(filePath, currentSize);
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
                } catch (err) {
                    console.error(`[TelegramService] File Read Error (${path.basename(filePath)}):`, err.message);
                }
            } else if (currentSize < previousSize) {
                fileOffsets.set(filePath, currentSize);
            }
        });

        console.log('[TelegramService] Phase 7 Gateway Listener active. Bridging session transcripts to React SSE.');

    } catch (err) {
        console.error('[TelegramService] Initialization failed:', err.message);
    }
};

const processGatewayMessage = (data, isInit = false, filePath = '') => {
    const msgObj = buildMsgObjFromGatewayLine(data);
    if (!msgObj) return;

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
    const realChatId = normalizeChatIdForBuffer(String(chatId));
    const bufferKey = realChatId;

    logOpenclawCli('inject_start', {
        bufferKey,
        rawChatId: String(chatId),
        realChatId: String(realChatId),
        textLen: String(text).length
    });

    console.log(`[TelegramService] CLI Injection -> To: ${realChatId}, Text: "${text.substring(0, 50)}..."`);
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    if (!safeText.trim()) {
        logOpenclawCli('inject_skip', { reason: 'empty_after_escape', realChatId: String(realChatId) });
        return { message_id: `ui-empty-${Date.now()}` };
    }

    const cmd = `export PATH=$PATH:/home/claw-agentbox/.npm-global/bin && openclaw agent --channel telegram --to "${realChatId}" --message "${safeText}" --deliver`;

    try {
        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        logOpenclawCli('inject_ok', {
            realChatId: String(realChatId),
            stdoutLen: (stdout || '').length,
            stderrLen: (stderr || '').length,
            stdoutPreview: clip(stdout, 800),
            stderrPreview: clip(stderr, 400)
        });
        console.log('[TelegramService] openclaw agent finished (exit 0).');
    } catch (err) {
        logOpenclawCli('inject_err', {
            realChatId: String(realChatId),
            message: clip(err?.message, 400),
            stderrPreview: clip(err?.stderr, 400),
            stdoutPreview: clip(err?.stdout, 400)
        });
        console.error('[TelegramService] openclaw agent failed:', err.message);
        const fail = new Error(
            `OpenClaw CLI failed for chat ${realChatId}: ${clip(err?.message, 200)}`
        );
        fail.status = 502;
        fail.cause = err;
        throw fail;
    }

    return { message_id: `legacy-send-${Date.now()}` };
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
