import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    buildChannelRuntimeBinding,
    forceChannelCanonicalSession,
    validateSessionIdentityForKey
} from '../services/channelRuntimeBinding.js';

async function withTempSessions(sessionDoc, fn) {
    const oldOverride = process.env.OPENCLAW_SESSIONS_JSON_PATH;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-runtime-binding-'));
    const sessionsPath = path.join(dir, 'sessions.json');
    fs.writeFileSync(sessionsPath, JSON.stringify(sessionDoc, null, 2));
    process.env.OPENCLAW_SESSIONS_JSON_PATH = sessionsPath;
    try {
        return await fn({ dir, sessionsPath });
    } finally {
        if (oldOverride === undefined) delete process.env.OPENCLAW_SESSIONS_JSON_PATH;
        else process.env.OPENCLAW_SESSIONS_JSON_PATH = oldOverride;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function channelConfigFor(channel) {
    return { channels: [channel] };
}

test('buildChannelRuntimeBinding returns aligned binding for canonical Telegram session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    await withTempSessions(
        {
            'agent:tars-1001:telegram:group:-1001': {
                sessionId,
                sessionFile: `/tmp/${sessionId}.jsonl`,
                deliveryContext: { channel: 'telegram' },
                updatedAt: 1
            }
        },
        () => {
            const out = buildChannelRuntimeBinding('-1001', {
                channelConfigRaw: channelConfigFor({
                    id: '-1001',
                    name: 'TTG001_Idea_Capture',
                    assignedAgent: 'tars',
                    model: 'openai-codex/gpt-5.4',
                    skills: ['clawflow']
                })
            });

            assert.equal(out.alignment.status, 'aligned');
            assert.equal(out.channelRuntimeBinding.agentId, 'tars-1001');
            assert.equal(
                out.channelRuntimeBinding.canonicalSession.gatewaySessionId,
                'agent:tars-1001:telegram:group:-1001'
            );
            assert.equal(out.resolvedSession.canonicalForChannelId, '-1001');
            assert.equal(out.sessionIdentity.status, 'aligned');
        }
    );
});

test('buildChannelRuntimeBinding exposes active Skill Roles without claiming runtime workers', async () => {
    const sessionId = '77777777-7777-4777-8777-777777777777';
    await withTempSessions(
        {
            'agent:tars-1001:telegram:group:-1001': {
                sessionId,
                sessionFile: `/tmp/${sessionId}.jsonl`,
                updatedAt: 1
            }
        },
        () => {
            const out = buildChannelRuntimeBinding('-1001', {
                channelConfigRaw: {
                    channels: [
                        {
                            id: '-1001',
                            name: 'TTG001_Idea_Capture',
                            assignedAgent: 'tars',
                            inactiveSubAgents: ['disabled-for-channel']
                        }
                    ],
                    subAgents: [
                        {
                            id: 'researcher',
                            name: 'Researcher',
                            parent: 'tars',
                            additionalSkills: ['web_search']
                        },
                        {
                            id: 'disabled-for-channel',
                            parent: 'tars',
                            additionalSkills: ['x']
                        }
                    ]
                }
            });

            assert.equal(out.channelRuntimeBinding.skillRolePolicy.semantics.currentSubAgentsAre, 'skillRole');
            assert.equal(out.channelRuntimeBinding.skillRolePolicy.semantics.runtimeWorkerImplemented, false);
            assert.deepEqual(out.channelRuntimeBinding.skillRolePolicy.roles.map((r) => r.id), ['researcher']);
            assert.deepEqual(out.channelRuntimeBinding.workerPolicy.runtimeWorkers, []);
        }
    );
});

test('buildChannelRuntimeBinding reports mismatch when resolved session belongs to another agent', async () => {
    const sessionId = '22222222-2222-4222-8222-222222222222';
    await withTempSessions(
        {
            'agent:legacy-1001:telegram:group:-1001': {
                sessionId,
                sessionFile: `/tmp/${sessionId}.jsonl`,
                updatedAt: 1
            }
        },
        () => {
            const out = buildChannelRuntimeBinding('-1001', {
                channelConfigRaw: channelConfigFor({
                    id: '-1001',
                    name: 'TTG001_Idea_Capture',
                    assignedAgent: 'tars',
                    model: 'openai-codex/gpt-5.4'
                })
            });

            assert.equal(out.alignment.status, 'mismatch');
            assert.equal(out.alignment.expectedSessionKey, 'agent:tars-1001:telegram:group:-1001');
            assert.equal(out.alignment.actualSessionKey, 'agent:legacy-1001:telegram:group:-1001');
            assert.ok(out.alignment.reasons.includes('resolved_session_not_canonical_for_channel'));
            assert.ok(out.alignment.reasons.includes('session_entry_missing'));
        }
    );
});

test('validateSessionIdentityForKey detects sessionId vs sessionFile basename drift', async () => {
    await withTempSessions(
        {
            'agent:tars-1001:telegram:group:-1001': {
                sessionId: '33333333-3333-4333-8333-333333333333',
                sessionFile: '/tmp/44444444-4444-4444-8444-444444444444.jsonl',
                updatedAt: 1
            }
        },
        () => {
            const out = validateSessionIdentityForKey('agent:tars-1001:telegram:group:-1001');
            assert.equal(out.status, 'mismatch');
            assert.ok(out.reasons.includes('session_id_file_basename_drift'));
            assert.equal(out.sessionFileSessionId, '44444444-4444-4444-8444-444444444444');
        }
    );
});

test('forceChannelCanonicalSession refreshes canonical entry and repairs sessionId drift', async () => {
    const oldId = '55555555-5555-4555-8555-555555555555';
    const fileId = '66666666-6666-4666-8666-666666666666';
    await withTempSessions(
        {
            'agent:tars-1001:telegram:group:-1001': {
                sessionId: oldId,
                sessionFile: `/tmp/${fileId}.jsonl`,
                updatedAt: 1
            }
        },
        async ({ sessionsPath }) => {
            const out = await forceChannelCanonicalSession('-1001', {
                channelConfigRaw: channelConfigFor({
                    id: '-1001',
                    name: 'TTG001_Idea_Capture',
                    assignedAgent: 'tars'
                })
            });
            const parsed = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
            const entry = parsed['agent:tars-1001:telegram:group:-1001'];
            assert.equal(entry.sessionId, fileId);
            assert.ok(entry.updatedAt > 1);
            assert.equal(out.alignment.status, 'aligned');
            assert.equal(out.forced.ok, true);
            assert.ok(fs.existsSync(out.forced.backupPath));
        }
    );
});
