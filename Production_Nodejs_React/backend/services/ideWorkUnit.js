import fs from 'fs/promises';
import path from 'path';
import { parseArtifactHeaderBinding } from './artifactHeaderBinding.js';
import { buildAdapterWorkUnit } from './ideWorkUnitAdapters.js';
import { extractTtgIds, resolveTtgBinding } from './ttgBindingResolver.js';

const SCHEMA = 'channel-manager.ide-work-unit.v1';

export function slugifyProjectId(value) {
    const raw = String(value || 'workspace').trim().toLowerCase();
    return raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'workspace';
}

export function summaryMetaRelativePath(summaryRelativePath) {
    return String(summaryRelativePath || '').replace(/\.md$/i, '') + '.meta.json';
}

export function inferTtgId(relativePath, fallback = '') {
    const text = `${relativePath || ''} ${fallback || ''}`;
    return extractTtgIds(text)[0] || '';
}

export function buildSummaryRelativePath({ date, ttgId, projectId }) {
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayDateSlug();
    const safeTtg = ttgId || 'all';
    const safeProject = slugifyProjectId(projectId);
    return `drafts/${safeDate}__${safeTtg}__${safeProject}__summary.md`;
}

export function todayDateSlug() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildIdeWorkUnit({
    summaryRelativePath,
    text = '',
    ttgId = '',
    channelName = '',
    surface = 'manual',
    projectRoot = process.env.WORKSPACE_ROOT || '',
    projectId = '',
    repoSlug = '',
    repoRemote = '',
    head = '',
    model = '',
    agent = '',
    sessionId = '',
    operator = '',
    projectMappingKey = '',
    pathHints = [],
    projectMappings = [],
    existing = null,
    adapterInput = null
}) {
    const now = new Date().toISOString();
    const previous = existing && typeof existing === 'object' ? existing : {};
    const adapter = buildAdapterWorkUnit(adapterInput || {
        surface,
        projectRoot,
        projectId,
        repoSlug,
        repoRemote,
        head,
        sessionId,
        agent,
        model,
        operator,
        ttgId,
        channelName,
        projectMappingKey,
        pathHints: [
            summaryRelativePath,
            text,
            ...(Array.isArray(pathHints) ? pathHints : [])
        ]
    });
    const artifactHeader = parseArtifactHeaderBinding(text);
    const binding = resolveTtgBinding({
        explicitTtgId: adapter.bindingHints.explicitTtgId,
        artifactHeaderTtgId: artifactHeader.currentTtgId,
        artifactHeaderInitialTtgId: artifactHeader.initialTtgId,
        channelName: adapter.bindingHints.channelName,
        projectId: adapter.project.id,
        projectMappingKey: adapter.bindingHints.projectMappingKey,
        repoSlug: adapter.project.repoSlug,
        pathHints: [
            summaryRelativePath,
            text,
            ...(Array.isArray(adapter.bindingHints.pathHints) ? adapter.bindingHints.pathHints : [])
        ],
        projectMappings
    });
    const previousPromotion = previous.promotion || {};

    return {
        schema: SCHEMA,
        surface: adapter.surface,
        projectRoot: adapter.project.root,
        projectId: adapter.project.id,
        repo: {
            slug: adapter.project.repoSlug,
            remote: adapter.project.repoRemote,
            head: adapter.project.head
        },
        ttgId: binding.ttgId,
        channelName: adapter.bindingHints.channelName || '',
        summaryPath: summaryRelativePath,
        source: {
            sessionId: adapter.source.sessionId,
            operator: adapter.source.operator,
            model: adapter.source.model,
            agent: adapter.source.agent,
            createdAt: previous.source?.createdAt || adapter.source.createdAt || now
        },
        promotion: {
            target: previousPromotion.target || '',
            status: previousPromotion.status || 'not_promoted',
            lastPromotedAt: previousPromotion.lastPromotedAt || null,
            marker: previousPromotion.marker || null
        },
        binding: {
            status: binding.status,
            method: binding.method,
            ...(binding.candidates?.length ? { candidates: binding.candidates } : {}),
            ...(binding.reason ? { reason: binding.reason } : {}),
            ...(artifactHeader.hasHeader ? {
                artifactHeader: {
                    currentTtgId: artifactHeader.currentTtgId || '',
                    initialTtgId: artifactHeader.initialTtgId || '',
                    currentTtgName: artifactHeader.current?.name || '',
                    initialTtgName: artifactHeader.initial?.name || ''
                }
            } : {})
        },
        promotedTo: Array.isArray(previous.promotedTo) ? previous.promotedTo : [],
        createdAt: previous.createdAt || now,
        updatedAt: now
    };
}

export async function readJsonIfExists(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        return null;
    }
}

export async function readJsonWithStatus(filePath) {
    try {
        return { value: JSON.parse(await fs.readFile(filePath, 'utf8')), exists: true, invalid: false };
    } catch (e) {
        if (e.code === 'ENOENT') return { value: null, exists: false, invalid: false };
        return { value: null, exists: true, invalid: true, error: e.message };
    }
}

export async function writeJsonAtomic(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, filePath);
}

export function computeWorkUnitStatus(meta, hasSummary = true) {
    if (!hasSummary) return 'no_summary';
    if (meta && meta.__invalid === true) return 'meta_invalid';
    if (!meta) return 'draft_saved';
    if (meta.binding?.status === 'ambiguous') return 'ambiguous_binding';
    if (!meta.ttgId || meta.binding?.status === 'unknown') return 'unknown';
    const promotionStatus = meta.promotion?.status || 'not_promoted';
    if (promotionStatus === 'readback_confirmed') return 'readback_confirmed';
    if (promotionStatus === 'stale') return 'stale';
    if (promotionStatus === 'failed') return 'promotion_failed';
    if (promotionStatus === 'promoted') return 'promoted';
    return 'not_promoted';
}

export function updateMetaAfterPromotion(meta, result) {
    const now = new Date().toISOString();
    const marker = result.marker || meta?.promotion?.marker || null;
    const target = result.destinationRelative || meta?.promotion?.target || '';
    const readbackStatus = result.readbackConfirmed ? 'readback_confirmed' : 'stale';
    const next = {
        ...(meta || {}),
        schema: meta?.schema || SCHEMA,
        promotion: {
            target,
            status: readbackStatus,
            lastPromotedAt: now,
            marker
        },
        promotedTo: [
            ...((Array.isArray(meta?.promotedTo) ? meta.promotedTo : [])),
            {
                target,
                at: now,
                marker,
                readback: result.readbackConfirmed ? 'confirmed' : 'stale'
            }
        ],
        updatedAt: now
    };
    return next;
}
