export function clip(s, max = 600) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .slice(0, max);
}

export function logOpenclawSend(phase, payload) {
    console.log('[Chat/sessionSender][openclaw]', phase, JSON.stringify(payload));
}

export function normalizeOpenclawSendText(text) {
    return String(text ?? '').replace(/\r?\n/g, ' ');
}

export function buildOpenclawSendFailure({ realChatId, transport, message, cause, status = 502 }) {
    const fail = new Error(`OpenClaw send failed for chat ${realChatId} via ${transport}: ${clip(message, 200)}`);
    fail.status = status;
    if (cause) fail.cause = cause;
    return fail;
}
