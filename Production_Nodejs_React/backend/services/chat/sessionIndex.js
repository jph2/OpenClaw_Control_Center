import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { normalizeChatIdForBuffer } from './channelAliases.js';
import { replaceBufferFromSessionFile } from './chatMirrorState.js';
import { telegramEvents } from './chatEvents.js';

/**
 * Pre-2026-04-20 the Channel Manager mirror only looked at the "main" agent
 * (~/.openclaw/agents/main/sessions/sessions.json). With the C1b.2a path CM
 * now writes per-channel synth agents (tars-<groupIdSlug>) and bindings route
 * Telegram traffic into their own sessions.json. So the mirror must merge
 * entries from every agent folder under ~/.openclaw/agents/.
 */
const DEFAULT_HOME = process.env.HOME || '/home/claw-agentbox';
const DEFAULT_AGENTS_ROOT = path.join(DEFAULT_HOME, '.openclaw/agents');
const LEGACY_MAIN_SESSIONS_JSON = path.join(DEFAULT_AGENTS_ROOT, 'main/sessions/sessions.json');

/** agent-id-prefix agnostic: `agent:<agentId>:telegram:group:<gid>`. */
const TELEGRAM_GROUP_KEY_RE = /^agent:([^:]+):telegram:group:(-?\d+)$/;

/** Maps OpenClaw session UUID → Telegram group id (across all agents). */
const sessionUuidToTelegramGroupId = new Map();

/** Telegram group id (string) → absolute path to canonical `sessionFile`. */
const telegramGroupIdToSessionFile = new Map();

/** Previous sessionFile per group — detect rebind and refresh buffer. */
let previousGroupIdToSessionFile = new Map();

let sessionsJsonWatcher = null;

/**
 * Backwards-compatible: returns the **legacy** main-agent sessions.json path
 * unless the caller has pinned a single file via `OPENCLAW_SESSIONS_JSON_PATH`.
 *
 * Newer callers should prefer `listAgentSessionsJsonPaths()` below.
 */
export const defaultSessionsJsonPath = () =>
    process.env.OPENCLAW_SESSIONS_JSON_PATH || LEGACY_MAIN_SESSIONS_JSON;

/**
 * List every "<agentsRoot>/<agentId>/sessions/sessions.json" that currently
 * exists on disk. OPENCLAW_SESSIONS_JSON_PATH, when set, short-circuits the
 * scan and pins the reader to that single file (used by tests).
 *
 * Ordered so the legacy `main` agent comes first for deterministic conflict
 * resolution when two agents happen to have the same `sessionId` (practically
 * never happens but we keep behaviour predictable).
 */
export function listAgentSessionsJsonPaths() {
    const override = process.env.OPENCLAW_SESSIONS_JSON_PATH;
    if (override) {
        return fs.existsSync(override) ? [override] : [];
    }

    const root = process.env.OPENCLAW_AGENTS_DIR || DEFAULT_AGENTS_ROOT;
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn('[Chat/sessionIndex] Could not scan agents root:', root, err.message);
        }
        return [];
    }

    const candidates = [];
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const candidate = path.join(root, ent.name, 'sessions', 'sessions.json');
        if (fs.existsSync(candidate)) candidates.push(candidate);
    }

    candidates.sort((a, b) => {
        const isMain = (p) => /\/agents\/main\/sessions\/sessions\.json$/.test(p);
        if (isMain(a) && !isMain(b)) return -1;
        if (!isMain(a) && isMain(b)) return 1;
        return a.localeCompare(b);
    });

    return candidates;
}

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
 * Safely parse a sessions.json file; returns {} on any error so one corrupt
 * file cannot take the whole mirror offline.
 */
function readSessionsJsonSafe(sessionsPath) {
    try {
        const raw = fs.readFileSync(sessionsPath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn('[Chat/sessionIndex] Failed to read', sessionsPath, '-', e.message);
        return {};
    }
}

/**
 * Re-read every agent's `sessions.json` so gateway lines can resolve group id
 * without per-line metadata. Also tracks the canonical `sessionFile` per
 * Telegram group (OpenClaw UI parity). Newer entries (higher `updatedAt`) win
 * when the same group id appears under multiple agents — that way, right after
 * a `cm-release-telegram-session` run, the CM mirror follows the synth agent
 * without requiring a service restart.
 */
export function hydrateOpenclawSessionIndex() {
    const paths = listAgentSessionsJsonPaths();
    if (paths.length === 0) {
        console.warn(
            `[Chat/sessionIndex] No sessions.json found under ${
                process.env.OPENCLAW_AGENTS_DIR || DEFAULT_AGENTS_ROOT
            } (override with OPENCLAW_SESSIONS_JSON_PATH or OPENCLAW_AGENTS_DIR).`
        );
        return;
    }

    sessionUuidToTelegramGroupId.clear();
    telegramGroupIdToSessionFile.clear();
    const nextGroupFile = new Map();
    /** group id → {agentId, updatedAt} of the currently-winning entry */
    const winners = new Map();

    let totalSessionIds = 0;

    for (const sessionsPath of paths) {
        const parsed = readSessionsJsonSafe(sessionsPath);

        for (const [sessionKey, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const m = sessionKey.match(TELEGRAM_GROUP_KEY_RE);
            if (!m) continue;
            const [, agentId, gid] = m;

            const sid = entry.sessionId;
            if (sid && typeof sid === 'string') {
                sessionUuidToTelegramGroupId.set(sid.toLowerCase(), gid);
                totalSessionIds++;
            }

            const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
            const prev = winners.get(gid);
            const prevUpdatedAt = prev ? prev.updatedAt : -1;

            if (!prev || updatedAt > prevUpdatedAt) {
                winners.set(gid, { agentId, updatedAt });
                if (entry.sessionFile && typeof entry.sessionFile === 'string') {
                    const abs = path.resolve(entry.sessionFile);
                    nextGroupFile.set(gid, abs);
                    telegramGroupIdToSessionFile.set(gid, abs);
                } else {
                    nextGroupFile.delete(gid);
                    telegramGroupIdToSessionFile.delete(gid);
                }
            }
        }
    }

    for (const [gid, newPath] of nextGroupFile) {
        const oldPath = previousGroupIdToSessionFile.get(gid);
        if (oldPath !== undefined && oldPath !== newPath) {
            console.log(
                `[Chat/sessionIndex] Session file rebind for group ${gid}: ${oldPath} → ${newPath}`
            );
            replaceBufferFromSessionFile(gid, newPath);
            telegramEvents.emit('sessionRebound', { chatId: gid, sessionFile: newPath });
        }
    }
    previousGroupIdToSessionFile = nextGroupFile;

    console.log(
        `[Chat/sessionIndex] Hydrated OpenClaw session index: ${totalSessionIds} session UUIDs, ` +
            `${telegramGroupIdToSessionFile.size} sessionFile paths across ${paths.length} agent file(s).`
    );
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
    let winningUpdatedAt = -1;

    for (const sessionsPath of listAgentSessionsJsonPaths()) {
        const parsed = readSessionsJsonSafe(sessionsPath);
        for (const [candidateKey, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const m = candidateKey.match(TELEGRAM_GROUP_KEY_RE);
            if (!m || m[2] !== key) continue;

            const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
            if (updatedAt < winningUpdatedAt) continue;

            winningUpdatedAt = updatedAt;
            sessionKey = candidateKey;
            sessionId = entry.sessionId || sessionId;
            deliveryContext = entry.deliveryContext || null;
        }
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
 * Debounced watcher on every agent's sessions.json (C1b.2d: include synth
 * agents in the CM mirror). Starts chokidar in non-polling mode on the
 * agents root and filters events to ".../sessions/sessions.json" paths so
 * new tars-<slug> agents are picked up automatically.
 *
 * @param {string} _legacyPath kept for backwards compatibility with callers
 *   that still pass the legacy main sessions.json path; ignored internally.
 * @param {() => void} onAfterHydrate e.g. reconcileWatchedSessionFiles
 */
export function startSessionsJsonWatcher(_legacyPath, onAfterHydrate) {
    const override = process.env.OPENCLAW_SESSIONS_JSON_PATH;
    const agentsRoot = process.env.OPENCLAW_AGENTS_DIR || DEFAULT_AGENTS_ROOT;

    let sessionsJsonDebounce = null;
    const schedule = () => {
        if (sessionsJsonDebounce) return;
        sessionsJsonDebounce = setTimeout(() => {
            sessionsJsonDebounce = null;
            hydrateOpenclawSessionIndex();
            onAfterHydrate();
        }, 200);
    };

    const watchTarget = override || agentsRoot;
    sessionsJsonWatcher = chokidar.watch(watchTarget, {
        persistent: true,
        ignoreInitial: true,
        depth: override ? 0 : 3,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
    });

    const handlePath = (filePath) => {
        if (!override && !/[\\/]sessions[\\/]sessions\.json$/.test(filePath)) {
            return;
        }
        schedule();
    };

    sessionsJsonWatcher.on('add', handlePath);
    sessionsJsonWatcher.on('change', handlePath);
    sessionsJsonWatcher.on('unlink', handlePath);
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
