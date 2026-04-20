import fs from 'fs';
import path from 'path';

/** UI / legacy aliases → canonical Telegram chat id (same numeric id as openclaw --to). */
const CHAT_ID_ALIASES = new Map([
    ['TTG000_General_Chat', '-1003752539559'],
    ['TG000_General_Chat', '-1003752539559'],
    ['TSG003_General_Chat', '-1003752539559'],
    ['tg000_general_chat', '-1003752539559']
]);

/**
 * Loads `name` → `id` from channel_config.json so labels (e.g. TTG001_Idea_Capture) map to the
 * real group id in this install — never a stale hardcoded id.
 */
export function hydrateChannelAliasesFromDiskSync() {
    if (!process.env.WORKSPACE_ROOT) {
        console.warn('[Chat/channelAliases] WORKSPACE_ROOT is not set; skipping channel alias hydration.');
        return;
    }
    const configPath = path.join(
        process.env.WORKSPACE_ROOT,
        'OpenClaw_Control_Center',
        'Prototyp',
        'channel_CHAT-manager',
        'channel_config.json'
    );
    try {
        if (!fs.existsSync(configPath)) {
            console.warn(`[Chat/channelAliases] No channel_config.json at ${configPath}; label→id may be incomplete.`);
            return;
        }
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        let n = 0;
        for (const c of parsed.channels || []) {
            if (c?.id == null || !c?.name) continue;
            const id = String(c.id).trim();
            const name = String(c.name).trim();
            CHAT_ID_ALIASES.set(name, id);
            CHAT_ID_ALIASES.set(name.toLowerCase(), id);
            n++;
        }
        console.log(`[Chat/channelAliases] Hydrated ${n} channel id aliases from ${configPath}`);
    } catch (e) {
        console.warn(`[Chat/channelAliases] Could not hydrate aliases from ${configPath}:`, e.message);
    }
}

// OpenClaw gateway emits chat_ids with a transport prefix like "telegram:-1003…" inside
// the "Conversation info (untrusted metadata)" block of every user payload, while the
// Channel Manager (routes, frontend, channel_config.json aliases) treats the bare numeric
// Telegram group id as the canonical buffer key. Stripping the prefix here keeps every
// downstream key comparison consistent without touching each call site.
const TRANSPORT_PREFIX_RE = /^(?:telegram|tg|slack|discord|whatsapp|signal):/i;

function stripTransportPrefix(value) {
    return value.replace(TRANSPORT_PREFIX_RE, '');
}

/**
 * Single storage key per Telegram group so SSE and buffers stay consistent.
 * Exported for the telegram route (SSE backlog + live) to match the same key.
 */
export function normalizeChatIdForBuffer(chatId) {
    const raw = String(chatId ?? '').trim();
    if (!raw) return raw;
    const stripped = stripTransportPrefix(raw);
    if (CHAT_ID_ALIASES.has(stripped)) return CHAT_ID_ALIASES.get(stripped);
    if (CHAT_ID_ALIASES.has(raw)) return CHAT_ID_ALIASES.get(raw);
    return stripped;
}
