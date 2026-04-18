/**
 * Bundle C2 — append A070 summary text into OpenClaw workspace memory with dedup + audit.
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { homedir } from 'os';
import lockfile from 'proper-lockfile';
import { resolveSafe } from '../utils/security.js';

export function getOpenclawWorkspaceRoot() {
    return process.env.OPENCLAW_WORKSPACE || path.join(homedir(), '.openclaw', 'workspace');
}

export function openclawMemoryDir() {
    return path.join(getOpenclawWorkspaceRoot(), 'memory');
}

export function getMemoryPromoteAuditPath() {
    return path.join(getOpenclawWorkspaceRoot(), 'channel-manager-memory-promote-audit.jsonl');
}

function studioFrameworkRoot() {
    return process.env.STUDIO_FRAMEWORK_ROOT || path.join(process.env.WORKSPACE_ROOT, 'Studio_Framework');
}

function a070BaseResolved() {
    return path.join(studioFrameworkRoot(), '050_Artifacts', 'A070_ide_cursor_summaries');
}

function todayDateSlug() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {string} sourceRelativePath
 * @param {string} text
 * @returns {{ block: string, marker: string, hash: string }}
 */
export function buildPromoteBlock(sourceRelativePath, text) {
    const trimmed = text.replace(/\s+$/u, '');
    const hash = crypto
        .createHash('sha256')
        .update(`v1\0${sourceRelativePath}\0${trimmed}`)
        .digest('hex');
    const marker = `<!-- CM_PROMOTE_${hash} -->`;
    const block = `\n\n${marker}\n## Promoted from A070 \`${sourceRelativePath}\`\n*${new Date().toISOString()}*\n\n${trimmed}\n\n`;
    return { block, marker, hash };
}

async function appendAudit(entry) {
    const logPath = getMemoryPromoteAuditPath();
    const line = `${JSON.stringify({ ...entry, ts: new Date().toISOString() })}\n`;
    await fsPromises.appendFile(logPath, line, 'utf8');
}

/**
 * @param {object} opts
 * @param {string} opts.sourceRelativePath — path under A070
 * @param {'daily'|'MEMORY_MD'} opts.destination
 * @param {string} [opts.date] — YYYY-MM-DD for daily file
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.confirm=false]
 * @param {boolean} [opts.memoryMdAck=false]
 * @param {string|null} [opts.operator]
 */
export async function runMemoryPromote({
    sourceRelativePath,
    destination,
    date,
    dryRun = true,
    confirm = false,
    memoryMdAck = false,
    operator = null
}) {
    if (!dryRun && !confirm) {
        const err = new Error('confirm must be true when dryRun is false');
        err.status = 400;
        throw err;
    }
    if (!dryRun && destination === 'MEMORY_MD' && !memoryMdAck) {
        const err = new Error('memoryMdAck must be true to append to MEMORY.md');
        err.status = 400;
        throw err;
    }

    const a070Base = a070BaseResolved();
    const relOs = sourceRelativePath.split('/').join(path.sep);
    const { resolved: sourceResolved } = await resolveSafe(a070Base, relOs);
    let text;
    try {
        text = await fsPromises.readFile(sourceResolved, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            const err = new Error(`Source summary not found: ${sourceRelativePath}`);
            err.status = 404;
            throw err;
        }
        throw e;
    }

    const { block, marker } = buildPromoteBlock(sourceRelativePath, text);

    const wsRoot = getOpenclawWorkspaceRoot();
    const memBase = openclawMemoryDir();
    let destRel;
    let destResolved;
    if (destination === 'MEMORY_MD') {
        destRel = 'MEMORY.md';
        ({ resolved: destResolved } = await resolveSafe(wsRoot, 'MEMORY.md'));
    } else {
        const slug = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDateSlug();
        destRel = `${slug}.md`;
        ({ resolved: destResolved } = await resolveSafe(memBase, destRel.split('/').join(path.sep)));
    }

    let existing = '';
    try {
        existing = await fsPromises.readFile(destResolved, 'utf8');
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }

    const duplicate = existing.includes(marker);

    if (dryRun || !confirm) {
        return {
            ok: true,
            dryRun: true,
            duplicate,
            destinationPath: destResolved,
            destinationRelative: destRel,
            sourceRelativePath,
            marker,
            previewAppend: block
        };
    }

    if (duplicate) {
        return {
            ok: true,
            dryRun: false,
            skipped: true,
            reason: 'duplicate',
            destinationPath: destResolved,
            destinationRelative: destRel,
            sourceRelativePath
        };
    }

    await fsPromises.mkdir(memBase, { recursive: true });

    const release = await lockfile.lock(destResolved, { retries: { retries: 15, minTimeout: 50 } });

    try {
        let body = '';
        try {
            body = await fsPromises.readFile(destResolved, 'utf8');
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        if (body.includes(marker)) {
            return {
                ok: true,
                dryRun: false,
                skipped: true,
                reason: 'duplicate',
                destinationPath: destResolved,
                destinationRelative: destRel,
                sourceRelativePath
            };
        }
        const next = body + block;
        const tmp = `${destResolved}.tmp.${process.pid}`;
        await fsPromises.writeFile(tmp, next, 'utf8');
        await fsPromises.rename(tmp, destResolved);
    } finally {
        await release();
    }

    await appendAudit({
        action: 'promote',
        operator,
        sourceRelativePath,
        destinationRelative: destRel,
        destinationPath: destResolved
    });

    return {
        ok: true,
        dryRun: false,
        skipped: false,
        destinationPath: destResolved,
        destinationRelative: destRel,
        sourceRelativePath
    };
}
