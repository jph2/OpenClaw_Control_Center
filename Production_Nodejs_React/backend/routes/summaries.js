import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { apiLimiter } from '../utils/rateLimiter.js';
import { isValidTtgId } from '../services/ttgBindingResolver.js';
import { parseArtifactHeaderBinding, upsertArtifactHeaderBinding } from '../services/artifactHeaderBinding.js';
import { buildArtifactIndex, indexMarkdownArtifact } from '../services/artifactIndex.js';
import {
    buildOpenBrainExportRecord,
    OpenBrainExportBlockedError
} from '../services/openBrainExportContract.js';
import { writeOpenBrainSyncAuditEntry } from '../services/openBrainSyncAudit.js';
import {
    OpenBrainSyncDispatchError,
    runOpenBrainLiveSync
} from '../services/openBrainSyncDispatch.js';
import { buildChannelMappingsFromConfig, classifyArtifactTtg, loadTtgDefinitions } from '../services/ttgClassifier.js';
import { runMemoryPromote } from '../services/memoryPromote.js';
import {
    assertPromoteBindingAllowed,
    buildIdeWorkUnit,
    computeWorkUnitStatus,
    confirmWorkUnitRouting,
    mergeTtgClassificationIntoMeta,
    readJsonIfExists,
    readJsonWithStatus,
    summaryMetaRelativePath,
    updateMetaAfterPromotion,
    writeJsonAtomic
} from '../services/ideWorkUnit.js';
import {
    readIdeCaptureStatus,
    resolveWorkspaceStorageRoot,
    runIdeChatCapture,
    isIdeCaptureEnabled
} from '../services/ideChatCapture.js';
import { writeIdeCaptureSettings } from '../services/ideCaptureSettingsStore.js';
import { runRemoteMountScript } from '../services/ideCaptureRemoteMount.js';
import {
    isSimpleMountEnabled,
    runSimpleSmbMount,
    runSimpleUmount
} from '../services/ideCaptureSimpleMount.js';
import { ensureIdeCaptureWorkspaceDir } from '../services/ideCapturePathEnsure.js';
import { normalizeWorkspaceStorageRootForFs, isStoredWorkspaceStorageRootValid } from '../services/cursorWorkspacePath.js';
import {
    normalizeProjectMappings,
    readChannelConfigForProjectMappings,
    readProjectMappings,
    writeProjectMappings
} from '../services/projectMappingStore.js';

const router = express.Router();
/** Same router is mounted at `/api/summaries` and `/api/ide-project-summaries` (generic IDE project summary API). */

const SummaryWriteSchema = z.object({
    relativePath: z
        .string()
        .min(1)
        .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid relative path'),
    text: z.string(),
    createOnly: z.boolean().optional(),
    meta: z
        .object({
            ttgId: z.string().optional(),
            explicitTtgId: z.string().optional(),
            channelName: z.string().optional(),
            surface: z.enum(['cursor', 'codex', 'manual', 'unknown']).optional(),
            projectRoot: z.string().optional(),
            projectId: z.string().optional(),
            repoSlug: z.string().optional(),
            repoRemote: z.string().optional(),
            head: z.string().optional(),
            model: z.string().optional(),
            agent: z.string().optional(),
            sessionId: z.string().optional(),
            operator: z.string().optional(),
            projectMappingKey: z.string().optional(),
            pathHints: z.array(z.string()).optional()
        })
        .optional()
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

const SummaryRoutingConfirmSchema = z.object({
    sourceRelativePath: z
        .string()
        .min(1)
        .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid source path'),
    ttgId: z.string().refine((value) => isValidTtgId(value), 'invalid TTG id'),
    ttgName: z.string().optional().default(''),
    reason: z.string().optional().default('operator accepted routing suggestion')
});

const IdeCaptureRunSchema = z.object({
    force: z.boolean().optional().default(false)
});

const IdeCaptureSettingsSchema = z.object({
    workspaceStorageRoot: z.union([z.string().max(4096), z.literal(''), z.null()])
});

const IdeCaptureMountSchema = z.object({
    action: z.enum(['mount', 'umount', 'status'])
});

const IdeCaptureEnsurePathSchema = z.object({
    path: z.string().max(4096).optional()
});

const IdeCaptureSimpleSmbMountSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('mount'),
        host: z.string().min(1).max(253),
        share: z.string().min(1).max(80),
        username: z.string().min(1).max(256),
        password: z.string().max(512),
        mountPoint: z.string().min(1).max(4096),
        domain: z.string().max(256).optional()
    }),
    z.object({
        action: z.literal('umount'),
        mountPoint: z.string().min(1).max(4096)
    })
]);

const ProjectMappingsBodySchema = z.object({
    projectMappings: z.array(z.object({
        projectId: z.string().optional(),
        repoSlug: z.string().optional(),
        projectMappingKey: z.string().optional(),
        ttgId: z.string(),
        label: z.string().optional(),
        note: z.string().optional(),
        updatedAt: z.string().optional()
    }))
});

const ArtifactBindingConfirmSchema = z.object({
    sourcePath: z
        .string()
        .min(1)
        .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid sourcePath'),
    ttgId: z.string().refine((value) => isValidTtgId(value), 'invalid TTG id'),
    ttgName: z.string().optional().default(''),
    reason: z.string().optional().default('operator confirmed TTG binding')
});

const OpenBrainSyncSchema = z
    .object({
        sourcePath: z
            .string()
            .min(1)
            .refine((s) => !s.includes('..') && !path.isAbsolute(s), 'invalid sourcePath'),
        dryRun: z.boolean().optional().default(true),
        confirm: z.boolean().optional().default(false),
        surface: z.enum(['cursor', 'codex', 'manual', 'unknown', 'opencode', 'telegram', 'chat']).optional()
    })
    .superRefine((val, ctx) => {
        if (!val.dryRun && !val.confirm) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'confirm: true is required when dryRun is false',
                path: ['confirm']
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
 * Write Markdown under A070_ide_cursor_summaries (Sub-Task 6.10b). Paths must stay under the A070_ide_cursor_summaries root.
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

        const metaRel = summaryMetaRelativePath(body.relativePath);
        const { resolved: metaResolved } = await resolveSafe(base, metaRel.split('/').join(path.sep));
        const existingMeta = await readJsonIfExists(metaResolved);
        const { config } = await readChannelConfigForProjectMappings();
        const projectMappings = normalizeProjectMappings(config.projectMappings);
        const headerParsed = parseArtifactHeaderBinding(body.text);
        const artifactForClassifier = {
            title: String(headerParsed.frontmatter?.title || ''),
            type: String(headerParsed.frontmatter?.type || ''),
            tags: Array.isArray(headerParsed.frontmatter?.tags) ? headerParsed.frontmatter.tags.map(String) : []
        };
        const ttgDefinitions = await loadTtgDefinitions({
            studioRoot: studioFrameworkRoot(),
            channelMappings: buildChannelMappingsFromConfig(config)
        });
        const classification = classifyArtifactTtg({
            artifact: artifactForClassifier,
            markdown: body.text,
            ttgDefinitions
        });
        let meta = buildIdeWorkUnit({
            summaryRelativePath: body.relativePath,
            text: body.text,
            ttgId: body.meta?.explicitTtgId || body.meta?.ttgId,
            channelName: body.meta?.channelName,
            surface: body.meta?.surface,
            projectRoot: body.meta?.projectRoot,
            projectId: body.meta?.projectId,
            repoSlug: body.meta?.repoSlug,
            repoRemote: body.meta?.repoRemote,
            head: body.meta?.head,
            model: body.meta?.model,
            agent: body.meta?.agent,
            sessionId: body.meta?.sessionId,
            operator: body.meta?.operator,
            projectMappingKey: body.meta?.projectMappingKey,
            pathHints: body.meta?.pathHints,
            projectMappings,
            existing: existingMeta
        });
        meta = mergeTtgClassificationIntoMeta(meta, classification);
        await writeJsonAtomic(metaResolved, meta);

        res.json({ ok: true, relativePath: body.relativePath, metaRelativePath: metaRel, meta });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        next(e);
    }
});

router.get('/project-mappings', async (req, res, next) => {
    try {
        const projectMappings = await readProjectMappings();
        res.json({ ok: true, projectMappings });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        next(e);
    }
});

router.put('/project-mappings', async (req, res, next) => {
    try {
        const body = ProjectMappingsBodySchema.parse(req.body);
        const projectMappings = await writeProjectMappings(body.projectMappings);
        res.json({ ok: true, projectMappings });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
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
                note: 'A070_ide_cursor_summaries path missing or empty — create Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/'
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
                    const metaRel = summaryMetaRelativePath(f.relativePath);
                    const { resolved: metaResolved } = await resolveSafe(base, metaRel.split('/').join(path.sep));
                    const metaRead = await readJsonWithStatus(metaResolved);
                    const meta = metaRead.invalid ? { __invalid: true, error: metaRead.error } : metaRead.value;
                    return {
                        ...f,
                        preview: raw.slice(0, 2000),
                        metaRelativePath: metaRel,
                        meta: metaRead.invalid ? null : meta,
                        metaInvalid: metaRead.invalid,
                        metaError: metaRead.invalid ? metaRead.error : undefined,
                        bridgeStatus: computeWorkUnitStatus(meta, true)
                    };
                } catch {
                    return { ...f, preview: '', meta: null, bridgeStatus: 'draft_saved' };
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
 * GET /api/summaries/artifact-index
 * Read-only computed index of Studio artifacts. This is the shared resolver
 * view for later promote/export/sync flows.
 */
router.get('/artifact-index', async (req, res, next) => {
    try {
        const root = studioFrameworkRoot();
        const { config } = await readChannelConfigForProjectMappings();
        const index = await buildArtifactIndex({
            studioRoot: root,
            channelMappings: buildChannelMappingsFromConfig(config)
        });
        const obProvider = (process.env.OPEN_BRAIN_SYNC_PROVIDER || 'stub').toLowerCase();
        res.json({
            ok: true,
            ...index,
            openBrainSync: {
                provider: obProvider,
                httpConfigured: obProvider === 'http' && Boolean(String(process.env.OPEN_BRAIN_SYNC_URL || '').trim())
            }
        });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /api/summaries/open-brain-export?sourcePath=050_Artifacts/...
 * Read-only builder for the Open Brain export contract. This returns an
 * OB1-ready upsert payload; it does not sync or mutate Open Brain.
 */
router.get('/open-brain-export', async (req, res, next) => {
    try {
        const sourcePath = req.query.sourcePath;
        if (!sourcePath || typeof sourcePath !== 'string') {
            return res.status(400).json({ ok: false, error: 'sourcePath query required' });
        }
        if (sourcePath.includes('..') || path.isAbsolute(sourcePath)) {
            return res.status(400).json({ ok: false, error: 'invalid sourcePath' });
        }
        const root = studioFrameworkRoot();
        const { resolved } = await resolveSafe(root, sourcePath.split('/').join(path.sep));
        const markdown = await fs.readFile(resolved, 'utf8');
        const { config } = await readChannelConfigForProjectMappings();
        const record = indexMarkdownArtifact({
            studioRoot: root,
            filePath: resolved,
            markdown,
            ttgDefinitions: await loadTtgDefinitions({
                studioRoot: root,
                channelMappings: buildChannelMappingsFromConfig(config)
            })
        });
        const exportRecord = buildOpenBrainExportRecord(record, {
            markdown,
            producer: {
                surface: req.query.surface ? String(req.query.surface) : 'unknown',
                agent: req.query.agent ? String(req.query.agent) : '',
                model: req.query.model ? String(req.query.model) : '',
                sessionId: req.query.sessionId ? String(req.query.sessionId) : '',
                operator: req.ip || ''
            }
        });
        res.json({ ok: true, export: exportRecord });
    } catch (e) {
        if (e instanceof OpenBrainExportBlockedError) {
            return res.status(e.status).json({ ok: false, error: e.message, details: e.details });
        }
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        if (e.code === 'ENOENT') return res.status(404).json({ ok: false, error: 'source artifact not found' });
        next(e);
    }
});

/**
 * GET /api/summaries/studio-artifact-file?sourcePath=050_Artifacts/...
 * Read-only full Markdown for CM TTG review / preview (same path rules as export).
 */
router.get('/studio-artifact-file', async (req, res, next) => {
    try {
        const sourcePath = req.query.sourcePath;
        if (!sourcePath || typeof sourcePath !== 'string') {
            return res.status(400).json({ ok: false, error: 'sourcePath query required' });
        }
        if (sourcePath.includes('..') || path.isAbsolute(sourcePath)) {
            return res.status(400).json({ ok: false, error: 'invalid sourcePath' });
        }
        const root = studioFrameworkRoot();
        const { resolved } = await resolveSafe(root, sourcePath.split('/').join(path.sep));
        const text = await fs.readFile(resolved, 'utf8');
        res.json({ ok: true, sourcePath, text });
    } catch (e) {
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        if (e.code === 'ENOENT') return res.status(404).json({ ok: false, error: 'source artifact not found' });
        next(e);
    }
});

/**
 * POST /api/summaries/open-brain-sync
 * Ticket G: audited sync. `stub` (default) is local-only; `http` POSTs the export
 * payload to OPEN_BRAIN_SYNC_URL and records the returned thought id. Requires
 * export eligibility `ready`.
 */
router.post('/open-brain-sync', apiLimiter, async (req, res, next) => {
    try {
        const body = OpenBrainSyncSchema.parse(req.body);
        const root = studioFrameworkRoot();
        const { resolved } = await resolveSafe(root, body.sourcePath.split('/').join(path.sep));
        const markdown = await fs.readFile(resolved, 'utf8');
        const { config } = await readChannelConfigForProjectMappings();
        const ttgDefinitions = await loadTtgDefinitions({
            studioRoot: root,
            channelMappings: buildChannelMappingsFromConfig(config)
        });
        const record = indexMarkdownArtifact({
            studioRoot: root,
            filePath: resolved,
            markdown,
            ttgDefinitions
        });
        if (record.exportEligibility?.status !== 'ready') {
            return res.status(400).json({
                ok: false,
                error: 'Artifact is not eligible for Open Brain sync',
                exportEligibility: record.exportEligibility,
                header: record.header,
                binding: record.binding,
                secretGate: record.secretGate
            });
        }
        const exportRecord = buildOpenBrainExportRecord(record, {
            markdown,
            producer: {
                surface: body.surface || 'manual',
                agent: '',
                model: '',
                sessionId: '',
                operator: req.ip || '',
                createdAt: new Date().toISOString()
            }
        });
        if (body.dryRun) {
            return res.json({
                ok: true,
                dryRun: true,
                sourcePath: body.sourcePath,
                export: exportRecord,
                record
            });
        }
        let syncResult;
        try {
            syncResult = await runOpenBrainLiveSync(exportRecord);
        } catch (err) {
            if (err instanceof OpenBrainSyncDispatchError) {
                return res.status(err.statusCode).json({
                    ok: false,
                    error: err.message,
                    details: err.details
                });
            }
            throw err;
        }
        const { provider, thoughtId } = syncResult;
        await writeOpenBrainSyncAuditEntry(body.sourcePath, {
            provider,
            thoughtId,
            dedupIdentity: exportRecord.dedup.identity,
            contentHashAtSync: exportRecord.content.hash,
            lastSyncedAt: new Date().toISOString(),
            lastExportMode: exportRecord.exportMode
        });
        res.json({
            ok: true,
            dryRun: false,
            synced: true,
            provider,
            sourcePath: body.sourcePath,
            thoughtId,
            dedupIdentity: exportRecord.dedup.identity,
            contentHash: exportRecord.content.hash
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e instanceof OpenBrainExportBlockedError) {
            return res.status(e.status).json({ ok: false, error: e.message, details: e.details });
        }
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        if (e.code === 'ENOENT') return res.status(404).json({ ok: false, error: 'source artifact not found' });
        next(e);
    }
});

/**
 * POST /api/summaries/artifact-binding/confirm
 * Durable confirmation for a reviewable classifier result. This materializes
 * the selected TTG as artifact-owned YAML frontmatter; it is not a transient UI
 * flag and it does not promote/sync memory.
 */
router.post('/artifact-binding/confirm', apiLimiter, async (req, res, next) => {
    try {
        const body = ArtifactBindingConfirmSchema.parse(req.body);
        const root = studioFrameworkRoot();
        const { resolved } = await resolveSafe(root, body.sourcePath.split('/').join(path.sep));
        const markdown = await fs.readFile(resolved, 'utf8');
        const updated = upsertArtifactHeaderBinding(markdown, {
            ttgId: body.ttgId,
            ttgName: body.ttgName,
            reason: body.reason
        });
        await fs.writeFile(resolved, updated, 'utf8');
        const record = indexMarkdownArtifact({ studioRoot: root, filePath: resolved, markdown: updated });
        res.json({ ok: true, sourcePath: body.sourcePath, record });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400) return res.status(400).json({ ok: false, error: e.message });
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        if (e.code === 'ENOENT') return res.status(404).json({ ok: false, error: 'source artifact not found' });
        next(e);
    }
});

/**
 * GET /api/summaries/file?relative=by_ttg/foo/bar.md
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
        const metaRel = summaryMetaRelativePath(rel);
        const { resolved: metaResolved } = await resolveSafe(base, metaRel.split('/').join(path.sep));
        const metaRead = await readJsonWithStatus(metaResolved);
        const meta = metaRead.invalid ? { __invalid: true, error: metaRead.error } : metaRead.value;
        res.json({
            ok: true,
            relativePath: rel,
            text,
            metaRelativePath: metaRel,
            meta: metaRead.invalid ? null : meta,
            metaInvalid: metaRead.invalid,
            metaError: metaRead.invalid ? metaRead.error : undefined,
            bridgeStatus: computeWorkUnitStatus(meta, true)
        });
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
 * POST /api/summaries/routing/confirm
 * Human-in-the-loop confirmation for an A070 summary sidecar. Agent/classifier
 * proposals are advisory only; this endpoint materializes the selected TTG as
 * the operative summary binding without touching Channel Manager agent/skill
 * configuration.
 */
router.post('/routing/confirm', apiLimiter, async (req, res, next) => {
    try {
        const body = SummaryRoutingConfirmSchema.parse(req.body);
        const base = a070BaseResolved();
        const metaRel = summaryMetaRelativePath(body.sourceRelativePath);
        const { resolved: metaResolved } = await resolveSafe(base, metaRel.split('/').join(path.sep));
        const existingMeta = await readJsonWithStatus(metaResolved);
        if (!existingMeta.exists) {
            return res.status(404).json({ ok: false, error: 'summary metadata not found' });
        }
        if (existingMeta.invalid) {
            return res.status(400).json({
                ok: false,
                error: 'summary metadata is invalid',
                details: existingMeta.error
            });
        }
        const meta = confirmWorkUnitRouting(existingMeta.value, {
            ttgId: body.ttgId,
            ttgName: body.ttgName,
            reason: body.reason
        });
        await writeJsonAtomic(metaResolved, meta);
        res.json({
            ok: true,
            sourceRelativePath: body.sourceRelativePath,
            metaRelativePath: metaRel,
            meta,
            bridgeStatus: computeWorkUnitStatus(meta, true)
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400) return res.status(400).json({ ok: false, error: e.message });
        if (e.status === 403) return res.status(403).json({ ok: false, error: 'path blocked' });
        next(e);
    }
});

/**
 * POST /api/summaries/promote
 * Append a summary from A070_ide_cursor_summaries into `~/.openclaw/workspace/memory/YYYY-MM-DD.md` or `MEMORY.md` (Bundle C2).
 * Default `dryRun: true` — preview duplicate + append text; set `dryRun: false` and `confirm: true` to write.
 */
router.post('/promote', apiLimiter, async (req, res, next) => {
    try {
        const body = MemoryPromoteSchema.parse(req.body);
        const base = a070BaseResolved();
        const relOs = body.sourceRelativePath.split('/').join(path.sep);
        try {
            const { resolved: sourceResolved } = await resolveSafe(base, relOs);
            await fs.access(sourceResolved);
        } catch (e) {
            if (e && e.code === 'ENOENT') {
                return res.status(404).json({
                    ok: false,
                    error: `Source summary not found: ${body.sourceRelativePath}`
                });
            }
            throw e;
        }
        const metaRel = summaryMetaRelativePath(body.sourceRelativePath);
        const { resolved: metaResolved } = await resolveSafe(base, metaRel.split('/').join(path.sep));
        const existingMeta = await readJsonIfExists(metaResolved);
        assertPromoteBindingAllowed(existingMeta);
        const result = await runMemoryPromote({
            sourceRelativePath: body.sourceRelativePath,
            destination: body.destination,
            date: body.date,
            dryRun: body.dryRun,
            confirm: body.confirm,
            memoryMdAck: body.memoryMdAck,
            operator: req.ip || null
        });
        if (!body.dryRun && result.ok) {
            const meta = updateMetaAfterPromotion(existingMeta, result);
            await writeJsonAtomic(metaResolved, meta);
            return res.json({
                ok: true,
                ...result,
                metaRelativePath: metaRel,
                meta,
                bridgeStatus: computeWorkUnitStatus(meta, true)
            });
        }
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

/**
 * GET /api/summaries/capture/status
 * IDE chat capture status (SPEC_8B5 §15.10) — Cursor workspaceStorage → A070/capture/.
 */
router.get('/capture/status', async (req, res, next) => {
    try {
        const base = a070BaseResolved();
        const status = await readIdeCaptureStatus(base);
        res.json(status);
    } catch (e) {
        next(e);
    }
});

/**
 * POST /api/summaries/capture/run
 * Run capture once (optional force). Disable with IDE_CAPTURE_ENABLED=false.
 */
router.post('/capture/run', apiLimiter, async (req, res, next) => {
    try {
        if (!isIdeCaptureEnabled()) {
            return res.status(403).json({
                ok: false,
                error: 'IDE capture disabled (set IDE_CAPTURE_ENABLED unset or not false)'
            });
        }
        const body = IdeCaptureRunSchema.parse(req.body || {});
        const base = a070BaseResolved();
        const state = await runIdeChatCapture({ a070Base: base, force: body.force });
        res.json({ ok: true, ...state });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400 || e.status === 403) {
            return res.status(e.status).json({ ok: false, error: e.message });
        }
        next(e);
    }
});

/**
 * POST /api/summaries/capture/settings
 * Persist `workspaceStorageRoot` (absolute path or null). Used when `CURSOR_WORKSPACE_STORAGE_ROOT` is unset.
 * File: alongside channel_config — `ide_capture_settings.json`.
 */
router.post('/capture/settings', apiLimiter, async (req, res, next) => {
    try {
        const body = IdeCaptureSettingsSchema.parse(req.body || {});
        const saved = await writeIdeCaptureSettings(body);
        res.json({ ok: true, ...saved });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        next(e);
    }
});

/**
 * POST /api/summaries/capture/mount
 * Runs IDE_CAPTURE_REMOTE_MOUNT_SCRIPT with action mount|umount|status (operator hook for SMB/sshfs).
 * Disabled unless IDE_CAPTURE_REMOTE_MOUNT_SCRIPT is a safe absolute path to an existing file.
 */
router.post('/capture/mount', apiLimiter, async (req, res, next) => {
    try {
        const body = IdeCaptureMountSchema.parse(req.body || {});
        const result = runRemoteMountScript(body.action);
        res.json({ ok: result.ok, ...result });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400) {
            return res.status(400).json({ ok: false, error: e.message });
        }
        next(e);
    }
});

/**
 * POST /api/summaries/capture/mount/simple
 * Guided SMB mount (password only kept in memory for this request; temp credentials file on disk).
 * Requires IDE_CAPTURE_SIMPLE_MOUNT=true on a Linux API host.
 */
router.post('/capture/mount/simple', apiLimiter, async (req, res, next) => {
    try {
        if (!isSimpleMountEnabled()) {
            return res.status(403).json({
                ok: false,
                error: 'Simple SMB mount is disabled. Set IDE_CAPTURE_SIMPLE_MOUNT=true on the API server (Linux only).'
            });
        }
        const body = IdeCaptureSimpleSmbMountSchema.parse(req.body || {});
        if (body.action === 'umount') {
            const result = runSimpleUmount(body.mountPoint);
            return res.json({ ok: result.ok, ...result });
        }
        const result = await runSimpleSmbMount(body);
        res.json({ ok: result.ok, ...result });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400) {
            return res.status(400).json({ ok: false, error: e.message });
        }
        console.error('[capture/mount/simple]', e);
        return res.status(500).json({
            ok: false,
            error: e?.message || 'Simple SMB mount failed (unexpected server error). Check API process logs.'
        });
    }
});

/**
 * POST /api/summaries/capture/ensure-path
 * mkdir -p for workspaceStorage root (allowed prefixes only). Optional body.path; else uses resolved settings/env path.
 * Disable with IDE_CAPTURE_ENSURE_PATH=false.
 */
router.post('/capture/ensure-path', apiLimiter, async (req, res, next) => {
    try {
        if (!isIdeCaptureEnabled()) {
            return res.status(403).json({
                ok: false,
                error: 'IDE capture disabled (set IDE_CAPTURE_ENABLED unset or not false)'
            });
        }
        const body = IdeCaptureEnsurePathSchema.parse(req.body || {});
        let target;
        if (body.path != null && String(body.path).trim() !== '') {
            const raw = String(body.path).trim();
            if (!isStoredWorkspaceStorageRootValid(raw)) {
                return res.status(400).json({ ok: false, error: 'invalid path' });
            }
            target = normalizeWorkspaceStorageRootForFs(raw);
        } else {
            const resolved = await resolveWorkspaceStorageRoot();
            target = resolved.path;
        }
        await ensureIdeCaptureWorkspaceDir(target);
        let ensuredPathExists = false;
        try {
            await fs.access(target);
            ensuredPathExists = true;
        } catch {
            ensuredPathExists = false;
        }
        const base = a070BaseResolved();
        const status = await readIdeCaptureStatus(base);
        res.json({
            ok: true,
            path: target,
            ensuredPathExists,
            workspaceRootExists: status.workspaceRootExists,
            workspaceRoot: status.workspaceRoot
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ ok: false, error: 'Validation failed', details: e.flatten() });
        }
        if (e.status === 400 || e.status === 403 || e.status === 500) {
            return res.status(e.status).json({ ok: false, error: e.message });
        }
        console.error('[capture/ensure-path]', e);
        return res.status(500).json({
            ok: false,
            error: e?.message || 'ensure-path failed (unexpected server error). Check API process logs.'
        });
    }
});

export default router;
