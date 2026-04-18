/**
 * Bundle C1 / C1b — merge Channel Manager `channel_config.json` into
 * `~/.openclaw/openclaw.json`:
 *
 * - C1    : `channels.telegram.groups[id].requireMention`
 * - C1b.1 : `channels.telegram.groups[id].skills` (deduped string[])
 * - C1b.2a: per-channel `agents.list[]` (synth id, model, skills allowlist)
 *           + matching `bindings[]` routes.
 *
 *           OpenClaw's `agents.list[]` schema is Zod-strict and rejects unknown
 *           top-level keys (e.g. `comment` is not in the schema). The CM
 *           ownership marker therefore lives in `params._cm` on agent entries
 *           (schema-legal — `params` is Record<string, unknown>), and in
 *           `comment` on binding entries (schema-legal there).
 *
 *           Additive upsert only — no deletions. Orphan cleanup is C1b.2b.
 *           `agents.defaults.*` is operator-owned; never rewritten here
 *           (opt-in shipment is C1b.2c).
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import lockfile from 'proper-lockfile';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const MAX_BACKUPS = 10;

/**
 * Ownership marker prefix (used inside `bindings[].comment`, which is
 * schema-allowed). Agents use a structured marker in `params._cm` instead
 * (see CM_AGENT_PARAM_KEY).
 */
export const CM_MARKER_PREFIX = 'managed-by: channel-manager';

/** Key under `agents.list[].params` that carries the CM ownership marker. */
export const CM_AGENT_PARAM_KEY = '_cm';

/** Literal used in `params._cm.managedBy` to flag CM-owned agents. */
export const CM_AGENT_MANAGED_BY = 'channel-manager';

/** Validates merged doc has a sane telegram.groups map; rest is passthrough. */
const MergedOpenClawSchema = z
    .object({
        channels: z
            .object({
                telegram: z
                    .object({
                        groups: z.record(z.string(), z.any())
                    })
                    .passthrough()
            })
            .passthrough()
            .optional()
    })
    .passthrough();

/**
 * Strict shape for CM-emitted agents.list[] entries.
 *
 * Must stay compatible with OpenClaw's Zod-strict `agents.list[]` schema:
 * only fields defined in `AgentsSchema.list[]` are allowed at the top level.
 * `params` is `Record<string, unknown>`, which is why the ownership marker
 * lives there.
 */
const CmAgentEntrySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    model: z
        .object({
            primary: z.string().min(1)
        })
        .optional(),
    skills: z.array(z.string().min(1)).optional(),
    params: z.object({
        [CM_AGENT_PARAM_KEY]: z.object({
            managedBy: z.literal(CM_AGENT_MANAGED_BY),
            source: z.string().min(1)
        })
    })
});

/** Strict shape for CM-emitted bindings[] entries (route variant). */
const CmBindingEntrySchema = z.object({
    type: z.literal('route'),
    agentId: z.string().min(1),
    comment: z.string().min(1),
    match: z.object({
        channel: z.literal('telegram'),
        peer: z.object({
            kind: z.literal('group'),
            id: z.string().min(1)
        })
    })
});

export function getOpenClawConfigPath() {
    return process.env.OPENCLAW_CONFIG_PATH || path.join(homedir(), '.openclaw', 'openclaw.json');
}

export function getApplyAuditLogPath() {
    const p = getOpenClawConfigPath();
    return path.join(path.dirname(p), 'channel-manager-openclaw-apply-audit.jsonl');
}

/**
 * Reload the user-level OpenClaw gateway so it re-reads openclaw.json (no hot-reload today).
 * Skip with CHANNEL_MANAGER_SKIP_GATEWAY_RESTART=1 if you manage the service elsewhere.
 *
 * @returns {Promise<{ ok?: boolean, skipped?: boolean, error?: string }>}
 */
export async function restartOpenClawGatewayUserService() {
    const skip = ['1', 'true', 'yes'].includes(
        String(process.env.CHANNEL_MANAGER_SKIP_GATEWAY_RESTART || '').toLowerCase()
    );
    if (skip) {
        return { skipped: true };
    }
    try {
        await execFileAsync('systemctl', ['--user', 'restart', 'openclaw-gateway.service'], {
            timeout: 120_000
        });
        return { ok: true };
    } catch (e) {
        const stderr = e?.stderr != null ? String(e.stderr) : '';
        return { ok: false, error: stderr || e.message || String(e) };
    }
}

/** Dedupe non-empty skill ids from Channel Manager (OpenClaw expects string[] on groups). */
export function normalizeChannelSkillIds(skills) {
    if (!Array.isArray(skills)) return [];
    const out = [];
    const seen = new Set();
    for (const s of skills) {
        const id = String(s ?? '')
            .trim()
            .replace(/\s+/gu, '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

const GroupApplyPatchSchema = z.object({
    requireMention: z.boolean(),
    skills: z.array(z.string())
});

/**
 * Build per-group patch from channel_config.json (SoT).
 * Keys merged into OpenClaw `channels.telegram.groups[id]` (schema-allowed only).
 */
export function buildTelegramGroupsApplyPatch(rawChannelConfig) {
    const channels = Array.isArray(rawChannelConfig?.channels) ? rawChannelConfig.channels : [];
    const patch = {};
    for (const c of channels) {
        if (c?.id == null) continue;
        const id = String(c.id);
        const entry = {
            requireMention: Boolean(c.require_mention ?? false),
            skills: normalizeChannelSkillIds(c.skills)
        };
        const parsed = GroupApplyPatchSchema.safeParse(entry);
        if (!parsed.success) {
            const err = new Error(`Invalid apply patch for channel ${id}: ${parsed.error.message}`);
            err.status = 400;
            throw err;
        }
        patch[id] = parsed.data;
    }
    return patch;
}

export function mergeOpenClawTelegramGroups(existingOpenclaw, groupsPatch) {
    const out = JSON.parse(JSON.stringify(existingOpenclaw));
    if (!out.channels) out.channels = {};
    if (!out.channels.telegram) out.channels.telegram = {};
    if (!out.channels.telegram.groups || typeof out.channels.telegram.groups !== 'object') {
        out.channels.telegram.groups = {};
    }
    const g = out.channels.telegram.groups;
    for (const [id, patch] of Object.entries(groupsPatch)) {
        g[id] = { ...(g[id] && typeof g[id] === 'object' ? g[id] : {}), ...patch };
    }
    return out;
}

// ---------------------------------------------------------------------------
// C1b.2a — agents.list[] + bindings[] per-channel upsert
// ---------------------------------------------------------------------------

/** Deterministic slug: strip leading `-`, cap at 16 chars. */
export function groupIdSlug(id) {
    return String(id ?? '').replace(/^-/, '').slice(0, 16);
}

/**
 * Build the `bindings[].comment` marker. `comment` is schema-legal on
 * bindings, so we use a human-readable string there.
 */
export function makeCmComment(groupId) {
    return `${CM_MARKER_PREFIX}; source: ${groupId}`;
}

export function isCmOwnedComment(comment) {
    return typeof comment === 'string' && comment.startsWith(CM_MARKER_PREFIX);
}

/**
 * Build the structured agent ownership marker stored under
 * `agents.list[].params._cm`. Structured (not a string) so the gateway's
 * strict schema accepts it via the generic `params: Record<string, unknown>`
 * slot.
 */
export function makeCmAgentParams(groupId) {
    return {
        [CM_AGENT_PARAM_KEY]: {
            managedBy: CM_AGENT_MANAGED_BY,
            source: String(groupId)
        }
    };
}

/** True iff the agent entry was authored by Channel Manager. */
export function isCmOwnedAgentEntry(agentEntry) {
    const marker = agentEntry?.params?.[CM_AGENT_PARAM_KEY];
    return Boolean(marker && marker.managedBy === CM_AGENT_MANAGED_BY);
}

/** Returns the source groupId from the agent marker, or null. */
export function getCmAgentSource(agentEntry) {
    const marker = agentEntry?.params?.[CM_AGENT_PARAM_KEY];
    if (!marker || marker.managedBy !== CM_AGENT_MANAGED_BY) return null;
    return typeof marker.source === 'string' && marker.source.length > 0
        ? marker.source
        : null;
}

/** agents[c.assignedAgent].defaultSkills ∪ c.skills, minus agent.inactiveSkills. */
function computeChannelSkills(channel, agent) {
    const agentDefaults = Array.isArray(agent?.defaultSkills) ? agent.defaultSkills : [];
    const agentInactive = new Set(
        Array.isArray(agent?.inactiveSkills) ? agent.inactiveSkills : []
    );
    const channelExtras = Array.isArray(channel?.skills) ? channel.skills : [];
    const merged = normalizeChannelSkillIds([...agentDefaults, ...channelExtras]);
    return merged.filter((s) => !agentInactive.has(s));
}

/**
 * Build the per-channel patch for `agents.list[]` + `bindings[]`.
 * Never touches `agents.defaults.*`.
 *
 * @returns {{ agentEntries: object[], bindingEntries: object[], perChannel: object[] }}
 */
export function buildAgentsAndBindingsApplyPatch(rawChannelConfig) {
    const channels = Array.isArray(rawChannelConfig?.channels) ? rawChannelConfig.channels : [];
    const agents = Array.isArray(rawChannelConfig?.agents) ? rawChannelConfig.agents : [];
    const agentsById = new Map(agents.filter((a) => a?.id).map((a) => [a.id, a]));

    const agentEntries = [];
    const bindingEntries = [];
    const perChannel = [];

    for (const c of channels) {
        if (c?.id == null || !c?.assignedAgent) continue;
        const groupId = String(c.id);
        const assignedAgent = String(c.assignedAgent);
        const agentDef = agentsById.get(assignedAgent);

        const synthId = `${assignedAgent}-${groupIdSlug(groupId)}`;
        const bindingComment = makeCmComment(groupId);
        const modelStr =
            typeof c.model === 'string' && c.model.trim().length > 0 ? c.model.trim() : null;
        const effectiveSkills = computeChannelSkills(c, agentDef);
        const agentLabel = agentDef?.name || assignedAgent;
        const channelName = c.name || groupId;

        const agentEntry = {
            id: synthId,
            name: `${agentLabel} · ${channelName}`,
            params: makeCmAgentParams(groupId)
        };
        if (modelStr) agentEntry.model = { primary: modelStr };
        if (effectiveSkills.length > 0) agentEntry.skills = effectiveSkills;

        const agentParsed = CmAgentEntrySchema.safeParse(agentEntry);
        if (!agentParsed.success) {
            const err = new Error(
                `Invalid agents.list[] entry for channel ${groupId}: ${agentParsed.error.message}`
            );
            err.status = 400;
            throw err;
        }

        const bindingEntry = {
            type: 'route',
            agentId: synthId,
            comment: bindingComment,
            match: {
                channel: 'telegram',
                peer: { kind: 'group', id: groupId }
            }
        };

        const bindingParsed = CmBindingEntrySchema.safeParse(bindingEntry);
        if (!bindingParsed.success) {
            const err = new Error(
                `Invalid bindings[] entry for channel ${groupId}: ${bindingParsed.error.message}`
            );
            err.status = 400;
            throw err;
        }

        agentEntries.push(agentParsed.data);
        bindingEntries.push(bindingParsed.data);
        perChannel.push({
            groupId,
            channelName,
            assignedAgent,
            synthAgentId: synthId,
            effectiveModel: modelStr,
            effectiveSkills
        });
    }

    return { agentEntries, bindingEntries, perChannel };
}

/**
 * Additive upsert — never removes anything. Collisions (same synth id or
 * same telegram/group peer) on operator-owned entries are surfaced as
 * structured collision records; caller decides whether to block the write.
 *
 * @returns {{
 *   merged: object,
 *   summary: {
 *     agentsAdded: number, agentsUpdated: number,
 *     bindingsAdded: number, bindingsUpdated: number
 *   },
 *   collisions: Array<{ kind: 'agent'|'binding', reason: string, detail: object }>
 * }}
 */
export function mergeOpenClawAgentsAndBindings(existingOpenclaw, patch) {
    const out = JSON.parse(JSON.stringify(existingOpenclaw));
    if (!out.agents || typeof out.agents !== 'object') out.agents = {};
    if (!Array.isArray(out.agents.list)) out.agents.list = [];
    if (!Array.isArray(out.bindings)) out.bindings = [];

    const collisions = [];
    let agentsAdded = 0;
    let agentsUpdated = 0;
    let bindingsAdded = 0;
    let bindingsUpdated = 0;

    for (const incomingRef of patch.agentEntries || []) {
        const incoming = JSON.parse(JSON.stringify(incomingRef));
        const idx = out.agents.list.findIndex((a) => a && a.id === incoming.id);
        if (idx === -1) {
            out.agents.list.push(incoming);
            agentsAdded += 1;
            continue;
        }
        const existing = out.agents.list[idx];
        // Migration-tolerant ownership probe: treat pre-C1b.2a entries that
        // carried the ownership marker in `comment` as CM-owned too, so we
        // can safely upgrade them to the schema-legal `params._cm` marker.
        const ownedViaParams = isCmOwnedAgentEntry(existing);
        const ownedViaLegacyComment = isCmOwnedComment(existing.comment);
        if (!ownedViaParams && !ownedViaLegacyComment) {
            const source = getCmAgentSource(incoming);
            collisions.push({
                kind: 'agent',
                reason: 'operator_owned_id_collision',
                detail: {
                    synthId: incoming.id,
                    existingName: existing.name ?? null,
                    existingComment: existing.comment ?? null,
                    sourceGroupId: source
                }
            });
            continue;
        }
        // Drop any legacy fields we no longer emit (e.g. `comment`) and
        // rewrite the canonical CM slots from the incoming patch.
        const {
            id: _id,
            name: _name,
            model: _model,
            skills: _skills,
            params: _params,
            comment: _legacyComment,
            ...unknown
        } = existing;
        out.agents.list[idx] = {
            ...unknown,
            id: incoming.id,
            name: incoming.name,
            params: incoming.params,
            ...(incoming.model ? { model: incoming.model } : {}),
            ...(incoming.skills ? { skills: incoming.skills } : {})
        };
        agentsUpdated += 1;
    }

    for (const incomingRef of patch.bindingEntries || []) {
        const incoming = JSON.parse(JSON.stringify(incomingRef));
        const peerId = incoming.match.peer.id;
        const idx = out.bindings.findIndex(
            (b) =>
                b &&
                (b.type === 'route' || b.type === undefined) &&
                b.match?.channel === 'telegram' &&
                b.match?.peer?.id === peerId
        );
        if (idx === -1) {
            out.bindings.push(incoming);
            bindingsAdded += 1;
            continue;
        }
        const existing = out.bindings[idx];
        if (!isCmOwnedComment(existing.comment)) {
            collisions.push({
                kind: 'binding',
                reason: 'operator_owned_binding_collision',
                detail: {
                    peerId,
                    existingAgentId: existing.agentId ?? null,
                    existingComment: existing.comment ?? null
                }
            });
            continue;
        }
        out.bindings[idx] = { ...existing, ...incoming };
        bindingsUpdated += 1;
    }

    return {
        merged: out,
        summary: { agentsAdded, agentsUpdated, bindingsAdded, bindingsUpdated },
        collisions
    };
}

// ---------------------------------------------------------------------------
// Display / validation / IO
// ---------------------------------------------------------------------------

export function redactOpenclawForDisplay(obj) {
    const o = JSON.parse(JSON.stringify(obj));
    if (o.gateway?.auth && typeof o.gateway.auth === 'object' && 'token' in o.gateway.auth) {
        o.gateway.auth.token = '«redacted»';
    }
    if (o.channels?.telegram && typeof o.channels.telegram === 'object' && 'botToken' in o.channels.telegram) {
        o.channels.telegram.botToken = '«redacted»';
    }
    return o;
}

export function sha256Json(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export function validateMergedOpenClaw(doc) {
    return MergedOpenClawSchema.safeParse(doc);
}

function listBackupFiles(openclawPath) {
    const dir = path.dirname(openclawPath);
    const base = path.basename(openclawPath);
    let entries = [];
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return [];
    }
    return entries
        .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.bak'))
        .map((name) => path.join(dir, name))
        .map((p) => ({ p, m: fs.statSync(p).mtimeMs }))
        .sort((a, b) => b.m - a.m);
}

export function getApplyUndoStatus() {
    const target = getOpenClawConfigPath();
    const backups = listBackupFiles(target);
    return {
        destinationPath: target,
        canUndo: backups.length > 0,
        newestBackup: backups[0]?.p || null,
        backupCount: backups.length
    };
}

async function rotateOldBackups(openclawPath) {
    const sorted = listBackupFiles(openclawPath);
    for (let i = MAX_BACKUPS; i < sorted.length; i++) {
        try {
            await fsPromises.unlink(sorted[i].p);
        } catch {
            /* ignore */
        }
    }
}

async function appendAudit(entry) {
    const logPath = getApplyAuditLogPath();
    const line = `${JSON.stringify({ ...entry, ts: new Date().toISOString() })}\n`;
    await fsPromises.appendFile(logPath, line, 'utf8');
}

/**
 * @param {object} opts
 * @param {object} opts.channelConfigRaw — parsed channel_config.json
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.confirm=false] — must be true with dryRun false to write
 * @param {string} [opts.operator] — e.g. req.ip
 */
export async function runOpenClawApply({ channelConfigRaw, dryRun = true, confirm = false, operator = null }) {
    const targetPath = getOpenClawConfigPath();

    if (!fs.existsSync(targetPath)) {
        const err = new Error(`OpenClaw config not found: ${targetPath}`);
        err.status = 404;
        throw err;
    }

    const release = await lockfile.lock(targetPath, { retries: 5 });
    /** Filled only after a successful disk write; gateway restart runs after lock release. */
    let applyWriteResult = null;

    try {
        const raw = await fsPromises.readFile(targetPath, 'utf8');
        const current = JSON.parse(raw);

        const groupsPatch = buildTelegramGroupsApplyPatch(channelConfigRaw);
        const mergedWithGroups = mergeOpenClawTelegramGroups(current, groupsPatch);

        const agentsAndBindingsPatch = buildAgentsAndBindingsApplyPatch(channelConfigRaw);
        const {
            merged,
            summary: agentsBindingsSummary,
            collisions
        } = mergeOpenClawAgentsAndBindings(mergedWithGroups, agentsAndBindingsPatch);

        const parsed = validateMergedOpenClaw(merged);
        if (!parsed.success) {
            return {
                ok: false,
                dryRun: true,
                destinationPath: targetPath,
                schemaErrors: parsed.error.flatten(),
                groupsPatch,
                agentsBindingsSummary,
                collisions,
                perChannel: agentsAndBindingsPatch.perChannel
            };
        }

        const redBefore = redactOpenclawForDisplay(current);
        const redAfter = redactOpenclawForDisplay(merged);
        const beforePretty = `${JSON.stringify(redBefore, null, 2)}\n`;
        const afterPretty = `${JSON.stringify(redAfter, null, 2)}\n`;
        const diffHash = sha256Json(merged);

        if (dryRun || !confirm) {
            return {
                ok: true,
                dryRun: true,
                destinationPath: targetPath,
                groupsPatch,
                agentsBindingsSummary,
                collisions,
                perChannel: agentsAndBindingsPatch.perChannel,
                beforePretty,
                afterPretty,
                diffHash,
                unchanged: beforePretty === afterPretty
            };
        }

        if (collisions.length > 0) {
            const err = new Error(
                `Refusing to write: ${collisions.length} operator-owned collision(s) detected. ` +
                    `Resolve in openclaw.json or rename/remove conflicting entries, then retry.`
            );
            err.status = 409;
            err.details = { collisions };
            throw err;
        }

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${targetPath}.${ts}.bak`;
        await fsPromises.copyFile(targetPath, backupPath);
        await rotateOldBackups(targetPath);

        const tmpPath = `${targetPath}.tmp.${process.pid}`;
        await fsPromises.writeFile(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
        await fsPromises.rename(tmpPath, targetPath);

        await appendAudit({
            action: 'apply',
            operator,
            destinationPath: targetPath,
            backupPath,
            diffHash,
            groupsPatched: Object.keys(groupsPatch).length,
            agentsAdded: agentsBindingsSummary.agentsAdded,
            agentsUpdated: agentsBindingsSummary.agentsUpdated,
            bindingsAdded: agentsBindingsSummary.bindingsAdded,
            bindingsUpdated: agentsBindingsSummary.bindingsUpdated,
            mergeSlice:
                'channels.telegram.groups.{requireMention,skills}+agents.list[]+bindings[] (C1b.2a)'
        });

        applyWriteResult = {
            ok: true,
            dryRun: false,
            destinationPath: targetPath,
            backupPath,
            diffHash,
            groupsPatched: Object.keys(groupsPatch).length,
            agentsBindingsSummary,
            perChannel: agentsAndBindingsPatch.perChannel
        };
    } finally {
        await release();
    }

    if (applyWriteResult) {
        applyWriteResult.gatewayRestart = await restartOpenClawGatewayUserService();
    }
    return applyWriteResult;
}

/**
 * Restore newest `.bak` for openclaw.json (after explicit confirm).
 */
export async function runOpenClawUndo({ confirm = false, operator = null }) {
    if (!confirm) {
        const err = new Error('confirm: true required');
        err.status = 400;
        throw err;
    }

    const targetPath = getOpenClawConfigPath();
    const backups = listBackupFiles(targetPath);
    if (backups.length === 0) {
        const err = new Error('No backup file found to undo');
        err.status = 400;
        throw err;
    }

    const backupPath = backups[0].p;
    const release = await lockfile.lock(targetPath, { retries: 5 });
    let undoResult = null;
    try {
        const buf = await fsPromises.readFile(backupPath, 'utf8');
        JSON.parse(buf);

        const tmpPath = `${targetPath}.tmp.${process.pid}.undo`;
        await fsPromises.writeFile(tmpPath, buf, 'utf8');
        await fsPromises.rename(tmpPath, targetPath);

        await appendAudit({
            action: 'undo',
            operator,
            destinationPath: targetPath,
            restoredFrom: backupPath
        });

        undoResult = { ok: true, restoredFrom: backupPath };
    } finally {
        await release();
    }

    if (undoResult) {
        undoResult.gatewayRestart = await restartOpenClawGatewayUserService();
    }
    return undoResult;
}
