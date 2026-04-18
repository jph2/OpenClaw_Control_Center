/**
 * Legacy mount: `/api/telegram/*` — thin aliases to canonical handlers in `chat.js`.
 * Scheduled for removal after one release; prefer `/api/chat/*`.
 */
import express from 'express';
import { z } from 'zod';
import { apiLimiter } from '../utils/rateLimiter.js';
import { handleGroupStream, handleGroupSession, handleGroupSend } from './chat.js';

const router = express.Router();

const LegacySendSchema = z.object({
    chatId: z.string().min(1),
    text: z.string().min(1)
});

router.get('/stream/:chatId', (req, res) => handleGroupStream(req, res, req.params.chatId));

router.post('/send', apiLimiter, (req, res, next) => {
    console.log('[API POST /api/telegram/send] Incoming payload:', req.body);
    try {
        const { chatId, text } = LegacySendSchema.parse(req.body);
        console.log(`[API POST /api/telegram/send] Parsed values -> chatId: ${chatId}, textLength: ${text.length}`);
        req.body = { text };
        return handleGroupSend(req, res, next, chatId);
    } catch (error) {
        console.error('[API POST /api/telegram/send] ERROR:', error.message || error);
        if (error instanceof z.ZodError) error.status = 400;
        return next(error);
    }
});

router.get('/session/:chatId', (req, res) => handleGroupSession(req, res, req.params.chatId));

export default router;
