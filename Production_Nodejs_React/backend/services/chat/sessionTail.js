import chokidar from 'chokidar';
import fs from 'fs';
import { processGatewayMessage } from './sessionIngest.js';
import { listCanonicalSessionFilePaths } from './sessionIndex.js';

const watchedSessionFiles = new Set();
let sessionFilesWatcher = null;

const fileOffsets = new Map();

// Polling is used deliberately instead of inotify-backed fs.watch because OpenClaw
// appends to per-session JSONL files in small bursts. Under those conditions chokidar
// silently drops change events on ext4 when `awaitWriteFinish` is combined with plain
// append-writes (observed 2026-04-20: 3 registered files, 0 matching inotify watches).
// Polling at 200ms: faster mirror for CM OpenClaw Chat vs Telegram (~half the average
// wait vs 400ms) while still cheap for a few JSONL files. (chokidar + ext4 append quirk)
const SESSION_TAIL_POLL_INTERVAL_MS = 200;

function ensureSessionFilesWatcher() {
    if (sessionFilesWatcher) return sessionFilesWatcher;
    sessionFilesWatcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
        alwaysStat: false,
        usePolling: true,
        interval: SESSION_TAIL_POLL_INTERVAL_MS,
        binaryInterval: SESSION_TAIL_POLL_INTERVAL_MS * 2
    });
    sessionFilesWatcher.on('add', handleSessionFileAppend);
    sessionFilesWatcher.on('change', handleSessionFileAppend);
    sessionFilesWatcher.on('unlink', (filePath) => {
        watchedSessionFiles.delete(filePath);
        fileOffsets.delete(filePath);
    });
    sessionFilesWatcher.on('error', (err) => {
        console.warn('[Chat/sessionTail] session files watcher error:', err.message);
    });
    return sessionFilesWatcher;
}

/**
 * Diff the currently-watched session files against the session index; add/seed
 * newly-bound files and stop watching files that are no longer referenced.
 */
export function reconcileWatchedSessionFiles() {
    const watcher = ensureSessionFilesWatcher();
    const nextSet = listCanonicalSessionFilePaths();

    for (const filePath of nextSet) {
        if (!filePath || typeof filePath !== 'string') continue;
        if (watchedSessionFiles.has(filePath)) continue;
        watchedSessionFiles.add(filePath);
        watcher.add(filePath);
        seedSessionFileBuffer(filePath);
        console.log(`[Chat/sessionTail] Watching canonical session file: ${filePath}`);
    }

    for (const filePath of Array.from(watchedSessionFiles)) {
        if (nextSet.has(filePath)) continue;
        watchedSessionFiles.delete(filePath);
        try {
            watcher.unwatch(filePath);
        } catch {
            /* best effort */
        }
        fileOffsets.delete(filePath);
    }
}

function seedSessionFileBuffer(filePath, tailLines = 200) {
    try {
        if (!fs.existsSync(filePath)) {
            fileOffsets.set(filePath, 0);
            return;
        }
        const stat = fs.statSync(filePath);
        fileOffsets.set(filePath, stat.size);

        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw.split('\n').filter((l) => l.trim() !== '');
        const recent = lines.slice(-tailLines);
        for (const line of recent) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message' && parsed.message) {
                    processGatewayMessage(parsed, true, filePath);
                }
            } catch {
                /* skip bad line */
            }
        }
    } catch (err) {
        console.warn(`[Chat/sessionTail] seedSessionFileBuffer failed for ${filePath}:`, err.message);
    }
}

function handleSessionFileAppend(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            fileOffsets.delete(filePath);
            return;
        }
        const stat = fs.statSync(filePath);
        const prevOffset = fileOffsets.get(filePath) ?? 0;

        if (stat.size < prevOffset) {
            fileOffsets.set(filePath, 0);
            seedSessionFileBuffer(filePath);
            return;
        }
        if (stat.size === prevOffset) return;

        const delta = stat.size - prevOffset;
        const buf = Buffer.alloc(delta);
        const fd = fs.openSync(filePath, 'r');
        try {
            fs.readSync(fd, buf, 0, delta, prevOffset);
        } finally {
            fs.closeSync(fd);
        }

        const chunk = buf.toString('utf8');
        const lastNewline = chunk.lastIndexOf('\n');
        if (lastNewline < 0) {
            return;
        }

        const processable = chunk.slice(0, lastNewline);
        const consumedBytes = Buffer.byteLength(processable, 'utf8') + 1;
        fileOffsets.set(filePath, prevOffset + consumedBytes);

        const lines = processable.split('\n').filter((l) => l.trim() !== '');
        let messageCount = 0;
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message' && parsed.message) {
                    processGatewayMessage(parsed, false, filePath);
                    messageCount += 1;
                }
            } catch {
                /* skip bad line */
            }
        }
        if (messageCount > 0) {
            console.log(
                `[Chat/sessionTail] Appended ${messageCount} gateway message(s) from ${filePath} (+${delta} bytes).`
            );
        }
    } catch (err) {
        console.warn(`[Chat/sessionTail] handleSessionFileAppend failed for ${filePath}:`, err.message);
    }
}

export function getWatchedSessionFilesCount() {
    return watchedSessionFiles.size;
}
