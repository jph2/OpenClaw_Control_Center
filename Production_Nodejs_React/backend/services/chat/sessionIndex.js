import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { normalizeChatIdForBuffer } from './channelAliases.js';
import { replaceBufferFromSessionFile } from './chatMirrorState.js';
import { telegramEvents } from './chatEvents.js';

const DEFAULT_SESSIONS_ROOT = path.join(process.env.HOME || '/home/claw-agentbox', '.openclaw/agents/main/sessions');

/** Maps OpenClaw `sessions.json`: session UUID → Telegram group id (from key agent:main:telegram:group:<id>). */
const sessionUuidToTelegramGroupId = new Map();

/** Telegram group id (string) → absolute path to canonical `sessionFile` (current OpenClaw transcript). */
const telegramGroupIdToSessionFile = new Map();

/** Previous sessionFile per group — detect rebind and refresh buffer. */
let previousGroupIdToSessionFile = new Map();

let sessionsJsonWatcher = null;

export const defaultSessionsJsonPath = () =>
    process.env.OPENCLAW_SESSIONS_JSON_PATH || path.join(DEFAULT_SESSIONS_ROOT, 'sessions.json');

export function getTelegramGroupIdBySessionUuid(uuid) {
    if (!uuid) return undefined;
    return sessionUuidToTelegramGroupId.get(String(uuid).toLowerCase());
}

export function getCanonicalSessionFileForGroup(groupId) {
    const key = normalizeChatIdForBuffer(String(groupId));
    return telegramGroupIdToSessionFile.get(key);
}

/** Iterable of absolute session file paths currently bound to some Telegram group. */
export function listCanonicalSessionFilePaths() {
    return new Set(telegramGroupIdToSessionFile.values());
}

/**
 * Re-read OpenClaw session index so gateway lines can resolve group id without per-line metadata.
 * Also tracks canonical sessionFile per Telegram group (OpenClaw UI parity).
 */
export function hydrateOpenclawSessionIndex() {
    const sessionsPath = defaultSessionsJsonPath();
    try {
        if (!fs.existsSync(sessionsPath)) {
            console.warn(
                `[Chat/sessionIndex] sessions.json not found at ${sessionsPath} (set OPENCLAW_SESSIONS_JSON_PATH if non-default).`
            );
            return;
        }
        const raw = fs.readFileSync(sessionsPath, 'utf8');
        const parsed = JSON.parse(raw);
        let n = 0;
        sessionUuidToTelegramGroupId.clear();
        telegramGroupIdToSessionFile.clear();

        const nextGroupFile = new Map();
        for (const [sessionKey, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const m = sessionKey.match(/^agent:main:telegram:group:(-?\d+)$/);
            if (!m) continue;
            const gid = m[1];
            const sid = entry.sessionId;
            if (sid && typeof sid === 'string') {
                sessionUuidToTelegramGroupId.set(sid.toLowerCase(), gid);
                n++;
            }
            if (entry.sessionFile && typeof entry.sessionFile === 'string') {
                const abs = path.resolve(entry.sessionFile);
                nextGroupFile.set(gid, abs);
                telegramGroupIdToSessionFile.set(gid, abs);
            }
        }

        for (const [gid, newPath] of nextGroupFile) {
            const oldPath = previousGroupIdToSessionFile.get(gid);
            if (oldPath !== undefined && oldPath !== newPath) {
                console.log(`[Chat/sessionIndex] Session file rebind for group ${gid}: ${oldPath} → ${newPath}`);
                replaceBufferFromSessionFile(gid, newPath);
                telegramEvents.emit('sessionRebound', { chatId: gid, sessionFile: newPath });
            }
        }
        previousGroupIdToSessionFile = nextGroupFile;

        console.log(
            `[Chat/sessionIndex] Hydrated OpenClaw session index: ${n} session UUIDs, ${telegramGroupIdToSessionFile.size} sessionFile paths (${sessionsPath}).`
        );
    } catch (e) {
        console.warn('[Chat/sessionIndex] Failed to hydrate sessions.json:', e.message);
    }
}

/**
 * Variant A: re-resolve canonical sessionFile from sessions.json and refill buffer (call on each SSE connect).
 */
export function refreshChatMirrorFromCanonicalSession(chatId) {
    const key = normalizeChatIdForBuffer(String(chatId));
    const sessionFile = telegramGroupIdToSessionFile.get(key);
    if (!sessionFile) {
        return;
    }
    replaceBufferFromSessionFile(key, sessionFile);
}

export function resolveCanonicalSession(chatId) {
    let key = normalizeChatIdForBuffer(String(chatId));
    let inputSessionId = null;

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(key)) {
        inputSessionId = key.toLowerCase();
        const telegramGroupId = sessionUuidToTelegramGroupId.get(inputSessionId);
        if (telegramGroupId) {
            key = telegramGroupId;
        }
    }

    const sessionFile = telegramGroupIdToSessionFile.get(key) || null;

    let sessionKey = null;
    let sessionId = inputSessionId;
    let deliveryContext = null;
    const sessionsPath = defaultSessionsJsonPath();

    try {
        if (fs.existsSync(sessionsPath)) {
            const parsed = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
            const wantedKey = `agent:main:telegram:group:${key}`;
            const entry = parsed[wantedKey];
            if (entry) {
                sessionKey = wantedKey;
                sessionId = entry.sessionId || null;
                deliveryContext = entry.deliveryContext || null;
            }
        }
    } catch (e) {
        console.warn('[Chat/sessionIndex] resolveCanonicalSession failed:', e.message);
    }

    return {
        chatId: key,
        sessionKey,
        sessionId,
        sessionFile,
        deliveryContext
    };
}

/**
 * Debounced watcher on sessions.json → re-hydrate + caller runs reconcile for session files.
 * @param {string} sessionsJsonPath
 * @param {() => void} onAfterHydrate e.g. reconcileWatchedSessionFiles
 */
export function startSessionsJsonWatcher(sessionsJsonPath, onAfterHydrate) {
    let sessionsJsonDebounce = null;
    const schedule = () => {
        if (sessionsJsonDebounce) return;
        sessionsJsonDebounce = setTimeout(() => {
            sessionsJsonDebounce = null;
            hydrateOpenclawSessionIndex();
            onAfterHydrate();
        }, 200);
    };

    sessionsJsonWatcher = chokidar.watch(sessionsJsonPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
    });
    sessionsJsonWatcher.on('add', schedule);
    sessionsJsonWatcher.on('change', schedule);
    sessionsJsonWatcher.on('error', (err) => {
        console.warn('[Chat/sessionIndex] sessions.json watcher error:', err.message);
    });
}

/** Exposed for tests / teardown if needed */
export function stopSessionsJsonWatcher() {
    if (sessionsJsonWatcher) {
        sessionsJsonWatcher.close();
        sessionsJsonWatcher = null;
    }
}
