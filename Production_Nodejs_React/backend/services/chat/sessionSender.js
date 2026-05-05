import { resolveCanonicalSession } from './sessionIndex.js';
import { clip, logOpenclawSend } from './chatSendUtils.js';
import { sendViaOpenclawCli } from './openclawCliTransport.js';
import {
    GatewayNativeTransportUnavailable,
    isGatewayNativeForced,
    isGatewayNativeUnavailable,
    resolveGatewaySendMode,
    sendViaOpenclawGateway,
    shouldAttemptGatewayNative
} from './openclawGatewayTransport.js';

export async function sendMessageToChat(chatId, text, options = {}) {
    const attachments = options.attachments;
    const requestStartedAt = Date.now();
    const canonical = resolveCanonicalSession(chatId);
    const realChatId = canonical.chatId;
    const transportEnvRaw = String(process.env.OPENCLAW_CM_SEND_TRANSPORT || '').trim();
    const baseSendMode = resolveGatewaySendMode();
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    // Media requires gateway `chat.send` with attachments; CLI path is text-only. If the operator
    // has not set OPENCLAW_CM_SEND_TRANSPORT, default attachment sends to `auto` so we try the
    // warm gateway (token/URL from env or openclaw.json) instead of failing with 501.
    const sendMode = hasAttachments && !transportEnvRaw ? 'auto' : baseSendMode;

    logOpenclawSend('inject_start', {
        rawChatId: String(chatId),
        realChatId: String(realChatId),
        sessionKey: canonical.sessionKey,
        sessionId: canonical.sessionId,
        sendMode,
        sendModeEnv: transportEnvRaw || null,
        sendModeBase: baseSendMode,
        textLen: String(text).length,
        attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
        requestStartedAt
    });

    const trimmedText = String(text || '').trim();

    if (hasAttachments && !shouldAttemptGatewayNative(sendMode)) {
        const err = new GatewayNativeTransportUnavailable(
            'Media attachments require OPENCLAW_CM_SEND_TRANSPORT=gateway or auto with a reachable gateway'
        );
        err.status = 501;
        throw err;
    }

    if (!trimmedText && !hasAttachments) {
        logOpenclawSend('inject_skip', { reason: 'empty_message', realChatId: String(realChatId) });
        return { message_id: `ui-empty-${Date.now()}`, transport: 'noop', timing: { totalMs: Date.now() - requestStartedAt } };
    }

    if (shouldAttemptGatewayNative(sendMode)) {
        try {
            return await sendViaOpenclawGateway({
                canonical,
                realChatId,
                text: trimmedText,
                attachments,
                requestStartedAt,
                log: logOpenclawSend
            });
        } catch (err) {
            if (sendMode === 'auto' && isGatewayNativeUnavailable(err)) {
                if (hasAttachments) {
                    logOpenclawSend('gateway_native_no_cli_fallback_media', {
                        reason: clip(err?.message, 400),
                        realChatId: String(realChatId),
                        sessionId: canonical.sessionId
                    });
                    if (!err.status) err.status = 501;
                    throw err;
                }
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
        text: trimmedText,
        requestStartedAt,
        log: logOpenclawSend
    });
}
