import express from 'express';
import fs from 'fs/promises';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { apiLimiter } from '../utils/rateLimiter.js';
import {
    buildCanonicalSnapshot,
    buildOpenClawProjection,
    buildCursorProjection,
    buildIdeWorkbenchBundle
} from '../services/ideConfigBridge.js';
import {
    runOpenClawApply,
    runOpenClawUndo,
    getApplyUndoStatus
} from '../services/openclawApply.js';

const router = express.Router();

async function loadChannelConfig() {
    const { resolved } = await resolveSafe(
        process.env.WORKSPACE_ROOT,
        'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json'
    );
    const raw = await fs.readFile(resolved, 'utf8');
    return JSON.parse(raw);
}

router.get('/canonical', async (req, res, next) => {
    try {
        const cfg = await loadChannelConfig();
        res.json({ ok: true, data: buildCanonicalSnapshot(cfg) });
    } catch (e) {
        next(e);
    }
});

router.get('/openclaw', async (req, res, next) => {
    try {
        const cfg = await loadChannelConfig();
        const snap = buildCanonicalSnapshot(cfg);
        res.json({ ok: true, data: buildOpenClawProjection(snap) });
    } catch (e) {
        next(e);
    }
});

router.get('/ide', async (req, res, next) => {
    try {
        const cfg = await loadChannelConfig();
        const snap = buildCanonicalSnapshot(cfg);
        res.json({ ok: true, data: buildIdeWorkbenchBundle(snap) });
    } catch (e) {
        next(e);
    }
});

router.get('/cursor', async (req, res, next) => {
    try {
        const cfg = await loadChannelConfig();
        const snap = buildCanonicalSnapshot(cfg);
        res.json({ ok: true, data: buildCursorProjection(snap) });
    } catch (e) {
        next(e);
    }
});

const ApplyBodySchema = z.object({
    dryRun: z.boolean().optional().default(true),
    confirm: z.boolean().optional().default(false)
});

const UndoBodySchema = z.object({
    confirm: z.literal(true)
});

/** GET /api/exports/openclaw/apply-status — undo availability + destination path */
router.get('/openclaw/apply-status', async (req, res, next) => {
    try {
        res.json({ ok: true, ...getApplyUndoStatus() });
    } catch (e) {
        next(e);
    }
});

/**
 * POST /api/exports/openclaw/apply
 * Body: `{ dryRun?: true (default), confirm?: false }` — preview only unless `dryRun: false` and `confirm: true`.
 */
router.post('/openclaw/apply', apiLimiter, async (req, res, next) => {
    try {
        const body = ApplyBodySchema.parse(req.body ?? {});
        if (!body.dryRun && !body.confirm) {
            return res.status(400).json({
                ok: false,
                error: 'confirm_true_required',
                message: 'Send confirm: true together with dryRun: false to write, or dryRun: true to preview only.'
            });
        }
        const cfg = await loadChannelConfig();
        const result = await runOpenClawApply({
            channelConfigRaw: cfg,
            dryRun: body.dryRun,
            confirm: body.confirm,
            operator: req.ip || null
        });
        if (!result.ok && result.schemaErrors) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (e) {
        if (e instanceof z.ZodError) {
            e.status = 400;
            return next(e);
        }
        if (e.status === 404) {
            return res.status(404).json({ ok: false, message: e.message });
        }
        if (e.status === 409) {
            return res
                .status(409)
                .json({ ok: false, error: 'collision', message: e.message, details: e.details || null });
        }
        next(e);
    }
});

/** POST /api/exports/openclaw/undo — restore newest backup (body `{ confirm: true }`) */
router.post('/openclaw/undo', apiLimiter, async (req, res, next) => {
    try {
        UndoBodySchema.parse(req.body ?? {});
        const out = await runOpenClawUndo({ confirm: true, operator: req.ip || null });
        res.json({ ok: true, ...out });
    } catch (e) {
        if (e instanceof z.ZodError) {
            e.status = 400;
            return next(e);
        }
        if (e.status === 400) {
            return res.status(400).json({ ok: false, message: e.message });
        }
        next(e);
    }
});

export default router;
