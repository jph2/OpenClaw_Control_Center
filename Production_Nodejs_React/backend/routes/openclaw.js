/**
 * OpenClaw Native Session Routes
 * 
 * Provides direct access to OpenClaw session/chat APIs
 * for native session-native read/write operations.
 */

import express from 'express';
import { z } from 'zod';
import { apiLimiter } from '../utils/rateLimiter.js';
import { resolveCanonicalSession, telegramEvents } from '../services/telegramService.js';

const router = express.Router();

const SendMessageSchema = z.object({
    message: z.string().min(1),
    sessionKey: z.string().optional()
});

/**
 * GET /api/openclaw/session/:chatId
 * Resolve Channel Manager chat binding to canonical OpenClaw session identity.
 * Returns: sessionKey, sessionId, sessionFile, deliveryContext
 */
router.get('/session/:chatId', (req, res) => {
    const resolved = resolveCanonicalSession(req.params.chatId);
    res.json({ 
        ok: true, 
        ...resolved,
        timestamp: Date.now()
    });
});

/**
 * POST /api/openclaw/session/:sessionId/send
 * Native OpenClaw session send via HTTP Gateway API
 * Fast path that eliminates CLI spawn overhead
 */
router.post('/session/:sessionId/send', apiLimiter, async (req, res, next) => {
    const requestStartedAt = Date.now();
    
    try {
        const { sessionId } = req.params;
        const { message, sessionKey } = SendMessageSchema.parse(req.body);
        
        // Import here to avoid circular deps
        const { sendMessageToChat } = await import('../services/telegramService.js');
        
        // Use the existing sendMessageToChat which now has HTTP fast-path
        const result = await sendMessageToChat(sessionId, message);
        
        const totalMs = Date.now() - requestStartedAt;
        
        res.json({
            ok: true,
            messageId: result.message_id,
            transport: result.transport,
            sessionKey: result.sessionKey,
            sessionId: result.sessionId,
            sessionFile: result.sessionFile,
            timing: {
                ...result.timing,
                apiTotalMs: totalMs
            },
            timestamp: Date.now()
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            error.status = 400;
        }
        next(error);
    }
});

/**
 * GET /api/openclaw/session/:sessionId/messages
 * Get canonical session messages directly from OpenClaw
 */
router.get('/session/:sessionId/messages', async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        
        // Import here to avoid circular deps
        const { getMessagesForChat } = await import('../services/telegramService.js');
        
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
});

/**
 * GET /api/openclaw/session/:sessionId/stream
 * SSE stream for live session messages
 * Native OpenClaw session event stream
 */
router.get('/session/:sessionId/stream', (req, res) => {
    const { sessionId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection ack
    res.write(`data: ${JSON.stringify({ 
        type: 'CONNECTED', 
        sessionId,
        timestamp: Date.now() 
    })}\n\n`);

    // Listener for new messages
    const onNewMessage = (payload) => {
        if (payload.chatId === sessionId || payload.sessionId === sessionId) {
            res.write(`data: ${JSON.stringify({ 
                type: 'MESSAGE', 
                message: payload.message,
                timestamp: Date.now()
            })}\n\n`);
        }
    };

    telegramEvents.on('newMessage', onNewMessage);

    // Keep alive
    const keepAlive = setInterval(() => res.write(':ping\n\n'), 30000);

    req.on('close', () => {
        telegramEvents.off('newMessage', onNewMessage);
        clearInterval(keepAlive);
    });
});

export default router;
