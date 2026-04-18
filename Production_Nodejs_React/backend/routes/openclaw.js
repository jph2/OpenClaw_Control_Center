/**
 * Legacy mount: `/api/openclaw/*` — thin aliases to canonical handlers in `chat.js`.
 * Scheduled for removal after one release; prefer `/api/chat/session/:sessionId/*`.
 */
import express from 'express';
import { apiLimiter } from '../utils/rateLimiter.js';
import {
    handleGroupSession,
    handleSessionSend,
    handleSessionMessages,
    handleSessionStream
} from './chat.js';

const router = express.Router();

router.get('/session/:chatId', (req, res) =>
    handleGroupSession(req, res, req.params.chatId, { timestamp: true })
);

router.post('/session/:sessionId/send', apiLimiter, handleSessionSend);
router.get('/session/:sessionId/messages', handleSessionMessages);
router.get('/session/:sessionId/stream', handleSessionStream);

export default router;
