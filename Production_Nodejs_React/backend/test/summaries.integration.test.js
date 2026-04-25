import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import app from '../index.js';

let tmpRoot;
let oldStudioRoot;
let oldOpenClawWorkspace;
let oldWorkspaceRoot;

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

describe('IDE project summaries bridge integration', () => {
    beforeEach(async () => {
        oldStudioRoot = process.env.STUDIO_FRAMEWORK_ROOT;
        oldOpenClawWorkspace = process.env.OPENCLAW_WORKSPACE;
        oldWorkspaceRoot = process.env.WORKSPACE_ROOT;
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-ide-bridge-'));
        process.env.STUDIO_FRAMEWORK_ROOT = path.join(tmpRoot, 'Studio_Framework');
        process.env.OPENCLAW_WORKSPACE = path.join(tmpRoot, 'openclaw-workspace');
        process.env.WORKSPACE_ROOT = tmpRoot;
        await fs.mkdir(path.join(process.env.OPENCLAW_WORKSPACE, 'memory'), { recursive: true });
        await fs.mkdir(path.join(tmpRoot, 'OpenClaw_Control_Center', 'Prototyp', 'channel_CHAT-manager'), { recursive: true });
        await fs.writeFile(
            path.join(tmpRoot, 'OpenClaw_Control_Center', 'Prototyp', 'channel_CHAT-manager', 'channel_config.json'),
            JSON.stringify({ channels: [], agents: [], subAgents: [], projectMappings: [] }, null, 2),
            'utf8'
        );
    });

    afterEach(async () => {
        if (oldStudioRoot === undefined) delete process.env.STUDIO_FRAMEWORK_ROOT;
        else process.env.STUDIO_FRAMEWORK_ROOT = oldStudioRoot;
        if (oldOpenClawWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE;
        else process.env.OPENCLAW_WORKSPACE = oldOpenClawWorkspace;
        if (oldWorkspaceRoot === undefined) delete process.env.WORKSPACE_ROOT;
        else process.env.WORKSPACE_ROOT = oldWorkspaceRoot;
        if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
    });

    it('POST summary creates markdown and sidecar meta exposed by list API', async () => {
        const relativePath = 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md';
        const text = '# Summary\n\n- TTG: -1003752539559\n\nBridge smoke.';

        const write = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text,
                createOnly: true,
                meta: {
                    ttgId: '-1003752539559',
                    channelName: 'TG000_General_Chat',
                    surface: 'codex',
                    projectRoot: '/repo/OpenClaw_Control_Center',
                    projectId: 'openclaw-control-center',
                    agent: 'codex'
                }
            })
            .expect(200);

        assert.equal(write.body.ok, true);
        assert.equal(write.body.metaRelativePath, 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.meta.json');
        assert.equal(write.body.meta.ttgId, '-1003752539559');
        assert.equal(write.body.meta.binding.status, 'confirmed');

        const a070Root = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '050_Artifacts', 'A070_ide_cursor_summaries');
        assert.equal(await fs.readFile(path.join(a070Root, relativePath), 'utf8'), text);
        const meta = await readJson(path.join(a070Root, write.body.metaRelativePath));
        assert.equal(meta.projectId, 'openclaw-control-center');

        const list = await request(app)
            .get('/api/ide-project-summaries')
            .query({ telegramId: '-1003752539559' })
            .expect(200);
        assert.equal(list.body.files.length, 1);
        assert.equal(list.body.files[0].meta.ttgId, '-1003752539559');
        assert.equal(list.body.files[0].metaRelativePath, write.body.metaRelativePath);
        assert.equal(list.body.files[0].bridgeStatus, 'not_promoted');
    });

    it('uses persisted project mappings to resolve summary TTG binding', async () => {
        await request(app)
            .put('/api/ide-project-summaries/project-mappings')
            .send({
                projectMappings: [
                    {
                        projectId: 'openclaw-control-center',
                        repoSlug: 'openclaw-control-center',
                        ttgId: '-1003752539559',
                        label: 'General'
                    }
                ]
            })
            .expect(200);

        const write = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath: 'drafts/2026-04-24__all__openclaw-control-center__summary.md',
                text: '# Summary\n\nNo TTG in body.',
                createOnly: true,
                meta: {
                    surface: 'manual',
                    projectId: 'openclaw-control-center',
                    repoSlug: 'openclaw-control-center'
                }
            })
            .expect(200);

        assert.equal(write.body.meta.ttgId, '-1003752539559');
        assert.equal(write.body.meta.binding.status, 'confirmed');
        assert.equal(write.body.meta.binding.method, 'project_mapping');
    });

    it('uses artifact header current_ttg before project mappings on summary write', async () => {
        await request(app)
            .put('/api/ide-project-summaries/project-mappings')
            .send({
                projectMappings: [
                    {
                        projectId: 'discovery-project',
                        ttgId: '-1003752539559',
                        label: 'Project fallback'
                    }
                ]
            })
            .expect(200);

        const text = `---
initial_ttg:
  id: "-100732566515"
  name: "TTG001_Idea_Capture"
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
binding:
  status: confirmed
  method: artifact_header
---

# Discovery
`;

        const write = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath: 'drafts/2026-04-25__all__discovery-project__summary.md',
                text,
                createOnly: true,
                meta: {
                    surface: 'manual',
                    projectId: 'discovery-project'
                }
            })
            .expect(200);

        assert.equal(write.body.meta.ttgId, '-100390983368');
        assert.equal(write.body.meta.binding.status, 'confirmed');
        assert.equal(write.body.meta.binding.method, 'artifact_header');
        assert.equal(write.body.meta.binding.artifactHeader.currentTtgName, 'TTG010_General_Discovery_Plus_Research');
        assert.equal(write.body.meta.binding.artifactHeader.initialTtgId, '-100732566515');
    });

    it('exposes a read-only Studio artifact index', async () => {
        const artifactDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '050_Artifacts', 'A010_discovery-research');
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(
            path.join(artifactDir, 'index-api.md'),
            `---
id: "index-api"
title: "Index API"
type: DISCOVERY
status: active
tags: [api, index]
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
binding:
  status: confirmed
  method: artifact_header
---

# Index API
`,
            'utf8'
        );

        const res = await request(app)
            .get('/api/ide-project-summaries/artifact-index')
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.schema, 'studio-framework.artifact-index.v1');
        assert.equal(res.body.count, 1);
        assert.equal(res.body.records[0].artifact.id, 'index-api');
        assert.equal(res.body.records[0].binding.method, 'artifact_header');
        assert.equal(res.body.records[0].exportEligibility.status, 'ready');
    });

    it('builds a read-only Open Brain export payload for a Studio artifact', async () => {
        const artifactDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '050_Artifacts', 'A010_discovery-research');
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(
            path.join(artifactDir, 'ob1-export-api.md'),
            `---
id: "ob1-export-api"
title: "OB1 Export API"
type: DISCOVERY
status: active
tags: [api, open_brain]
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
project:
  id: "studio-framework"
binding:
  status: confirmed
  method: artifact_header
---

# OB1 Export API

Ready for Open Brain.
`,
            'utf8'
        );

        const res = await request(app)
            .get('/api/ide-project-summaries/open-brain-export')
            .query({
                sourcePath: '050_Artifacts/A010_discovery-research/ob1-export-api.md',
                surface: 'codex',
                model: 'gpt-5.4'
            })
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.export.schema, 'studio-framework.open-brain-export.v1');
        assert.equal(res.body.export.operation, 'upsert');
        assert.equal(res.body.export.target, 'thoughts');
        assert.equal(res.body.export.artifact.id, 'ob1-export-api');
        assert.equal(res.body.export.exportMode, 'knowledge');
        assert.equal(res.body.export.ttg.binding.method, 'artifact_header');
        assert.equal(res.body.export.ttg.current.id, '-100390983368');
        assert.equal(res.body.export.producer.surface, 'codex');
        assert.match(res.body.export.dedup.identity, /^[a-f0-9]{64}$/);
    });

    it('blocks Open Brain export payloads when a Studio artifact contains secrets', async () => {
        const artifactDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '050_Artifacts', 'A010_discovery-research');
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(
            path.join(artifactDir, 'ob1-secret.md'),
            `---
id: "ob1-secret"
title: "OB1 Secret"
type: DISCOVERY
status: active
current_ttg:
  id: "-100390983368"
---

# Secret

api_key = "sk-abcdefghijklmnopqrstuvwxyz"
`,
            'utf8'
        );

        const res = await request(app)
            .get('/api/ide-project-summaries/open-brain-export')
            .query({ sourcePath: '050_Artifacts/A010_discovery-research/ob1-secret.md' })
            .expect(400);

        assert.equal(res.body.ok, false);
        assert.match(res.body.error, /secret gate/i);
    });

    it('promote writes marker, confirms readback, and updates sidecar meta', async () => {
        const relativePath = 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md';
        await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text: '# Summary\n\nPromote me.',
                createOnly: true,
                meta: { ttgId: '-1003752539559', projectId: 'openclaw-control-center' }
            })
            .expect(200);

        const promote = await request(app)
            .post('/api/ide-project-summaries/promote')
            .send({
                dryRun: false,
                confirm: true,
                sourceRelativePath: relativePath,
                destination: 'daily',
                date: '2026-04-24'
            })
            .expect(200);

        assert.equal(promote.body.ok, true);
        assert.equal(promote.body.readbackConfirmed, true);
        assert.match(promote.body.marker, /^<!-- CM_PROMOTE_[a-f0-9]{64} -->$/);

        const memoryText = await fs.readFile(
            path.join(process.env.OPENCLAW_WORKSPACE, 'memory', '2026-04-24.md'),
            'utf8'
        );
        assert.equal(memoryText.includes(promote.body.marker), true);

        const meta = await readJson(
            path.join(
                process.env.STUDIO_FRAMEWORK_ROOT,
                '050_Artifacts',
                'A070_ide_cursor_summaries',
                promote.body.metaRelativePath
            )
        );
        assert.equal(meta.promotion.status, 'readback_confirmed');
        assert.equal(meta.promotion.target, '2026-04-24.md');
        assert.equal(meta.promotion.marker, promote.body.marker);
        assert.equal(typeof meta.promotion.lastPromotedAt, 'string');
        assert.equal(promote.body.bridgeStatus, 'readback_confirmed');
    });

    it('duplicate promote is idempotent and does not append a second block', async () => {
        const relativePath = 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md';
        await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text: '# Summary\n\nPromote once.',
                createOnly: true,
                meta: { ttgId: '-1003752539559', projectId: 'openclaw-control-center' }
            })
            .expect(200);

        const payload = {
            dryRun: false,
            confirm: true,
            sourceRelativePath: relativePath,
            destination: 'daily',
            date: '2026-04-24'
        };
        const first = await request(app).post('/api/ide-project-summaries/promote').send(payload).expect(200);
        const second = await request(app).post('/api/ide-project-summaries/promote').send(payload).expect(200);

        assert.equal(first.body.skipped, false);
        assert.equal(second.body.skipped, true);
        assert.equal(second.body.reason, 'duplicate');

        const memoryText = await fs.readFile(
            path.join(process.env.OPENCLAW_WORKSPACE, 'memory', '2026-04-24.md'),
            'utf8'
        );
        assert.equal(memoryText.split(first.body.marker).length - 1, 1);
    });

    it('blocks MEMORY.md promote without explicit acknowledgement', async () => {
        const relativePath = 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md';
        await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text: '# Summary\n\nDo not promote without ack.',
                createOnly: true,
                meta: { ttgId: '-1003752539559', projectId: 'openclaw-control-center' }
            })
            .expect(200);

        const res = await request(app)
            .post('/api/ide-project-summaries/promote')
            .send({
                dryRun: false,
                confirm: true,
                sourceRelativePath: relativePath,
                destination: 'MEMORY_MD',
                memoryMdAck: false
            })
            .expect(400);

        assert.equal(res.body.ok, false);
        assert.match(JSON.stringify(res.body), /memoryMdAck/i);
    });

    it('blocks traversal paths on summary write', async () => {
        const res = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath: '../escape.md',
                text: 'escape',
                createOnly: true
            })
            .expect(400);

        assert.equal(res.body.ok, false);
        assert.match(JSON.stringify(res.body), /relativePath|invalid relative path/i);
    });

    it('returns 404 for promote with missing source summary', async () => {
        const res = await request(app)
            .post('/api/ide-project-summaries/promote')
            .send({
                dryRun: false,
                confirm: true,
                sourceRelativePath: 'drafts/does-not-exist.md',
                destination: 'daily',
                date: '2026-04-24'
            })
            .expect(404);

        assert.equal(res.body.ok, false);
        assert.match(res.body.error, /Source summary not found: drafts\/does-not-exist\.md/);
    });

    it('does not crash when sidecar meta is broken', async () => {
        const relativePath = 'drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md';
        const write = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text: '# Summary\n\nBroken meta smoke.',
                createOnly: true,
                meta: { ttgId: '-1003752539559', projectId: 'openclaw-control-center' }
            })
            .expect(200);

        await fs.writeFile(
            path.join(
                process.env.STUDIO_FRAMEWORK_ROOT,
                '050_Artifacts',
                'A070_ide_cursor_summaries',
                write.body.metaRelativePath
            ),
            '{ definitely not json',
            'utf8'
        );

        const res = await request(app)
            .get('/api/ide-project-summaries/file')
            .query({ relative: relativePath })
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.meta, null);
        assert.equal(res.body.metaInvalid, true);
        assert.equal(res.body.bridgeStatus, 'meta_invalid');
    });
});
