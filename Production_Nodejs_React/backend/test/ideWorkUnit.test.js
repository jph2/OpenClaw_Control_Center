import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertPromoteBindingAllowed,
    buildIdeWorkUnit,
    computeWorkUnitStatus,
    confirmWorkUnitRouting,
    inferTtgId,
    mergeTtgClassificationIntoMeta,
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

    it('binds discovery artifacts through current_ttg in the artifact header', () => {
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
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/discovery.md',
            text,
            projectId: 'unmapped-project',
            projectMappings: [{ projectId: 'unmapped-project', ttgId: '-1003752539559' }]
        });
        assert.equal(unit.ttgId, '-100390983368');
        assert.equal(unit.binding.status, 'confirmed');
        assert.equal(unit.binding.method, 'artifact_header');
        assert.equal(unit.binding.artifactHeader.currentTtgName, 'TTG010_General_Discovery_Plus_Research');
        assert.equal(unit.binding.artifactHeader.initialTtgId, '-100732566515');
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

    it('mergeTtgClassificationIntoMeta keeps hard binding and still attaches ttgClassification', () => {
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/summary.md',
            ttgId: '-1003752539559',
            projectId: 'x'
        });
        const merged = mergeTtgClassificationIntoMeta(unit, {
            status: 'inferred',
            method: 'agent_classification',
            ttgId: '-1003930983368',
            ttgName: 'Other',
            confidence: 0.9,
            evidence: ['test'],
            candidates: [],
            distribution: [{ ttgId: '-1003930983368', percent: 100, score: 10, evidence: [], code: '010', ttgName: 'T' }]
        });
        assert.equal(merged.ttgId, '-1003752539559');
        assert.equal(merged.binding.method, 'explicit');
        assert.equal(merged.ttgClassification.status, 'inferred');
        assert.equal(merged.routingSuggestion.ttgId, '-1003930983368');
    });

    it('mergeTtgClassificationIntoMeta records classifier output as suggestion only', () => {
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/summary.md',
            projectId: 'x'
        });
        const merged = mergeTtgClassificationIntoMeta(unit, {
            status: 'inferred',
            method: 'agent_classification',
            ttgId: '-1003930983368',
            ttgName: 'TTG010_General_Discovery_Plus_Research',
            confidence: 0.9,
            evidence: ['matched discovery'],
            candidates: [],
            distribution: [{ ttgId: '-1003930983368', percent: 100, score: 10, evidence: [], code: '010', ttgName: 'TTG010' }]
        });
        assert.equal(merged.ttgId, null);
        assert.equal(merged.binding.status, 'unknown');
        assert.equal(merged.binding.method, 'none');
        assert.equal(merged.routingSuggestion.status, 'proposed');
        assert.equal(merged.routingSuggestion.ttgId, '-1003930983368');
    });

    it('assertPromoteBindingAllowed rejects unconfirmed classifier suggestion', () => {
        assert.throws(
            () =>
                assertPromoteBindingAllowed({
                    ttgId: null,
                    binding: { status: 'unknown', method: 'none' },
                    routingSuggestion: { status: 'proposed', ttgId: '-1003752539559' }
                }),
            /no resolved TTG id/i
        );
    });

    it('assertPromoteBindingAllowed rejects future or unreviewed binding states by default', () => {
        assert.throws(
            () =>
                assertPromoteBindingAllowed({
                    ttgId: '-1003752539559',
                    binding: { status: 'trusted_by_ai', method: 'agent_classification' }
                }),
            /binding must be confirmed/i
        );
        assert.throws(
            () =>
                assertPromoteBindingAllowed({
                    ttgId: '-1003752539559',
                    binding: { status: 'needs_review', method: 'project_mapping' }
                }),
            /binding must be confirmed/i
        );
    });

    it('assertPromoteBindingAllowed allows confirmed explicit binding', () => {
        assert.doesNotThrow(() =>
            assertPromoteBindingAllowed({
                ttgId: '-1003752539559',
                binding: { status: 'confirmed', method: 'explicit' }
            })
        );
    });

    it('confirmWorkUnitRouting turns a suggestion into operator-confirmed binding', () => {
        const unit = buildIdeWorkUnit({
            summaryRelativePath: 'drafts/summary.md',
            projectId: 'x'
        });
        const withSuggestion = mergeTtgClassificationIntoMeta(unit, {
            status: 'inferred',
            method: 'agent_classification',
            ttgId: '-1003930983368',
            ttgName: 'TTG010_General_Discovery_Plus_Research',
            confidence: 0.9,
            evidence: [],
            candidates: [],
            distribution: []
        });
        const confirmed = confirmWorkUnitRouting(withSuggestion, {
            ttgId: '-1003930983368',
            ttgName: 'TTG010_General_Discovery_Plus_Research'
        });
        assert.equal(confirmed.ttgId, '-1003930983368');
        assert.equal(confirmed.binding.status, 'confirmed');
        assert.equal(confirmed.binding.method, 'operator_confirmed');
        assert.equal(confirmed.routingSuggestion.status, 'accepted');
        assert.doesNotThrow(() => assertPromoteBindingAllowed(confirmed));
    });
});
