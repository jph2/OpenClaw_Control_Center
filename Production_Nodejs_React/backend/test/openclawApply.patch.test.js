import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTelegramGroupsApplyPatch,
    mergeOpenClawTelegramGroups,
    normalizeChannelSkillIds,
    groupIdSlug,
    makeCmComment,
    isCmOwnedComment,
    makeCmAgentParams,
    isCmOwnedAgentEntry,
    getCmAgentSource,
    buildAgentsAndBindingsApplyPatch,
    mergeOpenClawAgentsAndBindings,
    CM_MARKER_PREFIX,
    CM_AGENT_PARAM_KEY,
    CM_AGENT_MANAGED_BY
} from '../services/openclawApply.js';

describe('openclawApply patch (C1 + C1b.1)', () => {
    it('normalizes and dedupes skill ids', () => {
        assert.deepEqual(normalizeChannelSkillIds([' a ', 'a', 'b', 'b']), ['a', 'b']);
        assert.deepEqual(normalizeChannelSkillIds(null), []);
    });

    it('builds requireMention + skills from channel_config', () => {
        const patch = buildTelegramGroupsApplyPatch({
            channels: [
                { id: '-1001', require_mention: true, skills: ['clawflow', 'clawflow', ' web_search '] },
                { id: '-1002', require_mention: false, skills: [] }
            ]
        });
        assert.deepEqual(patch['-1001'], {
            requireMention: true,
            skills: ['clawflow', 'web_search']
        });
        assert.deepEqual(patch['-1002'], {
            requireMention: false,
            skills: []
        });
    });

    it('merges patch into existing groups without dropping other keys', () => {
        const merged = mergeOpenClawTelegramGroups(
            {
                channels: {
                    telegram: {
                        groups: {
                            '-1001': { requireMention: false, tools: { allow: ['x'] } }
                        }
                    }
                }
            },
            {
                '-1001': { requireMention: true, skills: ['s1'] }
            }
        );
        const g = merged.channels.telegram.groups['-1001'];
        assert.equal(g.requireMention, true);
        assert.deepEqual(g.skills, ['s1']);
        assert.deepEqual(g.tools, { allow: ['x'] });
    });
});

describe('openclawApply C1b.2a — helpers', () => {
    it('groupIdSlug strips leading dash and caps at 16 chars', () => {
        assert.equal(groupIdSlug('-5168034995'), '5168034995');
        assert.equal(groupIdSlug('-12345678901234567890'), '1234567890123456');
        assert.equal(groupIdSlug('42'), '42');
    });

    it('makeCmComment encodes source group and starts with the marker prefix', () => {
        const c = makeCmComment('-5168034995');
        assert.ok(c.startsWith(CM_MARKER_PREFIX));
        assert.ok(c.includes('source: -5168034995'));
    });

    it('isCmOwnedComment recognizes the prefix and rejects others', () => {
        assert.equal(isCmOwnedComment(makeCmComment('-1')), true);
        assert.equal(isCmOwnedComment('operator-owned route'), false);
        assert.equal(isCmOwnedComment(undefined), false);
        assert.equal(isCmOwnedComment(null), false);
    });

    it('makeCmAgentParams emits a structured marker under params._cm', () => {
        const params = makeCmAgentParams('-42');
        assert.deepEqual(params, {
            [CM_AGENT_PARAM_KEY]: {
                managedBy: CM_AGENT_MANAGED_BY,
                source: '-42'
            }
        });
    });

    it('isCmOwnedAgentEntry recognizes params._cm marker, rejects plain entries', () => {
        assert.equal(
            isCmOwnedAgentEntry({ id: 'x', params: makeCmAgentParams('-42') }),
            true
        );
        assert.equal(isCmOwnedAgentEntry({ id: 'x' }), false);
        assert.equal(isCmOwnedAgentEntry({ id: 'x', params: {} }), false);
        assert.equal(
            isCmOwnedAgentEntry({ id: 'x', params: { _cm: { managedBy: 'other' } } }),
            false
        );
    });

    it('getCmAgentSource reads the source groupId from the marker, else null', () => {
        assert.equal(
            getCmAgentSource({ params: makeCmAgentParams('-99') }),
            '-99'
        );
        assert.equal(getCmAgentSource({}), null);
    });
});

describe('openclawApply C1b.2a — buildAgentsAndBindingsApplyPatch', () => {
    const baseCm = {
        channels: [
            {
                id: '-5168034995',
                name: 'TG001_Idea_Capture',
                assignedAgent: 'tars',
                model: 'openai/gpt-4o',
                skills: ['web_search']
            },
            {
                id: '-1003752539559',
                name: 'TG000_General_Chat',
                assignedAgent: 'tars',
                model: 'lmstudio/google/gemma-4-26b-a4b',
                skills: []
            }
        ],
        agents: [
            {
                id: 'tars',
                name: 'TARS',
                defaultSkills: ['clawflow', 'skill-creator', 'clawhub'],
                inactiveSkills: ['clawhub']
            }
        ]
    };

    it('emits one agents.list entry and one route binding per channel with main agent assigned', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        assert.equal(p.agentEntries.length, 2);
        assert.equal(p.bindingEntries.length, 2);
    });

    it('synth id follows <assignedAgent>-<groupIdSlug> convention', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        assert.equal(p.agentEntries[0].id, 'tars-5168034995');
        assert.equal(p.agentEntries[1].id, 'tars-1003752539559');
    });

    it('writes channel model as agents.list[].model.primary', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        assert.deepEqual(p.agentEntries[0].model, { primary: 'openai/gpt-4o' });
        assert.deepEqual(p.agentEntries[1].model, { primary: 'lmstudio/google/gemma-4-26b-a4b' });
    });

    it('computes skills allowlist as (agent defaults ∪ channel extras) minus agent inactive', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        assert.deepEqual(p.agentEntries[0].skills, ['clawflow', 'skill-creator', 'web_search']);
        assert.deepEqual(p.agentEntries[1].skills, ['clawflow', 'skill-creator']);
    });

    it('omits skills entirely when the effective allowlist would be empty (defaults apply)', () => {
        const p = buildAgentsAndBindingsApplyPatch({
            channels: [{ id: '-42', assignedAgent: 'tars', model: 'm/x', skills: [] }],
            agents: [{ id: 'tars', defaultSkills: [], inactiveSkills: [] }]
        });
        assert.equal(p.agentEntries[0].skills, undefined);
    });

    it('tags every agent entry with params._cm and every binding with a CM comment', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        for (const a of p.agentEntries) {
            assert.ok(
                isCmOwnedAgentEntry(a),
                `missing params._cm marker on agent ${JSON.stringify(a)}`
            );
            assert.equal(
                a.comment,
                undefined,
                `agent entry must not carry the schema-illegal "comment" key: ${JSON.stringify(a)}`
            );
        }
        for (const b of p.bindingEntries) {
            assert.ok(
                isCmOwnedComment(b.comment),
                `missing CM marker on binding ${JSON.stringify(b)}`
            );
        }
    });

    it('agent params._cm.source matches the channel id', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        assert.equal(getCmAgentSource(p.agentEntries[0]), '-5168034995');
        assert.equal(getCmAgentSource(p.agentEntries[1]), '-1003752539559');
    });

    it('binding match targets the telegram group peer id', () => {
        const p = buildAgentsAndBindingsApplyPatch(baseCm);
        const b0 = p.bindingEntries[0];
        assert.equal(b0.type, 'route');
        assert.equal(b0.agentId, 'tars-5168034995');
        assert.deepEqual(b0.match, {
            channel: 'telegram',
            peer: { kind: 'group', id: '-5168034995' }
        });
    });

    it('skips channels without id or without assignedAgent', () => {
        const p = buildAgentsAndBindingsApplyPatch({
            channels: [
                { id: '-1001', assignedAgent: 'tars', model: 'm/x' },
                { id: '-1002' },
                { assignedAgent: 'tars' }
            ],
            agents: [{ id: 'tars' }]
        });
        assert.equal(p.agentEntries.length, 1);
        assert.equal(p.bindingEntries.length, 1);
    });

    it('omits model when CM channel has no model string', () => {
        const p = buildAgentsAndBindingsApplyPatch({
            channels: [{ id: '-1', assignedAgent: 'tars', model: '' }],
            agents: [{ id: 'tars', defaultSkills: [] }]
        });
        assert.equal(p.agentEntries[0].model, undefined);
    });
});

describe('openclawApply C1b.2a — mergeOpenClawAgentsAndBindings', () => {
    const patch = buildAgentsAndBindingsApplyPatch({
        channels: [
            { id: '-1001', name: 'C1', assignedAgent: 'tars', model: 'openai/gpt-4o', skills: [] }
        ],
        agents: [{ id: 'tars', defaultSkills: [] }]
    });

    it('adds new agents and bindings when nothing exists', () => {
        const { merged, summary, collisions } = mergeOpenClawAgentsAndBindings({}, patch);
        assert.equal(summary.agentsAdded, 1);
        assert.equal(summary.agentsUpdated, 0);
        assert.equal(summary.bindingsAdded, 1);
        assert.equal(summary.bindingsUpdated, 0);
        assert.deepEqual(collisions, []);
        assert.equal(merged.agents.list[0].id, 'tars-1001');
        assert.equal(merged.bindings[0].match.peer.id, '-1001');
    });

    it('is idempotent — running twice yields the same result, counts as updated the second time', () => {
        const first = mergeOpenClawAgentsAndBindings({}, patch).merged;
        const second = mergeOpenClawAgentsAndBindings(first, patch);
        assert.equal(second.summary.agentsAdded, 0);
        assert.equal(second.summary.agentsUpdated, 1);
        assert.equal(second.summary.bindingsAdded, 0);
        assert.equal(second.summary.bindingsUpdated, 1);
        assert.deepEqual(second.collisions, []);
        assert.equal(second.merged.agents.list.length, 1);
        assert.equal(second.merged.bindings.length, 1);
    });

    it('preserves operator-owned agents (no CM marker) side-by-side with CM entries', () => {
        const existing = {
            agents: {
                list: [{ id: 'ops-agent', name: 'Ops', model: { primary: 'x/y' } }]
            },
            bindings: [
                {
                    type: 'route',
                    agentId: 'ops-agent',
                    match: { channel: 'discord', peer: { kind: 'channel', id: '999' } }
                }
            ]
        };
        const { merged, collisions } = mergeOpenClawAgentsAndBindings(existing, patch);
        assert.deepEqual(collisions, []);
        assert.equal(merged.agents.list.length, 2);
        assert.equal(merged.agents.list[0].id, 'ops-agent');
        assert.equal(merged.bindings.length, 2);
    });

    it('refuses to rewrite an operator-owned agents.list entry that shares the synth id', () => {
        const existing = {
            agents: {
                list: [{ id: 'tars-1001', name: 'operator copy', model: { primary: 'frozen' } }]
            }
        };
        const { merged, summary, collisions } = mergeOpenClawAgentsAndBindings(existing, patch);
        assert.equal(summary.agentsAdded, 0);
        assert.equal(summary.agentsUpdated, 0);
        assert.equal(collisions.length, 1);
        assert.equal(collisions[0].kind, 'agent');
        assert.equal(collisions[0].reason, 'operator_owned_id_collision');
        assert.equal(merged.agents.list[0].model.primary, 'frozen');
    });

    it('refuses to rewrite an operator-owned binding for the same telegram peer', () => {
        const existing = {
            bindings: [
                {
                    type: 'route',
                    agentId: 'operator-agent',
                    match: { channel: 'telegram', peer: { kind: 'group', id: '-1001' } }
                }
            ]
        };
        const { merged, summary, collisions } = mergeOpenClawAgentsAndBindings(existing, patch);
        assert.equal(summary.bindingsAdded, 0);
        assert.equal(summary.bindingsUpdated, 0);
        assert.equal(collisions.length, 1);
        assert.equal(collisions[0].kind, 'binding');
        assert.equal(collisions[0].reason, 'operator_owned_binding_collision');
        assert.equal(merged.bindings[0].agentId, 'operator-agent');
    });

    it('updates in place when the existing entry is CM-owned', () => {
        const existing = mergeOpenClawAgentsAndBindings({}, patch).merged;
        existing.agents.list[0].model = { primary: 'stale/model' };
        const { merged, summary, collisions } = mergeOpenClawAgentsAndBindings(existing, patch);
        assert.deepEqual(collisions, []);
        assert.equal(summary.agentsUpdated, 1);
        assert.equal(merged.agents.list[0].model.primary, 'openai/gpt-4o');
    });

    it('migrates legacy CM entries (ownership marker in "comment") to params._cm and strips "comment"', () => {
        // Shape written by pre-fix C1b.2a: top-level `comment` on the agent,
        // which the gateway's strict schema refuses. Merge must rewrite it.
        const legacy = {
            agents: {
                list: [
                    {
                        id: 'tars-1001',
                        name: 'legacy',
                        comment: makeCmComment('-1001'),
                        model: { primary: 'old/model' }
                    }
                ]
            }
        };
        const { merged, summary, collisions } = mergeOpenClawAgentsAndBindings(legacy, patch);
        assert.deepEqual(collisions, []);
        assert.equal(summary.agentsUpdated, 1);
        const a = merged.agents.list[0];
        assert.equal(a.comment, undefined, 'legacy comment key must be removed');
        assert.ok(isCmOwnedAgentEntry(a), 'new params._cm marker must be present');
        assert.equal(a.model.primary, 'openai/gpt-4o');
    });

    it('produces a merged doc whose agents.list entries are free of the schema-illegal "comment" key', () => {
        const { merged } = mergeOpenClawAgentsAndBindings({}, patch);
        for (const a of merged.agents.list) {
            assert.equal(
                a.comment,
                undefined,
                `agents.list[] entry must not carry "comment": ${JSON.stringify(a)}`
            );
        }
    });
});
