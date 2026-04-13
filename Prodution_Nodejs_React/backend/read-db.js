const Database = require('better-sqlite3');
const db = new Database('/home/claw-agentbox/.openclaw/memory/main.sqlite');
const rows = db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 2").all();
console.log(JSON.stringify(rows, null, 2));
