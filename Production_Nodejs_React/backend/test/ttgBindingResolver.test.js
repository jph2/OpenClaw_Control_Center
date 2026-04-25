import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTtgBinding } from '../services/ttgBindingResolver.js';

describe('ttgBindingResolver', () => {
    it('confirms valid explicit TTG ids before other signals', () => {
        const res = resolveTtgBinding({
            explicitTtgId: '-1003752539559',
            projectId: 'other',
            projectMappings: [{ projectId: 'other', ttgId: '-1003987722298' }],
            pathHints: ['also mentions -1003987722298']
        });
        assert.equal(res.status, 'confirmed');
        assert.equal(res.method, 'explicit');
        assert.equal(res.ttgId, '-1003752539559');
    });

    it('confirms a single project mapping match', () => {
        const res = resolveTtgBinding({
            projectId: 'openclaw-control-center',
            projectMappings: [{ projectId: 'openclaw-control-center', ttgId: '-1003752539559' }]
        });
        assert.equal(res.status, 'confirmed');
        assert.equal(res.method, 'project_mapping');
        assert.equal(res.ttgId, '-1003752539559');
    });

    it('confirms a single path hint match', () => {
        const res = resolveTtgBinding({
            pathHints: ['drafts/2026-04-24__-1003752539559__summary.md']
        });
        assert.equal(res.status, 'confirmed');
        assert.equal(res.method, 'path_hint');
        assert.equal(res.ttgId, '-1003752539559');
    });

    it('returns unknown when no signal is usable', () => {
        const res = resolveTtgBinding({ projectId: 'nope', pathHints: ['drafts/summary.md'] });
        assert.equal(res.status, 'unknown');
        assert.equal(res.method, 'none');
        assert.equal(res.ttgId, null);
    });

    it('returns ambiguous when project mapping has multiple distinct matches', () => {
        const res = resolveTtgBinding({
            projectId: 'shared',
            projectMappings: [
                { projectId: 'shared', ttgId: '-1003752539559' },
                { projectId: 'shared', ttgId: '-1003987722298' }
            ]
        });
        assert.equal(res.status, 'ambiguous');
        assert.equal(res.method, 'project_mapping');
        assert.deepEqual(res.candidates, ['-1003752539559', '-1003987722298']);
    });

    it('returns ambiguous when path hints contain conflicting TTG ids', () => {
        const res = resolveTtgBinding({
            pathHints: ['first -1003752539559', 'second -1003987722298']
        });
        assert.equal(res.status, 'ambiguous');
        assert.equal(res.method, 'path_hint');
        assert.deepEqual(res.candidates, ['-1003752539559', '-1003987722298']);
    });

    it('treats invalid explicit TTG as unresolved instead of guessing', () => {
        const res = resolveTtgBinding({
            explicitTtgId: '-42',
            projectId: 'openclaw-control-center',
            projectMappings: [{ projectId: 'openclaw-control-center', ttgId: '-1003987722298' }],
            pathHints: ['could have -1003752539559']
        });
        assert.equal(res.status, 'unknown');
        assert.equal(res.method, 'explicit');
        assert.equal(res.ttgId, null);
    });

    it('returns ambiguous for conflicting non-explicit project and path signals', () => {
        const res = resolveTtgBinding({
            projectId: 'openclaw-control-center',
            projectMappings: [{ projectId: 'openclaw-control-center', ttgId: '-1003752539559' }],
            pathHints: ['draft for -1003987722298']
        });
        assert.equal(res.status, 'ambiguous');
        assert.equal(res.method, 'project_mapping');
        assert.equal(res.ttgId, null);
        assert.deepEqual(res.candidates, ['-1003752539559', '-1003987722298']);
    });
});
