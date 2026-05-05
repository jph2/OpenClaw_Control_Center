import { z } from 'zod';

export const WORKER_CANDIDATE_SCHEMA_SLICE_VERSION = 1;
export const WORKER_SOURCE_PREFIX = 'worker:';
export const WORKER_AGENT_PREFIX = 'worker-';

const WorkerCandidateIdSchema = z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim())
    .refine((s) => /^[a-z][a-z0-9_-]{0,63}$/.test(s), {
        message: 'worker candidate id must use lowercase letters, digits, hyphen, underscore and start with a letter'
    });

export const WorkerCandidateConfigSchema = z
    .object({
        schemaSlice: z.literal('c1e-worker-candidate-v1').optional(),
        id: WorkerCandidateIdSchema,
        displayName: z.string().min(1).max(120).optional(),
        parentId: z.string().min(1).default('tars'),
        sourceSkillRoleId: z.string().min(1).optional(),
        enabled: z.boolean().optional().default(false),
        status: z.enum(['candidate', 'active', 'inactive', 'experimental', 'deprecated']).optional().default('candidate'),
        modelProfile: z.string().min(1).optional().default('inherit'),
        skillIds: z.array(z.string()).optional().default([]),
        deniedSkillIds: z.array(z.string()).optional().default([]),
        contextBoundary: z
            .enum(['sharedSummaryOnly', 'freshContext', 'dedicatedSession'])
            .optional()
            .default('sharedSummaryOnly'),
        riskTier: z.enum(['readOnly', 'writeProposed']).optional().default('readOnly'),
        canSpeakToChannel: z.literal(false).optional().default(false),
        openclawProjection: z
            .object({
                mode: z.literal('dedicatedAgentsListEntry').optional().default('dedicatedAgentsListEntry'),
                sessionPolicy: z.literal('dedicatedPerTask').optional().default('dedicatedPerTask'),
                transcriptPolicy: z.literal('linked').optional().default('linked'),
                maxConcurrent: z.number().int().min(1).max(4).optional().default(1)
            })
            .optional()
            .default({}),
        cursorProjection: z
            .object({
                mode: z.enum(['notApplicable', 'agentMarkdown', 'taskTypeMapping']).optional().default('notApplicable'),
                mappingStatus: z.enum(['unmapped', 'manual', 'verified', 'stale']).optional().default('unmapped'),
                taskType: z.string().optional()
            })
            .optional()
            .default({})
    })
    .transform((w) => ({
        ...w,
        schemaSlice: w.schemaSlice || 'c1e-worker-candidate-v1',
        displayName: w.displayName || w.id,
        modelProfile: w.modelProfile || 'inherit',
        skillIds: normalizeSkillIds(w.skillIds),
        deniedSkillIds: normalizeSkillIds(w.deniedSkillIds),
        canSpeakToChannel: false,
        openclawProjection: {
            mode: 'dedicatedAgentsListEntry',
            sessionPolicy: 'dedicatedPerTask',
            transcriptPolicy: 'linked',
            maxConcurrent: w.openclawProjection?.maxConcurrent || 1
        },
        cursorProjection: {
            mode: w.cursorProjection?.mode || 'notApplicable',
            mappingStatus: w.cursorProjection?.mappingStatus || 'unmapped',
            ...(w.cursorProjection?.taskType ? { taskType: w.cursorProjection.taskType } : {})
        }
    }));

export function normalizeSkillIds(skills) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(skills) ? skills : []) {
        const id = String(raw ?? '').trim().replace(/\s+/gu, '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

export function normalizeWorkerCandidates(raw) {
    return (Array.isArray(raw) ? raw : []).map((entry) => WorkerCandidateConfigSchema.parse(entry));
}

export function parseWorkerCandidatesLenient(raw) {
    const candidates = [];
    const warnings = [];
    for (const entry of Array.isArray(raw) ? raw : []) {
        const parsed = WorkerCandidateConfigSchema.safeParse(entry);
        if (parsed.success) {
            candidates.push(parsed.data);
            continue;
        }
        warnings.push({
            code: 'worker_candidate_invalid',
            message: `Worker Candidate "${entry?.id || '(missing id)'}" is invalid: ${parsed.error.message}`,
            detail: { workerCandidateId: entry?.id || null }
        });
    }
    return { candidates, warnings };
}

export function isWorkerCandidateActive(candidate) {
    return Boolean(
        candidate &&
            candidate.enabled !== false &&
            (candidate.status === 'active' || candidate.status === 'experimental') &&
            candidate.openclawProjection?.mode === 'dedicatedAgentsListEntry' &&
            candidate.canSpeakToChannel === false
    );
}

export function runtimeWorkerSourceId(workerId) {
    return `${WORKER_SOURCE_PREFIX}${workerId}`;
}

export function runtimeWorkerAgentId(workerId) {
    return `${WORKER_AGENT_PREFIX}${workerId}`;
}

export function workerCandidateEffectiveSkillIds(candidate, subAgents = []) {
    const sourceRole =
        candidate?.sourceSkillRoleId &&
        (Array.isArray(subAgents) ? subAgents : []).find((s) => s?.id === candidate.sourceSkillRoleId);
    const sourceInactive = new Set(normalizeSkillIds(sourceRole?.inactiveSkills));
    const denied = new Set(normalizeSkillIds(candidate?.deniedSkillIds));
    const sourceSkills = normalizeSkillIds(sourceRole?.additionalSkills).filter((id) => !sourceInactive.has(id));
    return normalizeSkillIds([...sourceSkills, ...(candidate?.skillIds || [])]).filter((id) => !denied.has(id));
}
