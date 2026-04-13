import express from 'express';
import { z } from 'zod';
import { telegramEvents, getMessagesForChat, sendMessageToChat, getChatBots } from '../services/telegramService.js';
import { apiLimiter } from '../utils/rateLimiter.js';

const router = express.Router();

const SendMessageSchema = z.object({
    chatId: z.string().min(1),
    text: z.string().min(1)
});

/**
 * GET /api/telegram/stream/:chatId
 * SSE endpoint for live telegram messages for a specific chat
 */
router.get('/stream/:chatId', (req, res) => {
    const { chatId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial backlog of messages
    const backlog = getMessagesForChat(chatId);
    if (backlog.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'INIT', messages: backlog })}\n\n`);
    }

    // Listener for new live messages
    const onNewMessage = (payload) => {
        if (payload.chatId === chatId) {
            res.write(`data: ${JSON.stringify({ type: 'MESSAGE', message: payload.message })}\n\n`);
        }
    };

    telegramEvents.on('newMessage', onNewMessage);

    // Keep alive to prevent proxies from closing
    const keepAlive = setInterval(() => res.write(':ping\n\n'), 30000);

    req.on('close', () => {
        telegramEvents.off('newMessage', onNewMessage);
        clearInterval(keepAlive);
    });
});

/**
 * POST /api/telegram/send
 * Send a message to Telegram
 */
router.post('/send', apiLimiter, async (req, res, next) => {
    console.log('[API POST /send] Incoming payload:', req.body);
    try {
        let { chatId, text } = SendMessageSchema.parse(req.body);
        console.log(`[API POST /send] Parsed values -> chatId: ${chatId}, textLength: ${text.length}`);
        
        // Auto-fix legacy generic OpenClaw aliases to the real telegram Chat ID
        if (chatId === '-3736210177') {
            console.log('[API POST /send] Auto-correcting legacy chatId -3736210177 to -1003752539559');
            chatId = '-1003752539559';
        }
        
        const result = await sendMessageToChat(chatId, text);
        console.log(`[API POST /send] Success! messageId: ${result.message_id}`);
        // Return telegram response structure to UI
        res.json({ ok: true, messageId: result.message_id });
    } catch (error) {
        console.error('[API POST /send] ERROR:', error.message || error);
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * GET /api/telegram/bots/:chatId
 * Fetches the bots currently present in the chat (as administrators).
 */
router.get('/bots/:chatId', async (req, res, next) => {
    try {
        let { chatId } = req.params;
        
        // Auto-fix legacy generic OpenClaw aliases to the real telegram Chat ID
        if (chatId === '-3736210177') {
            chatId = '-1003752539559';
        }

        const bots = await getChatBots(chatId);
        res.json({ ok: true, bots });
    } catch (error) {
        next(error);
    }
});

export default router;
