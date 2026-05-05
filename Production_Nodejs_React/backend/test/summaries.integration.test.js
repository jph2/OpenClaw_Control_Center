import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import app from '../index.js';

/** Create a minimal Cursor-like state.vscdb without better-sqlite3 (avoids native rebuild mismatch in tests). */
function writeMinimalStateVscdb(dbPath) {
    const sql = [
        'CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);',
        `INSERT INTO ItemTable VALUES ('aiService.prompts', '${JSON.stringify({ prompts: [1] }).replace(/'/g, "''")}');`,
        `INSERT INTO ItemTable VALUES ('workbench.panel.aichat.view.aichat.chatdata', '${JSON.stringify({ chats: [] }).replace(/'/g, "''")}');`
    ].join('\n');
    execFileSync('sqlite3', [dbPath, sql], { stdio: 'pipe' });
}

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

    it('confirms a reviewable artifact binding by writing current_ttg into the artifact header', async () => {
        const artifactDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '050_Artifacts', 'A010_discovery-research');
        await fs.mkdir(artifactDir, { recursive: true });
        const sourcePath = '050_Artifacts/A010_discovery-research/confirm-binding.md';
        await fs.writeFile(
            path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath),
            `---
id: "confirm-binding"
title: "Confirm Binding"
type: DISCOVERY
status: active
---

# Confirm Binding

Structured discovery and research.
`,
            'utf8'
        );

        const res = await request(app)
            .post('/api/ide-project-summaries/artifact-binding/confirm')
            .send({
                sourcePath,
                ttgId: '-1003930983368',
                ttgName: 'TTG010_General_Discovery_Plus_Research',
                reason: 'operator accepted classifier proposal'
            })
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.record.binding.status, 'confirmed');
        assert.equal(res.body.record.binding.method, 'artifact_header');
        assert.equal(res.body.record.ttg.current.id, '-1003930983368');
        const updated = await fs.readFile(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath), 'utf8');
        assert.match(updated, /current_ttg:/);
        assert.match(updated, /operator accepted classifier proposal/);
    });

    it('open-brain-sync dryRun returns export without writing audit', async () => {
        const sourcePath = '050_Artifacts/A010_discovery-research/ob1-sync-dry.md';
        await fs.mkdir(path.dirname(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath)), { recursive: true });
        await fs.writeFile(
            path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath),
            `---
id: "ob1-sync-dry"
title: "OB1 Sync Dry"
type: DISCOVERY
status: active
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
binding:
  status: confirmed
  method: artifact_header
---

# Body
`,
            'utf8'
        );

        const res = await request(app)
            .post('/api/ide-project-summaries/open-brain-sync')
            .send({ sourcePath, dryRun: true })
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.dryRun, true);
        assert.equal(res.body.export?.schema, 'studio-framework.open-brain-export.v1');
    });

    it('open-brain-sync stub records audit and artifact-index shows synced', async () => {
        const sourcePath = '050_Artifacts/A010_discovery-research/ob1-sync-stub.md';
        await fs.mkdir(path.dirname(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath)), { recursive: true });
        await fs.writeFile(
            path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath),
            `---
id: "ob1-sync-stub"
title: "OB1 Sync Stub"
type: DISCOVERY
status: active
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
binding:
  status: confirmed
  method: artifact_header
---

# Stub sync body
`,
            'utf8'
        );

        const sync = await request(app)
            .post('/api/ide-project-summaries/open-brain-sync')
            .send({ sourcePath, dryRun: false, confirm: true, surface: 'manual' })
            .expect(200);

        assert.equal(sync.body.ok, true);
        assert.equal(sync.body.synced, true);
        assert.equal(sync.body.provider, 'stub');
        assert.match(sync.body.thoughtId, /^stub-[a-f0-9]{32}$/);

        const idx = await request(app)
            .get('/api/ide-project-summaries/artifact-index')
            .expect(200);

        const rec = idx.body.records.find((r) => r.sourcePath === sourcePath);
        assert.ok(rec);
        assert.equal(rec.openBrain.syncStatus, 'synced');
        assert.equal(rec.openBrain.thoughtId, sync.body.thoughtId);
    });

    it('studio-artifact-file returns markdown for a Studio path', async () => {
        const sourcePath = '050_Artifacts/A010_discovery-research/studio-file-read.md';
        await fs.mkdir(path.dirname(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath)), {
            recursive: true
        });
        const md = '---\nid: x\ntitle: T\ntype: DISCOVERY\nstatus: active\n---\n\n# Hello\n';
        await fs.writeFile(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath), md, 'utf8');

        const res = await request(app)
            .get('/api/ide-project-summaries/studio-artifact-file')
            .query({ sourcePath })
            .expect(200);

        assert.equal(res.body.ok, true);
        assert.equal(res.body.sourcePath, sourcePath);
        assert.equal(res.body.text, md);
    });

    it('open-brain-sync http provider posts export and records audit', async () => {
        const sourcePath = '050_Artifacts/A010_discovery-research/ob1-sync-http.md';
        const prevFetch = globalThis.fetch;
        process.env.OPEN_BRAIN_SYNC_PROVIDER = 'http';
        process.env.OPEN_BRAIN_SYNC_URL = 'https://example.test/open-brain/upsert';

        await fs.mkdir(path.dirname(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath)), {
            recursive: true
        });
        await fs.writeFile(
            path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath),
            `---
id: "ob1-sync-http"
title: "OB1 Sync HTTP"
type: DISCOVERY
status: active
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
binding:
  status: confirmed
  method: artifact_header
---

# HTTP sync body
`,
            'utf8'
        );

        try {
            globalThis.fetch = async (url, opts) => {
                assert.equal(url, 'https://example.test/open-brain/upsert');
                assert.equal(opts.method, 'POST');
                const body = JSON.parse(opts.body);
                assert.equal(body.schema, 'studio-framework.open-brain-export.v1');
                assert.equal(body.operation, 'upsert');
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ thoughtId: 'remote-thought-abc' })
                };
            };

            const sync = await request(app)
                .post('/api/ide-project-summaries/open-brain-sync')
                .send({ sourcePath, dryRun: false, confirm: true, surface: 'manual' })
                .expect(200);

            assert.equal(sync.body.ok, true);
            assert.equal(sync.body.provider, 'http');
            assert.equal(sync.body.thoughtId, 'remote-thought-abc');

            const idx = await request(app).get('/api/ide-project-summaries/artifact-index').expect(200);
            assert.equal(idx.body.openBrainSync.provider, 'http');
            assert.equal(idx.body.openBrainSync.httpConfigured, true);
            const rec = idx.body.records.find((r) => r.sourcePath === sourcePath);
            assert.ok(rec);
            assert.equal(rec.openBrain.syncStatus, 'synced');
            assert.equal(rec.openBrain.thoughtId, 'remote-thought-abc');
        } finally {
            globalThis.fetch = prevFetch;
            delete process.env.OPEN_BRAIN_SYNC_PROVIDER;
            delete process.env.OPEN_BRAIN_SYNC_URL;
        }
    });

    it('open-brain-sync rejects artifacts that are not export-eligible', async () => {
        const sourcePath = '050_Artifacts/A010_discovery-research/ob1-sync-ineligible.md';
        await fs.mkdir(path.dirname(path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath)), { recursive: true });
        await fs.writeFile(
            path.join(process.env.STUDIO_FRAMEWORK_ROOT, sourcePath),
            `---
id: "ob1-sync-ineligible"
title: "Ineligible"
type: DISCOVERY
status: active
---

# No TTG
`,
            'utf8'
        );

        const res = await request(app)
            .post('/api/ide-project-summaries/open-brain-sync')
            .send({ sourcePath, dryRun: true })
            .expect(400);

        assert.equal(res.body.ok, false);
        assert.match(res.body.error, /not eligible/i);
    });

    it('blocks promote when routing is only an agent suggestion (must confirm TTG first)', async () => {
        const cfgPath = path.join(tmpRoot, 'OpenClaw_Control_Center', 'Prototyp', 'channel_CHAT-manager', 'channel_config.json');
        await fs.writeFile(
            cfgPath,
            JSON.stringify(
                {
                    channels: [{ id: '-1003930983368', name: 'TTG010_General_Discovery_Plus_Research' }],
                    agents: [],
                    subAgents: [],
                    projectMappings: []
                },
                null,
                2
            ),
            'utf8'
        );
        const ttgDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '000_TelegramTopicGroups_Def');
        await fs.mkdir(ttgDir, { recursive: true });
        await fs.writeFile(
            path.join(ttgDir, 'TTG010_General_Discovery_Plus_Research.md'),
            `---
title: TTG010 General Discovery
tags: [discovery, research, analysis]
---

# Discovery lane
`,
            'utf8'
        );

        const relativePath = 'drafts/2026-04-27__all__solo-proj__summary.md';
        const text = '# Note\n\nStructured discovery and research with analysis for the API.';
        const write = await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text,
                createOnly: true,
                meta: { surface: 'manual', projectId: 'solo-proj' }
            })
            .expect(200);

        assert.equal(write.body.meta.binding.status, 'unknown');
        assert.equal(write.body.meta.binding.method, 'none');
        assert.equal(write.body.meta.ttgId, null);
        assert.equal(write.body.meta.routingSuggestion.status, 'proposed');
        assert.equal(write.body.meta.routingSuggestion.ttgId, '-1003930983368');
        assert.ok(write.body.meta.ttgClassification?.distribution?.length > 0);

        const res = await request(app)
            .post('/api/ide-project-summaries/promote')
            .send({
                dryRun: true,
                confirm: false,
                sourceRelativePath: relativePath,
                destination: 'daily',
                date: '2026-04-27'
            })
            .expect(400);

        assert.equal(res.body.ok, false);
        assert.match(res.body.error, /Promotion blocked/i);
        assert.match(res.body.error, /no resolved TTG id|confirmed/i);
    });

    it('confirms a summary routing suggestion before promotion', async () => {
        const cfgPath = path.join(tmpRoot, 'OpenClaw_Control_Center', 'Prototyp', 'channel_CHAT-manager', 'channel_config.json');
        await fs.writeFile(
            cfgPath,
            JSON.stringify(
                {
                    channels: [{ id: '-1003930983368', name: 'TTG010_General_Discovery_Plus_Research' }],
                    agents: [],
                    subAgents: [],
                    projectMappings: []
                },
                null,
                2
            ),
            'utf8'
        );
        const ttgDir = path.join(process.env.STUDIO_FRAMEWORK_ROOT, '000_TelegramTopicGroups_Def');
        await fs.mkdir(ttgDir, { recursive: true });
        await fs.writeFile(
            path.join(ttgDir, 'TTG010_General_Discovery_Plus_Research.md'),
            `---
title: TTG010 General Discovery
tags: [discovery, research, analysis]
---

# Discovery lane
`,
            'utf8'
        );

        const relativePath = 'drafts/2026-04-27__all__confirm-suggestion__summary.md';
        await request(app)
            .post('/api/ide-project-summaries')
            .send({
                relativePath,
                text: '# Note\n\nStructured discovery and research with analysis for the API.',
                createOnly: true,
                meta: { surface: 'manual', projectId: 'confirm-suggestion' }
            })
            .expect(200);

        const confirm = await request(app)
            .post('/api/ide-project-summaries/routing/confirm')
            .send({
                sourceRelativePath: relativePath,
                ttgId: '-1003930983368',
                ttgName: 'TTG010_General_Discovery_Plus_Research',
                reason: 'operator accepted routing suggestion'
            })
            .expect(200);

        assert.equal(confirm.body.meta.ttgId, '-1003930983368');
        assert.equal(confirm.body.meta.binding.status, 'confirmed');
        assert.equal(confirm.body.meta.binding.method, 'operator_confirmed');
        assert.equal(confirm.body.meta.routingSuggestion.status, 'accepted');
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

    it('GET capture/status and POST capture/run write capture/ snapshots from Cursor workspaceStorage', async () => {
        let oldCur;
        let oldIde;
        try {
            try {
                execFileSync('sqlite3', ['-version'], { stdio: 'pipe' });
            } catch {
                return;
            }

            oldCur = process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            oldIde = process.env.IDE_CAPTURE_ENABLED;

            const wsRoot = path.join(tmpRoot, 'fake-cursor-workspaceStorage');
            await fs.mkdir(wsRoot, { recursive: true });
            const wid = 'testws0001';
            const folder = path.join(wsRoot, wid);
            await fs.mkdir(folder, { recursive: true });
            writeMinimalStateVscdb(path.join(folder, 'state.vscdb'));

            process.env.CURSOR_WORKSPACE_STORAGE_ROOT = wsRoot;
            delete process.env.IDE_CAPTURE_ENABLED;

            const st = await request(app).get('/api/ide-project-summaries/capture/status').expect(200);
            assert.equal(st.body.enabled, true);
            assert.equal(st.body.workspaceRootExists, true);
            assert.equal(typeof st.body.remoteMount, 'object');
            assert.equal(st.body.remoteMount.scriptConfigured, false);
            assert.equal(typeof st.body.simpleMountEnabled, 'boolean');
            assert.equal(typeof st.body.ensurePathEnabled, 'boolean');
            assert.equal(st.body.workspacePathDiagnostics, null);

            const run1 = await request(app).post('/api/ide-project-summaries/capture/run').send({ force: false }).expect(200);
            assert.equal(run1.body.ok, true);
            const ok1 = run1.body.results.filter((r) => r.outcome === 'ok');
            assert.ok(ok1.length >= 1);
            assert.ok(ok1.some((r) => r.workspaceStorageId === wid));

            const run2 = await request(app).post('/api/ide-project-summaries/capture/run').send({ force: false }).expect(200);
            assert.ok(run2.body.results.every((r) => r.outcome === 'skipped_no_change'));

            const run3 = await request(app).post('/api/ide-project-summaries/capture/run').send({ force: true }).expect(200);
            assert.ok(run3.body.results.some((r) => r.outcome === 'ok'));

            process.env.IDE_CAPTURE_ENABLED = 'false';
            const blocked = await request(app).post('/api/ide-project-summaries/capture/run').send({}).expect(403);
            assert.equal(blocked.body.ok, false);
        } finally {
            if (oldCur === undefined) delete process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            else process.env.CURSOR_WORKSPACE_STORAGE_ROOT = oldCur;
            if (oldIde === undefined) delete process.env.IDE_CAPTURE_ENABLED;
            else process.env.IDE_CAPTURE_ENABLED = oldIde;
        }
    });

    it('POST capture/settings persists workspaceStorageRoot and GET status reports source settings', async () => {
        let oldCur;
        try {
            oldCur = process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            delete process.env.CURSOR_WORKSPACE_STORAGE_ROOT;

            const savedRoot = path.join(tmpRoot, 'operator-workspace-storage');
            await fs.mkdir(savedRoot, { recursive: true });

            const save = await request(app)
                .post('/api/ide-project-summaries/capture/settings')
                .send({ workspaceStorageRoot: savedRoot })
                .expect(200);
            assert.equal(save.body.ok, true);
            assert.equal(save.body.workspaceStorageRoot, savedRoot);

            const st = await request(app).get('/api/ide-project-summaries/capture/status').expect(200);
            assert.equal(st.body.workspaceRootSource, 'settings');
            assert.equal(st.body.workspaceRoot, path.resolve(savedRoot));
            assert.equal(st.body.workspaceRootExists, true);

            await request(app)
                .post('/api/ide-project-summaries/capture/settings')
                .send({ workspaceStorageRoot: null })
                .expect(200);
            const st2 = await request(app).get('/api/ide-project-summaries/capture/status').expect(200);
            assert.equal(st2.body.workspaceRootSource, 'default');
        } finally {
            if (oldCur === undefined) delete process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            else process.env.CURSOR_WORKSPACE_STORAGE_ROOT = oldCur;
        }
    });

    it('POST capture/settings accepts Windows path when API is on Linux (WSL-style mapping)', async () => {
        if (process.platform === 'win32') return;
        let oldCur;
        try {
            oldCur = process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            delete process.env.CURSOR_WORKSPACE_STORAGE_ROOT;

            const winPath = 'C:\\Users\\jan\\AppData\\Roaming\\Cursor\\User\\workspaceStorage';
            await request(app)
                .post('/api/ide-project-summaries/capture/settings')
                .send({ workspaceStorageRoot: winPath })
                .expect(200);

            const st = await request(app).get('/api/ide-project-summaries/capture/status').expect(200);
            assert.equal(st.body.workspaceRootSource, 'settings');
            assert.equal(st.body.savedWorkspaceStorageRoot, winPath);
            assert.ok(
                st.body.workspaceRoot.startsWith('/mnt/c/'),
                `expected WSL-style path, got ${st.body.workspaceRoot}`
            );
            assert.equal(st.body.pathMappingApplied, true);

            await request(app)
                .post('/api/ide-project-summaries/capture/settings')
                .send({ workspaceStorageRoot: null })
                .expect(200);
        } finally {
            if (oldCur === undefined) delete process.env.CURSOR_WORKSPACE_STORAGE_ROOT;
            else process.env.CURSOR_WORKSPACE_STORAGE_ROOT = oldCur;
        }
    });

    it('POST capture/mount runs IDE_CAPTURE_REMOTE_MOUNT_SCRIPT when configured', async () => {
        let oldHook;
        try {
            oldHook = process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT;
            const hook = path.join(tmpRoot, 'mount-hook.sh');
            await fs.writeFile(hook, '#!/bin/sh\necho "action=$1"\nexit 0\n', 'utf8');
            await fs.chmod(hook, 0o755);
            process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT = hook;

            const r = await request(app).post('/api/ide-project-summaries/capture/mount').send({ action: 'status' }).expect(200);
            assert.equal(r.body.ok, true);
            assert.match(String(r.body.stdout || ''), /action=status/);
        } finally {
            if (oldHook === undefined) delete process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT;
            else process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT = oldHook;
        }
    });

    it('POST capture/mount returns 400 when hook script is not configured', async () => {
        let oldHook;
        try {
            oldHook = process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT;
            delete process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT;
            const r = await request(app).post('/api/ide-project-summaries/capture/mount').send({ action: 'mount' }).expect(400);
            assert.equal(r.body.ok, false);
        } finally {
            if (oldHook === undefined) delete process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT;
            else process.env.IDE_CAPTURE_REMOTE_MOUNT_SCRIPT = oldHook;
        }
    });

    it('POST capture/mount/simple returns 403 when simple mount is disabled', async () => {
        let old;
        try {
            old = process.env.IDE_CAPTURE_SIMPLE_MOUNT;
            process.env.IDE_CAPTURE_SIMPLE_MOUNT = 'false';
            const r = await request(app)
                .post('/api/ide-project-summaries/capture/mount/simple')
                .send({
                    action: 'mount',
                    host: '127.0.0.1',
                    share: 'x',
                    username: 'u',
                    password: 'p',
                    mountPoint: '/media/x'
                })
                .expect(403);
            assert.equal(r.body.ok, false);
        } finally {
            if (old === undefined) delete process.env.IDE_CAPTURE_SIMPLE_MOUNT;
            else process.env.IDE_CAPTURE_SIMPLE_MOUNT = old;
        }
    });

    it('POST capture/mount/simple returns 400 for invalid host when enabled', async () => {
        if (process.platform === 'win32') return;
        let old;
        let oldPref;
        try {
            old = process.env.IDE_CAPTURE_SIMPLE_MOUNT;
            oldPref = process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES;
            process.env.IDE_CAPTURE_SIMPLE_MOUNT = 'true';
            process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES = tmpRoot;
            const mp = path.join(tmpRoot, 'smb-mp');
            const r = await request(app)
                .post('/api/ide-project-summaries/capture/mount/simple')
                .send({
                    action: 'mount',
                    host: 'bad;host',
                    share: 'Users',
                    username: 'u',
                    password: 'p',
                    mountPoint: mp
                })
                .expect(400);
            assert.equal(r.body.ok, false);
        } finally {
            if (old === undefined) delete process.env.IDE_CAPTURE_SIMPLE_MOUNT;
            else process.env.IDE_CAPTURE_SIMPLE_MOUNT = old;
            if (oldPref === undefined) delete process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES;
            else process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES = oldPref;
        }
    });

    it('POST capture/ensure-path mkdir -p under allowed prefix', async () => {
        if (process.platform === 'win32') return;
        let oldPref;
        let oldEnsure;
        try {
            oldPref = process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES;
            oldEnsure = process.env.IDE_CAPTURE_ENSURE_PATH;
            process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES = tmpRoot;
            delete process.env.IDE_CAPTURE_ENSURE_PATH;
            const deep = path.join(tmpRoot, 'ensure-ws', 'nested', 'workspaceStorage');
            const r = await request(app)
                .post('/api/ide-project-summaries/capture/ensure-path')
                .send({ path: deep })
                .expect(200);
            assert.equal(r.body.ok, true);
            assert.equal(r.body.ensuredPathExists, true);
            assert.equal(r.body.path, deep);
            const st = await fs.stat(deep);
            assert.ok(st.isDirectory());
        } finally {
            if (oldPref === undefined) delete process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES;
            else process.env.IDE_CAPTURE_SIMPLE_MOUNT_PREFIXES = oldPref;
            if (oldEnsure === undefined) delete process.env.IDE_CAPTURE_ENSURE_PATH;
            else process.env.IDE_CAPTURE_ENSURE_PATH = oldEnsure;
        }
    });
});
