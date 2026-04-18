import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard for ADR-017 (Local LLMs: providers ≠ aliases).
 *
 * The previous default `local-pc/google/gemma-4-26b-a4b` referenced a
 * non-existent provider. The OpenClaw gateway silently failed over to
 * `moonshot/kimi-k2.5` for those channels, which masked the misconfig.
 * The canonical local-LLM slug is now `lmstudio/google/gemma-4-26b-a4b`
 * (the `lmstudio` provider declared in `~/.openclaw/openclaw.json`).
 *
 * These tests scan the route source for the bad slug and confirm the
 * good one is still present in at least the row-create fallback.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_ROUTE_PATH = path.resolve(HERE, '../routes/channels.js');
const FORBIDDEN_SLUG = 'local-pc/google/gemma-4-26b-a4b';
const CANONICAL_SLUG = 'lmstudio/google/gemma-4-26b-a4b';

describe('channels.js local-model default (ADR-017)', () => {
    it('does not reference the legacy `local-pc/...` slug anywhere', () => {
        const src = fs.readFileSync(CHANNELS_ROUTE_PATH, 'utf8');
        const hits = src.split('\n').reduce((acc, line, idx) => {
            if (line.includes(FORBIDDEN_SLUG)) acc.push(`L${idx + 1}: ${line.trim()}`);
            return acc;
        }, []);
        assert.equal(
            hits.length,
            0,
            `Found legacy slug "${FORBIDDEN_SLUG}" in channels.js — would silently fall back to Kimi:\n  ${hits.join('\n  ')}`
        );
    });

    it('uses the canonical `lmstudio/...` slug in at least one default fallback', () => {
        const src = fs.readFileSync(CHANNELS_ROUTE_PATH, 'utf8');
        assert.ok(
            src.includes(CANONICAL_SLUG),
            `channels.js must default new/orphan rows to "${CANONICAL_SLUG}" (see ADR-017).`
        );
    });
});
