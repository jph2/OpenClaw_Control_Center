/**
 * Canonical chat mirror + session send routes (Bundle B / P4).
 * Mounted at `/api/chat`. Legacy `/api/telegram/*` and `/api/openclaw/*` stay as thin aliases.
 */
import express from 'express';
import { z } from 'zod';
import {
    telegramEvents,
    getMessagesForChat,
    sendMessageToChat,
    normalizeChatIdForBuffer,
    refreshChatMirrorFromCanonicalSession,
    resolveCanonicalSession
} from '../services/telegramService.js';
import { apiLimiter } from '../utils/rateLimiter.js';

const GroupSendSchema = z.object({
    text: z.string().min(1)
});

const SessionSendSchema = z.object({
    message: z.string().min(1),
    sessionKey: z.string().optional()
});

/** @param {string} groupIdParam */
export function handleGroupSession(req, res, groupIdParam, opts = {}) {
    const resolved = resolveCanonicalSession(String(groupIdParam));
    const payload = { ok: true, ...resolved };
    if (opts.timestamp) payload.timestamp = Date.now();
    res.json(payload);
}

/** @param {string} groupIdParam — Telegram group id or alias */
export function handleGroupStream(req, res, groupIdParam) {
    const normalized = normalizeChatIdForBuffer(String(groupIdParam));
    refreshChatMirrorFromCanonicalSession(normalized);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const backlog = getMessagesForChat(normalized);
    if (backlog.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'INIT', messages: backlog })}\n\n`);
    }

    const onNewMessage = (payload) => {
        if (normalizeChatIdForBuffer(payload.chatId) === normalized) {
            res.write(`data: ${JSON.stringify({ type: 'MESSAGE', message: payload.message })}\n\n`);
        }
    };
    telegramEvents.on('newMessage', onNewMessage);

    const onSessionRebound = (payload) => {
        if (normalizeChatIdForBuffer(String(payload.chatId)) !== normalized) return;
        const msgs = getMessagesForChat(normalized);
        res.write(
            `data: ${JSON.stringify({
                type: 'SESSION_REBOUND',
                chatId: normalized,
                sessionFile: payload.sessionFile || null,
                messages: msgs
            })}\n\n`
        );
    };
    telegramEvents.on('sessionRebound', onSessionRebound);

    const keepAlive = setInterval(() => res.write(':ping\n\n'), 30000);

    req.on('close', () => {
        telegramEvents.off('newMessage', onNewMessage);
        telegramEvents.off('sessionRebound', onSessionRebound);
        clearInterval(keepAlive);
    });
}

/** POST body: `{ text }` — `groupId` is the Telegram group (path). */
export async function handleGroupSend(req, res, next, groupIdParam) {
    const requestStartedAt = Date.now();
    try {
        const { text } = GroupSendSchema.parse(req.body);
        const result = await sendMessageToChat(String(groupIdParam), text);
        const totalMs = Date.now() - requestStartedAt;
        console.log(
            `[chat send] groupId=${String(groupIdParam)} messageId=${result.message_id} transport=${result.transport || 'unknown'} httpMs=${totalMs} ackMs=${result.timing?.totalAckMs ?? 'n/a'}`
        );
        res.json({
            ok: true,
            messageId: result.message_id,
            transport: result.transport || null,
            sessionKey: result.sessionKey || null,
            sessionId: result.sessionId || null,
            sessionFile: result.sessionFile || null,
            spawnedPid: result.spawnedPid || null,
            gatewayResultId: result.gatewayResultId || null,
            timing: {
                ...result.timing,
                httpTotalMs: totalMs
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
}

export async function handleSessionSend(req, res, next) {
    const requestStartedAt = Date.now();
    try {
        const { sessionId } = req.params;
        const body = SessionSendSchema.parse(req.body);

        const result = await sendMessageToChat(sessionId, body.message);

        const totalMs = Date.now() - requestStartedAt;
        res.json({
            ok: true,
            messageId: result.message_id,
            transport: result.transport,
            sessionKey: result.sessionKey,
            sessionId: result.sessionId,
            sessionFile: result.sessionFile,
            gatewayResultId: result.gatewayResultId || null,
            timing: {
                ...result.timing,
                apiTotalMs: totalMs
            },
            timestamp: Date.now()
        });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
}

export async function handleSessionMessages(req, res, next) {
    try {
        const { sessionId } = req.params;
        const limit = parseInt(String(req.query.limit), 10) || 100;
        const messages = getMessagesForChat(sessionId).slice(-limit);
        res.json({
            ok: true,
            sessionId,
            messages,
            count: messages.length,
            timestamp: Date.now()
        });
    } catch (error) {
        next(error);
    }
}

export function handleSessionStream(req, res) {
    const { sessionId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(
        `data: ${JSON.stringify({
            type: 'CONNECTED',
            sessionId,
            timestamp: Date.now()
        })}\n\n`
    );

    const onNewMessage = (payload) => {
        if (payload.chatId === sessionId || payload.sessionId === sessionId) {
            res.write(
                `data: ${JSON.stringify({
                    type: 'MESSAGE',
                    message: payload.message,
                    timestamp: Date.now()
                })}\n\n`
            );
        }
    };
    telegramEvents.on('newMessage', onNewMessage);

    const keepAlive = setInterval(() => res.write(':ping\n\n'), 30000);

    req.on('close', () => {
        telegramEvents.off('newMessage', onNewMessage);
        clearInterval(keepAlive);
    });
}

const router = express.Router();

router.post('/session/:sessionId/send', apiLimiter, handleSessionSend);
router.get('/session/:sessionId/messages', handleSessionMessages);
router.get('/session/:sessionId/stream', handleSessionStream);

router.get('/:groupId/session', (req, res) => handleGroupSession(req, res, req.params.groupId));
router.get('/:groupId/stream', (req, res) => handleGroupStream(req, res, req.params.groupId));
router.post('/:groupId/send', apiLimiter, (req, res, next) =>
    handleGroupSend(req, res, next, req.params.groupId)
);

export default router;
