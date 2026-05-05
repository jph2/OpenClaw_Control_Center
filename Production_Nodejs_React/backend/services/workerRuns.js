import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { buildChannelRuntimeBinding } from './channelRuntimeBinding.js';

export const WORKER_RUN_AUDIT_SCHEMA = 'cm.worker-run-audit.v1';

export const WorkerRunRequestSchema = z.object({
    workerId: z.string().min(1),
    task: z.string().min(1).max(8000)
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
    channelConfigRaw,
    operator = null,
    now = new Date()
}) {
    const parsed = WorkerRunRequestSchema.parse({ workerId, task });
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
    const entry = {
        schema: WORKER_RUN_AUDIT_SCHEMA,
        runId,
        channelId: normalizeChannelId(channelId),
        channelName: binding.displayName,
        workerId: worker.id,
        runtimeAgentId: worker.runtimeAgentId,
        parentAgentId,
        status: 'completed_audit_proof',
        mode: 'headless_audit_readback',
        requestedBy: operator || 'channel-manager',
        startedAt,
        completedAt: startedAt,
        inputEnvelope: {
            task: taskText,
            contextBoundary: worker.contextBoundary,
            transcriptPolicy: worker.transcriptPolicy,
            canonicalSessionKey: binding.canonicalSession?.expectedSessionKey || null,
            canSpeakToChannel: false
        },
        workerResultArtifact: {
            kind: 'worker_run_result_summary',
            format: 'text/markdown',
            text:
                `Worker ${worker.displayName || worker.id} accepted a headless task from ` +
                `${parentAgentId}. Direct Telegram speech stayed disabled. Task:\n\n${taskText}`
        },
        parentAggregation: {
            status: 'recorded_for_parent_review',
            parentAgentId,
            telegramWrite: 'not_performed',
            summary:
                `Worker result recorded for ${parentAgentId}; parent remains the only channel voice.`
        },
        events: [
            { type: 'worker_run_requested', at: startedAt },
            { type: 'worker_run_started', at: startedAt },
            { type: 'worker_result_artifact_recorded', at: startedAt },
            { type: 'parent_aggregation_recorded', at: startedAt }
        ]
    };

    const auditPath = await appendWorkerRunAuditEntry(entry);
    return { ok: true, auditPath, run: entry };
}
