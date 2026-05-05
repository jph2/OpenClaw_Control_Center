import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    createWorkerRun,
    listWorkerRuns,
    WORKER_RUN_AUDIT_SCHEMA
} from '../services/workerRuns.js';

async function withTempWorkerRunEnv(fn) {
    const oldRoot = process.env.WORKSPACE_ROOT;
    const oldSessions = process.env.OPENCLAW_SESSIONS_JSON_PATH;
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
