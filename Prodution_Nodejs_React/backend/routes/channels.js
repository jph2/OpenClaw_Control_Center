import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { resolveSafe } from '../utils/security.js';

const OPENCLAW_JSON_PATH = process.env.OPENCLAW_CONFIG_PATH || '/home/claw-agentbox/.openclaw/openclaw.json';

async function syncToOpenClawState(channelId, updates) {
    try {
        const raw = await fs.readFile(OPENCLAW_JSON_PATH, 'utf8');
        const state = JSON.parse(raw);
        
        if (!state.channels?.telegram?.groups) return;
        
        const group = state.channels.telegram.groups[channelId];
        if (group) {
            if (updates.model) group.model = updates.model;
            await fs.writeFile(OPENCLAW_JSON_PATH, JSON.stringify(state, null, 2));
            console.log(`[Sync] Synchronized ${channelId} model (${updates.model}) to sovereign state.`);
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
    const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, 'Openclaw-OpenUSDGoodtstart-Extension/channel_CHAT-manager/channel_config.json');
    _cachedConfigPath = resolved;
    return resolved;
};

// Initialize Chokidar Watcher immediately when route is mounted
setTimeout(async () => {
    try {
        const configPath = await getResolvedConfigPath();
        const watcher = chokidar.watch(configPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });
        
        watcher.on('change', () => {
            console.log(`[Chokidar] Detected config change in ${configPath}. Pushing SSE hot-reload event...`);
            configEvents.emit('configChange');
        });
        console.log(`[Chokidar] Active and watching: ${configPath}`);
    } catch (err) {
        console.warn('[Chokidar] Failed to initialize watcher:', err.message);
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
    availableModels: z.record(z.any()).optional()
}).passthrough();

const UpdateChannelSchema = z.object({
    channelId: z.string().min(1),
    skills: z.array(z.string()).nullish(),
    assignedAgent: z.string().nullish(),
    ideOverride: z.boolean().nullish(),
    model: z.string().nullish(),
    inactiveSubAgents: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish()
}).passthrough();

const UpdateAgentSchema = z.object({
    agentId: z.string().min(1),
    defaultSkills: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish()
}).passthrough();

const UpdateSubAgentSchema = z.object({
    subAgentId: z.string().min(1),
    additionalSkills: z.array(z.string()).nullish(),
    inactiveSkills: z.array(z.string()).nullish()
}).passthrough();

/**
 * Helper to safely get the config path.
 */
const getConfigPath = async () => {
    // Legacy configs are stored in the prototypes folder
    const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, 'Openclaw-OpenUSDGoodtstart-Extension/channel_CHAT-manager/channel_config.json');
    return resolved;
};

/**
 * Ensures the config directory and file exists.
 */
const ensureConfigExists = async (configPath) => {
    try {
        await fs.access(configPath);
    } catch {
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify({ channels: {} }, null, 2), 'utf8');
    }
};

/**
 * Helper to gracefully parse external JSON files without crashing the server
 */
const readExternalJsonSafe = async (filePath) => {
    if (!filePath) return {};
    try {
        const raw = await fs.readFile(filePath, 'utf8');
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
 * POST /api/channels/import
 * Overwrites the current configuration with an uploaded one.
 */
router.post('/import', async (req, res, next) => {
    try {
        const payload = ChannelConfigSchema.parse(req.body);
        const configPath = await getConfigPath();
        const release = await lockfile.lock(configPath, { retries: 5 });

        try {
            await fs.writeFile(configPath, JSON.stringify(payload, null, 2), 'utf8');
            res.json({ ok: true, message: 'Configuration imported successfully.' });
        } finally {
            await release();
        }
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
        const rawLocal = await fs.readFile(configPath, 'utf8');
        const localState = JSON.parse(rawLocal);
        const localChannelsMap = new Map((localState.channels || []).map(c => [c.id, c]));

        // 2. Fetch OpenClaw Sovereign State (Point of Truth for Telegram Connections)
        console.log("MARKER: Fetching OPENCLAW_CONFIG_PATH");
        const openclawState = await readExternalJsonSafe(process.env.OPENCLAW_CONFIG_PATH);
        const liveTelegramGroups = openclawState?.channels?.telegram?.groups || {};

        // 3. Fetch Documentation / Dictionary State
        console.log("MARKER: Fetching TELEGRAM_ROUTING_PATH");
        const routingState = await readExternalJsonSafe(process.env.TELEGRAM_ROUTING_PATH);
        const routingChannels = routingState?.channels || {};

        // 4. Merge Engine
        const mergedChannels = [];
        
        // Ensure every live OpenClaw group exists locally
        for (const [groupId, settings] of Object.entries(liveTelegramGroups)) {
            // Ignore wildcard entry
            if (groupId === '*') continue;

            const routingInfo = routingChannels[groupId] || {};
            const localInfo = localChannelsMap.get(groupId) || {};

            mergedChannels.push({
                id: groupId,
                name: routingInfo.name || localInfo.name || `TG Unknown (${groupId})`,
                model: settings.model || localInfo.model || 'local-pc/google/gemma-4-26b-a4b',
                skills: localInfo.skills || [],
                assignedAgent: localInfo.assignedAgent || undefined,
                ideOverride: localInfo.ideOverride || false,
                inactiveSubAgents: localInfo.inactiveSubAgents || [],
                inactiveSkills: localInfo.inactiveSkills || [],
                require_mention: settings.requireMention || false,
                currentTask: routingInfo.purpose || "Live Channel",
                status: "active"
            });
            
            localChannelsMap.delete(groupId);
        }

        // Add any local orphan channels that are NOT in live OpenClaw yet (for robustness)
        for (const [groupId, localInfo] of localChannelsMap.entries()) {
             mergedChannels.push({
                 id: groupId,
                 name: localInfo.name || `Orphan (${groupId})`,
                 model: localInfo.model || 'local-pc/google/gemma-4-26b-a4b',
                 skills: localInfo.skills || [],
                 assignedAgent: localInfo.assignedAgent || undefined,
                 ideOverride: localInfo.ideOverride || false,
                 inactiveSubAgents: localInfo.inactiveSubAgents || [],
                 inactiveSkills: localInfo.inactiveSkills || [],
                 currentTask: "Offline/Disconnected",
                 status: "offline"
             });
        }

        // 5. Aggregate Metadata (Sub-Task 1.2) - Moved from Frontend
        // Sub-Task 1.5: Dynamic Model Mapping from Sovereign State
        // Convert OpenClaw's models object into a flat array for the UI dropdown
        const modelsObject = openclawState?.agents?.defaults?.models || {};
        const dynamicModels = Object.entries(modelsObject).map(([id, info]) => ({
            id: id,
            name: info.alias || id,
            desc: id.includes('local-pc') ? 'Sovereign Local Agent' : 'Cloud Connected Agent'
        }));

        const metadata = {
            models: dynamicModels,
            mainAgents: {
                tars: { name: "TARS", role: "Planner", color: "#50e3c2", defaultSkills: ["clawflow", "skill-creator", "clawhub"], quote: "Direct, honest, useful. No fake certainty. Builds with architecture and rigor." },
                marvin: { name: "MARVIN", role: "Critic", color: "#e35050", defaultSkills: ["healthcheck", "node-connect"], quote: "Zero-trust reviewer. Assumes everything is broken. Finds failures before they find you." },
                sonic: { name: "SONIC", role: "Executor", color: "#e3c450", defaultSkills: ["web_search", "web_fetch"], quote: "Fast execution inside scope. Moves quick when plan is solid. Stops when reality diverges." }
            },
            subAgentsDict: {
                researcher: { name: "Researcher", parent: "tars", additionalSkills: ["web_search", "web_fetch"] },
                coder: { name: "Coder", parent: "sonic", additionalSkills: ["omniverse-extension-development", "usd-development"] },
                reviewer: { name: "Reviewer", parent: "marvin", additionalSkills: [] },
                documenter: { name: "Documenter", parent: "tars", additionalSkills: ["notion"] },
                tester: { name: "Tester", parent: "marvin", additionalSkills: ["healthcheck"] }
            },
            skills: {
                "weather": { desc: "Get current weather and forecasts for any location", origin: "openclaw/skills", cat: "utility", src: "bundled", def: true },
                "web_search": { desc: "Search the web using Google Search grounding", origin: "openclaw/skills", cat: "research", src: "bundled", def: true },
                "web_fetch": { desc: "Fetch and extract content from URLs", origin: "openclaw/skills", cat: "research", src: "bundled", def: true },
                "healthcheck": { desc: "System security hardening and risk assessment", origin: "openclaw/skills", cat: "system", src: "bundled", def: false },
                "node-connect": { desc: "Diagnose OpenClaw node connection failures", origin: "openclaw/skills", cat: "system", src: "bundled", def: false },
                "notion": { desc: "Create and manage Notion pages and databases", origin: "clawhub", cat: "integration", src: "managed", def: false },
                "clawflow": { desc: "ClawFlow workflow orchestration and job management", origin: "openclaw/skills", cat: "orchestration", src: "bundled", def: true },
                "skill-creator": { desc: "Create, edit and audit AgentSkills", origin: "openclaw/skills", cat: "development", src: "bundled", def: false },
                "clawhub": { desc: "Search, install and publish agent skills", origin: "openclaw/skills", cat: "utility", src: "bundled", def: false }
            }
        };

        // Extract available models from the sovereign state for dynamic UI population
        const availableModels = openclawState?.agents?.defaults?.models || {};

        // Return unified schema
        const unifiedData = {
            channels: mergedChannels,
            agents: localState.agents,
            subAgents: localState.subAgents,
            metadata: metadata,
            availableModels: availableModels
        };
        
        console.log("MARKER: Doing Zod parse");
        
        // Zod Validation (Sub-Task 1.3)
        console.log("DEBUG mainAgents tars:", typeof unifiedData.metadata.mainAgents.tars, unifiedData.metadata.mainAgents.tars);
        const validated = ChannelConfigSchema.parse(unifiedData);
        res.json({ ok: true, data: validated });
    } catch (error) {
        next(error); // Passes to G5 central error handler
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
            const raw = await fs.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            
            if (!parsed.channels) {
                parsed.channels = [];
            }

            const channelIndex = parsed.channels.findIndex(c => c.id === payload.channelId);
            
            if (channelIndex > -1) {
                if (payload.skills !== undefined) {
                    parsed.channels[channelIndex].skills = payload.skills;
                }
                if (payload.assignedAgent !== undefined) {
                    parsed.channels[channelIndex].assignedAgent = payload.assignedAgent;
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
            } else {
                parsed.channels.push({
                    id: payload.channelId,
                    name: `New Channel ${payload.channelId}`,
                    skills: payload.skills || [],
                    assignedAgent: payload.assignedAgent || 'tars',
                    ideOverride: payload.ideOverride || false,
                    model: payload.model || 'local-pc/google/gemma-4-26b-a4b',
                    inactiveSubAgents: payload.inactiveSubAgents || [],
                    inactiveSkills: payload.inactiveSkills || []
                });
            }

            // G4 Secondary check: ensure our modifications didn't break the global schema
            const finalState = ChannelConfigSchema.parse(parsed);

            await fs.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            
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
            const raw = await fs.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            
            if (!parsed.agents) parsed.agents = [];

            const agentIndex = parsed.agents.findIndex(a => a.id === payload.agentId);
            if (agentIndex > -1) {
                if (payload.defaultSkills !== undefined) parsed.agents[agentIndex].defaultSkills = payload.defaultSkills;
                if (payload.inactiveSkills !== undefined) parsed.agents[agentIndex].inactiveSkills = payload.inactiveSkills;
            }

            const finalState = ChannelConfigSchema.parse(parsed);
            await fs.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
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
            const raw = await fs.readFile(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            
            if (!parsed.subAgents) parsed.subAgents = [];

            const subAgentIndex = parsed.subAgents.findIndex(a => a.id === payload.subAgentId);
            if (subAgentIndex > -1) {
                if (payload.additionalSkills !== undefined) parsed.subAgents[subAgentIndex].additionalSkills = payload.additionalSkills;
                if (payload.inactiveSkills !== undefined) parsed.subAgents[subAgentIndex].inactiveSkills = payload.inactiveSkills;
            }

            const finalState = ChannelConfigSchema.parse(parsed);
            await fs.writeFile(configPath, JSON.stringify(finalState, null, 2), 'utf8');
            res.json({ ok: true, message: 'SubAgent configuration updated atomically.' });
        } finally {
            await release();
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

export default router;
