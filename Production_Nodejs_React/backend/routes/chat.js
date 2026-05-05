/**
 * Canonical chat mirror + session send routes (Bundle B / P4).
 * Mounted at `/api/chat`. Legacy `/api/telegram/*` and `/api/openclaw/*` stay as thin aliases.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
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
import {
    CM_CHAT_IMAGE_BASE64_MAX_CHARS,
    normalizeGatewayImageAttachment,
    resolveInboundMediaAbsolutePath,
    resolveInboundMediaDirectory
} from '../services/chat/chatSendMedia.js';
import {
    forceChannelCanonicalSession,
    resolveChannelRuntimeBinding
} from '../services/channelRuntimeBinding.js';

const GroupSendSchema = z.object({
    text: z.string().min(1)
});

const SessionSendSchema = z.object({
    message: z.string().min(1),
    sessionKey: z.string().optional()
});

const SendImageBodySchema = z.object({
    filename: z.string().max(240).optional(),
    mimeType: z.string().min(1),
    base64: z.string().min(1).max(CM_CHAT_IMAGE_BASE64_MAX_CHARS)
});

const GroupSendMediaSchema = z.object({
    text: z.string().optional().default(''),
    image: SendImageBodySchema
});

const SessionSendMediaSchema = z.object({
    message: z.string().optional().default(''),
    sessionKey: z.string().optional(),
    image: SendImageBodySchema
});

const EXT_TO_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif'
};

/** @param {string} groupIdParam */
export function handleGroupSession(req, res, groupIdParam, opts = {}) {
    const resolved = resolveCanonicalSession(String(groupIdParam));
    const payload = { ok: true, ...resolved };
    if (opts.timestamp) payload.timestamp = Date.now();
    res.json(payload);
}

export async function handleGroupRuntimeBinding(req, res, next, groupIdParam) {
    try {
        const payload = await resolveChannelRuntimeBinding(String(groupIdParam));
        res.json({ ...payload, timestamp: Date.now() });
    } catch (error) {
        next(error);
    }
}

export async function handleForceCanonicalSession(req, res, next, groupIdParam) {
    try {
        const payload = await forceChannelCanonicalSession(String(groupIdParam));
        res.json({ ...payload, timestamp: Date.now() });
    } catch (error) {
        next(error);
    }
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

/** GET — stream a single inbound OpenClaw media file (session mirror thumbnails). */
export async function handleInboundMediaFile(req, res, next) {
    try {
        const rawId = req.params.mediaId;
        const mediaId = rawId ? decodeURIComponent(String(rawId)) : '';
        const abs = resolveInboundMediaAbsolutePath(mediaId);
        const inboundDir = resolveInboundMediaDirectory();
        const [dirStat, fileStat] = await Promise.all([
            fs.promises.lstat(inboundDir),
            fs.promises.lstat(abs)
        ]);
        if (dirStat.isSymbolicLink() || fileStat.isSymbolicLink() || !fileStat.isFile()) {
            res.status(404).end();
            return;
        }
        const [realDir, realFile] = await Promise.all([
            fs.promises.realpath(inboundDir),
            fs.promises.realpath(abs)
        ]);
        const realPrefix = realDir + path.sep;
        if (!realFile.startsWith(realPrefix)) {
            res.status(404).end();
            return;
        }
        const ext = path.extname(abs).toLowerCase();
        const mime = EXT_TO_MIME[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        fs.createReadStream(abs).pipe(res);
    } catch (e) {
        if (e && e.code === 'ENOENT') {
            res.status(404).end();
            return;
        }
        if (/unsafe media id|path escapes/i.test(e?.message || '')) {
            res.status(400).end();
            return;
        }
        next(e);
    }
}

export async function handleGroupSendMedia(req, res, next, groupIdParam) {
    const requestStartedAt = Date.now();
    try {
        const body = GroupSendMediaSchema.parse(req.body);
        const attachment = normalizeGatewayImageAttachment(body.image);
        const result = await sendMessageToChat(String(groupIdParam), body.text, {
            attachments: [attachment]
        });
        const totalMs = Date.now() - requestStartedAt;
        console.log(
            `[chat send-media] groupId=${String(groupIdParam)} messageId=${result.message_id} transport=${result.transport || 'unknown'} httpMs=${totalMs}`
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

export async function handleSessionSendMedia(req, res, next) {
    const requestStartedAt = Date.now();
    try {
        const { sessionId } = req.params;
        const body = SessionSendMediaSchema.parse(req.body);
        const attachment = normalizeGatewayImageAttachment(body.image);
        const result = await sendMessageToChat(body.sessionKey || sessionId, body.message, {
            attachments: [attachment]
        });
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

        const result = await sendMessageToChat(body.sessionKey || sessionId, body.message);

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

router.get('/media/inbound/:mediaId', handleInboundMediaFile);
router.post('/session/:sessionId/send-media', apiLimiter, handleSessionSendMedia);
router.post('/session/:sessionId/send', apiLimiter, handleSessionSend);
router.get('/session/:sessionId/messages', handleSessionMessages);
router.get('/session/:sessionId/stream', handleSessionStream);

router.get('/:groupId/runtime-binding', (req, res, next) =>
    handleGroupRuntimeBinding(req, res, next, req.params.groupId)
);
router.post('/:groupId/force-canonical-session', apiLimiter, (req, res, next) =>
    handleForceCanonicalSession(req, res, next, req.params.groupId)
);
router.get('/:groupId/session', (req, res) => handleGroupSession(req, res, req.params.groupId));
router.get('/:groupId/stream', (req, res) => handleGroupStream(req, res, req.params.groupId));
router.post('/:groupId/send-media', apiLimiter, (req, res, next) =>
    handleGroupSendMedia(req, res, next, req.params.groupId)
);
router.post('/:groupId/send', apiLimiter, (req, res, next) =>
    handleGroupSend(req, res, next, req.params.groupId)
);

export default router;
