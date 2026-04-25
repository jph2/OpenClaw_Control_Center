const TTG_RE = /-100\d{8,}/g;

function uniq(values) {
    return [...new Set(values.filter(Boolean).map(String))];
}

function isValidTtgId(value) {
    return /^-100\d{8,}$/.test(String(value || ''));
}

function extractTtgIds(value) {
    const matches = String(value || '').match(TTG_RE);
    return uniq(matches || []);
}

function mappingMatches({ projectMappings = [], projectId = '', projectMappingKey = '', repoSlug = '' }) {
    const ids = [];
    for (const row of Array.isArray(projectMappings) ? projectMappings : []) {
        if (!row || !row.ttgId) continue;
        const projectHit = projectId && row.projectId && String(row.projectId) === String(projectId);
        const keyHit = projectMappingKey && row.projectMappingKey && String(row.projectMappingKey) === String(projectMappingKey);
        const slugHit = repoSlug && row.repoSlug && String(row.repoSlug) === String(repoSlug);
        if (projectHit || keyHit || slugHit) ids.push(String(row.ttgId));
    }
    return uniq(ids);
}

export function resolveTtgBinding(input = {}) {
    const explicit = String(input.explicitTtgId || '').trim();
    if (explicit) {
        if (!isValidTtgId(explicit)) {
            return {
                status: 'unknown',
                method: 'explicit',
                ttgId: null,
                candidates: [],
                reason: 'explicit TTG id is present but invalid'
            };
        }
        return {
            status: 'confirmed',
            method: 'explicit',
            ttgId: explicit
        };
    }

    const pathCandidates = uniq([
        ...extractTtgIds(input.channelName),
        ...extractTtgIds(input.projectMappingKey),
        ...extractTtgIds(input.projectId),
        ...extractTtgIds(input.repoSlug),
        ...((Array.isArray(input.pathHints) ? input.pathHints : []).flatMap(extractTtgIds))
    ]);
    const mapped = mappingMatches(input);
    if (mapped.length === 1) {
        const nonExplicitCandidates = uniq([...mapped, ...pathCandidates]);
        if (nonExplicitCandidates.length > 1) {
            return {
                status: 'ambiguous',
                method: 'project_mapping',
                ttgId: null,
                candidates: nonExplicitCandidates,
                reason: 'project mapping conflicts with path hints'
            };
        }
        return {
            status: 'confirmed',
            method: 'project_mapping',
            ttgId: mapped[0]
        };
    }
    if (mapped.length > 1) {
        return {
            status: 'ambiguous',
            method: 'project_mapping',
            ttgId: null,
            candidates: mapped,
            reason: 'multiple project mapping matches'
        };
    }

    if (pathCandidates.length === 1) {
        return {
            status: 'confirmed',
            method: 'path_hint',
            ttgId: pathCandidates[0]
        };
    }
    if (pathCandidates.length > 1) {
        return {
            status: 'ambiguous',
            method: 'path_hint',
            ttgId: null,
            candidates: pathCandidates,
            reason: 'multiple distinct TTG ids found in path hints'
        };
    }

    return {
        status: 'unknown',
        method: 'none',
        ttgId: null,
        candidates: [],
        reason: 'no binding signals'
    };
}

export { extractTtgIds, isValidTtgId };
