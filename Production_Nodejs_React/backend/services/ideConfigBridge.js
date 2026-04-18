/**
 * Canonical Channel Manager snapshot + projections for OpenClaw vs Cursor.
 * No filesystem writes — pure JSON for APIs and tooling.
 */

/**
 * @param {object} raw - Parsed channel_config.json
 */
export function buildCanonicalSnapshot(raw) {
    const channels = Array.isArray(raw.channels) ? raw.channels : [];
    const agents = Array.isArray(raw.agents) ? raw.agents : [];
    const subAgents = Array.isArray(raw.subAgents) ? raw.subAgents : [];
    return {
        version: 1,
        generatedBy: 'ideConfigBridge',
        counts: {
            channels: channels.length,
            agents: agents.length,
            subAgents: subAgents.length
        },
        agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            color: a.color,
            defaultSkills: a.defaultSkills || [],
            inactiveSkills: a.inactiveSkills || []
        })),
        subAgents: subAgents.map((s) => ({
            id: s.id,
            name: s.name,
            parent: s.parent,
            additionalSkills: s.additionalSkills || [],
            inactiveSkills: s.inactiveSkills || []
        })),
        channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            model: c.model,
            assignedAgent: c.assignedAgent,
            skills: c.skills || [],
            caseSkills: c.caseSkills || [],
            inactiveCaseSkills: c.inactiveCaseSkills || []
        }))
    };
}

/**
 * OpenClaw-oriented hints for humans / tooling (not the same shape as on-disk openclaw.json).
 * Automated merge of telegram group fields (`requireMention`, `skills`) uses
 * `openclawApply.js` + POST `/api/exports/openclaw/apply`.
 */
export function buildOpenClawProjection(snapshot) {
    return {
        kind: 'openclaw_merge_hints',
        version: 1,
        note: 'Review before merging into ~/.openclaw/openclaw.json. Channel Manager remains SoT in Prototyp/channel_CHAT-manager/channel_config.json. For requireMention sync, use Apply to OpenClaw in the UI or POST /api/exports/openclaw/apply.',
        telegramGroups: snapshot.channels.map((c) => ({
            id: c.id,
            label: c.name,
            assignedAgent: c.assignedAgent,
            model: c.model
        })),
        agents: snapshot.agents
    };
}

/**
 * IDE workbench bundle (tool-agnostic name): typical paths follow `.cursor/` layout used by Cursor-class IDEs.
 */
export function buildIdeWorkbenchBundle(snapshot) {
    const subagentFiles = snapshot.subAgents.map((s) => ({
        relativePath: `.cursor/agents/${s.id}.md`,
        name: s.id,
        displayName: s.name,
        parentEngine: s.parent,
        suggestedFrontmatter: {
            name: s.id,
            description: `${s.name} — parent engine: ${s.parent}`,
            model: 'inherit',
            readonly: false
        },
        skillIds: s.additionalSkills || []
    }));

    return {
        kind: 'ide_workbench_bundle',
        version: 1,
        note: 'IDE workbench projection: markdown agents under .cursor/agents/, rules under .cursor/rules/, MCP in .cursor/mcp.json (paths follow common Cursor-class layouts; other IDEs may map differently). Manifest only — apply via export script or manual paste.',
        subagents: subagentFiles,
        engines: snapshot.agents.map((a) => ({
            id: a.id,
            name: a.name,
            defaultSkills: a.defaultSkills
        }))
    };
}

/** @deprecated Prefer GET /api/exports/ide — kept for backward compatibility (same payload shape, kind: cursor_bundle). */
export function buildCursorProjection(snapshot) {
    const data = buildIdeWorkbenchBundle(snapshot);
    return { ...data, kind: 'cursor_bundle' };
}
