# SPEC 8b.5 - TARS in IDE / IDE Memory Bridge

Date: 2026-04-24 (§15 capture pipeline: 2026-04-26)
Status: Draft for implementation
Owner surface: Channel Manager, third TTG workspace tab
QA checklist: `QA_8B5_IDE_MEMORY_BRIDGE.md`
Open Brain guardrail: `SPEC_OPEN_BRAIN_BOUNDARY_CONDITIONS.md`

## 1. Intent

The third Channel Manager tab is a bridge and ledger between IDE work and
OpenClaw memory. It is not a second chat UI and not a hidden memory writer.

Canonical flow:

```text
IDE/Codex work
  -> canonical work-unit contract
  -> Studio summary artifact in A070_ide_cursor_summaries
  -> explicit promotion
  -> OpenClaw memory read-back
```

The purpose of this slice is to prevent split-brain context between Cursor,
Codex, Channel Manager, TTG routing, and OpenClaw memory.

For project work, the work-unit usually binds through a stable project mapping.
For discovery/research before a project exists, the work-unit should bind
through the artifact header itself.

Open Brain integration changes the center of gravity: the durable truth is the
Studio artifact, not the producer surface. Codex, Cursor, OpenCode, Telegram,
and chat are producers that may create/update artifacts. They are not separate
memory authorities. See `SPEC_OPEN_BRAIN_BOUNDARY_CONDITIONS.md`.

## 2. Non-Goals

- Do not mirror full IDE transcripts into Channel Manager.
- Do not create another chat surface.
- Do not silently mutate `MEMORY.md`, `memory/*.md`, TTG bindings, identity, or
  auth state.
- Do not build Cursor-only or Codex-only logic. Use adapters that normalize into
  the same work-unit contract.
- Do not make producer adapters the source of truth. They feed artifacts.
- Do not sync secrets or unreviewed inferred bindings into Open Brain.
- Do not add topology/graph visualization in this slice. That is §8b.7.

## 3. Existing Building Blocks

Already available:

- `GET /api/ide-project-summaries`
- `GET /api/ide-project-summaries/file`
- `POST /api/ide-project-summaries`
- `GET /api/ide-project-summaries/memory`
- `GET /api/ide-project-summaries/memory/file`
- `POST /api/ide-project-summaries/promote`
- `IdeProjectSummaryPanel.jsx`
- `MemoryPromoteModal.jsx`
- `memoryPromote.js` with marker-based dedup/audit behavior

This slice hardens and unifies these pieces; it is not a greenfield feature.

## 4. Canonical Work-Unit Contract

Every IDE work unit normalized into the bridge must carry this shape:

```json
{
  "surface": "cursor|codex|unknown",
  "projectRoot": "/canonical/project/path",
  "projectId": "stable-project-slug",
  "repo": {
    "slug": "openclaw-control-center",
    "remote": "git@github.com:jph2/OpenClaw_Control_Center.git",
    "head": "optional-git-sha"
  },
  "ttgId": "-1003752539559",
  "summaryPath": "drafts/2026-04-24__-1003752539559__openclaw-control-center__summary.md",
  "source": {
    "sessionId": "optional-source-session-id",
    "operator": "Jan",
    "model": "optional-model-id",
    "agent": "codex|cursor|tars|unknown",
    "createdAt": "2026-04-24T19:00:00.000Z"
  },
  "promotion": {
    "target": "memory/2026-04-24.md",
    "status": "not_promoted|promoted|readback_confirmed|stale|unknown|failed",
    "lastPromotedAt": null,
    "marker": null
  },
  "binding": {
    "status": "confirmed|inferred|needs_review|ambiguous|unknown|blocked",
    "method": "explicit|artifact_header|project_mapping|agent_classification|ide_metadata|path_fallback|none"
  }
}
```

Rules:

- `ttgId` is explicit whenever possible.
- `projectId` must be stable across mounts/symlinks where possible.
- `projectRoot` is useful for humans but not enough as identity.
- `confirmed` requires durable evidence: explicit human selection, artifact
  header, project mapping, or a previously reviewed governed record.
- `inferred` and `needs_review` are never treated as confirmed truth.
- If binding is `ambiguous`, `unknown`, or `blocked`, the UI must stop and ask
  for explicit selection or remediation before promote/sync.
- Human confirmation must materialize in a durable artifact-owned or governed
  record. Preferred target: artifact header. Fallback: governed sidecar or
  mapping registry. Ephemeral UI state, chat text, or transient adapter metadata
  are never sufficient alone.

## 5. A070_ide_cursor_summaries Summary + Sidecar Metadata

Markdown remains the human-readable artifact. Machine state lives beside it as
a JSON sidecar.

Recommended naming:

```text
drafts/YYYY-MM-DD__TTGID__project-slug__summary.md
drafts/YYYY-MM-DD__TTGID__project-slug__summary.meta.json
```

The sidecar stores the canonical work-unit contract plus promotion history:

```json
{
  "schema": "channel-manager.ide-work-unit.v1",
  "ttgId": "-1003752539559",
  "surface": "codex",
  "projectId": "openclaw-control-center",
  "projectRoot": "/media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center",
  "sourceSessionId": "optional",
  "model": "openai-codex/gpt-5.4",
  "agent": "codex",
  "createdAt": "2026-04-24T19:00:00.000Z",
  "updatedAt": "2026-04-24T19:05:00.000Z",
  "promotedTo": [
    {
      "target": "memory/2026-04-24.md",
      "at": "2026-04-24T19:06:00.000Z",
      "marker": "CM_PROMOTE_<hash>",
      "readback": "confirmed"
    }
  ]
}
```

Frontmatter is intentionally avoided for v1 so Markdown remains easy to edit
and metadata remains easy to validate.

## 6. Artifact Header Binding Contract

Implementation status 2026-04-25: `ARTIFACT_HEADER_BINDING_V1` is implemented
for writes to A070_ide_cursor_summaries. The backend parses Markdown frontmatter,
`current_ttg.id` resolves as `binding.method = "artifact_header"`, and
`initial_ttg.id` is retained as history/fallback evidence. This does not make
producer tools authoritative; it makes artifact-owned routing metadata visible
to the existing work-unit sidecar.

Discovery and research artifacts are first-class binding sources. This covers
work that happens before a concrete repo/project exists, such as idea capture,
research, product/design theory, architecture exploration, and pre-project
technical discovery.

The artifact header carries both provenance and current routing truth:

```yaml
---
arys_schema_version: "1.2"
id: "20260425-discovery-example"
title: "Example Discovery"
type: DISCOVERY
status: active
created: "2026-04-25T00:00:00+02:00"
last_modified: "2026-04-25T00:00:00+02:00"

initial_ttg:
  id: "-100732566515"
  name: "TTG001_Idea_Capture"
  reason: "Initial capture before project binding was known"

current_ttg:
  id: "-100390983368"
  name: "TTG010_General_Discovery_Plus_Research"
  reason: "Active discovery/research lane"

project:
  id: ""
  repo_slug: ""
  root: ""

binding:
  status: confirmed
  method: artifact_header
  history:
    - at: "2026-04-25T00:00:00+02:00"
      from: null
      to: "-100732566515"
      reason: "created in idea capture"
    - at: "2026-04-25T00:00:00+02:00"
      from: "-100732566515"
      to: "-100390983368"
      reason: "promoted to discovery/research"
---
```

Rules:

- `initial_ttg` records where the artifact was born.
- `current_ttg` is the operative routing and promotion truth.
- `initial_ttg` is history; it must not override `current_ttg`.
- For general intake, prefer:
  - `TTG000_General_Chat` for unspecific conversation residue.
  - `TTG001_Idea_Capture` for early ideas and unstructured captures.
  - `TTG010_General_Discovery_Plus_Research` for active discovery/research.
- If the artifact later becomes a concrete implementation project, keep
  `initial_ttg` and update `current_ttg` or add `project.id` /
  `project.repo_slug` so the resolver can switch from artifact binding to
  project mapping.
- If `current_ttg` is missing but `initial_ttg` exists, the resolver may use
  `initial_ttg` as a weak fallback and mark the reason accordingly.
- If header TTG values conflict with explicit user selection, valid explicit
  selection wins but the conflict should remain visible in sidecar metadata or
  audit.

This contract is intentionally artifact-owned. Chat statements may explain why
a binding changed, but they are not the durable source of truth.

## 7. TTG Binding Resolver

Binding priority:

1. Explicit `ttgId` in the work unit / IDE bundle.
2. Artifact header `current_ttg`.
3. Project mapping from Channel Manager configuration.
4. Artifact header `initial_ttg` as history fallback.
5. IDE adapter metadata (`.cursor/*`, Codex session metadata, exported bundle).
6. Path/name heuristic as fallback only.

Failure behavior:

- No match: `binding.status = "unknown"`.
- Multiple plausible matches: `binding.status = "ambiguous"`.
- Ambiguous binding blocks promotion until the operator resolves it.

## 7A. Summary -> TTG Scoring + Review (Next Slice)

This is the next implementation slice after the bridge MVP. The goal is to make
Cursor/Codex/TARS summary capture route to the right TTG without turning
classification into hidden routing truth.

Principle: the resolver remains deterministic. Hard signals decide routing;
classification only proposes candidates until an operator or governed artifact
header confirms them.

Hard signals, in order:

1. Explicit operator-selected `ttgId`.
2. Artifact header `current_ttg.id`.
3. Channel Manager `projectMappings[]`.
4. Artifact header `initial_ttg.id` as weak historical fallback.

Soft scoring inputs:

- Summary title and body.
- Artifact type (`DISCOVERY`, `RESEARCH`, `IMPLEMENTATION`, etc.).
- Tags already present in the artifact header or sidecar.
- TTG definition documents and their frontmatter/body terms.
- Project/repo/path hints from the IDE adapter.
- Optional future tag-document vocabulary, normalized into the same TTG
  definition token set.

Scoring output shape:

```json
{
  "status": "inferred|needs_review|ambiguous|unknown",
  "method": "agent_classification",
  "ttgId": "-100390983368",
  "confidence": 0.78,
  "distribution": [
    {
      "ttgId": "-100390983368",
      "ttgName": "TTG010_General_Discovery_Plus_Research",
      "percent": 61,
      "score": 17,
      "evidence": ["matched tags: research, discovery", "artifact type is DISCOVERY"]
    }
  ]
}
```

Threshold policy:

- Auto-propose `inferred` only when the top candidate is at least 70% confidence
  and leads the second candidate by at least 20 percentage points.
- Mark `needs_review` when the top candidate is plausible but below the
  auto-propose threshold.
- Mark `ambiguous` when the top two candidates are close or conflicting hard
  hints exist.
- Mark `unknown` when useful TTG evidence is missing.

UI requirements:

- Show the ranked percentage distribution per TTG as bars or compact rows.
- Show evidence per candidate, not only the score.
- Allow the operator to confirm one TTG or override with another valid TTG.
- Candidate values may arrive as legacy string TTG ids or as classifier objects;
  all UI filtering, relevance sorting, and confirm defaults must normalize both
  shapes through a shared helper.
- On confirmation, write/update artifact `current_ttg` plus
  `binding.status: confirmed` through `upsertArtifactHeaderBinding()`.
- Keep promotion blocked while binding is `ambiguous`, `unknown`, or unreviewed
  `needs_review`.
- Promotion eligibility is an explicit allowlist, not a denylist. Only durable
  confirmed bindings from `explicit`, `artifact_header`, `project_mapping`, or
  `path_hint` may promote. `agent_classification`, `needs_review`, `ambiguous`,
  `unknown`, and future unrecognized binding states remain blocked until
  reviewed.

Audit / sidecar requirements:

- Persist classifier candidates, percentages, evidence, timestamp, and selected
  TTG in the `.meta.json` sidecar or IDE bridge audit.
- Do not store full hidden IDE transcripts in audit.
- Do not use percentage matching for promotion read-back; read-back remains
  marker/hash based.

Hardening loop captured 2026-04-27:

1. Normalize string/object classifier candidates everywhere in
   `IdeProjectSummaryPanel` (`format`, active-TTG relevance, and confirm draft).
2. Convert `assertPromoteBindingAllowed()` from blocking known-bad states to
   allowing only confirmed durable methods.
3. Add regression coverage for candidate strings and future unknown binding
   statuses.

## 8. UI States

The third tab computes status from exactly three questions:

1. Does an A070_ide_cursor_summaries artifact exist?
2. Is the TTG binding unambiguous?
3. Does the promotion marker exist in the target memory file?

Supported states:

- `no_summary`
- `draft_saved`
- `ambiguous_binding`
- `not_promoted`
- `promoted`
- `readback_confirmed`
- `stale`
- `promotion_failed`
- `unknown`
- `meta_invalid`

Primary actions:

- Save A070_ide_cursor_summaries draft
- Promote to OpenClaw memory

Secondary display:

- target memory file
- last promoted at
- source surface/agent/model
- binding status and method
- marker/read-back status

## 9. Promotion + Read-Back

Promotion remains explicit and separate from saving.

On confirm:

1. Append using existing marker/hash dedup.
2. Write/extend promotion audit.
3. Read back target memory file.
4. Search for the exact promotion marker.
5. Update sidecar and UI state:
   - marker found: `readback_confirmed`
   - write ok but marker missing: `stale`
   - write/read failed: `promotion_failed`

Do not use text similarity for read-back. Marker/hash only.

## 10. Audit

Keep the existing memory promotion audit. Add a small IDE bridge audit:

```text
channel-manager-ide-summary-audit.jsonl
```

Events:

- `draft_created`
- `draft_updated`
- `binding_confirmed`
- `binding_ambiguous`
- `promote_requested`
- `promoted`
- `readback_confirmed`
- `readback_failed`

Audit events must not include auth secrets or full hidden IDE transcripts.

## 11. Implementation Order

1. Add work-unit contract helpers and validation.
2. Add A070_ide_cursor_summaries `.meta.json` sidecar read/write.
3. Add TTG binding resolver.
4. Add status engine for `IdeProjectSummaryPanel`.
5. Couple promotion success to marker-based read-back.
6. Add audit JSONL.
7. Update docs and smoke tests.

### Next implementation order: Summary -> TTG scoring/review

1. Extend `ttgClassifier` to return normalized percentage distribution plus
   evidence for all relevant TTG candidates, not only top-three raw scores.
2. Feed classifier output into the existing resolver path only when no hard
   `confirmed` signal exists.
3. Persist classifier candidates and selected TTG in the summary sidecar.
4. Add `IdeProjectSummaryPanel` affordances for ranked TTG distribution,
   evidence, confirm, and override.
5. Confirm writes `current_ttg` and `binding.status: confirmed` into the
   artifact header; promotion remains blocked before confirmation when needed.
6. Add tests for high-confidence inference, ambiguous near-ties, hard-signal
   precedence, sidecar persistence, and header write-back.

## 12. Acceptance Criteria

- From one TTG row, the operator can save a summary in A070_ide_cursor_summaries (with sidecar metadata).
- The summary is bound to one TTG or blocked as ambiguous.
- The operator can explicitly promote the summary to OpenClaw memory.
- The tab shows read-back confirmation from the target memory file.
- Cursor and Codex use the same normalized contract.
- No silent writes to memory, auth, identity, or routing occur.

Next-slice acceptance:

- A summary without hard TTG binding shows a ranked TTG percentage distribution
  with evidence.
- A confident top candidate is proposed as `inferred`; ambiguous or weak matches
  require operator review.
- Explicit selection, artifact `current_ttg`, and project mapping always outrank
  content scoring.
- Confirming a candidate updates the artifact header and sidecar; only confirmed
  or otherwise unambiguous bindings can be promoted.
- Tests cover classifier distribution, resolver precedence, UI state mapping,
  and promotion blocking for ambiguous/unknown bindings.
- Existing §8b.4 chat behavior does not regress.

## 13. Current Implementation Slices

### 2026-04-24 - Bridge foundation

First implementation slice is in place:

- A070_ide_cursor_summaries save writes the Markdown summary plus a sibling `.meta.json`.
- Summary list/file APIs return `meta`, `metaRelativePath`, and
  `bridgeStatus`.
- `IdeProjectSummaryPanel.jsx` displays bridge status and core ledger fields:
  TTG, project, surface, binding, target, and last promoted timestamp.
- Promotion returns `marker` plus `readbackConfirmed`.
- Confirmed promotion updates the sidecar metadata.
- `ideWorkUnit.js` and `ideWorkUnit.test.js` cover sidecar path derivation,
  TTG inference, work-unit construction, and promotion status mapping.
- `summaries.integration.test.js` covers the core file-backed bridge flow with
  temp Studio/OpenClaw roots:
  - POST summary creates Markdown plus sidecar metadata.
  - Promote writes marker, confirms read-back, and updates sidecar metadata.
  - Duplicate promote is idempotent and does not append a second block.
  - `MEMORY.md` promote without explicit acknowledgement is blocked.
  - Summary path traversal is blocked.
  - Missing source summaries return a clean 404.
  - Broken sidecar metadata does not crash file reads and degrades to
    `bridgeStatus: "meta_invalid"`.

Implementation note: these integration tests caught and fixed the first-promote
case where a new daily memory file did not exist before the lock was acquired.

### 2026-04-25 - Resolver and adapter safety rail

Second implementation slice is in place:

- `backend/services/ttgBindingResolver.js` resolves TTG binding as a pure,
  deterministic decision:
  - explicit TTG wins when valid.
  - invalid explicit TTG stops as unresolved; it does not fall through to
    weaker hints.
  - project mappings confirm only one distinct TTG when no weaker hint
    conflicts with it.
  - path hints are weak fallback and become `ambiguous` when multiple TTGs are
    present.
  - conflicting non-explicit signals become `ambiguous`.
  - no usable signal returns `unknown`.
- `backend/services/ideWorkUnitAdapters.js` introduces Manual, Codex, Cursor,
  and Unknown adapter shapes that normalize provenance without deciding TTG
  binding.
- `buildIdeWorkUnit()` now consumes adapter output plus resolver output instead
  of doing its own hidden Regex binding decision.
- `IdeProjectSummaryPanel.jsx` no longer hardcodes `surface: "codex"`,
  `agent: "codex"`, or a fixed project root for newly saved summaries. The UI
  collects adapter type, optional project identity, and explicit TTG input; the
  backend normalizes and resolves.
- The selected summary preview now surfaces resolver method, reason, and
  candidates when present.
- `backend/test/ttgBindingResolver.test.js` covers explicit, project mapping,
  path-hint, unknown, ambiguous mapping, ambiguous path hints, and invalid
  explicit input.

### 2026-04-25 - Operator-managed project mapping store

Third implementation slice is in place:

- `projectMappings[]` is stored in Channel Manager's canonical
  `channel_config.json`.
- `backend/services/projectMappingStore.js` validates and persists mappings:
  - `projectId -> ttgId`
  - `repoSlug -> ttgId`
  - `projectMappingKey -> ttgId`
  - optional `label`, `note`, `updatedAt`
- `GET /api/ide-project-summaries/project-mappings` returns the mapping store.
- `PUT /api/ide-project-summaries/project-mappings` replaces it atomically under
  the same config lock discipline, using temp-file write plus same-directory
  `rename`.
- `POST /api/ide-project-summaries` now reads persisted mappings and passes them
  into the TTG resolver.
- `IdeProjectSummaryPanel.jsx` exposes a compact operator editor for project
  mappings in the third tab.
- Tests cover mapping validation, temp-file/rename persistence inside
  `channel_config.json`, and project-mapping based TTG resolution during
  summary write.

Current summary verdict (2026-04-27):

> §8b.5 is a **credible, tested** bridge: mappings, artifact headers, classifier
> + TTG review, artifact index, Open Brain export + sync (stub/HTTP), E2E golden
> paths, and **B** (CM → Cursor agent files + fingerprint stale check) are
> **landed**. What remains for “architecturally complete” is mainly **producer
> adapters**, **first-party OB1/MCP** (if desired), and **runtime verification**
> UX (e.g. §8b.7) — see `030_ROADMAP.md` §8b.5.

Implementation maturity snapshot (Reifegrad):

| Area | Status |
| --- | --- |
| Project Mapping Bridge | 88-92% |
| Promotion / Read-back Core | 90-93% |
| Operator UI (IDE tab) | 78-85% |
| Artifact Header Binding | 88-93% |
| Agent-assisted TTG Classification | 72-80% |
| Artifact Index / Resolver | 85-90% |
| Open Brain Export Contract | 88-93% |
| Open Brain Sync (stub + HTTP + audit) | 62-72% |
| **B: CM → Cursor** | 88-93% |
| Producer Adapters (Codex/Cursor/OpenCode) | 18-30% |

**C1c dual-target (Schätzung, Stand 2026-04-27):** CM → OpenClaw **Apply** 92–96%,
**Runtime/Readback** 55–70%; CM → Cursor **Repo-Export** 88–93%, **volle IDE-Parität**
(Skills/MCP/Rules/Reload) 40–55%. Detail in
[`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md).

**B / C1c:** C1c / §8b.7A ist in
[`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md)
festgehalten (Managed Blocks, Fingerprint v2, Orphan-Stale, Synth-ID-Kollision,
offene Gates: Runtime-Readback, `--prune-managed`, Skill/MCP-Verifikation).

Remaining production gates before calling §8b.5 “done” in the strict sense:

1. **Producer adapters** — Codex/Cursor/OpenCode (and peers) create/update Studio artifacts under the same contract; CM is not the only write path for long-form context.
2. **OB1/MCP upsert** — optional first-party client; HTTP adapter exists today.
3. **Review / ops polish** — filters, previews, topology read-only view (§8b.7) when gateway APIs are stable.
4. **Hardening backlog** (see below) — row-level mapping conflicts, guarded A070_ide_cursor_summaries edits, full ledger UX.

Hardening backlog after those gates:

- Guarded edit/update support for existing A070_ide_cursor_summaries drafts and sidecars.
- Row-level conflict/ambiguity affordances in the mapping editor.
- Complete row sync ledger across draft, promote target, read-back, and
  stale/failed states.
- IDE bridge audit JSONL (`channel-manager-ide-summary-audit.jsonl`).

MARVIN verdict for production readiness (2026-04-26):

- **PASS** for "credible, operator-anchored §8b.5 bridge foundation" **including**
  artifact header/index/classifier, OB export/sync slice, E2E coverage, and **B**
  (Cursor apply + stale fingerprint).
- **FAIL** only for the **strict** bar: full producer-adapter coverage +
  first-party OB1/MCP + §8b.7-style runtime topology — i.e. "nothing left to wire."

Tickets C–G (header, index, export, classification, sync stub/HTTP) are **landed**
in code; remaining gates are **adapters**, **OB1/MCP choice**, and **polish**.

Recommended next implementation steps:

1. Producer adapters (Cursor/Codex/OpenCode) toward Studio artifacts.
2. OB1/MCP upsert when you prioritize it (HTTP path exists today).
3. §8b.7 topology / `tools.effective` when the gateway contract is stable.
4. Hardening backlog items above (mapping conflicts, A070_ide_cursor_summaries edit guards, audit JSONL).

## 14. Ticket Specs - Next Session

### Ticket C - `ARTIFACT_HEADER_BINDING_V1`

**Goal:** make Discovery/Research artifacts bindable without a project mapping
by reading their YAML header as a durable source of truth.

**Scope:**

1. Parse artifact frontmatter for:
   - `initial_ttg.id`
   - `initial_ttg.name`
   - `initial_ttg.reason`
   - `current_ttg.id`
   - `current_ttg.name`
   - `current_ttg.reason`
   - `project.id`
   - `project.repo_slug`
   - `binding.status`
   - `binding.method`
   - `binding.history[]`
2. Normalize valid `current_ttg` into the work-unit binding result.
3. Use `initial_ttg` only as history fallback when `current_ttg` is missing.
4. Surface `binding.method = "artifact_header"` in sidecar and UI.
5. Preserve canonical TTG naming; accept legacy `TG###` only as migration
   tolerance and never write it as new canonical output.

**Resolution rules:**

- Valid explicit user TTG still wins over artifact header.
- Valid `current_ttg` confirms `artifact_header` binding.
- Missing `current_ttg` plus valid `initial_ttg` may bind with a reason that
  it used history fallback.
- Multiple conflicting TTG signals become `ambiguous`, unless explicit user
  selection is valid.
- Invalid TTG syntax becomes `unknown` / `needs_review`; do not guess.

**Tests:**

1. `current_ttg` confirms artifact-header binding.
2. `initial_ttg` fallback works only when `current_ttg` is absent.
3. explicit TTG overrides artifact header and records conflict evidence.
4. conflicting non-explicit artifact/project hints become `ambiguous`.
5. malformed YAML / missing header does not crash.
6. legacy `TG###` is accepted as migration input but normalized/displayed as
   canonical TTG where possible.

**Acceptance:**

- A Discovery artifact with `current_ttg` can be saved/promoted through the
  third tab without a project mapping.
- Sidecar shows `binding.method = "artifact_header"`.
- UI makes header-derived binding visible to the operator.

### Ticket D - `AGENT_TTG_CLASSIFICATION_V1`

**Status:** backend foundation implemented. The artifact index can now propose
reviewable TTG bindings from canonical TTG definition docs. The operator UI
still needs the explicit "confirm this TTG" affordance before inferred
bindings become durable truth.

**Goal:** when a human leaves an artifact unbound, let the agent propose a TTG
using canonical TTG definition docs while clearly marking the result as a
reviewable inference.

**Classifier inputs:**

- artifact title
- artifact type (`DISCOVERY`, `RESEARCH`, `QUICKDOCU`, etc.)
- tags
- first relevant summary/content block
- canonical TTG definition documents under
  `000_TelegramTopicGroups_Def/TTG*.md`

**Classifier output:**

```json
{
  "status": "inferred|needs_review|ambiguous|unknown",
  "method": "agent_classification",
  "ttgId": "-100...",
  "ttgName": "TTG010_General_Discovery_Plus_Research",
  "confidence": 0.74,
  "evidence": [
    "artifact type is DISCOVERY",
    "content asks an open research question",
    "TTG010 definition matches active discovery/research"
  ],
  "candidates": []
}
```

**Policy:**

- Agent classification never creates `binding.status = "confirmed"` by itself.
- High-confidence classification may be `inferred`.
- Medium-confidence classification should be `needs_review`.
- Multiple plausible TTGs become `ambiguous`.
- No useful match stays `unknown`.
- The UI must show "confirm this TTG" before treating an inferred binding as
  durable truth.

**Current implementation:**

- Classifier service: `backend/services/ttgClassifier.js`
- Artifact-index integration: `backend/services/artifactIndex.js`
- Canonical definitions are read from
  `Studio_Framework/000_TelegramTopicGroups_Def/TTG*.md`.
- Channel ids are mapped from Channel Manager `channel_config.json`; legacy
  `TG###` names and canonical `TTG###` names are both accepted as migration
  input.
- The classifier is deterministic and evidence-based: it scores artifact title,
  type, tags, body excerpt, and TTG definition terms, then returns
  `inferred`, `needs_review`, `ambiguous`, or `unknown`.
- Classification never returns `confirmed`.
- Confirmed artifact-header/project/explicit bindings remain upstream truth and
  outrank classification.

**Tests:**

1. raw idea -> `TTG001_Idea_Capture`, status `needs_review` or `inferred`.
2. structured research/discovery -> `TTG010_General_Discovery_Plus_Research`.
3. unspecific meta chat -> `TTG000_General_Chat`.
4. two close candidates -> `ambiguous`.
5. no match -> `unknown`.
6. confirmed artifact header/project mapping outranks classification.
7. artifact index carries `classificationEvidence` and never marks classifier
   output as export-ready confirmed knowledge.

### Ticket E - `ARTIFACT_INDEX_RESOLVER_V1`

Implementation status 2026-04-25: implemented as a read-only backend artifact
index service plus `GET /api/ide-project-summaries/artifact-index`. The index
normalizes Studio-root-relative source paths, artifact identity, TTG header
binding, project metadata, header health, SHA-256 content hash, secret gate,
and export eligibility. It does not mutate source artifacts.

**Goal:** build a local machine-readable index of Studio Framework artifacts so
OpenClaw promote and Open Brain sync operate from the same artifact truth.

**Index fields:**

- artifact id
- source path
- artifact type and status
- tags
- created / last modified
- `initial_ttg`
- `current_ttg`
- project id / repo slug
- binding status/method
- content hash
- header health (`valid|missing|required_fields_missing|invalid_yaml`)
- export eligibility (`ready|needs_review|blocked`)
- secret gate result and operator-visible reason
- promote status (`not_promoted|promoted|readback_confirmed|stale|failed`)
- Open Brain sync status (`not_synced|synced|outdated_sync|failed`)

**Rules:**

- Indexing must not mutate source artifacts.
- Missing headers become `needs_review`, not guessed truth.
- Content hashes must be stable across irrelevant whitespace churn where
  feasible.
- Secrets or token-like values block export eligibility.
- Promote, export, sync, and review UI must all consume this index output; they
  must not each implement their own resolver.
- `source_path` is Studio-root-relative or repo-relative. Absolute local paths
  are provenance only and never dedup-leading.

**Tests:**

1. A010 Discovery artifact is indexed with TTG header metadata.
2. A070_ide_cursor_summaries file + sidecar are indexed.
3. invalid YAML is represented safely.
4. content hash changes when relevant content changes.
5. secret-like content blocks export eligibility.
6. artifact changes after promote/sync produce stale/outdated status.

### Ticket F - `OPEN_BRAIN_EXPORT_CONTRACT_V1`

**Status:** implemented as read-only export builder. This ticket defines and
materializes the OB1-ready payload, but it does not sync to Open Brain.

**Goal:** define the payload Channel Manager / Studio tooling sends to Open
Brain so later sync can be implemented without rethinking identity, metadata,
dedup, or review status.

**Payload must include:**

- `schema = "studio-framework.open-brain-export.v1"`
- artifact identity (`id`, `title`, `type`, `status`)
- source path
- content hash
- TTG binding (`initialTtg`, `currentTtg`, status, method)
- project identity where present
- classification evidence when binding came from agent classification
- producer provenance
- sync target (`thoughts`)
- operation (`upsert`)

**Rules:**

- No secrets in payload.
- `needs_review`, `ambiguous`, and `unknown` bindings may export only as
  review records, not as confirmed knowledge.
- Dedup identity is `artifact_id + content_hash + schema_version`.
- Export payloads remain tool-agnostic; Codex/Cursor/OpenCode are provenance,
  not schema branches.
- `sourcePath` is logical and portable, not an absolute machine-local path.
- Export means building/sending an OB1-ready record; it does not mean OpenClaw
  promote and does not imply Open Brain sync succeeded.

**Current implementation:**

- Contract service: `backend/services/openBrainExportContract.js`
- Read-only API:
  `GET /api/ide-project-summaries/open-brain-export?sourcePath=050_Artifacts/...`
- The endpoint reads a Studio-root-relative Markdown artifact, indexes it with
  the shared artifact index resolver, validates the secret gate, and returns:
  `{ ok: true, export: <studio-framework.open-brain-export.v1> }`.
- Secret-blocked artifacts return a visible `400` and no export payload.
- `confirmed` bindings export as `knowledge`; `inferred`, `needs_review`,
  `ambiguous`, and `unknown` export as review records only.
- `source.path` is portable and relative; absolute machine-local paths are not
  used for source identity or dedup.

**Tests:**

1. valid artifact creates OB1 export payload.
2. no-secrets validator rejects token-like values.
3. content hash is included and stable.
4. unconfirmed classification is preserved as review state.
5. producer surface does not alter export schema.
6. absolute local paths are excluded from dedup identity.
7. read-only API returns a contract payload for a Studio artifact.
8. read-only API blocks secret-containing artifacts.

### Ticket G - `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`

**Goal:** upsert reviewed Studio artifacts into Open Brain and record an audit
trail that can be reconciled later.

**Sync behavior:**

1. Read artifact index record.
2. Build Open Brain export payload.
3. Validate no secrets and export eligibility.
4. Upsert into OB1 `thoughts` through configured MCP/API path.
5. Store sync result:
   - Open Brain thought id if returned
   - fingerprint/hash
   - operation result (`inserted|updated|duplicate|failed`)
   - sync timestamp
   - error if any

**Channel Manager dispatch (`OPEN_BRAIN_SYNC_PROVIDER`):**

- **`stub`** (default): writes `open_brain_sync_audit.json` and a deterministic local `thoughtId`; no network.
- **`http`**: `POST` the full export record (same shape as `GET …/open-brain-export`) as JSON to **`OPEN_BRAIN_SYNC_URL`**. The response must be JSON with **`thoughtId`** or **`id`** (or `thought.id`). Optional: **`OPEN_BRAIN_SYNC_API_KEY`** → `Authorization: Bearer …`; **`OPEN_BRAIN_SYNC_TIMEOUT_MS`** (default 30000, clamped 3000–120000). Missing URL when `provider=http` returns **503** with a clear error.

**Rules:**

- Sync never deletes source artifacts.
- Sync never rewrites OpenClaw memory.
- Duplicate content should upsert/dedup rather than create repeated thoughts.
- Failed sync does not mark OpenClaw promotion as failed; these are separate
  targets.
- Policy-driven sync is allowed only for reviewed/confirmed artifacts and must
  record policy id/source.
- Sync means audited Open Brain upsert; it must not be confused with OpenClaw
  promote.

**Tests:**

1. reviewed artifact sync creates/upserts one Open Brain thought.
2. duplicate sync is idempotent.
3. unreviewed inferred binding is blocked or exported only as review state.
4. missing Open Brain config produces a clean actionable error.
5. sync result is written to audit without secrets.
6. policy-driven sync refuses `needs_review`, `ambiguous`, `unknown`, and
   `blocked`.

### Ticket A - `E2E_GOLDEN_PATH_8B5`

**Goal:** prove the current §8b.5 bridge in the browser as one golden operator
flow, with backend verification after the UI actions.

**Scope:** happy path only.

1. Open `/channels`.
2. Open a TTG row.
3. Open **TARS in IDE · IDE project summary**.
4. Ensure test project mapping exists.
5. Save an A070_ide_cursor_summaries draft.
6. Select the draft.
7. Promote to OpenClaw memory.
8. Observe `Read-back confirmed`.
9. Verify sidecar metadata via API/filesystem.

**Fixtures:**

- `projectId = "e2e-bridge-smoke"`
- `repoSlug = "e2e-bridge-smoke"`
- `label = "E2E smoke"`
- Draft path pattern:
  `drafts/e2e/YYYY-MM-DD__<ttgId>__e2e-bridge-smoke__summary.md`
- Summary text must include a unique run id.

**Setup:**

- Use `PUT /api/ide-project-summaries/project-mappings`.
- Preserve any existing mappings and append/replace only the E2E row.
- Use a dedicated TTG available in the current dev config; do not invent a
  non-existent Telegram group for browser row lookup.

**Assertions:**

- no browser console error from app code
- draft save succeeds
- summary appears in A070_ide_cursor_summaries list
- preview shows TTG, project, surface, binding method, and target
- promote succeeds
- UI shows `Read-back confirmed`
- backend sidecar has:
  - `binding.status = "confirmed"`
  - `binding.method = "project_mapping"`
  - `promotion.status = "readback_confirmed"`

**Cleanup:**

- Remove the E2E mapping row.
- Remove E2E draft and sidecar when safe.
- Prefer test summaries under `drafts/e2e/`.
- Memory cleanup may be deferred if marker removal is not yet implemented; in
  that case, the E2E block must be uniquely marked and documented.

**Human check:** after automation passes, the operator does one quick visual
review: the flow is understandable and the state labels make sense.

**Implementation status (2026-04-25):** implemented under
`e2e/tests/e2e-golden-path-8b5.spec.js` with Playwright. The automated flow
sets a temporary `e2e-bridge-smoke` project mapping through the API, opens the
third tab in the browser, saves a draft under `drafts/e2e/`, verifies
`binding.method = "project_mapping"`, promotes to daily OpenClaw memory,
confirms `promotion.status = "readback_confirmed"`, and cleans up mapping,
draft, sidecar, and memory marker block.

### Ticket B - `CODEX_ADAPTER_V1` (Producer Adapter)

**Goal:** normalize real Codex/session context into the existing producer
adapter contract so Codex can create/update artifacts. Codex must not become a
separate memory authority and must not decide final TTG binding.

**Adapter output extension:**

```ts
type CodexAdapterOutput = {
  surface: 'codex',
  project: {
    id: string,
    root: string,
    repoSlug?: string,
    repoRemote?: string,
    head?: string
  },
  source: {
    sessionId?: string,
    agent?: string,
    model?: string,
    operator?: string,
    createdAt?: string
  },
  bindingHints: {
    explicitTtgId?: string,
    channelName?: string,
    projectMappingKey?: string,
    pathHints?: string[]
  },
  evidence: {
    projectId: 'explicit' | 'derived' | 'missing',
    projectRoot: 'explicit' | 'derived' | 'missing',
    sessionId: 'explicit' | 'derived' | 'missing',
    model: 'explicit' | 'derived' | 'missing'
  }
}
```

**Input priority:**

1. explicit API/UI input
2. Codex session metadata
3. cwd / project path
4. git metadata
5. path hints

**V1 required fields:**

- `surface = "codex"`
- `project.root`
- `project.id`
- `project.repoSlug`
- `source.sessionId`
- `source.agent`
- `source.model`
- `bindingHints.pathHints`
- `evidence`

**Rules:**

- Never decide TTG in the adapter.
- Never invent fake defaults to make fields look complete.
- Empty is better than false provenance.
- Evidence must say whether core fields are explicit, derived, or missing.
- Path hints stay small: summary path, cwd, relevant source paths; no full
  transcripts.

**Tests:**

1. full Codex-like input: session id, cwd, model
2. cwd only: project fields derived, source partial
3. no git/session: minimal shape, no crash
4. explicit override beats derived metadata
5. dirty/partial input does not produce fantasy provenance

## 15. IDE chat capture pipeline (PC host → Studio)

**Status:** Partial CM implementation live (2026-04-27); remaining pipeline work below.
**Companion:** `Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/README_A070_IDE_Summaries.md` §Capture pipeline.

**Current CM slice:** `GET/POST …/capture/{status,run,settings,ensure-path}` and
the Summaries-tab UI are live. For the remote Windows-PC → Linux-backend case,
the guided workflow is **Step 0** (operator mounts or creates a readable path in
SSH/terminal) plus **Step 1** (required **Save path** to
`ide_capture_settings.json`, unless `CURSOR_WORKSPACE_STORAGE_ROOT` is set by
ops). The old in-browser SMB wizard is not part of the primary flow. See
[`030_ROADMAP_DETAILS/ide-chat-capture-a070.md`](./ide-chat-capture-a070.md).

### 15.1 Problem statement

Cursor/VS-Code-family IDEs store composer/chat state under the **machine where the IDE UI runs** (e.g. Windows `%APPDATA%\Cursor\User\workspaceStorage\…\state.vscdb`). With **Remote-SSH**, the **repository and OpenClaw** may live on a **different host** (e.g. laptop). Capture and sync jobs must therefore run on the **PC (IDE host)** and **push** artifacts to the Studio canonical tree; a cron on the **Studio host** only ingests what arrived.

### 15.2 Design principles

1. **Deterministic sync:** Copy/export and manifest append are scripts (scheduler on PC), not LLM calls.
2. **RAW is append-only ground truth:** Each successful capture adds a new snapshot file (or new revision); do not silently overwrite the only copy of a session.
3. **Summaries are distilled and incremental:** Nightly (or on-demand) jobs append **delta sections** to Markdown summaries that reference RAW paths, hashes, and capture ids.
4. **Change detection:** Prefer **content hash** and/or **stable file size** of a **SQLite copy** over naive “once per calendar day” — chats may sit idle for days then grow again.
5. **Memory promotion:** Remains **explicit** (existing `POST /api/ide-project-summaries/promote` / UI). The pipeline may **prepare** summary text; it does not auto-append to `MEMORY.md` without operator policy (future automation must be a separate ADR).
6. **Secrets:** RAW may contain tokens; encrypt in transit (SSH/scp/rsync), restrict file permissions, optional redaction pass before leaving the PC.

### 15.3 Directory layout (under `A070_ide_cursor_summaries/`)

All paths are relative to the A070 root.

```text
capture/
  manifest.jsonl                    # one JSON object per line, append-only
  <surface>/                        # e.g. cursor, vscode, codex (producer)
    <workspace_storage_id>/         # hash folder name from IDE storage, opaque id
      YYYY-MM-DDTHHMMSSZ__<shortsha>__snapshot.json   # or .json.gz
      YYYY-MM-DDTHHMMSSZ__<shortsha>__snapshot.meta.json
by_ttg/…                            # existing TTG summaries (human-facing)
drafts/…                            # optional drafts before TTG placement
```

**Naming:** `workspace_storage_id` MUST match the IDE’s workspace storage folder name (e.g. Cursor `workspaceStorage/<id>`). `shortsha` is first 8 chars of `content_sha256` of the payload file.

**Do not** commit live `state.vscdb` binaries as the canonical artifact; export **JSON** (or gzip JSON) extracted from a **copy** of the DB.

### 15.4 Manifest schema (`capture/manifest.jsonl`)

Each line is a JSON object. Append only.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `schema` | string | yes | `studio.ide-capture.manifest.v1` |
| `capturedAt` | string (ISO-8601) | yes | When the PC script finished this capture |
| `surface` | string | yes | `cursor`, `vscode`, `codex`, … |
| `workspaceStorageId` | string | yes | IDE storage folder id |
| `sourceHost` | string | yes | Human label, e.g. `pc-jan-win11` |
| `sourceDb` | object | yes | `{ "path": "…", "byteLength": n, "mtimeUtc": "…" }` of the **copied** db or export source |
| `contentSha256` | string | yes | Hash of the snapshot **payload** file (the `.json` or `.json.gz`) |
| `payloadRelativePath` | string | yes | Path under A070 root after sync, e.g. `capture/cursor/<id>/…snapshot.json.gz` |
| `summaryRelativePath` | string | no | Markdown summary this capture was merged into (if known) |
| `watermarkKey` | string | yes | Stable id for dedup, e.g. `cursor:<workspaceStorageId>` |
| `previousSha256` | string | null | Last known payload hash for this watermark before this run |
| `trigger` | string | yes | `scheduled`, `manual`, `size_change`, `hash_change` |

**Watermark state** may also live in a small `capture/watermarks.json` (per `watermarkKey`: last `contentSha256`, `byteLength`, `capturedAt`) on the PC; the manifest line remains the audit trail after sync.

### 15.5 PC-side algorithm (reference)

1. For each configured `workspaceStorageId` (or scan directory):
   - Copy `state.vscdb` to a temp file (avoid WAL locks).
   - If `byteLength` and/or hash unchanged vs watermark → skip (optional heartbeat manifest line omitted).
2. Run extraction query (example keys for Cursor; adjust per IDE/version):
   - `ItemTable` keys such as `aiService.prompts`, `workbench.panel.aichat.view.aichat.chatdata` (see IDE docs/community; keys may drift).
3. Write `…__snapshot.json` (+ optional `.meta.json` with query version, key list).
4. Append manifest line; update `watermarks.json`.
5. **Sync** to Studio host: `scp`/`rsync` into `Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/capture/…` or git push from a clone.

### 15.6 Studio-side nightly job (reference)

1. **Ingest:** Read new tail of `capture/manifest.jsonl` since last processed offset or id.
2. For each new line, load payload; compute delta vs previous snapshot for same `watermarkKey` (diff in script or feed both to summarizer).
3. **Summarize:** Produce an **appendix** block for the operator-facing summary (Markdown under `by_ttg/…` or `drafts/…`) with:
   - `## Capture <capturedAt> (surface, workspaceStorageId)`
   - Bullets: decisions, changes, open questions
   - Footer: `RAW: <payloadRelativePath> sha256=<contentSha256>`
4. **Memory:** No automatic promote in v1; operator uses existing CM promote flow when satisfied.

### 15.7 Skills and subagents

- **Per-IDE skill** documents: default paths (Windows/Linux), DB copy, keys, extraction version, and sync command.
- **Orchestrator skill** (`ide-summarizer` or similar): given manifest + paths, run summarize step and suggest summary edits (optional; can be human-in-the-loop first).

Channel Manager now has a partial control surface for deployments where the
backend can read `workspaceStorage`: status, saved path, capture run, force run,
and optional directory creation. It still **does not** replace the PC scheduler
or local companion for deployments where the IDE data lives on a machine the
backend cannot read.

### 15.8 Acceptance (pipeline v1)

- After a chat grows on the PC, a scheduled run produces a **new** snapshot file and manifest line on the Studio tree without duplicating the same `contentSha256`.
- A nightly Studio job can append a **delta** section to a summary that cites the RAW path and hash.
- No silent write to OpenClaw memory without going through existing promote semantics.

### 15.9 Phased delivery: shared contract first, CM and scheduler as two launchers

**Current decision (v1):** Keep the capture contract shared:
`workspaceStorage` input → snapshot payloads under `capture/` → append-only
`manifest.jsonl` → explicit summary/memory promotion. Channel Manager can run
the capture module when its backend can read the path; a standalone PC script or
local companion remains the right launcher when the IDE data lives on a
different host.

**How it runs by deployment shape:**

1. **CM backend can read the IDE data:** use the Summaries tab status/run
   controls. On Linux with a Windows IDE host, first do **Step 0** terminal mount
   and **Step 1** required Save path.
2. **IDE data only exists on a PC the CM backend cannot read:** Task Scheduler
   (Windows) or `cron` (Linux) invokes a script on the **IDE host**. The script
   writes snapshots + `watermarks.json`, appends a local manifest fragment (or
   full manifest), then **syncs** to the Studio tree (`scp` / `rsync` /
   `git pull && copy && commit` — operator choice; document in runbook).
3. **Studio host:** Existing nightly job (or manual run) ingests
   `capture/manifest.jsonl` and updates summaries per §15.6.

**Not a magic browser import:** CM can only read what its Node backend can read.
If that is not true, a scheduler, local companion, upload, or sync step is still
required.

**Channel Manager “Capture now” / “Get chat”**

A UI button such as **Capture now**, **Get chat**, or **Import capture** is not
equivalent to reading `%APPDATA%\…` from the browser:

| Approach | What it can do |
| -------- | -------------- |
| **Browser-only CM** | User **uploads** a file or paste; server writes into `capture/` — works, but manual. |
| **CM + path field (local CM)** | If Channel Manager’s **Node backend runs on the same machine** as Cursor (same Windows user), it **can** read `%APPDATA%\Cursor\…` and `workspaceStorage` — implement with explicit allowlisted roots and path validation. This is the preferred “button in CM” deployment for solo operators. |
| **CM + path field (remote CM)** | Server only sees **its own** filesystem; a PC path string does not reach the IDE DB unless shared/mounted. |
| **Local companion** | Small **localhost agent** on the PC (or extension) that watches `workspaceStorage` and **POSTs** snapshots to CM/API — same contract as the standalone script, different trigger. |
| **Reverse flow** | PC script **pushes** to CM `POST` endpoint (if added) — CM does not pull from PC by magic. |

So a **path field + button** only works without extra moving parts if (a) CM and the DB live on the **same machine**, or (b) the path is a **UNC/SMB/SSHFS** path the CM host can read, or (c) a **local helper** performs the read and uploads. **Document any chosen variant** in the runbook when implementing the button.

**Summary:** CM and a standalone scheduler are launchers for the same ingest
contract (`capture/` + `manifest.jsonl`). The deployment must still decide where
the read runs: always on a host that can access the IDE data.

### 15.10 Channel Manager UX — capture status + force run

**Intent:** Operators who run CM **on the IDE host** (see §15.9) should get a **single control surface** instead of only an external scheduler.

**Recommended UI (IDE / TARS tab or settings slice):**

1. **Status (always visible, read-only)** — derived from durable state the pipeline already writes:
   - `lastCaptureAt` (ISO), `lastTrigger` (`scheduled` | `manual` | `cm_force`), `lastOutcome` (`ok` | `skipped_no_change` | `error`),
   - `lastWorkspaceStorageId` (or “multi” if several),
   - `lastPayloadSha256` / relative path under `capture/`,
   - optional: **last manifest line** tail or link to open `capture/manifest.jsonl` in Workbench.
   Source of truth: either the **last line of `capture/manifest.jsonl`** on the Studio tree, or a small **`capture/cm-capture-state.json`** updated atomically by the capture module (so the UI does not parse the whole journal).

2. **Primary button — “Capture now” / “Sync IDE chat”** — calls **`POST /api/ide-project-summaries/capture/run`** (alias: `/api/summaries/capture/run`) with body `{ "force": false }`; **`force: true`** re-exports even when the content hash is unchanged. Status: **`GET /api/ide-project-summaries/capture/status`** (returns `workspaceRoot`, `workspaceRootSource`, `savedWorkspaceStorageRoot`, `summary` / `lastRun`). **Saved path:** **`POST …/capture/settings`** body `{ "workspaceStorageRoot": "<abs path or null>" }` persists **`ide_capture_settings.json`** (used when `CURSOR_WORKSPACE_STORAGE_ROOT` is unset).

3. **Secondary:** Link to **configure** allowlisted `workspaceStorage` roots or default `%APPDATA%\Cursor\User\workspaceStorage` (environment override).

**Backend:** Must reuse the §15.5 extraction + §15.3 write paths; **no duplicate** ad-hoc export logic in the React bundle — only HTTP → shared Node module or `child_process` to the CLI.

**Security:** Restrict readable paths to Cursor/VS Code workspace storage roots; reject `..` and absolute escapes; optional env `IDE_CAPTURE_ENABLED=true` gate.

**Scope note:** Ships as part of **backlog 6.22** once capture is implemented; status-only view can land in the same PR as `POST …/run` or immediately after.
