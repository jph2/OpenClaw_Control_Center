import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractMarkdownFrontmatter,
    parseArtifactHeaderBinding,
    parseSimpleYamlFrontmatter
} from '../services/artifactHeaderBinding.js';

const DISCOVERY_MARKDOWN = `---
arys_schema_version: "1.2"
id: "20260424-discovery-example"
title: "Example Discovery"
initial_ttg:
  id: "-100732566515"
  name: "TTG001_Idea_Capture"
  reason: "Initial capture"
current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
  reason: "Active discovery"
project:
  id: ""
  repo_slug: ""
binding:
  status: confirmed
  method: artifact_header
---

# Example
`;

describe('artifactHeaderBinding', () => {
    it('extracts markdown frontmatter without consuming body', () => {
        const res = extractMarkdownFrontmatter(DISCOVERY_MARKDOWN);
        assert.equal(res.hasFrontmatter, true);
        assert.match(res.frontmatter, /current_ttg:/);
        assert.match(res.body, /# Example/);
    });

    it('parses the simple YAML shape used by Studio discovery headers', () => {
        const { frontmatter } = extractMarkdownFrontmatter(DISCOVERY_MARKDOWN);
        const parsed = parseSimpleYamlFrontmatter(frontmatter);
        assert.equal(parsed.current_ttg.id, '-100390983368');
        assert.equal(parsed.current_ttg.name, 'TTG010_General_Discovery_Plus_Research');
        assert.equal(parsed.binding.method, 'artifact_header');
    });

    it('returns current_ttg as the operative binding and initial_ttg as history', () => {
        const parsed = parseArtifactHeaderBinding(DISCOVERY_MARKDOWN);
        assert.equal(parsed.hasHeader, true);
        assert.equal(parsed.currentTtgId, '-100390983368');
        assert.equal(parsed.initialTtgId, '-100732566515');
        assert.equal(parsed.hasValidCurrentTtg, true);
        assert.equal(parsed.current.name, 'TTG010_General_Discovery_Plus_Research');
    });

    it('handles markdown without frontmatter', () => {
        const parsed = parseArtifactHeaderBinding('# No header');
        assert.equal(parsed.hasHeader, false);
        assert.equal(parsed.currentTtgId, '');
    });
});
