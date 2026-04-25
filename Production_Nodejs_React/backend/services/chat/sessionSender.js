import { resolveCanonicalSession } from './sessionIndex.js';
import { clip, logOpenclawSend } from './chatSendUtils.js';
import { sendViaOpenclawCli } from './openclawCliTransport.js';
import {
    isGatewayNativeForced,
    isGatewayNativeUnavailable,
    resolveGatewaySendMode,
    sendViaOpenclawGateway,
    shouldAttemptGatewayNative
} from './openclawGatewayTransport.js';

export async function sendMessageToChat(chatId, text) {
    const requestStartedAt = Date.now();
    const canonical = resolveCanonicalSession(chatId);
    const realChatId = canonical.chatId;
    const sendMode = resolveGatewaySendMode();

    logOpenclawSend('inject_start', {
        rawChatId: String(chatId),
        realChatId: String(realChatId),
        sessionKey: canonical.sessionKey,
        sessionId: canonical.sessionId,
        sendMode,
        textLen: String(text).length,
        requestStartedAt
    });

    if (!text || !text.trim()) {
        logOpenclawSend('inject_skip', { reason: 'empty_message', realChatId: String(realChatId) });
        return { message_id: `ui-empty-${Date.now()}`, transport: 'noop', timing: { totalMs: Date.now() - requestStartedAt } };
    }

    if (shouldAttemptGatewayNative(sendMode)) {
        try {
            return await sendViaOpenclawGateway({
                canonical,
                realChatId,
                text,
                requestStartedAt,
                log: logOpenclawSend
            });
        } catch (err) {
            if (sendMode === 'auto' && isGatewayNativeUnavailable(err)) {
                logOpenclawSend('gateway_native_fallback_cli', {
                    reason: clip(err?.message, 400),
                    realChatId: String(realChatId),
                    sessionId: canonical.sessionId
                });
            } else {
                if (isGatewayNativeForced(sendMode) && !err.status) err.status = 502;
                throw err;
            }
        }
    }

    return sendViaOpenclawCli({
        canonical,
        realChatId,
        text,
        requestStartedAt,
        log: logOpenclawSend
    });
}
