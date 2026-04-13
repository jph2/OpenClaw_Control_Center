import 'dotenv/config';
import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.telegram.getChatAdministrators('-5207805052')
  .then(admins => console.log(JSON.stringify(admins, null, 2)))
  .catch(err => console.error(err));
