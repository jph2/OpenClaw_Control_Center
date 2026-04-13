const Database = require('better-sqlite3');
const db = new Database('/home/claw-agentbox/.openclaw/memory/main.sqlite');
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(JSON.stringify(rows));
