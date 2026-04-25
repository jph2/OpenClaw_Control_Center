import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildIdeWorkUnit,
    computeWorkUnitStatus,
    inferTtgId,
    summaryMetaRelativePath,
    updateMetaAfterPromotion
} from '../services/ideWorkUnit.js';

describe('ideWorkUnit', () => {
    it('derives sidecar path next to markdown summary', () => {
        assert.equal(
            summaryMetaRelativePath('drafts/2026-04-24__-1003752539559__summary.md'),
            'drafts/2026-04-24__-1003752539559__summary.meta.json'
        );
    });

    it('infers telegram topic group id from path or text', () => {
        assert.equal(inferTtgId('drafts/2026-04-24__-1003752539559__summary.md'), '-1003752539559');
        assert.equal(inferTtgId('drafts/no-id.md', 'Channel -1003987722298'), '-1003987722298');
    });

    it('builds a confirmed work-unit when ttgId is explicit', () => {
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/summary.md',
            ttgId: '-1003752539559',
            channelName: 'TG000_General_Chat',
            projectId: 'OpenClaw Control Center'
        });
        assert.equal(unit.schema, 'channel-manager.ide-work-unit.v1');
        assert.equal(unit.ttgId, '-1003752539559');
        assert.equal(unit.projectId, 'openclaw-control-center');
        assert.equal(unit.binding.status, 'confirmed');
        assert.equal(computeWorkUnitStatus(unit), 'not_promoted');
    });

    it('updates status after marker read-back confirms promotion', () => {
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/summary.md',
            ttgId: '-1003752539559'
        });
        const promoted = updateMetaAfterPromotion(unit, {
            destinationRelative: '2026-04-24.md',
            marker: '<!-- CM_PROMOTE_hash -->',
            readbackConfirmed: true
        });
        assert.equal(promoted.promotion.status, 'readback_confirmed');
        assert.equal(promoted.promotion.target, '2026-04-24.md');
        assert.equal(computeWorkUnitStatus(promoted), 'readback_confirmed');
    });

    it('distinguishes invalid metadata from healthy drafts', () => {
        assert.equal(computeWorkUnitStatus(null), 'draft_saved');
        assert.equal(computeWorkUnitStatus({ __invalid: true }), 'meta_invalid');
    });
});
