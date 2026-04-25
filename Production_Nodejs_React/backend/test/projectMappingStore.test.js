import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    normalizeProjectMappings,
    readProjectMappings,
    writeJsonAtomic,
    writeProjectMappings
} from '../services/projectMappingStore.js';

describe('projectMappingStore', () => {
    it('normalizes operator-managed project mappings', () => {
        const [row] = normalizeProjectMappings([
            {
                projectId: 'openclaw-control-center',
                repoSlug: 'openclaw-control-center',
                ttgId: '-1003752539559',
                label: 'General'
            }
        ]);
        assert.equal(row.projectId, 'openclaw-control-center');
        assert.equal(row.repoSlug, 'openclaw-control-center');
        assert.equal(row.ttgId, '-1003752539559');
        assert.ok(row.updatedAt);
    });

    it('rejects mappings without a project identity key', () => {
        assert.throws(() => normalizeProjectMappings([{ ttgId: '-1003752539559' }]), /at least one/);
    });

    it('rejects invalid TTG ids', () => {
        assert.throws(
            () => normalizeProjectMappings([{ projectId: 'openclaw-control-center', ttgId: '-42' }]),
            /invalid TTG id/
        );
    });

    it('persists mappings inside channel_config.json', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-project-mappings-'));
        const configPath = path.join(dir, 'channel_config.json');
        await fs.writeFile(configPath, JSON.stringify({ channels: [], agents: [], subAgents: [] }, null, 2), 'utf8');

        await writeProjectMappings(
            [{ projectId: 'openclaw-control-center', ttgId: '-1003752539559', note: 'primary' }],
            configPath
        );
        const mappings = await readProjectMappings(configPath);
        assert.equal(mappings.length, 1);
        assert.equal(mappings[0].projectId, 'openclaw-control-center');
        assert.equal(mappings[0].ttgId, '-1003752539559');

        const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
        assert.equal(raw.projectMappings[0].note, 'primary');
    });

    it('writes channel_config.json through temp file rename and leaves no temp file behind', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-project-mappings-atomic-'));
        const configPath = path.join(dir, 'channel_config.json');
        await fs.writeFile(configPath, JSON.stringify({ channels: [] }, null, 2), 'utf8');

        await writeProjectMappings([{ repoSlug: 'studio-framework', ttgId: '-1003987722298' }], configPath);

        const entries = await fs.readdir(dir);
        assert.deepEqual(entries, ['channel_config.json']);
        const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
        assert.equal(raw.projectMappings[0].repoSlug, 'studio-framework');
    });

    it('writeJsonAtomic replaces an existing JSON file', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-json-atomic-'));
        const target = path.join(dir, 'value.json');
        await fs.writeFile(target, '{"old":true}\n', 'utf8');

        await writeJsonAtomic(target, { next: true });

        assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { next: true });
        assert.deepEqual(await fs.readdir(dir), ['value.json']);
    });
});
