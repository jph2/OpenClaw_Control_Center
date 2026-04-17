import express from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { resolveSafe } from '../utils/security.js';
import { scanWorkspaceSkillsCatalog, resolveWorkspaceSkillsDir } from '../services/workspaceSkillRegistry.js';
import {
    assertStrictTtgChannelNames,
    isStrictTtgChannelNamesEnabled,
    TTG_CHANNEL_NAME_PREFIX_RE
} from '../utils/ttgChannelNameValidation.js';

const OPENCLAW_JSON_PATH = process.env.OPENCLAW_CONFIG_PATH || '/home/claw-agentbox/.openclaw/openclaw.json';

/** Bundled / managed catalog entries; merged at request time with filesystem scan under OPENCLAW_WORKSPACE/skills (see workspaceSkillRegistry.js). */
const BUNDLED_SKILL_CATALOG = {
    weather: { desc: 'Get current weather and forecasts for any location', origin: 'openclaw/skills', cat: 'utility', src: 'bundled', def: true },
    web_search: { desc: 'Search the web using Google Search grounding', origin: 'openclaw/skills', cat: 'research', src: 'bundled', def: true },
    web_fetch: { desc: 'Fetch and extract content from URLs', origin: 'openclaw/skills', cat: 'research', src: 'bundled', def: true },
    healthcheck: { desc: 'System security hardening and risk assessment', origin: 'openclaw/skills', cat: 'system', src: 'bundled', def: false },
    'node-connect': { desc: 'Diagnose OpenClaw node connection failures', origin: 'openclaw/skills', cat: 'system', src: 'bundled', def: false },
    notion: { desc: 'Create and manage Notion pages and databases', origin: 'clawhub', cat: 'integration', src: 'managed', def: false },
    clawflow: { desc: 'ClawFlow workflow orchestration and job management', origin: 'openclaw/skills', cat: 'orchestration', src: 'bundled', def: true },
    'skill-creator': { desc: 'Create, edit and audit AgentSkills', origin: 'openclaw/skills', cat: 'development', src: 'bundled', def: false },
    clawhub: { desc: 'Search, install and publish agent skills', origin: 'openclaw/skills', cat: 'utility', src: 'bundled', def: false }
};

async function syncToOpenClawState(channelId, updates) {
    try {
        const raw = await fsPromises.readFile(OPENCLAW_JSON_PATH, 'utf8');
        const state = JSON.parse(raw);

        if (!state.channels?.telegram?.groups) return;

        const group = state.channels.telegram.groups[channelId];
        if (group) {
            // OpenClaw schema strictly denies 'model' inside telegram groups. Wait for proper API approach.
            // if (updates.model) group.model = updates.model;
            // await fsPromises.writeFile(OPENCLAW_JSON_PATH, JSON.stringify(state, null, 2));
            console.log(`[Sync] Skipped syncing model (${updates.model}) to OpenClaw (unsupported schema property).`);
        }
    } catch (err) {
        console.error(`[Sync] Failed to sync to OpenClaw state: ${err.message}`);
    }
}

// Central Event Emitter for Hot-Reload signals
const configEvents = new EventEmitter();

// Helper to safely get the config path (reusable across module logic)
let _cachedConfigPath = null;
const getResolvedConfigPath = async () => {
    if (_cachedConfigPath) return _cachedConfigPath;
    const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, 'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json');
    _cachedConfigPath = resolved;
    return resolved;
};

// Initialize Config Polling (Chokidar causes EBADF errors)
setTimeout(async () => {
    try {
        const configPath = await getResolvedConfigPath();
        let lastMtime = 0;
        
        const pollConfig = () => {
            try {
                if (fs.existsSync(configPath)) {
                    const stat = fs.statSync(configPath);
                    if (stat.mtimeMs > lastMtime) {
                        lastMtime = stat.mtimeMs;
                        console.log(`[Polling] Detected config change in ${configPath}. Pushing SSE hot-reload event...`);
                        configEvents.emit('configChange');
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        };
        
        setInterval(pollConfig, 10000); // Poll every 10s to reduce CPU load
        pollConfig(); // Initial check
        console.log(`[Polling] Active and watching: ${configPath}`);
    } catch (err) {
        console.warn('[Polling] Failed to initialize config watcher:', err.message);
    }
}, 0);

// Workspace skills polling (Chokidar causes EBADF errors)
setTimeout(() => {
    try {
        const skillsDir = resolveWorkspaceSkillsDir();
        const knownSkills = new Map(); // filePath -> mtime
        
        const pollSkills = () => {
            try {
                if (!fs.existsSync(skillsDir)) return;
                
                const scanDir = (dir) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            scanDir(fullPath);
                        } else if (entry.name === 'SKILL.md') {
                            try {
                                const stat = fs.statSync(fullPath);
                                const known = knownSkills.get(fullPath);
                                
                                if (!known) {
                                    // New skill file
                                    knownSkills.set(fullPath, stat.mtimeMs);
                                    console.log(`[Polling] Workspace skill file added: ${fullPath}`);
                                    configEvents.emit('configChange');
                                } else if (stat.mtimeMs > known) {
                                    // Skill file changed
                                    knownSkills.set(fullPath, stat.mtimeMs);
                                    console.log(`[Polling] Workspace skill file changed: ${fullPath}`);
                                    configEvents.emit('configChange');
                                }
                            } catch (err) {
                                // Skip files we can't stat
                            }
                        }
                    }
                };
                
                scanDir(skillsDir);
                
                // Clean up deleted files
                for (const [filePath] of knownSkills) {
                    if (!fs.existsSync(filePath)) {
                        knownSkills.delete(filePath);
                        console.log(`[Polling] Workspace skill file deleted: ${filePath}`);
                        configEvents.emit('configChange');
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        };
        
        setInterval(pollSkills, 30000); // Poll every 30s to reduce CPU load (skills change rarely)
        pollSkills(); // Initial scan
        console.log(`[Polling] Watching workspace skills: ${skillsDir}`);
    } catch (err) {
        console.warn('[Polling] Workspace skills watcher failed:', err.message);
    }
}, 0);

const router = express.Router();

/**
 * G4 Security Fix-Gate: Zod Input Validation Schemas
 * We rigidly type all incoming API data to prevent injection and state corruption.
 */
const ChannelConfigSchema = z.object({
    channels: z.array(z.object({
        id: z.string(),
        name: z.string(),
        model: z.string().nullish(),
        skills: z.array(z.string()).nullish(),
        require_mention: z.boolean().nullish(),
        assignedAgent: z.string().nullish(),
        ideOverride: z.boolean().nullish(),
        inactiveSubAgents: z.array(z.string()).nullish(),
        inactiveSkills: z.array(z.string()).nullish(),
        caseSkills: z.array(z.string()).nullish(),
        inactiveCaseSkills: z.array(z.string()).nullish(),
        status: z.string().nullish(),
        currentTask: z.string().nullish()
    })),
    agents: z.array(z.object({
        id: z.string(),
        name: z.string(),
        role: z.string().nullish(),
        description: z.string().nullish(),
        color: z.string().nullish(),
        defaultSkills: z.array(z.string()).nullish(),
        inactiveSkills: z.array(z.string()).nullish()
    })).nullish(),
    subAgents: z.array(z.any()).nullish(),
    metadata: z.any().nullish(),
    availableModels: z.any().optional()
}).passthrough();

const UpdateChannelSchema = z.object({
    channelId: z.string().min(1),
    /** Optional rename; validated when CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES is set. */
    name: z.string().min(1).max(240).transform((s) => s.trim()).optional(),
    skills: z.array(z.string()).nullish(),
    assignedAgent: z.string().nullish(),
    ideOverride: z.boolean().nullish(),
    model: z.string().nullish(),
    inactiveSubAgents: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish(),
    caseSkills: z.array(z.string()).nullish(),
    inactiveCaseSkills: z.array(z.string()).nullish()
}).passthrough();

const UpdateAgentSchema = z.object({
    agentId: z.string().min(1),
    defaultSkills: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish()
}).passthrough();

const UpdateSubAgentSchema = z.object({
    subAgentId: z.string().min(1),
    additionalSkills: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish(),
    /** Main agent id, or null to unassign from all main agents. */
    parent: z.union([z.string().min(1), z.null()]).optional(),
    /** When false, sub-agent is hidden from channel pickers until re-enabled. */
    enabled: z.boolean().nullish()
}).passthrough();

const ReorderMainAgentsSchema = z.object({
    orderedAgentIds: z.array(z.string().min(1))
});

const DeleteSubAgentSchema = z.object({
    subAgentId: z.string().min(1).transform((s) => s.trim())
});

/** New sub-agent row in channel_config.json (id must be unique). */
const CreateSubAgentSchema = z.object({
    id: z
        .string()
        .min(1)
        .max(64)
        .transform((s) => s.trim())
        .refine((s) => /^[a-zA-Z0-9_-]+$/.test(s), {
            message: 'id must contain only letters, digits, hyphen, underscore'
        }),
    name: z.string().min(1).max(120).transform((s) => s.trim()),
    description: z.string().max(2000).optional().default(''),
    parent: z.string().min(1).default('tars'),
    additionalSkills: z.array(z.string()).optional().default([]),
    enabled: z.boolean().optional().default(true)
});

/** Planner is always TARS; older configs may still store other `assignedAgent` values. */
function normalizeChannelsAssignedAgentTars(channels) {
    if (!Array.isArray(channels)) return [];
    return channels.map((c) => ({ ...c, assignedAgent: 'tars' }));
}

/**
 * `channel_config.json` must use `channels` as an array; legacy or broken files may use `{}`
 * or a map — normalize so `.map()` / merge logic never throws.
 */
function normalizeToArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && value.constructor === Object) {
        return Object.values(value);
    }
    return [];
}

/** After `JSON.parse` of channel_config.json — keeps POST handlers from calling `.findIndex` on `{}`. */
function normalizeParsedChannelConfig(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    parsed.channels = normalizeToArray(parsed.channels);
    parsed.agents = normalizeToArray(parsed.agents);
    parsed.subAgents = normalizeToArray(parsed.subAgents);
}

/** When `agents` in JSON is empty, UI has nothing to render — seed from the same catalog as `metadata.mainAgents`. */
function buildDefaultMainAgentsFromMetadata(metadata) {
    const m = metadata?.mainAgents;
    if (!m || typeof m !== 'object') return [];
    const order = ['tars', 'marvin', 'case'];
    return order
        .map((id) => {
            const row = m[id];
            if (!row || typeof row !== 'object') return null;
            return {
                id,
                name: String(row.name || id),
                role: row.role ?? '',
                description: row.quote ?? '',
                color: row.color ?? '#50e3c2',
                defaultSkills: Array.isArray(row.defaultSkills) ? row.defaultSkills : [],
                inactiveSkills: []
            };
        })
        .filter(Boolean);
}

function buildDefaultSubAgentsFromMetadata(metadata) {
    const d = metadata?.subAgentsDict;
    if (!d || typeof d !== 'object') return [];
    return Object.entries(d).map(([id, row]) => ({
        id,
        name: String(row.name || id),
        parent: row.parent || 'tars',
        additionalSkills: Array.isArray(row.additionalSkills) ? row.additionalSkills : [],
        inactiveSkills: [],
        enabled: true
    }));
}

/**
 * Helper to safely get the config path.
 */
const getConfigPath = async () => {
    // Legacy configs are stored in the prototypes folder
    const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, 'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json');
    return resolved;
};

/**
 * Ensures the config directory and file exists.
 */
const ensureConfigExists = async (configPath) => {
    try {
        await fsPromises.access(configPath);
    } catch {
        await fsPromises.mkdir(path.dirname(configPath), { recursive: true });
        await fsPromises.writeFile(
            configPath,
            JSON.stringify({ channels: [], agents: [], subAgents: [] }, null, 2),
            'utf8'
        );
    }
};

/**
 * Helper to gracefully parse external JSON files without crashing the server
 */
const readExternalJsonSafe = async (filePath) => {
    if (!filePath) return {};
    try {
        const raw = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`[MARVIN-WARN] Failed to read or parse ${filePath}:`, err.message);
        return {};
    }
};

/**
 * GET /api/channels/events (SSE)
 * Sub-Task 1.4: Pushes real-time config refresh signals to the React frontends.
 */
router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const notifyUpdate = () => {
        res.write(`data: ${JSON.stringify({ type: 'CONFIG_UPDATED', timestamp: Date.now() })}\n\n`);
    };

    configEvents.on('configChange', notifyUpdate);

    // Keep connection alive
    const keepAlive = setInterval(() => res.write(':ping\n\n'), 30000);

    req.on('close', () => {
        configEvents.off('configChange', notifyUpdate);
        clearInterval(keepAlive);
    });
});

/**
 * GET /api/channels/export
 * Downloads the current channel_config.json
 */
router.get('/export', async (req, res, next) => {
    try {
        const configPath = await getConfigPath();
        res.download(configPath, 'channel_config.json');
    } catch (err) {
        next(err);
    }
});

/**
 * Atomic full replace of channel_config.json (validated). Emits SSE reload.
 */
async function persistFullChannelConfig(body) {
    const payload = ChannelConfigSchema.parse(body);
    payload.channels = normalizeChannelsAssignedAgentTars(payload.channels);
    assertStrictTtgChannelNames(payload.channels);
    const configPath = await getConfigPath();
    const release = await lockfile.lock(configPath, { retries: 5 });
    try {
        await fsPromises.writeFile(configPath, JSON.stringify(payload, null, 2), 'utf8');
        configEvents.emit('configChange');
    } finally {
        await release();
    }
    return payload;
}

/**
 * POST /api/channels/import
 * Overwrites the current configuration with an uploaded one.
 */
router.post('/import', async (req, res, next) => {
    try {
        await persistFullChannelConfig(req.body);
        res.json({ ok: true, message: 'Configuration imported successfully.' });
    } catch (err) {
        if (err instanceof z.ZodError) err.status = 400;
        next(err);
    }
});

/**
 * POST /api/channels/config
 * Sub-Task 6.5: Same as import — explicit name for atomic persistence of full JSON.
 */
router.post('/config', async (req, res, next) => {
    try {
        await persistFullChannelConfig(req.body);
        res.json({ ok: true, message: 'Configuration saved atomically.' });
    } catch (err) {
        if (err instanceof z.ZodError) err.status = 400;
        next(err);
    }
});

/**
 * POST /api/channels/reload
 * Forcefully triggers a hot-reload event
 */
router.post('/reload', (req, res) => {
    configEvents.emit('configChange');
    res.json({ ok: true, message: 'Reload signal emitted.' });
});

/**
 * GET /api/channels
 * Returns the current channel configuration merged with Live OpenClaw state.
 */
router.get('/', async (req, res, next) => {
    try {
        console.log("MARKER: GET /api/channels started");
        // 1. Get Local UI State
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const rawLocal = await fsPromises.readFile(configPath, 'utf8');
        const localState = JSON.parse(rawLocal);
        const localChannelsList = normalizeToArray(localState.channels);
        console.log("MARKER: Local UI State loaded, length:", localChannelsList.length);
        const localChannelsMap = new Map(localChannelsList.map((c) => [c.id, c]));

        // 2. Fetch OpenClaw Sovereign State (Point of Truth for Telegram Connections)
        console.log("MARKER: Fetching OPENCLAW_CONFIG_PATH");
        const openclawState = await readExternalJsonSafe(process.env.OPENCLAW_CONFIG_PATH);
        const liveTelegramGroups = openclawState?.channels?.telegram?.groups || {};

        // 3. Fetch Documentation / Dictionary State
        console.log("MARKER: Fetching TELEGRAM_ROUTING_PATH");
        const routingState = await readExternalJsonSafe(process.env.TELEGRAM_ROUTING_PATH);
        const routingChannels = routingState?.channels || {};

        const mergedChannels = [];
        console.log("MARKER [1]: Starting merge...");
        // Ensure every live OpenClaw group exists locally
        for (const [groupId, settings] of Object.entries(liveTelegramGroups)) {
            if (groupId === '*') continue;
            const routingInfo = routingChannels[groupId] || {};
            const localInfo = localChannelsMap.get(groupId) || {};
            mergedChannels.push({
                id: groupId,
                name: routingInfo.name || localInfo.name || `TG Unknown (${groupId})`,
                model: settings.model || localInfo.model || 'local-pc/google/gemma-4-26b-a4b',
                skills: localInfo.skills || [],
                assignedAgent: 'tars',
                ideOverride: localInfo.ideOverride || false,
                inactiveSubAgents: localInfo.inactiveSubAgents || [],
                inactiveSkills: localInfo.inactiveSkills || [],
                caseSkills: localInfo.caseSkills || [],
                inactiveCaseSkills: localInfo.inactiveCaseSkills || [],
                require_mention: settings.requireMention || false,
                currentTask: routingInfo.purpose || "Live Channel",
                status: "active"
            });
            localChannelsMap.delete(groupId);
        }

        console.log("MARKER [2]: Processing orphans...");
        for (const [groupId, localInfo] of localChannelsMap.entries()) {
            mergedChannels.push({
                id: groupId,
                name: localInfo.name || `Orphan (${groupId})`,
                model: localInfo.model || 'local-pc/google/gemma-4-26b-a4b',
                skills: localInfo.skills || [],
                assignedAgent: 'tars',
                ideOverride: localInfo.ideOverride || false,
                inactiveSubAgents: localInfo.inactiveSubAgents || [],
                inactiveSkills: localInfo.inactiveSkills || [],
                caseSkills: localInfo.caseSkills || [],
                inactiveCaseSkills: localInfo.inactiveCaseSkills || [],
                currentTask: "Offline/Disconnected",
                status: "offline"
            });
        }

        console.log("MARKER [3]: Building metadata...");
        const modelsObject = openclawState?.agents?.defaults?.models || {};
        const dynamicModels = Object.entries(modelsObject).map(([id, info]) => ({
            id: id,
            name: info.alias || id,
            desc: id.includes('local-pc') ? 'Sovereign Local Agent' : 'Cloud Connected Agent'
        }));

        const workspaceSkills = await scanWorkspaceSkillsCatalog();
        const mergedSkills = { ...BUNDLED_SKILL_CATALOG, ...workspaceSkills };

        const metadata = {
            models: dynamicModels,
            mainAgents: {
                tars: { name: "TARS", role: "Planner", color: "#50e3c2", defaultSkills: ["clawflow", "skill-creator", "clawhub"], quote: "Direct, honest, useful. No fake certainty. Builds with architecture and rigor." },
                marvin: { name: "MARVIN", role: "Critic", color: "#e35050", defaultSkills: ["healthcheck", "node-connect"], quote: "Zero-trust reviewer. Assumes everything is broken. Finds failures before they find you." },
                case: { name: "CASE", role: "Synthesis", color: "#e3c450", defaultSkills: ["clawflow", "web_search", "web_fetch"], quote: "Synthesis role (SONIC → CASE): execution and IDE relay aligned with the harness; same triad as the IDE (TARS / MARVIN / CASE)." }
            },
            subAgentsDict: {
                researcher: { name: "Researcher", parent: "tars", additionalSkills: ["web_search", "web_fetch"] },
                coder: { name: "Coder", parent: "case", additionalSkills: ["omniverse-extension-development", "usd-development"] },
                reviewer: { name: "Reviewer", parent: "marvin", additionalSkills: [] },
                documenter: { name: "Documenter", parent: "tars", additionalSkills: ["notion"] },
                tester: { name: "Tester", parent: "marvin", additionalSkills: ["healthcheck"] }
            },
            skills: mergedSkills
        };

        const availableModels = openclawState?.agents?.defaults?.models || {};

        let agents = normalizeToArray(localState.agents);
        if (agents.length === 0) {
            agents = buildDefaultMainAgentsFromMetadata(metadata);
        }
        let subAgents = normalizeToArray(localState.subAgents);
        if (subAgents.length === 0) {
            subAgents = buildDefaultSubAgentsFromMetadata(metadata);
        }

        const normalizedData = {
            channels: mergedChannels,
            agents,
            subAgents,
            metadata: metadata,
            availableModels: availableModels
        };

        try {
            const validated = ChannelConfigSchema.parse(normalizedData);
            res.json({ ok: true, data: validated });
        } catch (zodError) {
            import('fs').then(fs => fs.writeFileSync('/tmp/zod_error.txt', zodError.stack || zodError.toString() || 'unknown error in parse'));
            if (zodError instanceof z.ZodError) {
                return res.status(422).json({ ok: false, error: "Validation Failed", details: zodError.format() });
            }
            throw zodError; // This causes the 500
        }
    } catch (error) {
        import('fs').then(fs => fs.writeFileSync('/tmp/global_error.txt', error.stack || error.toString() || 'unknown error in global'));
        next(error);
    }
});

/**
 * POST /api/channels/update
 * G3 Security Fix-Gate: Atomic Writes with `proper-lockfile`
 * Sub-Task 1.5: (Marvin's Audit) Bounded Contexts. This POST route is ONLY allowed 
 * to modify TOP-DOWN configurations (channel_config.json). It strictly prohibits modifying *.memory.md
 */
router.post('/update', async (req, res, next) => {
    try {
        // G4: Strict input validation completely shields from payload injection
        const payload = UpdateChannelSchema.parse(req.body);

        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);

        // G3: Acquire file lock before read-modify-write cycle
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const channelIndex = parsed.channels.findIndex(c => c.id === payload.channelId);

            if (channelIndex > -1) {
                if (payload.name !== undefined) {
                    if (isStrictTtgChannelNamesEnabled() && !TTG_CHANNEL_NAME_PREFIX_RE.test(payload.name)) {
                        throw new z.ZodError([
                            {
                                code: z.ZodIssueCode.custom,
                                path: ['name'],
                                message:
                                    'Channel name must start with TTG followed by three digits (e.g. TTG001).'
                            }
                        ]);
                    }
                    parsed.channels[channelIndex].name = payload.name;
                }
                if (payload.skills !== undefined) {
                    parsed.channels[channelIndex].skills = payload.skills;
                }
                if (payload.ideOverride !== undefined) {
                    parsed.channels[channelIndex].ideOverride = payload.ideOverride;
                }
                if (payload.model !== undefined) {
                    parsed.channels[channelIndex].model = payload.model;
                }
                if (payload.inactiveSubAgents !== undefined) {
                    parsed.channels[channelIndex].inactiveSubAgents = payload.inactiveSubAgents;
                }
                if (payload.inactiveSkills !== undefined) {
                    parsed.channels[channelIndex].inactiveSkills = payload.inactiveSkills;
                }
                if (payload.caseSkills !== undefined) {
                    parsed.channels[channelIndex].caseSkills = payload.caseSkills;
                }
                if (payload.inactiveCaseSkills !== undefined) {
                    parsed.channels[channelIndex].inactiveCaseSkills = payload.inactiveCaseSkills;
                }
            } else {
                let initialName = isStrictTtgChannelNamesEnabled()
                    ? `TTG000 group ${payload.channelId}`
                    : `New Channel ${payload.channelId}`;
                if (payload.name !== undefined) {
                    if (isStrictTtgChannelNamesEnabled() && !TTG_CHANNEL_NAME_PREFIX_RE.test(payload.name)) {
                        throw new z.ZodError([
                            {
                                code: z.ZodIssueCode.custom,
                                path: ['name'],
                                message:
                                    'Channel name must start with TTG followed by three digits (e.g. TTG001).'
                            }
                        ]);
                    }
                    initialName = payload.name;
                }
                parsed.channels.push({
                    id: payload.channelId,
                    name: initialName,
                    skills: payload.skills || [],
                    assignedAgent: 'tars',
                    ideOverride: payload.ideOverride || false,
                    model: payload.model || 'local-pc/google/gemma-4-26b-a4b',
                    inactiveSubAgents: payload.inactiveSubAgents || [],
                    inactiveSkills: payload.inactiveSkills || [],
                    caseSkills: payload.caseSkills || [],
                    inactiveCaseSkills: payload.inactiveCaseSkills || []
                });
            }

            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);

            // G4 Secondary check: ensure our modifications didn't break the global schema
            const finalState = ChannelConfigSchema.parse(parsed);
            assertStrictTtgChannelNames(finalState.channels);

            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');

            // Sub-Task 1.5: Sovereign State Synchronization
            // Ensure model changes are pushed to the live OpenClaw Engine config
            if (payload.model) {
                await syncToOpenClawState(payload.channelId, { model: payload.model });
            }

            res.json({ ok: true, message: 'Configuration updated and synchronized.' });
        } finally {
            // ALWAYS release the lock whether success or error
            await release();
        }

    } catch (error) {
        if (error instanceof z.ZodError) {
            error.status = 400; // Bad request for validation errors
        }
        next(error);
    }
});

/**
 * POST /api/channels/updateAgent
 * Updates Main Agent properties atomically.
 */
router.post('/updateAgent', async (req, res, next) => {
    try {
        const payload = UpdateAgentSchema.parse(req.body);
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const agentIndex = parsed.agents.findIndex(a => a.id === payload.agentId);
            if (agentIndex > -1) {
                if (payload.defaultSkills !== undefined) parsed.agents[agentIndex].defaultSkills = payload.defaultSkills;
                if (payload.inactiveSkills !== undefined) parsed.agents[agentIndex].inactiveSkills = payload.inactiveSkills;
            }

            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);
            const finalState = ChannelConfigSchema.parse(parsed);
            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'Agent configuration updated atomically.' });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * POST /api/channels/updateSubAgent
 * Updates SubAgent properties atomically.
 */
router.post('/updateSubAgent', async (req, res, next) => {
    try {
        const payload = UpdateSubAgentSchema.parse(req.body);
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const subAgentIndex = parsed.subAgents.findIndex(a => a.id === payload.subAgentId);
            if (subAgentIndex > -1) {
                if (payload.additionalSkills !== undefined) parsed.subAgents[subAgentIndex].additionalSkills = payload.additionalSkills;
                if (payload.inactiveSkills !== undefined) parsed.subAgents[subAgentIndex].inactiveSkills = payload.inactiveSkills;
                if (payload.parent !== undefined) parsed.subAgents[subAgentIndex].parent = payload.parent;
                if (payload.enabled !== undefined) parsed.subAgents[subAgentIndex].enabled = payload.enabled;
            }

            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);
            const finalState = ChannelConfigSchema.parse(parsed);
            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'SubAgent configuration updated atomically.' });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * POST /api/channels/createSubAgent
 * Appends a new sub-agent to channel_config.json (atomic write).
 */
router.post('/createSubAgent', async (req, res, next) => {
    try {
        const payload = CreateSubAgentSchema.parse(req.body);
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const exists = parsed.subAgents.some((s) => s.id === payload.id);
            if (exists) {
                return res.status(409).json({
                    ok: false,
                    error: true,
                    message: `Sub-agent id "${payload.id}" already exists.`
                });
            }

            const mainIds = new Set((parsed.agents || []).map((a) => a.id));
            if (payload.parent && !mainIds.has(payload.parent)) {
                return res.status(400).json({
                    ok: false,
                    error: true,
                    message: `Unknown main agent parent: ${payload.parent}`
                });
            }

            const row = {
                id: payload.id,
                name: payload.name,
                parent: payload.parent,
                additionalSkills: [...payload.additionalSkills],
                inactiveSkills: [],
                enabled: payload.enabled
            };
            if (payload.description && payload.description.trim()) {
                row.description = payload.description.trim();
            }

            parsed.subAgents.push(row);
            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);
            const finalState = ChannelConfigSchema.parse(parsed);
            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'Sub-agent created.', subAgent: row });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * POST /api/channels/deleteSubAgent
 * Removes a sub-agent from channel_config.json and strips its id from channel inactiveSubAgents.
 */
router.post('/deleteSubAgent', async (req, res, next) => {
    try {
        const payload = DeleteSubAgentSchema.parse(req.body);
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const idx = parsed.subAgents.findIndex((s) => s.id === payload.subAgentId);
            if (idx === -1) {
                return res.status(404).json({
                    ok: false,
                    error: true,
                    message: `Sub-agent "${payload.subAgentId}" not found.`
                });
            }

            parsed.subAgents.splice(idx, 1);

            parsed.channels = parsed.channels.map((c) => ({
                ...c,
                inactiveSubAgents: (c.inactiveSubAgents || []).filter((id) => id !== payload.subAgentId)
            }));

            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);
            const finalState = ChannelConfigSchema.parse(parsed);
            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'Sub-agent removed.' });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * POST /api/channels/reorderMainAgents
 * Persists display order for the Agents tab (order of `agents` in channel_config.json).
 */
router.post('/reorderMainAgents', async (req, res, next) => {
    try {
        const payload = ReorderMainAgentsSchema.parse(req.body);
        const configPath = await getConfigPath();
        await ensureConfigExists(configPath);
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            const raw = await fsPromises.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            normalizeParsedChannelConfig(parsed);

            const agents = parsed.agents;
            const existingIds = new Set(agents.map((a) => a.id));
            const incoming = payload.orderedAgentIds;

            if (incoming.length !== existingIds.size) {
                return res.status(400).json({
                    ok: false,
                    error: 'orderedAgentIds must contain each main agent id exactly once.'
                });
            }
            const dup = new Set();
            for (const id of incoming) {
                if (dup.has(id)) {
                    return res.status(400).json({ ok: false, error: 'Duplicate id in orderedAgentIds.' });
                }
                dup.add(id);
                if (!existingIds.has(id)) {
                    return res.status(400).json({ ok: false, error: `Unknown agent id: ${id}` });
                }
            }

            const byId = new Map(agents.map((a) => [a.id, a]));
            parsed.agents = incoming.map((id) => byId.get(id));

            parsed.channels = normalizeChannelsAssignedAgentTars(parsed.channels || []);
            const finalState = ChannelConfigSchema.parse(parsed);
            await fsPromises.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'Main agent order updated.' });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

export default router;
