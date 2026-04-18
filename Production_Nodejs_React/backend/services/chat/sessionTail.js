import chokidar from 'chokidar';
import fs from 'fs';
import { processGatewayMessage } from './sessionIngest.js';
import { listCanonicalSessionFilePaths } from './sessionIndex.js';

const watchedSessionFiles = new Set();
let sessionFilesWatcher = null;

const fileOffsets = new Map();

function ensureSessionFilesWatcher() {
    if (sessionFilesWatcher) return sessionFilesWatcher;
    sessionFilesWatcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
        alwaysStat: false
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
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'message' && parsed.message) {
                    processGatewayMessage(parsed, false, filePath);
                }
            } catch {
                /* skip bad line */
            }
        }
    } catch (err) {
        console.warn(`[Chat/sessionTail] handleSessionFileAppend failed for ${filePath}:`, err.message);
    }
}

export function getWatchedSessionFilesCount() {
    return watchedSessionFiles.size;
}
