import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { resolveSafe } from '../utils/security.js';
import { computeActiveSkillRoleProjections, groupIdSlug } from './openclawApply.js';
import {
    hydrateOpenclawSessionIndex,
    listAgentSessionsJsonPaths,
    resolveCanonicalSession
} from './chat/sessionIndex.js';

const CHANNEL_CONFIG_RELATIVE_PATH =
    'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEGRAM_GROUP_KEY_RE = /^agent:([^:]+):telegram:group:(-?\d+)$/;

function normalizeChannelId(id) {
    return String(id || '').trim();
}

function normalizeSessionFilePath(sessionFile) {
    return sessionFile && typeof sessionFile === 'string' ? path.resolve(sessionFile) : null;
}

function sessionIdFromSessionFile(sessionFile) {
    const abs = normalizeSessionFilePath(sessionFile);
    if (!abs) return null;
    const ext = path.extname(abs).toLowerCase();
    const base = path.basename(abs, ext === '.jsonl' ? ext : undefined);
    return UUID_RE.test(base) ? base.toLowerCase() : null;
}

function readSessionsJsonSafe(sessionsPath) {
    try {
        return JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    } catch {
        return {};
    }
}

function findSessionEntry(sessionKey) {
    for (const sessionsPath of listAgentSessionsJsonPaths()) {
        const parsed = readSessionsJsonSafe(sessionsPath);
        if (parsed?.[sessionKey] && typeof parsed[sessionKey] === 'object') {
            return {
                entry: parsed[sessionKey],
                sessionsPath
            };
        }
    }
    return { entry: null, sessionsPath: null };
}

function classifySessionKind(sessionKey) {
    if (!sessionKey) return 'unknown';
    if (TELEGRAM_GROUP_KEY_RE.test(sessionKey)) return 'telegram_group';
    if (String(sessionKey).startsWith('explicit:') || UUID_RE.test(String(sessionKey))) return 'explicit';
    if (String(sessionKey).includes(':main') || sessionKey === 'main') return 'main';
    if (String(sessionKey).startsWith('telegram:')) return 'telegram_group';
    return 'unknown';
}

function modelPolicyForChannel(channel) {
    return {
        primaryModel: typeof channel?.model === 'string' ? channel.model : ''
    };
}

function skillPolicyForChannel(channel) {
    const skills = [
        ...(Array.isArray(channel?.skills) ? channel.skills : []),
        ...(Array.isArray(channel?.caseSkills) ? channel.caseSkills : [])
    ]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
    return {
        enabledSkills: Array.from(new Set(skills))
    };
}

function skillRolePolicyForChannel(channel, subAgents) {
    return {
        roles: computeActiveSkillRoleProjections(channel, subAgents),
        semantics: {
            currentSubAgentsAre: 'skillRole',
            openclawProjection: 'mergeIntoSynth',
            runtimeWorkerImplemented: false
        }
    };
}

export async function readChannelConfigRaw() {
    const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, CHANNEL_CONFIG_RELATIVE_PATH);
    return JSON.parse(await fsPromises.readFile(resolved, 'utf8'));
}

export function validateSessionIdentityForKey(sessionKey) {
    const { entry, sessionsPath } = findSessionEntry(sessionKey);
    if (!entry) {
        return {
            status: 'unknown',
            sessionKey,
            sessionsPath,
            reasons: ['session_entry_missing']
        };
    }

    const entrySessionId =
        typeof entry.sessionId === 'string' && entry.sessionId ? entry.sessionId.toLowerCase() : null;
    const sessionFile = normalizeSessionFilePath(entry.sessionFile);
    const sessionFileSessionId = sessionIdFromSessionFile(sessionFile);
    const reasons = [];

    if (!entrySessionId) reasons.push('session_id_missing');
    if (!sessionFile) reasons.push('session_file_missing');
    if (entrySessionId && sessionFileSessionId && entrySessionId !== sessionFileSessionId) {
        reasons.push('session_id_file_basename_drift');
    }

    return {
        status: reasons.length ? 'mismatch' : 'aligned',
        sessionKey,
        sessionsPath,
        sessionId: entrySessionId,
        sessionFile,
        sessionFileSessionId,
        reasons
    };
}

function derivedRuntimeEvents({ channel, synthAgentId, expectedSessionKey, resolved, invariant, status }) {
    const now = new Date().toISOString();
    const events = [];

    events.push({
        id: `${channel.id}:cm-target`,
        timestamp: now,
        channelId: channel.id,
        agentId: synthAgentId,
        eventType: 'canonical_session_resolved',
        logicalSessionId: expectedSessionKey,
        sessionKind: 'telegram_group',
        transcriptFile: invariant.sessionFile || resolved.sessionFile || undefined,
        canonical: true,
        lane: 'canonical_telegram',
        severity: invariant.status === 'mismatch' ? 'warning' : 'info',
        derived: true,
        summary: `CM target ${channel.name || channel.id} expects canonical Telegram session ${expectedSessionKey}.`
    });

    if (status === 'mismatch') {
        events.push({
            id: `${channel.id}:session-mismatch`,
            timestamp: now,
            channelId: channel.id,
            agentId: synthAgentId,
            eventType: 'session_mismatch_detected',
            logicalSessionId: resolved.sessionKey || null,
            sessionKind: classifySessionKind(resolved.sessionKey),
            transcriptFile: resolved.sessionFile || undefined,
            canonical: false,
            lane: classifySessionKind(resolved.sessionKey) === 'main' ? 'webchat_main' : 'debug',
            severity: 'warning',
            derived: true,
            summary: `Resolved session ${resolved.sessionKey || '(none)'} differs from canonical ${expectedSessionKey}.`
        });
    }

    if (invariant.status === 'mismatch') {
        events.push({
            id: `${channel.id}:session-invariant`,
            timestamp: now,
            channelId: channel.id,
            agentId: synthAgentId,
            eventType: 'session_rebound',
            logicalSessionId: expectedSessionKey,
            sessionKind: 'telegram_group',
            transcriptFile: invariant.sessionFile || undefined,
            canonical: true,
            lane: 'migration',
            severity: 'warning',
            derived: true,
            summary: `Session identity invariant needs attention: ${invariant.reasons.join(', ')}.`
        });
    }

    return events;
}

export function buildChannelRuntimeBinding(channelId, { channelConfigRaw } = {}) {
    const wantedId = normalizeChannelId(channelId);
    const channels = Array.isArray(channelConfigRaw?.channels) ? channelConfigRaw.channels : [];
    const subAgents = Array.isArray(channelConfigRaw?.subAgents) ? channelConfigRaw.subAgents : [];
    const channel = channels.find((c) => normalizeChannelId(c?.id) === wantedId);
    if (!channel) {
        const err = new Error(`Channel not found: ${wantedId}`);
        err.status = 404;
        throw err;
    }

    const assignedAgent = String(channel.assignedAgent || 'tars').trim() || 'tars';
    const synthAgentId = `${assignedAgent}-${groupIdSlug(channel.id)}`;
    const expectedSessionKey = `agent:${synthAgentId}:telegram:group:${channel.id}`;
    const resolved = resolveCanonicalSession(channel.id);
    const invariant = validateSessionIdentityForKey(expectedSessionKey);

    const resolvedMatchesExpected = resolved.sessionKey === expectedSessionKey;
    const status =
        resolvedMatchesExpected && invariant.status !== 'mismatch'
            ? 'aligned'
            : resolved.sessionKey || invariant.status !== 'unknown'
              ? 'mismatch'
              : 'unknown';

    const reasons = [];
    if (!resolvedMatchesExpected) {
        reasons.push('resolved_session_not_canonical_for_channel');
    }
    if (invariant.status === 'mismatch') {
        reasons.push(...invariant.reasons);
    }
    if (invariant.status === 'unknown') {
        reasons.push(...invariant.reasons);
    }

    const binding = {
        channelId: channel.id,
        channelKind: 'telegram_group',
        displayName: channel.name || channel.id,
        agentId: synthAgentId,
        canonicalSession: {
            kind: 'telegram_group',
            gatewaySessionId: expectedSessionKey,
            telegramGroupId: channel.id,
            expectedTranscriptFile: invariant.sessionFile || resolved.sessionFile || null
        },
        modelPolicy: modelPolicyForChannel(channel),
        skillPolicy: skillPolicyForChannel(channel),
        skillRolePolicy: skillRolePolicyForChannel(channel, subAgents),
        workerPolicy: {
            runtimeWorkers: [],
            status: 'not_configured',
            gate: 'C1e/G2+G7'
        }
    };

    const resolvedSession = {
        agentId: synthAgentId,
        logicalSessionId: resolved.sessionKey || null,
        sessionKind: classifySessionKind(resolved.sessionKey),
        storageSessionFile: resolved.sessionFile || null,
        source: 'channel_manager',
        canonicalForChannelId: resolvedMatchesExpected ? channel.id : undefined,
        sessionId: resolved.sessionId || null,
        openClawSessionHints: resolved.openClawSessionHints || null
    };

    return {
        ok: true,
        channelRuntimeBinding: binding,
        resolvedSession,
        sessionIdentity: invariant,
        alignment: {
            status,
            aligned: status === 'aligned',
            expectedSessionKey,
            actualSessionKey: resolved.sessionKey || null,
            reasons: Array.from(new Set(reasons))
        },
        runtimeTimeline: derivedRuntimeEvents({
            channel,
            synthAgentId,
            expectedSessionKey,
            resolved,
            invariant,
            status
        })
    };
}

export async function resolveChannelRuntimeBinding(channelId) {
    const channelConfigRaw = await readChannelConfigRaw();
    return buildChannelRuntimeBinding(channelId, { channelConfigRaw });
}

export async function forceChannelCanonicalSession(channelId, { channelConfigRaw = null } = {}) {
    const configRaw = channelConfigRaw || await readChannelConfigRaw();
    const current = buildChannelRuntimeBinding(channelId, { channelConfigRaw: configRaw });
    const sessionKey = current.alignment.expectedSessionKey;
    const identity = validateSessionIdentityForKey(sessionKey);

    if (identity.status === 'unknown' || !identity.sessionsPath) {
        const err = new Error(`Canonical session entry not found for ${sessionKey}`);
        err.status = 409;
        err.code = 'canonical_session_missing';
        throw err;
    }

    const parsed = JSON.parse(await fsPromises.readFile(identity.sessionsPath, 'utf8'));
    const entry = parsed?.[sessionKey];
    if (!entry || typeof entry !== 'object') {
        const err = new Error(`Canonical session entry not found for ${sessionKey}`);
        err.status = 409;
        err.code = 'canonical_session_missing';
        throw err;
    }

    if (identity.sessionFileSessionId) {
        entry.sessionId = identity.sessionFileSessionId;
    }
    entry.updatedAt = Date.now();

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${identity.sessionsPath}.${ts}.pre-cm-force-canonical.bak`;
    await fsPromises.copyFile(identity.sessionsPath, backupPath);
    await fsPromises.writeFile(identity.sessionsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    hydrateOpenclawSessionIndex();
    return {
        ...buildChannelRuntimeBinding(channelId, { channelConfigRaw: configRaw }),
        forced: {
            ok: true,
            sessionKey,
            sessionsPath: identity.sessionsPath,
            backupPath
        }
    };
}
