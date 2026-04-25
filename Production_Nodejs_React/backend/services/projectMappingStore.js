import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { resolveSafe } from '../utils/security.js';
import { isValidTtgId } from './ttgBindingResolver.js';

export const ProjectMappingSchema = z
    .object({
        projectId: z.string().trim().min(1).max(120).optional().default(''),
        repoSlug: z.string().trim().max(120).optional().default(''),
        projectMappingKey: z.string().trim().max(160).optional().default(''),
        ttgId: z
            .string()
            .trim()
            .refine((value) => isValidTtgId(value), 'invalid TTG id'),
        label: z.string().trim().max(160).optional().default(''),
        note: z.string().trim().max(2000).optional().default(''),
        updatedAt: z.string().optional()
    })
    .superRefine((value, ctx) => {
        if (!value.projectId && !value.repoSlug && !value.projectMappingKey) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'at least one of projectId, repoSlug, or projectMappingKey is required',
                path: ['projectId']
            });
        }
    });

export const ProjectMappingsSchema = z.array(ProjectMappingSchema);

export async function resolveChannelConfigPath() {
    const { resolved } = await resolveSafe(
        process.env.WORKSPACE_ROOT,
        'OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json'
    );
    return resolved;
}

async function ensureConfigExists(configPath) {
    try {
        await fs.access(configPath);
    } catch {
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await writeJsonAtomic(configPath, { channels: [], agents: [], subAgents: [], projectMappings: [] });
    }
}

export async function writeJsonAtomic(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, filePath);
}

export function normalizeProjectMappings(value) {
    const parsed = ProjectMappingsSchema.parse(Array.isArray(value) ? value : []);
    const now = new Date().toISOString();
    return parsed.map((row) => ({
        projectId: row.projectId || '',
        repoSlug: row.repoSlug || '',
        projectMappingKey: row.projectMappingKey || '',
        ttgId: row.ttgId,
        label: row.label || '',
        note: row.note || '',
        updatedAt: row.updatedAt || now
    }));
}

export async function readChannelConfigForProjectMappings(configPath = null) {
    const resolved = configPath || await resolveChannelConfigPath();
    await ensureConfigExists(resolved);
    const raw = await fs.readFile(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    return { configPath: resolved, config: parsed && typeof parsed === 'object' ? parsed : {} };
}

export async function readProjectMappings(configPath = null) {
    const { config } = await readChannelConfigForProjectMappings(configPath);
    return normalizeProjectMappings(config.projectMappings);
}

export async function writeProjectMappings(projectMappings, configPath = null) {
    const normalized = normalizeProjectMappings(projectMappings);
    const { configPath: resolved } = await readChannelConfigForProjectMappings(configPath);
    const release = await lockfile.lock(resolved, { retries: 5 });
    try {
        const raw = await fs.readFile(resolved, 'utf8');
        const config = JSON.parse(raw);
        config.projectMappings = normalized;
        await writeJsonAtomic(resolved, config);
    } finally {
        await release();
    }
    return normalized;
}
