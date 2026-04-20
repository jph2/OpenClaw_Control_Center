import path from 'path';
import { buildMsgObjFromGatewayLine } from './messageModel.js';
import { normalizeChatIdForBuffer } from './channelAliases.js';
import {
    sessionToCanonicalChat,
    getMessageBufferMap,
    MIRROR_MAX_BUFFER_SIZE
} from './chatMirrorState.js';
import {
    getTelegramGroupIdBySessionUuid,
    getCanonicalSessionFileForGroup
} from './sessionIndex.js';
import { telegramEvents } from './chatEvents.js';

const processedMessageIds = new Set();
const MAX_PROCESSED_IDS = 2000;

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

const INGEST_DEBUG = process.env.CM_INGEST_DEBUG === '1';

function debugIngest(tag, ctx) {
    if (!INGEST_DEBUG) return;
    try {
        console.log(`[Chat/sessionIngest] ${tag}`, JSON.stringify(ctx));
    } catch {
        /* best effort */
    }
}

export function processGatewayMessage(data, isInit = false, filePath = '') {
    const msgObj = buildMsgObjFromGatewayLine(data);
    if (!msgObj) {
        debugIngest('skip:no-msgObj', { filePath, isInit });
        return;
    }

    if (processedMessageIds.has(msgObj.id)) {
        debugIngest('skip:dedup', { id: msgObj.id, filePath, isInit });
        return;
    }

    processedMessageIds.add(msgObj.id);
    if (processedMessageIds.size > MAX_PROCESSED_IDS) {
        const entriesToKeep = Array.from(processedMessageIds).slice(-MAX_PROCESSED_IDS / 2);
        processedMessageIds.clear();
        entriesToKeep.forEach((id) => processedMessageIds.add(id));
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
    } else if (sessionUuid) {
        const gid = getTelegramGroupIdBySessionUuid(sessionUuid);
        if (gid) {
            canonicalChatId = normalizeChatIdForBuffer(gid);
            sessionToCanonicalChat.set(sessionUuid, canonicalChatId);
        }
    }

    if (!canonicalChatId) {
        debugIngest('skip:no-canonicalChat', { id: msgObj.id, sessionUuid, filePath });
        return;
    }

    const expectedFile = getCanonicalSessionFileForGroup(canonicalChatId);
    if (expectedFile && filePath) {
        try {
            if (path.resolve(filePath) !== path.resolve(expectedFile)) {
                debugIngest('skip:file-mismatch', {
                    id: msgObj.id,
                    canonicalChatId,
                    filePath,
                    expectedFile
                });
                return;
            }
        } catch {
            debugIngest('skip:file-resolve-error', { filePath, expectedFile });
            return;
        }
    }

    const chatId = canonicalChatId;
    const messageBuffer = getMessageBufferMap();
    if (!messageBuffer.has(chatId)) messageBuffer.set(chatId, []);
    const chatBuffer = messageBuffer.get(chatId);

    if (!chatBuffer.find((m) => m.id === msgObj.id)) {
        chatBuffer.push(msgObj);
        chatBuffer.sort((a, b) => a.date - b.date);
        if (chatBuffer.length > MIRROR_MAX_BUFFER_SIZE) {
            chatBuffer.splice(0, chatBuffer.length - MIRROR_MAX_BUFFER_SIZE);
        }

        if (!isInit) {
            const listenerCount = telegramEvents.listenerCount('newMessage');
            telegramEvents.emit('newMessage', { chatId, message: msgObj });
            console.log(
                `[Chat/sessionIngest] emit newMessage chatId=${chatId} msgId=${msgObj.id} listeners=${listenerCount}`
            );
        } else {
            debugIngest('buffered:init', { id: msgObj.id, chatId });
        }
    } else {
        debugIngest('skip:already-in-buffer', { id: msgObj.id, chatId });
    }
}
