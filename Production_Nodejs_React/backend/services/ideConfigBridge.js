/**
 * Canonical Channel Manager snapshot + projections for OpenClaw vs Cursor.
 * No filesystem writes — pure JSON for APIs and tooling.
 */
import {
    isWorkerCandidateActive,
    parseWorkerCandidatesLenient,
    runtimeWorkerAgentId,
    workerCandidateEffectiveSkillIds
} from './workerProjection.js';

/** Safe id for `.cursor/agents/<id>.md` (lowercase slug). */
export const CURSOR_AGENT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;

export function isSafeCursorAgentId(id) {
    return CURSOR_AGENT_ID_PATTERN.test(String(id || '').trim());
}

export const LEGACY_SKILL_ROLE_PROJECTION = Object.freeze({
    kind: 'skillRole',
    openclawProjection: 'mergeIntoSynth',
    cursorProjection: 'agentMarkdown',
    runtimeIdentity: 'none',
    runtimeWorker: false,
    visibility: 'ideOnly'
});

export function buildLegacySkillRoleProjection(extra = {}) {
    return { ...LEGACY_SKILL_ROLE_PROJECTION, ...extra };
}

/**
 * @param {object} raw - Parsed channel_config.json
 */
export function buildCanonicalSnapshot(raw) {
    const channels = Array.isArray(raw.channels) ? raw.channels : [];
    const agents = Array.isArray(raw.agents) ? raw.agents : [];
    const subAgents = Array.isArray(raw.subAgents) ? raw.subAgents : [];
    const { candidates: workerCandidates, warnings: workerCandidateWarnings } =
        parseWorkerCandidatesLenient(raw.workerCandidates);
    return {
        version: 1,
        generatedBy: 'ideConfigBridge',
        counts: {
            channels: channels.length,
            agents: agents.length,
            subAgents: subAgents.length,
            workerCandidates: workerCandidates.length
        },
        workerCandidateWarnings,
        agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            color: a.color,
            description: a.description,
            defaultSkills: a.defaultSkills || [],
            inactiveSkills: a.inactiveSkills || [],
            enabled: a.enabled !== false
        })),
        subAgents: subAgents.map((s) => ({
            id: s.id,
            name: s.name,
            parent: s.parent,
            role: s.role,
            description: s.description,
            additionalSkills: s.additionalSkills || [],
            inactiveSkills: s.inactiveSkills || [],
            enabled: s.enabled !== false,
            kind: 'skillRole',
            projection: buildLegacySkillRoleProjection()
        })),
        workerCandidates: workerCandidates.map((w) => ({
            ...w,
            kind: 'runtimeWorkerCandidate',
            runtimeAgentId: runtimeWorkerAgentId(w.id),
            effectiveSkillIds: workerCandidateEffectiveSkillIds(w, subAgents),
            active: isWorkerCandidateActive(w),
            projection: {
                openclawProjection: w.openclawProjection.mode,
                cursorProjection: w.cursorProjection.mode,
                runtimeIdentity: isWorkerCandidateActive(w) ? 'dedicatedPerTask' : 'none',
                canSpeakToChannel: false
            }
        })),
        channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            model: c.model,
            assignedAgent: c.assignedAgent,
            skills: c.skills || [],
            caseSkills: c.caseSkills || [],
            inactiveSubAgents: c.inactiveSubAgents || [],
            inactiveCaseSkills: c.inactiveCaseSkills || []
        }))
    };
}

function subtractInactive(ids, inactiveSet) {
    return [...ids].map(String).filter((x) => x && !inactiveSet.has(x));
}

/**
 * Warnings for OpenClaw Apply preview and IDE export (shared CM semantics).
 * @param {object} raw - channel_config.json
 * @returns {{ code: string, message: string, detail?: object }[]}
 */
export function collectChannelConfigApplyWarnings(raw) {
    const snap = buildCanonicalSnapshot(raw);
    const agentIds = new Set(snap.agents.map((a) => String(a.id || '').trim()).filter(Boolean));
    const warnings = [];
    warnings.push(...(snap.workerCandidateWarnings || []));

    for (const s of snap.subAgents) {
        const id = String(s.id || '').trim();
        if (!id) continue;
        if (!isSafeCursorAgentId(id)) {
            warnings.push({
                code: 'unsafe_cursor_agent_id',
                message: `Skill Role id "${id}" is not a safe Cursor filename token (use lowercase letters, digits, _ -).`,
                detail: { subAgentId: id }
            });
        }
        const parent = s.parent == null || s.parent === '' ? '' : String(s.parent);
        if (!parent || !agentIds.has(parent)) {
            warnings.push({
                code: 'subagent_parent_missing',
                message: `Skill Role "${id}" has parent "${parent || 'null'}" that does not match a CM main agent id.`,
                detail: { subAgentId: id, parent }
            });
        }
    }

    for (const a of snap.agents) {
        const id = String(a.id || '').trim();
        if (!id) continue;
        if (!isSafeCursorAgentId(id)) {
            warnings.push({
                code: 'unsafe_cursor_agent_id',
                message: `Main agent id "${id}" is not a safe Cursor filename token (use lowercase letters, digits, _ -).`,
                detail: { agentId: id }
            });
        }
    }

    for (const c of snap.channels) {
        const cid = String(c.id || '');
        const aa = c.assignedAgent == null || c.assignedAgent === '' ? '' : String(c.assignedAgent);
        if (aa && !agentIds.has(aa)) {
            warnings.push({
                code: 'channel_assigned_agent_unknown',
                message: `Channel "${cid}" assignedAgent "${aa}" is not a CM main agent id.`,
                detail: { channelId: cid, assignedAgent: aa }
            });
        }
    }

    for (const worker of snap.workerCandidates || []) {
        if (!agentIds.has(worker.parentId)) {
            warnings.push({
                code: 'worker_parent_missing',
                message: `Worker Candidate "${worker.id}" has parentId "${worker.parentId}" that does not match a CM main agent id.`,
                detail: { workerCandidateId: worker.id, parentId: worker.parentId }
            });
        }
    }

    return warnings;
}

/**
 * OpenClaw-oriented hints for humans / tooling (not the same shape as on-disk openclaw.json).
 * Automated merge of telegram group fields (`requireMention`, `skills`) uses
 * `openclawApply.js` + POST `/api/exports/openclaw/apply`.
 */
export function buildOpenClawProjection(snapshot) {
    return {
        kind: 'openclaw_merge_hints',
        version: 2,
        note: 'Review before merging into ~/.openclaw/openclaw.json. Channel Manager remains SoT in Prototyp/channel_CHAT-manager/channel_config.json. For requireMention sync, use Apply to OpenClaw in the UI or POST /api/exports/openclaw/apply.',
        telegramGroups: snapshot.channels.map((c) => ({
            id: c.id,
            label: c.name,
            assignedAgent: c.assignedAgent,
            model: c.model,
            skillRoles: snapshot.subAgents
                .filter(
                    (s) =>
                        s.parent === c.assignedAgent &&
                        s.enabled !== false &&
                        !(c.inactiveSubAgents || []).includes(s.id)
                )
                .map((s) => ({
                    id: s.id,
                    name: s.name,
                    projection: buildLegacySkillRoleProjection({
                        summary: 'Merged into the per-channel synth skills allowlist; no separate OpenClaw runtime worker.'
                    })
                }))
        })),
        runtimeWorkers: (snapshot.workerCandidates || [])
            .filter((w) => w.active)
            .map((w) => ({
                id: w.id,
                displayName: w.displayName,
                parentId: w.parentId,
                runtimeAgentId: w.runtimeAgentId,
                modelProfile: w.modelProfile,
                effectiveSkillIds: w.effectiveSkillIds,
                canSpeakToChannel: false,
                projection: w.projection
            })),
        agents: snapshot.agents,
        projectionSemantics: {
            currentSubAgentsAre: 'skillRole',
            runtimeWorkerImplemented: true,
            openclawProjection: 'mergeIntoSynth + dedicatedAgentsListEntry',
            cursorProjection: 'agentMarkdown'
        }
    };
}

/**
 * IDE workbench bundle (tool-agnostic name): typical paths follow `.cursor/` layout used by Cursor-class IDEs.
 */
export function buildIdeWorkbenchBundle(snapshot) {
    const agentIds = new Set(snapshot.agents.map((a) => String(a.id || '').trim()).filter(Boolean));
    const warnings = [];

    for (const s of snapshot.subAgents) {
        const id = String(s.id || '').trim();
        if (!id) continue;
        const parent = s.parent == null || s.parent === '' ? '' : String(s.parent);
        if (!parent || !agentIds.has(parent)) {
            warnings.push({
                code: 'subagent_parent_missing',
                subAgentId: id,
                parent: parent || null
            });
        }
        if (!isSafeCursorAgentId(id)) {
            warnings.push({ code: 'unsafe_cursor_agent_id', agentId: id, kind: 'subagent' });
        }
    }

    for (const a of snapshot.agents) {
        const id = String(a.id || '').trim();
        if (id && !isSafeCursorAgentId(id)) {
            warnings.push({ code: 'unsafe_cursor_agent_id', agentId: id, kind: 'engine' });
        }
    }

    for (const c of snapshot.channels) {
        const aa =
            c.assignedAgent == null || c.assignedAgent === '' ? '' : String(c.assignedAgent);
        if (aa && !agentIds.has(aa)) {
            warnings.push({
                code: 'channel_assigned_agent_unknown',
                channelId: c.id,
                assignedAgent: aa
            });
        }
    }

    for (const worker of snapshot.workerCandidates || []) {
        if (!agentIds.has(worker.parentId)) {
            warnings.push({
                code: 'worker_parent_missing',
                workerCandidateId: worker.id,
                parentId: worker.parentId
            });
        }
    }

    const subagentFiles = snapshot.subAgents.map((s) => {
        const inactive = new Set((s.inactiveSkills || []).map(String));
        const effectiveSkillIds = subtractInactive(s.additionalSkills || [], inactive);
        const parent = s.parent == null || s.parent === '' ? null : String(s.parent);
        const descFromCm = s.description ? String(s.description) : '';
        const descBase = descFromCm || `${s.name} — parent engine: ${parent ?? 'null'}`;
        return {
            relativePath: `.cursor/agents/${s.id}.md`,
            name: s.id,
            displayName: s.name,
            parentEngine: parent,
            enabled: s.enabled !== false,
            inactiveSkills: [...inactive],
            effectiveSkillIds,
            skillIds: effectiveSkillIds,
            kind: 'skillRole',
            projection: buildLegacySkillRoleProjection({
                summary: 'IDE Agent Profile export only; not proof of a live runtime worker.'
            }),
            suggestedFrontmatter: {
                name: s.id,
                description: descBase,
                model: 'inherit',
                readonly: false
            }
        };
    });

    const engines = snapshot.agents.map((a) => {
        const inactive = new Set((a.inactiveSkills || []).map(String));
        const effectiveDefaultSkills = subtractInactive(a.defaultSkills || [], inactive);
        return {
            id: a.id,
            name: a.name,
            role: a.role,
            enabled: a.enabled !== false,
            defaultSkills: a.defaultSkills || [],
            inactiveSkills: [...inactive],
            effectiveDefaultSkills
        };
    });

    return {
        kind: 'ide_workbench_bundle',
        bundleSchemaVersion: 2,
        version: 1,
        note: 'IDE workbench projection v2: markdown agents under .cursor/agents/. CM Skill Role skills use inactive filtering; these files are IDE Agent Profiles, not OpenClaw runtime workers. Apply via scripts/apply-ide-export.mjs; stale check uses fingerprint v2.',
        warnings,
        subagents: subagentFiles,
        engines,
        workerCandidates: snapshot.workerCandidates || []
    };
}

/** @deprecated Prefer GET /api/exports/ide — kept for backward compatibility (same payload shape, kind: cursor_bundle). */
export function buildCursorProjection(snapshot) {
    const data = buildIdeWorkbenchBundle(snapshot);
    return { ...data, kind: 'cursor_bundle' };
}
