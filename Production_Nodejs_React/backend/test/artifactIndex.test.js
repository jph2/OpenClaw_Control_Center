import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    buildArtifactIndex,
    detectSecretLikeContent,
    indexMarkdownArtifact,
    normalizeMarkdownBody
} from '../services/artifactIndex.js';

const VALID_DISCOVERY = `---
id: "20260425-discovery-index-smoke"
title: "Index Smoke"
type: DISCOVERY
status: active
created: "2026-04-25T00:00:00+02:00"
last_modified: "2026-04-25T01:00:00+02:00"
tags: [studio_framework, discovery, index]
initial_ttg:
  id: "-100732566515"
  name: "TTG001_Idea_Capture"
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

# Index Smoke

Body.
`;

describe('artifactIndex', () => {
    it('indexes a Discovery artifact with TTG header metadata', () => {
        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/index-smoke.md',
            markdown: VALID_DISCOVERY
        });

        assert.equal(record.schema, 'studio-framework.artifact-index.v1');
        assert.equal(record.artifact.id, '20260425-discovery-index-smoke');
        assert.equal(record.artifact.type, 'DISCOVERY');
        assert.deepEqual(record.artifact.tags, ['studio_framework', 'discovery', 'index']);
        assert.equal(record.sourcePath, '050_Artifacts/A010_discovery-research/index-smoke.md');
        assert.equal(record.ttg.current.id, '-100390983368');
        assert.equal(record.binding.status, 'confirmed');
        assert.equal(record.binding.method, 'artifact_header');
        assert.equal(record.header.status, 'valid');
        assert.equal(record.exportEligibility.status, 'ready');
        assert.match(record.contentHash, /^[a-f0-9]{64}$/);
    });

    it('marks missing headers as needs_review without guessing truth', () => {
        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/no-header.md',
            markdown: '# No Header\n'
        });

        assert.equal(record.header.status, 'missing');
        assert.equal(record.binding.status, 'unknown');
        assert.equal(record.exportEligibility.status, 'needs_review');
    });

    it('can attach agent classification evidence as routing suggestion for unbound artifacts', () => {
        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/no-header.md',
            markdown: '# Research note\n\nStructured discovery and research for Open Brain.',
            ttgDefinitions: [
                {
                    code: '010',
                    ttgId: '-1003930983368',
                    ttgName: 'TTG010_General_Discovery_Plus_Research',
                    tokens: ['discovery', 'research', 'structured']
                }
            ]
        });

        assert.equal(record.binding.method, 'none');
        assert.equal(record.binding.status, 'unknown');
        assert.equal(record.binding.ttgId, null);
        assert.equal(record.ttg.current, null);
        assert.equal(record.routingSuggestion.status, 'proposed');
        assert.equal(record.routingSuggestion.ttgId, '-1003930983368');
        assert.equal(record.classificationEvidence.method, 'agent_classification');
        assert.equal(record.exportEligibility.status, 'needs_review');
    });

    it('keeps confirmed artifact headers ahead of classification', () => {
        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/header-wins.md',
            markdown: VALID_DISCOVERY,
            ttgDefinitions: [
                {
                    code: '001',
                    ttgId: '-1003732566515',
                    ttgName: 'TTG001_Idea_Capture',
                    tokens: ['idea', 'brainstorming']
                }
            ]
        });

        assert.equal(record.binding.status, 'confirmed');
        assert.equal(record.binding.method, 'artifact_header');
        assert.equal(record.binding.ttgId, '-100390983368');
        assert.equal(record.classificationEvidence, null);
    });

    it('uses initial_ttg only as inferred fallback when current_ttg is missing', () => {
        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/initial-only.md',
            markdown: `---
id: "initial-only"
type: DISCOVERY
status: active
initial_ttg:
  id: "-100732566515"
---

# Initial Only
`
        });

        assert.equal(record.binding.status, 'inferred');
        assert.equal(record.binding.method, 'artifact_header');
        assert.equal(record.binding.ttgId, '-100732566515');
        assert.equal(record.exportEligibility.status, 'needs_review');
    });

    it('normalizes Markdown body before hashing', () => {
        assert.equal(normalizeMarkdownBody('# A\r\n\r\n\r\nText   \r\n'), '# A\n\nText');
    });

    it('keeps content hash stable across volatile timestamps', () => {
        const first = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/hash.md',
            markdown: VALID_DISCOVERY
        });
        const second = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/hash.md',
            markdown: VALID_DISCOVERY.replace('2026-04-25T01:00:00+02:00', '2026-04-25T02:00:00+02:00')
        });
        assert.equal(second.contentHash, first.contentHash);
    });

    it('changes content hash when meaningful content changes', () => {
        const first = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/hash.md',
            markdown: VALID_DISCOVERY
        });
        const second = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/hash.md',
            markdown: VALID_DISCOVERY.replace('Body.', 'Changed body.')
        });
        assert.notEqual(second.contentHash, first.contentHash);
    });

    it('blocks export eligibility for token-like content', () => {
        const secret = detectSecretLikeContent('api_key = "sk-abcdefghijklmnopqrstuvwxyz"', '050_Artifacts/secret.md');
        assert.equal(secret.status, 'blocked');

        const record = indexMarkdownArtifact({
            studioRoot: '/studio',
            filePath: '/studio/050_Artifacts/A010_discovery-research/secret.md',
            markdown: VALID_DISCOVERY.replace('Body.', 'api_key = "sk-abcdefghijklmnopqrstuvwxyz"')
        });
        assert.equal(record.secretGate.status, 'blocked');
        assert.equal(record.exportEligibility.status, 'blocked');
    });

    it('builds an index by walking configured Studio artifact roots', async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-index-'));
        try {
            const dir = path.join(tmp, '050_Artifacts', 'A010_discovery-research');
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(path.join(dir, 'one.md'), VALID_DISCOVERY, 'utf8');
            await fs.writeFile(path.join(dir, 'two.md'), '# Missing Header\n', 'utf8');

            const index = await buildArtifactIndex({ studioRoot: tmp });
            assert.equal(index.schema, 'studio-framework.artifact-index.v1');
            assert.equal(index.count, 2);
            assert.deepEqual(index.records.map((r) => r.sourcePath), [
                '050_Artifacts/A010_discovery-research/one.md',
                '050_Artifacts/A010_discovery-research/two.md'
            ]);
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });
});
