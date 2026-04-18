import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { apiLimiter } from '../utils/rateLimiter.js';
import { runMemoryPromote } from '../services/memoryPromote.js';

const router = express.Router();
/** Same router is mounted at `/api/summaries` and `/api/ide-project-summaries` (generic IDE project summary API). */

const SummaryWriteSchema = z.object({
    relativePath: z
        .string()
        .min(1)
        .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid relative path'),
    text: z.string(),
    createOnly: z.boolean().optional()
});

const MemoryPromoteSchema = z
    .object({
        dryRun: z.boolean().optional().default(true),
        confirm: z.boolean().optional().default(false),
        sourceRelativePath: z
            .string()
            .min(1)
            .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid source path'),
        destination: z.enum(['daily', 'MEMORY_MD']),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        memoryMdAck: z.boolean().optional().default(false)
    })
    .superRefine((val, ctx) => {
        if (!val.dryRun && !val.confirm) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'confirm: true is required when dryRun is false',
                path: ['confirm']
            });
        }
        if (!val.dryRun && val.destination === 'MEMORY_MD' && !val.memoryMdAck) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'memoryMdAck: true is required to append to MEMORY.md',
                path: ['memoryMdAck']
            });
        }
    });

function openclawMemoryDir() {
    const ws = process.env.OPENCLAW_WORKSPACE || path.join(homedir(), '.openclaw', 'workspace');
    return path.join(ws, 'memory');
}

function studioFrameworkRoot() {
    return process.env.STUDIO_FRAMEWORK_ROOT || path.join(process.env.WORKSPACE_ROOT, 'Studio_Framework');
}

function a070BaseResolved() {
    const root = studioFrameworkRoot();
    return path.join(root, '050_Artifacts', 'A070_ide_cursor_summaries');
}

async function walkMarkdownFiles(dir, acc, base) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return acc;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await walkMarkdownFiles(full, acc, base);
        } else if (ent.isFile() && ent.name.endsWith('.md')) {
            const st = await fs.stat(full);
            const rel = path.relative(base, full);
            acc.push({
                relativePath: rel.split(path.sep).join('/'),
                size: st.size,
                mtimeMs: st.mtimeMs
            });
        }
    }
    return acc;
}

const MAX_FILES = 400;
const MAX_MEMORY_LIST = 200;

/**
 * POST /api/summaries
 * Write Markdown under A070 (Sub-Task 6.10b). Paths must stay under the A070 root.
 */
router.post('/', async (req, res, next) => {
    try {
        const body = SummaryWriteSchema.parse(req.body);
        const base = a070BaseResolved();
        await fs.mkdir(base, { recursive: true });
        const relOs = body.relativePath.split('/').join(path.sep);
        const { resolved } = await resolveSafe(base, relOs);
        if (body.createOnly) {
            try {
                await fs.access(resolved);
                return res.status(409).json({ ok: false, error: 'File already exists (createOnly).' });
            } catch {
                /* ok */
            }
        }
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, body.text, 'utf8');
        res.json({ ok: true, relativePath: body.relativePath });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        next(e);
    }
});

/**
 * GET /api/summaries?telegramId=-100...&q=optionalSubstring
 */
router.get('/', async (req, res, next) => {
    try {
        const base = a070BaseResolved();
        try {
            await fs.stat(base);
        } catch {
            return res.json({
                ok: true,
                base,
                total: 0,
                returned: 0,
                truncated: false,
                files: [],
                note: 'A070 path missing or empty — create Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/'
            });
        }

        const list = [];
        await walkMarkdownFiles(base, list, base);

        const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';
        const q = req.query.q ? String(req.query.q).toLowerCase() : '';

        let filtered = list;
        if (telegramId) {
            filtered = filtered.filter((f) => f.relativePath.includes(telegramId));
        }
        if (q) {
            filtered = filtered.filter((f) => f.relativePath.toLowerCase().includes(q));
        }

        filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const truncated = filtered.length > MAX_FILES;
        const slice = filtered.slice(0, MAX_FILES);

        const previews = await Promise.all(
            slice.map(async (f) => {
                try {
                    const { resolved } = await resolveSafe(base, f.relativePath.split('/').join(path.sep));
                    const raw = await fs.readFile(resolved, 'utf8');
                    return { ...f, preview: raw.slice(0, 2000) };
                } catch {
                    return { ...f, preview: '' };
                }
            })
        );

        res.json({
            ok: true,
            base,
            total: list.length,
            matched: filtered.length,
            returned: previews.length,
            truncated,
            files: previews
        });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /api/summaries/file?relative=by_tg/foo/bar.md
 */
router.get('/file', async (req, res, next) => {
    try {
        const rel = req.query.relative;
        if (!rel || typeof rel !== 'string') {
            return res.status(400).json({ ok: false, error: 'relative query required' });
        }
        if (rel.includes('..')) {
            return res.status(400).json({ ok: false, error: 'invalid path' });
        }
        const base = a070BaseResolved();
        const { resolved } = await resolveSafe(base, rel.split('/').join(path.sep));
        const text = await fs.readFile(resolved, 'utf8');
        res.json({ ok: true, relativePath: rel, text });
    } catch (e) {
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        next(e);
    }
});

/**
 * GET /api/summaries/memory?telegramId=...
 * Read-only list of *.md under OPENCLAW_WORKSPACE/memory (default ~/.openclaw/workspace/memory).
 */
router.get('/memory', async (req, res, next) => {
    try {
        const base = openclawMemoryDir();
        try {
            await fs.stat(base);
        } catch {
            return res.json({
                ok: true,
                base,
                files: [],
                note: 'OpenClaw memory directory not found — check OPENCLAW_WORKSPACE or ~/.openclaw/workspace/memory'
            });
        }
        const list = [];
        await walkMarkdownFiles(base, list, base);
        const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';
        let filtered = list;
        if (telegramId) {
            filtered = filtered.filter((f) => f.relativePath.includes(telegramId));
        }
        filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
        res.json({
            ok: true,
            base,
            returned: Math.min(filtered.length, MAX_MEMORY_LIST),
            files: filtered.slice(0, MAX_MEMORY_LIST)
        });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /api/summaries/memory/file?relative=...
 */
/**
 * POST /api/summaries/promote
 * Append A070 summary into `~/.openclaw/workspace/memory/YYYY-MM-DD.md` or `MEMORY.md` (Bundle C2).
 * Default `dryRun: true` — preview duplicate + append text; set `dryRun: false` and `confirm: true` to write.
 */
router.post('/promote', apiLimiter, async (req, res, next) => {
    try {
        const body = MemoryPromoteSchema.parse(req.body);
        const result = await runMemoryPromote({
            sourceRelativePath: body.sourceRelativePath,
            destination: body.destination,
            date: body.date,
            dryRun: body.dryRun,
            confirm: body.confirm,
            memoryMdAck: body.memoryMdAck,
            operator: req.ip || null
        });
        res.json({ ok: true, ...result });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400 || e.status === 404) {
            return res.status(e.status).json({ ok: false, error: e.message });
        }
        next(e);
    }
});

router.get('/memory/file', async (req, res, next) => {
    try {
        const rel = req.query.relative;
        if (!rel || typeof rel !== 'string') {
            return res.status(400).json({ ok: false, error: 'relative query required' });
        }
        if (rel.includes('..')) {
            return res.status(400).json({ ok: false, error: 'invalid path' });
        }
        const base = openclawMemoryDir();
        const { resolved } = await resolveSafe(base, rel.split('/').join(path.sep));
        const text = await fs.readFile(resolved, 'utf8');
        res.json({ ok: true, relativePath: rel, text });
    } catch (e) {
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        next(e);
    }
});

export default router;
