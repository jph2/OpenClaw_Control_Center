import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCanonicalSnapshot,
    buildOpenClawProjection,
    buildCursorProjection,
    buildIdeWorkbenchBundle,
    collectChannelConfigApplyWarnings,
    isSafeCursorAgentId
} from '../services/ideConfigBridge.js';

describe('ideConfigBridge', () => {
    it('builds canonical snapshot', () => {
        const snap = buildCanonicalSnapshot({
            channels: [{ id: 'x', name: 'N', skills: [] }],
            agents: [{ id: 'tars', name: 'TARS', defaultSkills: ['a'] }],
            subAgents: [{ id: 'researcher', name: 'Researcher', parent: 'tars' }]
        });
        assert.equal(snap.channels.length, 1);
        assert.equal(snap.subAgents[0].id, 'researcher');
        assert.equal(snap.subAgents[0].kind, 'skillRole');
        assert.equal(snap.subAgents[0].projection.openclawProjection, 'mergeIntoSynth');
        assert.equal(snap.subAgents[0].projection.runtimeWorker, false);
        assert.deepEqual(snap.workerCandidates, []);
    });

    it('projects cursor bundle with agent file paths (legacy kind)', () => {
        const snap = buildCanonicalSnapshot({
            channels: [],
            agents: [],
            subAgents: [{ id: 'coder', name: 'Coder', parent: 'case', additionalSkills: ['x'] }]
        });
        const cur = buildCursorProjection(snap);
        assert.equal(cur.kind, 'cursor_bundle');
        assert.equal(cur.bundleSchemaVersion, 2);
        assert.equal(cur.subagents[0].relativePath, '.cursor/agents/coder.md');
    });

    it('projects IDE workbench bundle v2 with inactive skill filtering', () => {
        const snap = buildCanonicalSnapshot({
            channels: [],
            agents: [],
            subAgents: [
                {
                    id: 'coder',
                    name: 'Coder',
                    parent: 'case',
                    additionalSkills: ['x', 'y'],
                    inactiveSkills: ['y']
                }
            ]
        });
        const ide = buildIdeWorkbenchBundle(snap);
        assert.equal(ide.kind, 'ide_workbench_bundle');
        assert.equal(ide.bundleSchemaVersion, 2);
        assert.deepEqual(ide.subagents[0].effectiveSkillIds, ['x']);
        assert.deepEqual(ide.workerCandidates, []);
        assert.equal(ide.subagents[0].kind, 'skillRole');
        assert.equal(ide.subagents[0].projection.cursorProjection, 'agentMarkdown');
        assert.equal(ide.subagents[0].projection.runtimeIdentity, 'none');
    });

    it('collectChannelConfigApplyWarnings flags unknown parent', () => {
        const w = collectChannelConfigApplyWarnings({
            channels: [{ id: '1', assignedAgent: 'ghost' }],
            agents: [{ id: 'tars', name: 'T' }],
            subAgents: [{ id: 'r', name: 'R', parent: 'nope' }]
        });
        assert.ok(w.some((x) => x.code === 'subagent_parent_missing'));
        assert.ok(w.some((x) => x.code === 'channel_assigned_agent_unknown'));
    });

    it('isSafeCursorAgentId rejects uppercase', () => {
        assert.equal(isSafeCursorAgentId('tars'), true);
        assert.equal(isSafeCursorAgentId('TARS'), false);
    });

    it('buildOpenClawProjection still returns hints', () => {
        const snap = buildCanonicalSnapshot({
            channels: [{ id: '-1', assignedAgent: 'tars', inactiveSubAgents: [] }],
            agents: [{ id: 'tars', name: 'TARS' }],
            subAgents: [{ id: 'researcher', name: 'Researcher', parent: 'tars' }],
            workerCandidates: [
                {
                    id: 'research-summary-worker',
                    displayName: 'Research Summary Worker',
                    parentId: 'tars',
                    sourceSkillRoleId: 'researcher',
                    enabled: true,
                    status: 'active',
                    canSpeakToChannel: false,
                    openclawProjection: { mode: 'dedicatedAgentsListEntry' }
                }
            ]
        });
        const p = buildOpenClawProjection(snap);
        assert.equal(p.kind, 'openclaw_merge_hints');
        assert.equal(p.version, 2);
        assert.equal(p.projectionSemantics.runtimeWorkerImplemented, true);
        assert.equal(p.telegramGroups[0].skillRoles[0].projection.runtimeWorker, false);
        assert.equal(p.runtimeWorkers[0].runtimeAgentId, 'worker-research-summary-worker');
        assert.equal(p.runtimeWorkers[0].canSpeakToChannel, false);
    });

    it('collectChannelConfigApplyWarnings flags unknown worker parent', () => {
        const w = collectChannelConfigApplyWarnings({
            channels: [],
            agents: [{ id: 'tars', name: 'T' }],
            subAgents: [],
            workerCandidates: [
                { id: 'review-worker', parentId: 'ghost', enabled: true, status: 'active' }
            ]
        });
        assert.ok(w.some((x) => x.code === 'worker_parent_missing'));
    });
});
