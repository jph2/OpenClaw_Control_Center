import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../index.js';
import {
    createWorkerRun,
    listWorkerRuns,
    WORKER_RUN_AUDIT_SCHEMA
} from '../services/workerRuns.js';

async function withTempWorkerRunEnv(fn) {
    const oldRoot = process.env.WORKSPACE_ROOT;
    const oldSessions = process.env.OPENCLAW_SESSIONS_JSON_PATH;
    const oldDist = process.env.OPENCLAW_DIST_DIR;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-worker-runs-root-'));
    const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-worker-runs-sessions-'));
    const sessionsPath = path.join(sessionsDir, 'sessions.json');
    fs.writeFileSync(
        sessionsPath,
        JSON.stringify(
            {
                'agent:tars-1001:telegram:group:-1001': {
                    sessionId: '11111111-1111-4111-8111-111111111111',
                    sessionFile: '/tmp/11111111-1111-4111-8111-111111111111.jsonl',
                    updatedAt: 1
                }
            },
            null,
            2
        )
    );
    process.env.WORKSPACE_ROOT = root;
    process.env.OPENCLAW_SESSIONS_JSON_PATH = sessionsPath;
    try {
        return await fn({ root, sessionsPath });
    } finally {
        if (oldRoot === undefined) delete process.env.WORKSPACE_ROOT;
        else process.env.WORKSPACE_ROOT = oldRoot;
        if (oldSessions === undefined) delete process.env.OPENCLAW_SESSIONS_JSON_PATH;
        else process.env.OPENCLAW_SESSIONS_JSON_PATH = oldSessions;
        if (oldDist === undefined) delete process.env.OPENCLAW_DIST_DIR;
        else process.env.OPENCLAW_DIST_DIR = oldDist;
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(sessionsDir, { recursive: true, force: true });
    }
}

function channelConfigWithWorker() {
    return {
        channels: [{ id: '-1001', name: 'TTG001_Idea_Capture', assignedAgent: 'tars' }],
        subAgents: [
            {
                id: 'researcher',
                name: 'Researcher',
                parent: 'tars',
                additionalSkills: ['web_search']
            }
        ],
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
    };
}

test('createWorkerRun records a headless audit/readback run without Telegram write', async () => {
    await withTempWorkerRunEnv(async () => {
        const out = await createWorkerRun({
            channelId: '-1001',
            workerId: 'research-summary-worker',
            task: 'Summarize the newest research notes.',
            channelConfigRaw: channelConfigWithWorker(),
            operator: 'test'
        });

        assert.equal(out.ok, true);
        assert.equal(out.run.schema, WORKER_RUN_AUDIT_SCHEMA);
        assert.equal(out.run.workerId, 'research-summary-worker');
        assert.equal(out.run.runtimeAgentId, 'worker-research-summary-worker');
        assert.equal(out.run.parentAgentId, 'tars-1001');
        assert.equal(out.run.inputEnvelope.canSpeakToChannel, false);
        assert.equal(out.run.parentAggregation.telegramWrite, 'not_performed');
        assert.deepEqual(out.run.events.map((e) => e.type), [
            'worker_run_requested',
            'worker_run_started',
            'worker_result_artifact_recorded',
            'parent_aggregation_recorded'
        ]);

        const listed = await listWorkerRuns({ channelId: '-1001' });
        assert.equal(listed.runs.length, 1);
        assert.equal(listed.runs[0].runId, out.run.runId);
    });
});

test('createWorkerRun can spawn a live OpenClaw subagent and read back child completion', async () => {
    await withTempWorkerRunEnv(async ({ sessionsPath }) => {
        const calls = [];
        const childSessionKey = 'agent:worker-research-summary-worker:subagent:test';
        const out = await createWorkerRun({
            channelId: '-1001',
            workerId: 'research-summary-worker',
            task: 'Summarize the newest research notes.',
            executionMode: 'openclawSubagent',
            channelConfigRaw: channelConfigWithWorker(),
            operator: 'test',
            spawnSubagentDirect: async (params, ctx) => {
                calls.push({ params, ctx });
                return {
                    status: 'accepted',
                    childSessionKey,
                    runId: 'oc-run-123',
                    mode: 'run',
                    note: 'accepted'
                };
            }
        });

        assert.equal(out.run.status, 'live_spawn_accepted');
        assert.equal(out.run.mode, 'openclaw_subagent_spawn');
        assert.equal(out.run.completedAt, null);
        assert.equal(out.run.liveDelegation.runId, 'oc-run-123');
        assert.equal(out.run.liveDelegation.childSessionKey, childSessionKey);
        assert.equal(out.run.parentAggregation.status, 'waiting_for_worker_completion');
        assert.equal(out.run.parentAggregation.telegramWrite, 'not_performed');
        assert.equal(calls[0].params.agentId, 'worker-research-summary-worker');
        assert.equal(calls[0].params.mode, 'run');
        assert.equal(calls[0].params.cleanup, 'keep');
        assert.equal(calls[0].ctx.agentSessionKey, 'agent:tars-1001:telegram:group:-1001');
        assert.ok(out.run.events.some((e) => e.type === 'openclaw_subagent_spawn_accepted'));

        const childSessionFile = path.join(path.dirname(sessionsPath), '22222222-2222-4222-8222-222222222222.jsonl');
        fs.writeFileSync(
            childSessionFile,
            `${JSON.stringify({
                type: 'message',
                id: 'child-msg-1',
                timestamp: '2026-05-06T10:00:00.000Z',
                message: {
                    role: 'assistant',
                    content: 'Research summary complete.',
                    model: 'openai/gpt-5.4'
                }
            })}\n`
        );
        const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
        sessions[childSessionKey] = {
            sessionId: '22222222-2222-4222-8222-222222222222',
            sessionFile: childSessionFile,
            updatedAt: 2
        };
        fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));

        const listed = await listWorkerRuns({ channelId: '-1001' });
        assert.equal(listed.runs[0].status, 'worker_completion_readback_confirmed');
        assert.equal(listed.runs[0].completedAt, '2026-05-06T10:00:00.000Z');
        assert.equal(listed.runs[0].completionReadback.status, 'confirmed');
        assert.equal(listed.runs[0].completionReadback.text, 'Research summary complete.');
        assert.equal(listed.runs[0].parentAggregation.status, 'completion_readback_confirmed');
        assert.ok(listed.runs[0].events.some((e) => e.type === 'worker_completion_readback_confirmed'));
    });
});

test('createWorkerRun records live spawn failures as readback-visible runs', async () => {
    await withTempWorkerRunEnv(async () => {
        const out = await createWorkerRun({
            channelId: '-1001',
            workerId: 'research-summary-worker',
            task: 'Summarize the newest research notes.',
            executionMode: 'openclawSubagent',
            channelConfigRaw: channelConfigWithWorker(),
            spawnSubagentDirect: async () => ({ status: 'error', error: 'agent missing' })
        });

        assert.equal(out.run.status, 'live_spawn_failed');
        assert.equal(out.run.liveDelegation.status, 'error');
        assert.equal(out.run.liveDelegation.error, 'agent missing');
        assert.equal(out.run.parentAggregation.telegramWrite, 'not_performed');
        assert.ok(out.run.events.some((e) => e.type === 'openclaw_subagent_spawn_failed'));
    });
});

test('POST /api/chat/:groupId/worker-runs forwards openclawSubagent execution mode', async () => {
    await withTempWorkerRunEnv(async ({ root }) => {
        const configDir = path.join(root, 'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'channel_config.json'), JSON.stringify(channelConfigWithWorker(), null, 2));

        const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-worker-runs-dist-'));
        process.env.OPENCLAW_DIST_DIR = distDir;
        fs.writeFileSync(
            path.join(distDir, 'subagent-spawn-test.js'),
            `export async function spawnSubagentDirect() {
  return {
    status: 'accepted',
    childSessionKey: 'agent:worker-research-summary-worker:subagent:route',
    runId: 'oc-route-run-123',
    mode: 'run',
    note: 'accepted'
  };
}
`
        );

        const response = await request(app)
            .post('/api/chat/-1001/worker-runs')
            .send({
                workerId: 'research-summary-worker',
                task: 'Route-level worker run',
                executionMode: 'openclawSubagent'
            })
            .expect(200);

        assert.equal(response.body.run.status, 'live_spawn_accepted');
        assert.equal(response.body.run.liveDelegation.runId, 'oc-route-run-123');
        assert.equal(response.body.run.liveDelegation.childSessionKey, 'agent:worker-research-summary-worker:subagent:route');
        fs.rmSync(distDir, { recursive: true, force: true });
    });
});

test('createWorkerRun rejects workers that are not active for the channel parent', async () => {
    await withTempWorkerRunEnv(async () => {
        await assert.rejects(
            () =>
                createWorkerRun({
                    channelId: '-1001',
                    workerId: 'missing-worker',
                    task: 'Do work',
                    channelConfigRaw: channelConfigWithWorker()
                }),
            /not configured/
        );
    });
});
