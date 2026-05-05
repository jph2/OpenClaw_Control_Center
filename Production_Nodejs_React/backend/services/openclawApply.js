/**
 * Bundle C1 / C1b — merge Channel Manager `channel_config.json` into
 * `~/.openclaw/openclaw.json`:
 *
 * - C1    : `channels.telegram.groups[id].requireMention`
 * - C1b.1 : `channels.telegram.groups[id].skills` (deduped string[])
 * - C1b.2a: per-channel `agents.list[]` (synth id, model, skills allowlist)
 *           + matching `bindings[]` routes.
 * - C1b.2e: optional account-level `channels.telegram.{groupPolicy,dmPolicy,
 *           allowFrom,groupAllowFrom}` when `channel_config.json` declares
 *           `telegramAccountPolicy.applyOnOpenClawApply: true` (never silent).
 * - C1b.3: synth `agents.list[].skills` also unions **active** CM sub-agent
 *           `additionalSkills` (minus each sub's `inactiveSkills`, minus
 *           channel `inactiveSubAgents`), same layering as the TTG UI.
 * - C1b.2c: optional `agents.defaults.model.primary` when
 *           `openclawAgentsDefaultsPolicy.applyModelOnOpenClawApply` is true
 *           (explicit opt-in; preserves existing `model` object fields except
 *           `primary` — ADR-018).
 *
 *           OpenClaw's `agents.list[]` schema is Zod-strict and rejects unknown
 *           top-level keys (e.g. `comment` is not in the schema). The CM
 *           ownership marker therefore lives in `params._cm` on agent entries
 *           (schema-legal — `params` is Record<string, unknown>), and in
 *           `comment` on binding entries (schema-legal there).
 *
 *           Additive upsert, then **C1b.2b** orphan prune: CM-marked
 *           `agents.list[]` / `bindings[]` rows whose `source` group id is
 *           absent from `channel_config.json` are removed on every Apply
 *           (preview + write).
 *           Other `agents.defaults.*` keys stay operator-owned; only
 *           `model.primary` may be set when C1b.2c opt-in is on.
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
import { collectChannelConfigApplyWarnings } from './ideConfigBridge.js';

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

function getOpenClawAgentsRoot() {
    return process.env.OPENCLAW_AGENTS_DIR || path.join(homedir(), '.openclaw', 'agents');
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
// C1b.2e — channels.telegram account-level admission policy (opt-in)
// ---------------------------------------------------------------------------

const TelegramGroupPolicyEnum = z.enum(['open', 'disabled', 'allowlist']);
const TelegramDmPolicyEnum = z.enum(['pairing', 'allowlist', 'open', 'disabled']);

/** Shape stored in `channel_config.json` / returned by GET (defaults applied). */
export const TelegramAccountPolicyConfigSchema = z
    .object({
        applyOnOpenClawApply: z.boolean().optional(),
        groupPolicy: TelegramGroupPolicyEnum.optional(),
        dmPolicy: TelegramDmPolicyEnum.optional(),
        allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
        groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional()
    })
    .transform((o) => ({
        applyOnOpenClawApply: Boolean(o.applyOnOpenClawApply),
        groupPolicy: o.groupPolicy ?? 'open',
        dmPolicy: o.dmPolicy ?? 'pairing',
        allowFrom: Array.isArray(o.allowFrom) ? o.allowFrom : [],
        groupAllowFrom: Array.isArray(o.groupAllowFrom) ? o.groupAllowFrom : []
    }));

/** Coerce one OpenClaw allow-list entry (numeric strings → number). */
export function coerceTelegramAllowEntry(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^-?\d+$/.test(s)) return Number(s);
    return s;
}

/** Normalize allowFrom / groupAllowFrom for OpenClaw (dedupe, stable order). */
export function normalizeTelegramAllowList(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const x of list) {
        const v = coerceTelegramAllowEntry(x);
        if (v === null) continue;
        const key = typeof v === 'number' ? `n:${v}` : `s:${v}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

/**
 * Normalize telegram account policy from CM config (defaults when missing).
 */
export function normalizeTelegramAccountPolicyConfig(raw) {
    const defaults = {
        applyOnOpenClawApply: false,
        groupPolicy: 'open',
        dmPolicy: 'pairing',
        allowFrom: [],
        groupAllowFrom: []
    };
    if (!raw || typeof raw !== 'object') {
        return defaults;
    }
    const r = TelegramAccountPolicyConfigSchema.safeParse(raw);
    if (r.success) return r.data;
    return defaults;
}

/**
 * Build account-level telegram patch from channel_config SoT.
 * @returns {{ active: boolean, patch: object|null, normalized: object }}
 */
export function buildTelegramAccountPolicyApplyPatch(rawChannelConfig) {
    const normalized = normalizeTelegramAccountPolicyConfig(rawChannelConfig?.telegramAccountPolicy);
    if (!normalized.applyOnOpenClawApply) {
        return { active: false, patch: null, normalized };
    }
    const patch = {
        groupPolicy: normalized.groupPolicy,
        dmPolicy: normalized.dmPolicy,
        allowFrom: normalizeTelegramAllowList(normalized.allowFrom),
        groupAllowFrom: normalizeTelegramAllowList(normalized.groupAllowFrom)
    };
    return { active: true, patch, normalized };
}

/**
 * Merge C1b.2e fields into `channels.telegram` without touching groups, botToken, etc.
 * @param {object} existingOpenclaw
 * @param {object|null} accountPatch — only groupPolicy, dmPolicy, allowFrom?, groupAllowFrom?
 */
export function mergeOpenClawTelegramAccountPolicy(existingOpenclaw, accountPatch) {
    if (!accountPatch || typeof accountPatch !== 'object') {
        return JSON.parse(JSON.stringify(existingOpenclaw));
    }
    const out = JSON.parse(JSON.stringify(existingOpenclaw));
    if (!out.channels) out.channels = {};
    if (!out.channels.telegram || typeof out.channels.telegram !== 'object') {
        out.channels.telegram = {};
    }
    const tg = out.channels.telegram;
    for (const k of ['groupPolicy', 'dmPolicy', 'allowFrom', 'groupAllowFrom']) {
        if (Object.prototype.hasOwnProperty.call(accountPatch, k)) {
            tg[k] = accountPatch[k];
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// C1b.2c — agents.defaults.model.primary (opt-in, ADR-018)
// ---------------------------------------------------------------------------

/** Shape stored in `channel_config.json` / returned by GET (defaults applied). */
export const AgentsDefaultsPolicyConfigSchema = z
    .object({
        applyModelOnOpenClawApply: z.boolean().optional(),
        modelPrimary: z.string().optional()
    })
    .transform((o) => ({
        applyModelOnOpenClawApply: Boolean(o.applyModelOnOpenClawApply),
        modelPrimary: typeof o.modelPrimary === 'string' ? o.modelPrimary.trim() : ''
    }));

/**
 * Normalize workspace default model policy from CM config (defaults when missing).
 */
export function normalizeAgentsDefaultsPolicyConfig(raw) {
    const defaults = { applyModelOnOpenClawApply: false, modelPrimary: '' };
    if (!raw || typeof raw !== 'object') {
        return defaults;
    }
    const r = AgentsDefaultsPolicyConfigSchema.safeParse(raw);
    if (r.success) return r.data;
    return defaults;
}

/**
 * Build C1b.2c patch from channel_config SoT.
 * @returns {{ active: boolean, patch: { primary: string }|null, normalized: object, skipReason?: string }}
 */
export function buildAgentsDefaultsModelApplyPatch(rawChannelConfig) {
    const normalized = normalizeAgentsDefaultsPolicyConfig(
        rawChannelConfig?.openclawAgentsDefaultsPolicy
    );
    if (!normalized.applyModelOnOpenClawApply) {
        return { active: false, patch: null, normalized };
    }
    if (!normalized.modelPrimary) {
        return {
            active: false,
            patch: null,
            normalized,
            skipReason: 'apply_on_but_empty_model_primary'
        };
    }
    return {
        active: true,
        patch: { primary: normalized.modelPrimary },
        normalized
    };
}

/**
 * Read `agents.defaults.model.primary` from an OpenClaw doc (for live compare).
 * @returns {string|null}
 */
export function readOpenclawAgentsDefaultsModelPrimary(openclawDoc) {
    const m = openclawDoc?.agents?.defaults?.model;
    if (typeof m === 'string' && m.trim()) return m.trim();
    if (m && typeof m === 'object' && typeof m.primary === 'string' && m.primary.trim()) {
        return m.primary.trim();
    }
    return null;
}

/**
 * Merge C1b.2c — set `agents.defaults.model` to include `primary`; preserve
 * object shape (`fallbacks`, etc.) when `model` is already an object.
 *
 * @param {object} existingOpenclaw
 * @param {{ primary: string }|null} modelPatch
 */
export function mergeOpenClawAgentsDefaultsModel(existingOpenclaw, modelPatch) {
    if (!modelPatch || typeof modelPatch.primary !== 'string' || !modelPatch.primary.trim()) {
        return JSON.parse(JSON.stringify(existingOpenclaw));
    }
    const primary = modelPatch.primary.trim();
    const out = JSON.parse(JSON.stringify(existingOpenclaw));
    if (!out.agents || typeof out.agents !== 'object') out.agents = {};
    if (!out.agents.defaults || typeof out.agents.defaults !== 'object') out.agents.defaults = {};

    const existingModel = out.agents.defaults.model;
    if (typeof existingModel === 'object' && existingModel !== null && !Array.isArray(existingModel)) {
        out.agents.defaults.model = { ...existingModel, primary };
    } else {
        out.agents.defaults.model = { primary };
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
        Array.isArray(agent?.inactiveSkills) ? agent.inactiveSkills.map(String) : []
    );
    const channelExtras = Array.isArray(channel?.skills) ? channel.skills : [];
    const merged = normalizeChannelSkillIds([...agentDefaults, ...channelExtras]);
    return merged.filter((s) => !agentInactive.has(s));
}

/**
 * C1b.3 — Effective OpenClaw skills allowlist for the CM synth agent: main-agent
 * and channel layer ({@link computeChannelSkills}), then active sub-agents
 * (`parent` = channel `assignedAgent`, `enabled !== false`, not in
 * `channel.inactiveSubAgents`) contribute `additionalSkills` minus that sub's
 * `inactiveSkills`. Deduped, stable order (subs sorted by id). ADR-004: CM
 * sub-agents stay configuration roles; this only shapes the pushed allowlist.
 *
 * @param {object} channel — CM `channels[]` row
 * @param {object|undefined} agent — CM `agents[]` row for `assignedAgent`
 * @param {unknown} subAgents — CM top-level `subAgents[]`
 * @returns {string[]}
 */
export function computeEffectiveSynthSkills(channel, agent, subAgents) {
    const base = computeChannelSkills(channel, agent);
    const assigned = channel?.assignedAgent != null ? String(channel.assignedAgent) : '';
    const inactiveSub = new Set(
        Array.isArray(channel?.inactiveSubAgents)
            ? channel.inactiveSubAgents.map((x) => String(x))
            : []
    );
    const list = Array.isArray(subAgents) ? [...subAgents] : [];
    list.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));

    const extra = [];
    for (const sub of list) {
        if (!sub || sub.id == null) continue;
        const sid = String(sub.id);
        if (sub.enabled === false) continue;
        if (assigned && String(sub.parent ?? '') !== assigned) continue;
        if (inactiveSub.has(sid)) continue;

        const add = Array.isArray(sub.additionalSkills) ? sub.additionalSkills : [];
        const subInactive = new Set(
            Array.isArray(sub.inactiveSkills) ? sub.inactiveSkills.map((x) => String(x)) : []
        );
        for (const raw of add) {
            const skillId = String(raw ?? '')
                .trim()
                .replace(/\s+/gu, '');
            if (!skillId || subInactive.has(skillId)) continue;
            extra.push(skillId);
        }
    }
    return normalizeChannelSkillIds([...base, ...extra]);
}

/**
 * Build the per-channel patch for `agents.list[]` + `bindings[]`.
 * Does not touch `agents.defaults.*` (C1b.2c applies that in `runOpenClawApply`).
 *
 * @returns {{ agentEntries: object[], bindingEntries: object[], perChannel: object[] }}
 */
export function buildAgentsAndBindingsApplyPatch(rawChannelConfig) {
    const channels = Array.isArray(rawChannelConfig?.channels) ? rawChannelConfig.channels : [];
    const agents = Array.isArray(rawChannelConfig?.agents) ? rawChannelConfig.agents : [];
    const subAgents = Array.isArray(rawChannelConfig?.subAgents) ? rawChannelConfig.subAgents : [];
    const agentsById = new Map(agents.filter((a) => a?.id).map((a) => [a.id, a]));

    const agentEntries = [];
    const bindingEntries = [];
    const perChannel = [];
    const synthSources = new Map();

    for (const c of channels) {
        if (c?.id == null || !c?.assignedAgent) continue;
        const groupId = String(c.id);
        const assignedAgent = String(c.assignedAgent);
        const agentDef = agentsById.get(assignedAgent);

        const synthId = `${assignedAgent}-${groupIdSlug(groupId)}`;
        const existingSource = synthSources.get(synthId);
        if (existingSource && existingSource !== groupId) {
            const err = new Error(
                `CM synth agent id collision: channels "${existingSource}" and "${groupId}" both map to "${synthId}". ` +
                    'Rename one channel id or change groupIdSlug() before applying.'
            );
            err.status = 409;
            err.details = { synthAgentId: synthId, sourceGroupIds: [existingSource, groupId] };
            throw err;
        }
        synthSources.set(synthId, groupId);
        const bindingComment = makeCmComment(groupId);
        const modelStr =
            typeof c.model === 'string' && c.model.trim().length > 0 ? c.model.trim() : null;
        const effectiveSkills = computeEffectiveSynthSkills(c, agentDef, subAgents);
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

function hasSessionModelOverride(entry) {
    return Boolean(
        entry?.modelOverride ||
            entry?.providerOverride ||
            entry?.modelOverrideSource === 'user'
    );
}

/**
 * Clear stale last-resolved model/auth cache fields from CM-owned Telegram sessions.
 * OpenClaw may otherwise keep using a previous model from sessions.json after
 * Channel Manager has correctly applied a new model to openclaw.json.
 */
export async function clearCmSessionModelCaches(perChannel, { agentsRoot = getOpenClawAgentsRoot() } = {}) {
    const summary = {
        filesScanned: 0,
        filesUpdated: 0,
        entriesUpdated: 0,
        entriesSkippedForOverride: 0,
        backupPaths: []
    };

    for (const channel of Array.isArray(perChannel) ? perChannel : []) {
        if (!channel?.synthAgentId || !channel?.groupId) continue;
        const sessionsPath = path.join(agentsRoot, channel.synthAgentId, 'sessions', 'sessions.json');
        if (!fs.existsSync(sessionsPath)) continue;
        summary.filesScanned += 1;

        let parsed;
        try {
            parsed = JSON.parse(await fsPromises.readFile(sessionsPath, 'utf8'));
        } catch (err) {
            console.warn(`[openclawApply] Could not read sessions cache ${sessionsPath}:`, err.message);
            continue;
        }

        const sessionKey = `agent:${channel.synthAgentId}:telegram:group:${channel.groupId}`;
        const entry = parsed?.[sessionKey];
        if (!entry || typeof entry !== 'object') continue;

        if (hasSessionModelOverride(entry)) {
            summary.entriesSkippedForOverride += 1;
            continue;
        }

        const hadModelCache =
            Object.prototype.hasOwnProperty.call(entry, 'model') ||
            Object.prototype.hasOwnProperty.call(entry, 'modelProvider');
        const hasUserAuthOverride = entry.authProfileOverrideSource === 'user';
        const hadAutoAuthCache =
            !hasUserAuthOverride &&
            (Object.prototype.hasOwnProperty.call(entry, 'authProfileOverride') ||
                Object.prototype.hasOwnProperty.call(entry, 'authProfileOverrideSource') ||
                Object.prototype.hasOwnProperty.call(entry, 'authProfileOverrideCompactionCount'));
        if (!hadModelCache && !hadAutoAuthCache) continue;

        delete entry.model;
        delete entry.modelProvider;
        if (!hasUserAuthOverride) {
            delete entry.authProfileOverride;
            delete entry.authProfileOverrideSource;
            delete entry.authProfileOverrideCompactionCount;
        }

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${sessionsPath}.${ts}.pre-cm-apply-cache-clear.bak`;
        await fsPromises.copyFile(sessionsPath, backupPath);
        await fsPromises.writeFile(sessionsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

        summary.backupPaths.push(backupPath);
        summary.filesUpdated += 1;
        summary.entriesUpdated += 1;
    }

    return summary;
}

/**
 * Additive upsert — never removes rows here (orphan prune is **C1b.2b** in
 * `pruneCmOrphanAgentsAndBindings`, run after this step). Collisions (same
 * synth id or same telegram/group peer) on operator-owned entries are surfaced
 * as structured collision records; caller decides whether to block the write.
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
// C1b.2b — remove CM-owned rows for channels no longer in channel_config.json
// ---------------------------------------------------------------------------

/**
 * Parses `source: <groupId>` from a CM binding comment
 * (`managed-by: channel-manager; source: …`).
 */
export function getCmSourceFromComment(comment) {
    if (!isCmOwnedComment(comment)) return null;
    const m = String(comment).match(/source:\s*(\S+)/);
    return m ? m[1] : null;
}

/**
 * Resolved CM source group id for an agent row (params._cm first, else legacy comment).
 */
export function getCmAgentSourceResolved(agentEntry) {
    const fromParams = getCmAgentSource(agentEntry);
    if (fromParams) return fromParams;
    return getCmSourceFromComment(agentEntry?.comment);
}

/**
 * Resolved managed group id for a CM-owned telegram route binding.
 */
export function getCmBindingManagedGroupId(binding) {
    if (!binding || !isCmOwnedComment(binding.comment)) return null;
    const fromComment = getCmSourceFromComment(binding.comment);
    if (fromComment) return fromComment;
    if (
        binding.match?.channel === 'telegram' &&
        binding.match?.peer?.kind === 'group' &&
        binding.match?.peer?.id != null
    ) {
        return String(binding.match.peer.id);
    }
    return null;
}

/** All `channels[].id` values from Channel Manager SoT (stringified). */
export function collectActiveChannelGroupIds(rawChannelConfig) {
    const channels = Array.isArray(rawChannelConfig?.channels) ? rawChannelConfig.channels : [];
    const set = new Set();
    for (const c of channels) {
        if (c?.id != null) set.add(String(c.id));
    }
    return set;
}

/**
 * Drop CM-owned agents and telegram route bindings whose managed group id is not
 * in `activeGroupIds`. Operator-owned rows are never touched. Rows that are
 * CM-marked but yield no parseable source id are kept (safe no-op).
 *
 * @param {object} openclawDoc
 * @param {Set<string>|string[]} activeGroupIds
 * @returns {{ merged: object, orphanPruneSummary: object }}
 */
export function pruneCmOrphanAgentsAndBindings(openclawDoc, activeGroupIds) {
    const active =
        activeGroupIds instanceof Set ? activeGroupIds : new Set(activeGroupIds);
    const out = JSON.parse(JSON.stringify(openclawDoc));
    const removedAgents = [];
    const removedBindings = [];

    if (!out.agents || typeof out.agents !== 'object') out.agents = {};
    if (!Array.isArray(out.agents.list)) out.agents.list = [];
    if (!Array.isArray(out.bindings)) out.bindings = [];

    const nextAgents = [];
    for (const agent of out.agents.list) {
        if (!agent) continue;
        const ownedParams = isCmOwnedAgentEntry(agent);
        const ownedLegacy = isCmOwnedComment(agent.comment);
        if (!ownedParams && !ownedLegacy) {
            nextAgents.push(agent);
            continue;
        }
        const src = getCmAgentSourceResolved(agent);
        if (!src || active.has(src)) {
            nextAgents.push(agent);
            continue;
        }
        removedAgents.push({ id: agent.id, source: src });
    }
    out.agents.list = nextAgents;

    const nextBindings = [];
    for (const b of out.bindings) {
        if (!b) continue;
        if (!isCmOwnedComment(b.comment)) {
            nextBindings.push(b);
            continue;
        }
        const src = getCmBindingManagedGroupId(b);
        if (!src || active.has(src)) {
            nextBindings.push(b);
            continue;
        }
        removedBindings.push({
            peerId: b.match?.peer?.id ?? null,
            agentId: b.agentId ?? null,
            source: src
        });
    }
    out.bindings = nextBindings;

    return {
        merged: out,
        orphanPruneSummary: {
            agentsRemoved: removedAgents.length,
            bindingsRemoved: removedBindings.length,
            removedAgents,
            removedBindings
        }
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
    let sessionCacheSummary = null;
    let channelConfigWarnings = [];
    const runtimeVerificationNote =
        'Writing openclaw.json does not prove live gateway routing. After Apply, confirm Telegram ' +
        'and gateway behavior separately (C1c — SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1).';

    try {
        channelConfigWarnings = collectChannelConfigApplyWarnings(channelConfigRaw);
        const raw = await fsPromises.readFile(targetPath, 'utf8');
        const current = JSON.parse(raw);

        const groupsPatch = buildTelegramGroupsApplyPatch(channelConfigRaw);
        const mergedWithGroups = mergeOpenClawTelegramGroups(current, groupsPatch);

        const telegramAccountPolicyBuild = buildTelegramAccountPolicyApplyPatch(channelConfigRaw);
        const mergedWithTelegramPolicy = mergeOpenClawTelegramAccountPolicy(
            mergedWithGroups,
            telegramAccountPolicyBuild.active ? telegramAccountPolicyBuild.patch : null
        );

        const agentsAndBindingsPatch = buildAgentsAndBindingsApplyPatch(channelConfigRaw);
        const {
            merged: mergedAgentsBindings,
            summary: agentsBindingsSummary,
            collisions
        } = mergeOpenClawAgentsAndBindings(mergedWithTelegramPolicy, agentsAndBindingsPatch);

        const activeGroupIds = collectActiveChannelGroupIds(channelConfigRaw);
        const { merged: mergedAfterPrune, orphanPruneSummary } = pruneCmOrphanAgentsAndBindings(
            mergedAgentsBindings,
            activeGroupIds
        );

        const agentsDefaultsBuild = buildAgentsDefaultsModelApplyPatch(channelConfigRaw);
        const merged = mergeOpenClawAgentsDefaultsModel(
            mergedAfterPrune,
            agentsDefaultsBuild.active ? agentsDefaultsBuild.patch : null
        );

        const parsed = validateMergedOpenClaw(merged);
        if (!parsed.success) {
            return {
                ok: false,
                dryRun: true,
                destinationPath: targetPath,
                schemaErrors: parsed.error.flatten(),
                groupsPatch,
                telegramAccountPolicy: telegramAccountPolicyBuild,
                agentsDefaultsPolicy: agentsDefaultsBuild,
                agentsBindingsSummary,
                orphanPruneSummary,
                collisions,
                perChannel: agentsAndBindingsPatch.perChannel,
                channelConfigWarnings,
                runtimeVerificationNote
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
                telegramAccountPolicy: telegramAccountPolicyBuild,
                agentsDefaultsPolicy: agentsDefaultsBuild,
                agentsBindingsSummary,
                orphanPruneSummary,
                collisions,
                perChannel: agentsAndBindingsPatch.perChannel,
                beforePretty,
                afterPretty,
                diffHash,
                unchanged: beforePretty === afterPretty,
                channelConfigWarnings,
                runtimeVerificationNote
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
            agentsOrphansRemoved: orphanPruneSummary.agentsRemoved,
            bindingsOrphansRemoved: orphanPruneSummary.bindingsRemoved,
            telegramAccountPolicyApplied: telegramAccountPolicyBuild.active,
            agentsDefaultsModelApplied: agentsDefaultsBuild.active,
            mergeSlice:
                'channels.telegram.groups+optional C1b.2e+C1b.2c agents.defaults.model.primary+agents.list[]+bindings[] (C1b.2a+C1b.2b)'
        });

        sessionCacheSummary = await clearCmSessionModelCaches(agentsAndBindingsPatch.perChannel);

        applyWriteResult = {
            ok: true,
            dryRun: false,
            destinationPath: targetPath,
            backupPath,
            diffHash,
            groupsPatched: Object.keys(groupsPatch).length,
            telegramAccountPolicy: telegramAccountPolicyBuild,
            agentsDefaultsPolicy: agentsDefaultsBuild,
            agentsBindingsSummary,
            orphanPruneSummary,
            sessionCacheSummary,
            perChannel: agentsAndBindingsPatch.perChannel,
            channelConfigWarnings,
            runtimeVerificationNote
        };
    } finally {
        await release();
    }

    if (applyWriteResult) {
        applyWriteResult.gatewayRestart = await restartOpenClawGatewayUserService();
        if (applyWriteResult.gatewayRestart?.ok === false && !applyWriteResult.gatewayRestart?.skipped) {
            applyWriteResult.gatewayRestartWarning =
                'openclaw.json was written but the user-level gateway restart failed; runtime may still use the previous config until you restart manually.';
        }
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
