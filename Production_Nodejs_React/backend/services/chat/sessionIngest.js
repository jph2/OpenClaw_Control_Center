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

export function processGatewayMessage(data, isInit = false, filePath = '') {
    const msgObj = buildMsgObjFromGatewayLine(data);
    if (!msgObj) return;

    if (processedMessageIds.has(msgObj.id)) {
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
        return;
    }

    const expectedFile = getCanonicalSessionFileForGroup(canonicalChatId);
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
            telegramEvents.emit('newMessage', { chatId, message: msgObj });
        }
    }
}
