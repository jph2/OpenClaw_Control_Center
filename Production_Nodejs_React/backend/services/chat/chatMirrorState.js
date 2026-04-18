import fs from 'fs';
import { buildMsgObjFromGatewayLine } from './messageModel.js';
import { normalizeChatIdForBuffer } from './channelAliases.js';

const messageBuffer = new Map();
const MAX_BUFFER_SIZE = 500;

export function getMessagesForChat(chatId) {
    const key = normalizeChatIdForBuffer(chatId.toString());
    return messageBuffer.get(key) || [];
}

/**
 * Replace in-memory backlog for a group from the canonical session JSONL (same file OpenClaw UI uses).
 */
export function replaceBufferFromSessionFile(groupId, sessionFilePath) {
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
export function loadMessageHistoryFromSessionJsonl(sessionFilePath, _chatIdKey, maxLines = 800) {
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
        console.warn(`[Chat/chatMirrorState] Could not read session file ${sessionFilePath}:`, e.message);
        return [];
    }
}

/** Maps OpenClaw session file UUID → canonical Telegram group id (numeric string). */
export const sessionToCanonicalChat = new Map();

/** @internal Used by session ingest to append live JSONL lines. */
export function getMessageBufferMap() {
    return messageBuffer;
}

export const MIRROR_MAX_BUFFER_SIZE = MAX_BUFFER_SIZE;
