import 'dotenv/config';
import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

console.log('\n--- ID SNIFFER STARTED ---');
console.log('Waiting for your messages to extract new IDs...\n');

bot.on('message', (ctx) => {
    const chat = ctx.chat;
    const text = ctx.message.text || '';
    console.log(`[FOUND] Title: "${chat.title}"`);
    console.log(`        New ID: ${chat.id}`);
    console.log(`        Message: "${text}"`);
    console.log('---------------------------');
});

bot.launch();

// Stop after 20 seconds to not block
setTimeout(() => {
    console.log('\nStopping Sniffer. Processing results...');
    process.exit(0);
}, 20000);
