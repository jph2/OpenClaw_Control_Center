import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOpenBrainExportRecord,
    OPEN_BRAIN_EXPORT_SCHEMA,
    OpenBrainExportBlockedError
} from '../services/openBrainExportContract.js';
import { indexMarkdownArtifact } from '../services/artifactIndex.js';

const VALID_ARTIFACT = `---
id: "ob1-export-smoke"
title: "OB1 Export Smoke"
type: DISCOVERY
status: active
tags: [open_brain, export]
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
project:
  id: "studio-framework"
  repo_slug: "Studio_Framework"
binding:
  status: confirmed
  method: artifact_header
---

# OB1 Export Smoke

Exportable body.
`;

function recordFor(markdown = VALID_ARTIFACT, sourcePath = '/studio/050_Artifacts/A010_discovery-research/ob1.md') {
    return indexMarkdownArtifact({
        studioRoot: '/studio',
        filePath: sourcePath,
        markdown
    });
}

describe('openBrainExportContract', () => {
    it('builds an OB1-ready export payload from an indexed artifact', () => {
        const record = recordFor();
        const payload = buildOpenBrainExportRecord(record, {
            markdown: VALID_ARTIFACT,
            now: '2026-04-25T12:00:00.000Z',
            producer: { surface: 'codex', agent: 'codex', model: 'gpt-5.4' }
        });

        assert.equal(payload.schema, OPEN_BRAIN_EXPORT_SCHEMA);
        assert.equal(payload.operation, 'upsert');
        assert.equal(payload.target, 'thoughts');
        assert.equal(payload.exportMode, 'knowledge');
        assert.equal(payload.knowledgeStatus, 'confirmed');
        assert.equal(payload.artifact.id, 'ob1-export-smoke');
        assert.equal(payload.source.path, '050_Artifacts/A010_discovery-research/ob1.md');
        assert.equal(payload.ttg.binding.status, 'confirmed');
        assert.equal(payload.ttg.binding.method, 'artifact_header');
        assert.equal(payload.ttg.current.id, '-100390983368');
        assert.equal(payload.producer.surface, 'codex');
        assert.match(payload.dedup.identity, /^[a-f0-9]{64}$/);
        assert.equal(payload.dedup.contentHash, record.contentHash);
        assert.equal(payload.content.markdown.includes('Exportable body.'), true);
    });

    it('rejects token-like Markdown content instead of emitting secrets', () => {
        const markdown = VALID_ARTIFACT.replace('Exportable body.', 'api_key = "sk-abcdefghijklmnopqrstuvwxyz"');
        const record = recordFor(markdown);

        assert.throws(
            () => buildOpenBrainExportRecord(record, { markdown }),
            (err) => err instanceof OpenBrainExportBlockedError && /secret gate/i.test(err.message)
        );
    });

    it('keeps dedup content hash stable from the artifact index', () => {
        const record = recordFor();
        const first = buildOpenBrainExportRecord(record, { markdown: VALID_ARTIFACT, now: '2026-04-25T12:00:00.000Z' });
        const second = buildOpenBrainExportRecord(record, { markdown: VALID_ARTIFACT, now: '2026-04-25T13:00:00.000Z' });

        assert.equal(first.dedup.contentHash, record.contentHash);
        assert.equal(second.dedup.contentHash, record.contentHash);
        assert.equal(first.dedup.identity, second.dedup.identity);
    });

    it('exports inferred or unresolved bindings as review records, not confirmed knowledge', () => {
        const markdown = `---
id: "initial-only"
type: DISCOVERY
status: active
initial_ttg:
  id: "-100732566515"
---

# Initial Only
`;
        const record = recordFor(markdown, '/studio/050_Artifacts/A010_discovery-research/initial-only.md');
        const payload = buildOpenBrainExportRecord(record, { markdown });

        assert.equal(record.binding.status, 'inferred');
        assert.equal(payload.exportMode, 'review');
        assert.equal(payload.knowledgeStatus, 'review');
        assert.equal(payload.ttg.binding.reviewState, 'needs_review');
    });

    it('keeps the schema tool-agnostic across producer surfaces', () => {
        const record = recordFor();
        const codex = buildOpenBrainExportRecord(record, { markdown: VALID_ARTIFACT, producer: { surface: 'codex' } });
        const cursor = buildOpenBrainExportRecord(record, { markdown: VALID_ARTIFACT, producer: { surface: 'cursor' } });

        assert.equal(codex.schema, cursor.schema);
        assert.equal(codex.operation, cursor.operation);
        assert.equal(codex.target, cursor.target);
        assert.equal(codex.dedup.identity, cursor.dedup.identity);
        assert.equal(cursor.producer.surface, 'cursor');
    });

    it('excludes absolute local source paths from dedup identity and source location', () => {
        const record = recordFor();
        const payload = buildOpenBrainExportRecord(record, { markdown: VALID_ARTIFACT });
        const encoded = JSON.stringify(payload.dedup);

        assert.equal(payload.source.path.startsWith('/'), false);
        assert.equal(encoded.includes('/studio'), false);
    });
});
