import path from 'path';

function slugifyProjectId(value) {
    const raw = String(value || 'workspace').trim().toLowerCase();
    return raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'workspace';
}

function projectFrom(input = {}) {
    const root = String(input.projectRoot || input.project?.root || '').trim();
    const id = slugifyProjectId(input.projectId || input.project?.id || (root ? path.basename(root) : 'workspace'));
    return {
        id,
        root,
        repoSlug: slugifyProjectId(input.repoSlug || input.project?.repoSlug || id),
        repoRemote: String(input.repoRemote || input.project?.repoRemote || ''),
        head: String(input.head || input.project?.head || '')
    };
}

function sourceFrom(input = {}, agentFallback) {
    return {
        sessionId: String(input.sessionId || input.source?.sessionId || ''),
        agent: String(input.agent || input.source?.agent || agentFallback || 'unknown'),
        model: String(input.model || input.source?.model || ''),
        operator: String(input.operator || input.source?.operator || ''),
        createdAt: String(input.createdAt || input.source?.createdAt || '')
    };
}

function bindingHintsFrom(input = {}) {
    return {
        explicitTtgId: String(input.ttgId || input.explicitTtgId || input.bindingHints?.explicitTtgId || ''),
        channelName: String(input.channelName || input.bindingHints?.channelName || ''),
        projectMappingKey: String(input.projectMappingKey || input.bindingHints?.projectMappingKey || ''),
        pathHints: Array.isArray(input.pathHints || input.bindingHints?.pathHints)
            ? (input.pathHints || input.bindingHints.pathHints).map(String)
            : []
    };
}

export function buildWorkUnitFromManual(input = {}) {
    return {
        surface: 'manual',
        project: projectFrom(input),
        source: sourceFrom(input, 'manual'),
        bindingHints: bindingHintsFrom(input)
    };
}

export function buildWorkUnitFromCodex(input = {}) {
    return {
        surface: 'codex',
        project: projectFrom(input),
        source: sourceFrom(input, 'codex'),
        bindingHints: bindingHintsFrom(input)
    };
}

export function buildWorkUnitFromCursor(input = {}) {
    return {
        surface: 'cursor',
        project: projectFrom(input),
        source: sourceFrom(input, 'cursor'),
        bindingHints: bindingHintsFrom(input)
    };
}

export function buildWorkUnitFromUnknown(input = {}) {
    return {
        surface: 'unknown',
        project: projectFrom(input),
        source: sourceFrom(input, 'unknown'),
        bindingHints: bindingHintsFrom(input)
    };
}

export function buildAdapterWorkUnit(input = {}) {
    const surface = String(input.surface || input.adapter || 'manual').toLowerCase();
    if (surface === 'codex') return buildWorkUnitFromCodex(input);
    if (surface === 'cursor') return buildWorkUnitFromCursor(input);
    if (surface === 'unknown') return buildWorkUnitFromUnknown(input);
    return buildWorkUnitFromManual(input);
}
