import { Telegraf } from 'telegraf';
import { EventEmitter } from 'events';

export const telegramEvents = new EventEmitter();

// In-memory message store for Phase 3.1 (Buffer per chat)
const messageBuffer = new Map();
const MAX_BUFFER_SIZE = 50;

let bot = null;         // TARS (Inbound)
let relayBot = null;    // CASE / Shedly (Outbound)

export const initTelegramService = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const relayToken = process.env.RELAY_BOT_TOKEN || process.env.SHEDLY_BOT_TOKEN;

    if (!token) {
        console.warn('[TelegramService] TELEGRAM_BOT_TOKEN not found in .env. Running in offline/mock mode for Sub-Task 3.1.');
        return;
    }
    
    if (!relayToken) {
        console.warn('[TelegramService] RELAY_BOT_TOKEN not found in .env. Cannot send answers!');
    } else {
        relayBot = new Telegraf(relayToken);
    }

    try {
        bot = new Telegraf(token);

        // Sub-Task 3.1: Listen to live message stream
        bot.on('message', (ctx) => {
            const chatId = ctx.chat.id.toString();
            const message = {
                id: ctx.message.message_id,
                text: ctx.message.text || '[Non-text message]',
                sender: ctx.from.first_name || ctx.from.username || 'Unknown',
                senderId: ctx.from.id,
                date: ctx.message.date,
                isBot: ctx.from.is_bot
            };

            // Store in buffer
            if (!messageBuffer.has(chatId)) messageBuffer.set(chatId, []);
            const chatBuffer = messageBuffer.get(chatId);
            chatBuffer.push(message);
            if (chatBuffer.length > MAX_BUFFER_SIZE) chatBuffer.shift();

            // Broadcast to ChannelManager.jsx over Server-Sent Events
            telegramEvents.emit('newMessage', { chatId, message });
        });

        bot.launch().then(() => {
            console.log('[TelegramService] Telegraf Bot successfully connected and streaming data.');
        }).catch(err => {
            console.error('[TelegramService] Polling failed (usually 409 Conflict with OpenClaw). Receiving disabled, but sending remains active.', err.message);
            // Do NOT set bot = null. We can still use bot.telegram.sendMessage!
        });

        // Enable graceful stop
        process.once('SIGINT', () => { if (bot) bot.stop('SIGINT') });
        process.once('SIGTERM', () => { if (bot) bot.stop('SIGTERM') });
    } catch (err) {
        console.error('[TelegramService] Initialization failed:', err.message);
    }
};

export const getMessagesForChat = (chatId) => {
    return messageBuffer.get(chatId.toString()) || [];
};

export const sendMessageToChat = async (chatId, text) => {
    if (!relayBot) {
        console.warn('Relay bot is not configured, falling back to TARS bot (may cause Bot-to-Bot filter issues)');
        if (!bot) throw new Error('No Telegram bot configured.');
        return await bot.telegram.sendMessage(chatId, text);
    }
    return await relayBot.telegram.sendMessage(chatId, text);
};

let relayBotInfo = null;
let mainBotInfo = null;

export const getChatBots = async (chatId) => {
    if (!bot) return [];
    try {
        if (!mainBotInfo) mainBotInfo = await bot.telegram.getMe();
        
        const admins = await bot.telegram.getChatAdministrators(chatId);
        // Filter out human admins, keep only bots, AND hide the primary bot itself
        const bots = admins.filter(admin => admin.user.is_bot && admin.user.id !== mainBotInfo.id).map(admin => admin.user);

        // Telegram's getChatAdministrators misses bots that are normal members (e.g. CASE often defaults to member).
        // Since we know the Relay Bot (CASE), we can explicitly check its presence:
        if (relayBot) {
            try {
                if (!relayBotInfo) relayBotInfo = await relayBot.telegram.getMe();
                
                // If it's already caught in the admins query, no need to duplicate
                if (!bots.find(b => b.id === relayBotInfo.id)) {
                    const relayMember = await bot.telegram.getChatMember(chatId, relayBotInfo.id);
                    if (['creator', 'administrator', 'member', 'restricted'].includes(relayMember.status)) {
                        bots.push(relayMember.user);
                    }
                }
            } catch (err) {
                // Relay bot not present in chat or unauthorized
            }
        }

        return bots;
    } catch (err) {
        console.error(`[TelegramService] Failed to fetch admins for ${chatId}:`, err.message);
        return [];
    }
};
