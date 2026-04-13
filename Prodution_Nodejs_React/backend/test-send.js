import { Telegraf } from 'telegraf';
const bot = new Telegraf('8658754700:AAEKLTGYoPtklBzj2N5AUV1M_XjwY5sMxDo');

const testIds = [
  "-1003752539559",
  "-3736210177",
  "-1003736210177"
];

async function run() {
  for (const id of testIds) {
    try {
      const res = await bot.telegram.sendMessage(id, 'Ping from test script');
      console.log('SUCCESS with ID:', id, res.message_id);
      return;
    } catch(err) {
      console.log('FAIL with ID:', id, err.message);
    }
  }
}
run();
