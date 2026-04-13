import 'dotenv/config';
import { Telegraf } from 'telegraf';
import fs from 'fs/promises';

async function validate() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('TELEGRAM_BOT_TOKEN missing');
        return;
    }

    const bot = new Telegraf(token);
    const configRaw = await fs.readFile('/home/claw-agentbox/.openclaw/openclaw.json', 'utf8');
    const config = JSON.parse(configRaw);
    const groups = config.channels.telegram.groups;

    console.log('\n--- STARTING TELEGRAM CHANNEL VALIDATION ---\n');

    for (const groupId of Object.keys(groups)) {
        if (groupId === '*') continue;

        try {
            const chat = await bot.telegram.getChat(groupId);
            console.log(`[VALID] ID: ${groupId}`);
            console.log(`        Title: ${chat.title}`);
            console.log(`        Type:  ${chat.type}`);
            if (chat.username) console.log(`        Username: @${chat.username}`);
        } catch (err) {
            console.log(`[INVALID] ID: ${groupId}`);
            console.log(`          Error: ${err.message}`);
        }
        console.log('-------------------------------------------');
    }
}

validate();
