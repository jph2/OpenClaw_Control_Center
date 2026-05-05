import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { buildChannelRuntimeBinding } from './channelRuntimeBinding.js';

export const WORKER_RUN_AUDIT_SCHEMA = 'cm.worker-run-audit.v1';
const DEFAULT_OPENCLAW_DIST_DIR = '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/dist';

export const WorkerRunRequestSchema = z.object({
    workerId: z.string().min(1),
    task: z.string().min(1).max(8000),
    executionMode: z.enum(['auditProof', 'openclawSubagent']).optional().default('auditProof')
});

function nowIso() {
    return new Date().toISOString();
}

function normalizeChannelId(id) {
    return String(id ?? '').trim();
}

function makeRunId(now = new Date()) {
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    return `wr_${stamp}_${randomUUID().slice(0, 8)}`;
}

export async function resolveWorkerRunAuditPath() {
    if (!process.env.WORKSPACE_ROOT) {
        throw new Error('WORKSPACE_ROOT is required for Worker Run audit');
    }
    const { resolved } = await resolveSafe(
        process.env.WORKSPACE_ROOT,
        'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/worker_runs_audit.jsonl'
    );
    return resolved;
}

async function appendWorkerRunAuditEntry(entry) {
    const auditPath = await resolveWorkerRunAuditPath();
    await fs.mkdir(path.dirname(auditPath), { recursive: true });
    await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
    return auditPath;
}

async function loadOpenClawSubagentSpawner({ distDir = process.env.OPENCLAW_DIST_DIR || DEFAULT_OPENCLAW_DIST_DIR } = {}) {
    const files = await fs.readdir(distDir);
    const candidate = files.find((name) => /^subagent-spawn-[A-Za-z0-9_-]+\.js$/.test(name));
    if (!candidate) throw new Error(`OpenClaw subagent spawn module not found in ${distDir}`);
    const mod = await import(pathToFileURL(path.join(distDir, candidate)).href);
    const spawnSubagentDirect = mod.spawnSubagentDirect || mod.t || mod.default?.spawnSubagentDirect;
    if (typeof spawnSubagentDirect !== 'function') {
        throw new Error(`OpenClaw subagent spawn module ${candidate} does not export spawnSubagentDirect`);
    }
    return { spawnSubagentDirect, source: path.join(distDir, candidate) };
}

async function spawnOpenClawSubagent({ worker, binding, taskText, spawnSubagentDirect, loadSpawner }) {
    const spawner = spawnSubagentDirect
        ? { spawnSubagentDirect, source: 'injected' }
        : await (loadSpawner || loadOpenClawSubagentSpawner)();
    const parentSessionKey = binding.canonicalSession?.gatewaySessionId;
    if (!parentSessionKey) {
        throw new Error('canonical parent session key is unavailable for OpenClaw subagent spawn');
    }
    const result = await spawner.spawnSubagentDirect(
        {
            task: taskText,
            agentId: worker.runtimeAgentId,
            model: worker.modelProfile && worker.modelProfile !== 'inherit' ? worker.modelProfile : undefined,
            mode: 'run',
            cleanup: 'keep',
            expectsCompletionMessage: true,
            label: worker.id
        },
        {
            agentSessionKey: parentSessionKey,
            agentChannel: 'telegram',
            agentAccountId: null,
            agentTo: binding.channelId,
            agentThreadId: null,
            agentGroupId: binding.channelId,
            agentGroupChannel: 'telegram',
            agentGroupSpace: null
        }
    );
    return { ...result, spawnModule: spawner.source };
}

function parseAuditLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return null;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export async function listWorkerRuns({ channelId = null, workerId = null, limit = 50 } = {}) {
    let auditPath;
    try {
        auditPath = await resolveWorkerRunAuditPath();
    } catch {
        return { auditPath: null, runs: [] };
    }

    let raw = '';
    try {
        raw = await fs.readFile(auditPath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return { auditPath, runs: [] };
        throw err;
    }

    const wantedChannel = channelId == null ? '' : normalizeChannelId(channelId);
    const wantedWorker = workerId == null ? '' : String(workerId).trim();
    const max = Math.max(1, Math.min(Number.parseInt(String(limit), 10) || 50, 200));
    const runs = raw
        .split(/\r?\n/u)
        .map(parseAuditLine)
        .filter(Boolean)
        .filter((entry) => !wantedChannel || normalizeChannelId(entry.channelId) === wantedChannel)
        .filter((entry) => !wantedWorker || entry.workerId === wantedWorker || entry.runtimeAgentId === wantedWorker)
        .slice(-max)
        .reverse();

    return { auditPath, runs };
}

export async function createWorkerRun({
    channelId,
    workerId,
    task,
    executionMode = 'auditProof',
    channelConfigRaw,
    operator = null,
    now = new Date(),
    spawnSubagentDirect = null,
    loadSpawner = null
}) {
    const parsed = WorkerRunRequestSchema.parse({ workerId, task, executionMode });
    const bindingPayload = buildChannelRuntimeBinding(channelId, { channelConfigRaw });
    const binding = bindingPayload.channelRuntimeBinding;
    const workers = binding?.workerPolicy?.runtimeWorkers || [];
    const worker = workers.find(
        (w) => w.id === parsed.workerId || w.runtimeAgentId === parsed.workerId
    );

    if (!worker) {
        const err = new Error(
            `Runtime Worker "${parsed.workerId}" is not configured for channel ${channelId}.`
        );
        err.status = 404;
        throw err;
    }
    if (worker.canSpeakToChannel !== false) {
        const err = new Error(`Runtime Worker "${worker.id}" is not headless.`);
        err.status = 409;
        throw err;
    }

    const startedAt = nowIso();
    const runId = makeRunId(now);
    const taskText = parsed.task.trim();
    const parentAgentId = binding.agentId;
    const events = [
        { type: 'worker_run_requested', at: startedAt },
        { type: 'worker_run_started', at: startedAt }
    ];
    let liveDelegation = null;
    let status = 'completed_audit_proof';
    let mode = 'headless_audit_readback';
    let completedAt = startedAt;

    if (parsed.executionMode === 'openclawSubagent') {
        mode = 'openclaw_subagent_spawn';
        try {
            const spawnResult = await spawnOpenClawSubagent({
                worker,
                binding,
                taskText,
                spawnSubagentDirect,
                loadSpawner
            });
            liveDelegation = {
                status: spawnResult.status || 'unknown',
                runId: spawnResult.runId || null,
                childSessionKey: spawnResult.childSessionKey || null,
                mode: spawnResult.mode || null,
                note: spawnResult.note || null,
                modelApplied: spawnResult.modelApplied || null,
                spawnModule: spawnResult.spawnModule || null,
                error: spawnResult.error || null
            };
            status = spawnResult.status === 'accepted' ? 'live_spawn_accepted' : 'live_spawn_failed';
            if (spawnResult.status === 'accepted') {
                completedAt = null;
                events.push({
                    type: 'openclaw_subagent_spawn_accepted',
                    at: startedAt,
                    childSessionKey: spawnResult.childSessionKey || null,
                    openclawRunId: spawnResult.runId || null
                });
            } else {
                events.push({
                    type: 'openclaw_subagent_spawn_failed',
                    at: startedAt,
                    error: spawnResult.error || spawnResult.status || 'unknown'
                });
            }
        } catch (err) {
            status = 'live_spawn_failed';
            liveDelegation = {
                status: 'error',
                runId: null,
                childSessionKey: null,
                mode: null,
                note: null,
                modelApplied: null,
                spawnModule: null,
                error: err?.message || String(err)
            };
            events.push({
                type: 'openclaw_subagent_spawn_failed',
                at: startedAt,
                error: liveDelegation.error
            });
        }
    }

    events.push({ type: 'worker_result_artifact_recorded', at: startedAt });
    events.push({ type: 'parent_aggregation_recorded', at: startedAt });

    const entry = {
        schema: WORKER_RUN_AUDIT_SCHEMA,
        runId,
        channelId: normalizeChannelId(channelId),
        channelName: binding.displayName,
        workerId: worker.id,
        runtimeAgentId: worker.runtimeAgentId,
        parentAgentId,
        status,
        mode,
        requestedBy: operator || 'channel-manager',
        startedAt,
        completedAt,
        inputEnvelope: {
            task: taskText,
            contextBoundary: worker.contextBoundary,
            transcriptPolicy: worker.transcriptPolicy,
            canonicalSessionKey: binding.canonicalSession?.gatewaySessionId || null,
            canSpeakToChannel: false
        },
        workerResultArtifact: {
            kind: 'worker_run_result_summary',
            format: 'text/markdown',
            text:
                parsed.executionMode === 'openclawSubagent' && status === 'live_spawn_accepted'
                    ? `Worker ${worker.displayName || worker.id} was spawned as an OpenClaw subagent from ${parentAgentId}. Direct Telegram speech stayed disabled. Task:\n\n${taskText}`
                    : `Worker ${worker.displayName || worker.id} accepted a headless task from ${parentAgentId}. Direct Telegram speech stayed disabled. Task:\n\n${taskText}`
        },
        liveDelegation,
        parentAggregation: {
            status: status === 'live_spawn_accepted' ? 'waiting_for_worker_completion' : 'recorded_for_parent_review',
            parentAgentId,
            telegramWrite: 'not_performed',
            summary:
                status === 'live_spawn_accepted'
                    ? `OpenClaw subagent run accepted; ${parentAgentId} remains the only channel voice.`
                    : `Worker result recorded for ${parentAgentId}; parent remains the only channel voice.`
        },
        events
    };

    const auditPath = await appendWorkerRunAuditEntry(entry);
    return { ok: true, auditPath, run: entry };
}
