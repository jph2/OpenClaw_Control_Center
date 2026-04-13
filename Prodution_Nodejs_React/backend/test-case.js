import 'dotenv/config';
import { Telegraf } from 'telegraf';
const relayBot = new Telegraf(process.env.RELAY_BOT_TOKEN || process.env.SHEDLY_BOT_TOKEN);
async function run() {
  try {
    const me = await relayBot.telegram.getMe();
    console.log("Relay Bot Info:", me);
    const member = await relayBot.telegram.getChatMember('-5207805052', me.id);
    console.log("Chat Member Status:", JSON.stringify(member, null, 2));
  } catch (err) {
    console.error(err);
  }
}
run();
