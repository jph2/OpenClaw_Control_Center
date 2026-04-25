# SPEC 8b.5 - TARS in IDE / IDE Memory Bridge

Date: 2026-04-24
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
  -> Studio A070 summary artifact
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
- Do not add topology/graph visualization in this slice. That is §8b.6.

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

## 5. A070 Summary + Sidecar Metadata

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
for A070 summary writes. The backend parses Markdown frontmatter,
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

## 8. UI States

The third tab computes status from exactly three questions:

1. Does an A070 artifact exist?
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

- Save A070 draft
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
2. Add A070 `.meta.json` sidecar read/write.
3. Add TTG binding resolver.
4. Add status engine for `IdeProjectSummaryPanel`.
5. Couple promotion success to marker-based read-back.
6. Add audit JSONL.
7. Update docs and smoke tests.

## 12. Acceptance Criteria

- From one TTG row, the operator can save an A070 summary with sidecar metadata.
- The summary is bound to one TTG or blocked as ambiguous.
- The operator can explicitly promote the summary to OpenClaw memory.
- The tab shows read-back confirmation from the target memory file.
- Cursor and Codex use the same normalized contract.
- No silent writes to memory, auth, identity, or routing occur.
- Existing §8b.4 chat behavior does not regress.

## 13. Current Implementation Slices

### 2026-04-24 - Bridge foundation

First implementation slice is in place:

- A070 save writes the Markdown summary plus a sibling `.meta.json`.
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

Current summary verdict:

> §8b.5 stands as a credible, tested bridge foundation with clean project
> mapping semantics and a browser-proven golden operator flow. It is ready for
> project-based work with explicit project mappings. It is not yet complete for
> artifact-header discovery flows, Open Brain export/sync, agent-assisted
> fallback classification, or producer adapters.

Implementation maturity snapshot:

| Area | Status |
| --- | --- |
| Project Mapping Bridge | 85-90% |
| Promotion / Read-back Core | 90% |
| Operator UI Completeness | 65-70% |
| Artifact Header Binding | 35-40% (specified; parser/resolver not landed) |
| Agent-assisted TTG Classification | 10-15% (concept only) |
| Open Brain Export Contract | 10-15% |
| Open Brain Sync | 0-10% |
| Producer Adapters (Codex/Cursor/OpenCode) | 10-25% |

Remaining production gates before §8b.5 is complete:

1. **Artifact header resolver ingestion:** parse Discovery/Research YAML
   headers, read `current_ttg` / `initial_ttg`, and expose
   `binding.method = "artifact_header"` in sidecar/UI.
2. **Agent-assisted TTG classification:** when the human left no explicit
   binding, classify against canonical TTG definition docs and record the
   result as `inferred` / `needs_review`, not as confirmed truth.
3. **Artifact index/resolver:** index Studio artifacts by id, path, type, tags,
   TTG binding, project binding, content hash, and header health.
4. **Open Brain export contract:** produce no-secrets, fingerprinted,
   metadata-rich records suitable for OB1 `thoughts` upsert.
5. **Open Brain sync:** upsert reviewed artifacts into Open Brain with audit
   and dedup/read-back.
6. **Producer adapters:** Codex/Cursor/OpenCode/Telegram/Chat adapters create or
   update artifacts rather than becoming memory authorities.
7. **Review UI states:** surface `inferred`, `needs_review`, and "confirm this
   TTG" affordances so human sloppiness can be repaired without silent guesses.

Hardening backlog after those gates:

- Guarded edit/update support for existing A070 drafts and sidecars.
- Row-level conflict/ambiguity affordances in the mapping editor.
- Complete row sync ledger across draft, promote target, read-back, and
  stale/failed states.
- IDE bridge audit JSONL (`channel-manager-ide-summary-audit.jsonl`).

MARVIN verdict for production readiness:

- **PASS** for "credible, operator-anchored §8b.5 bridge foundation."
- **FAIL** for "architecturally complete / production-safe §8b.5."

Required fix-gates before calling §8b.5 done:

1. Land `ARTIFACT_HEADER_BINDING_V1`.
2. Land `ARTIFACT_INDEX_RESOLVER_V1`.
3. Land `OPEN_BRAIN_EXPORT_CONTRACT_V1`.
4. Land `AGENT_TTG_CLASSIFICATION_V1` with visible review states.
5. Land `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`.
6. Add producer adapters as convenience importers.

Recommended next implementation steps:

1. `ARTIFACT_HEADER_BINDING_V1`: parse YAML headers and bind through
   `current_ttg`.
2. `ARTIFACT_INDEX_RESOLVER_V1`: build a stable artifact index with content
   hashes and header health.
3. `OPEN_BRAIN_EXPORT_CONTRACT_V1`: define OB1-ready export/upsert records.
4. `AGENT_TTG_CLASSIFICATION_V1`: fallback classification from TTG definition
   docs with `inferred` / `needs_review` status.
5. `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`: sync reviewed artifacts with audit/dedup.
6. Producer adapters: Codex, Cursor, OpenCode, Telegram/Chat exports.
7. Extend `E2E_GOLDEN_PATH_8B5` with artifact-header and Open Brain export/sync
   cases.

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

**Tests:**

1. raw idea -> `TTG001_Idea_Capture`, status `needs_review` or `inferred`.
2. structured research/discovery -> `TTG010_General_Discovery_Plus_Research`.
3. unspecific meta chat -> `TTG000_General_Chat`.
4. two close candidates -> `ambiguous`.
5. no match -> `unknown`.
6. confirmed artifact header/project mapping outranks classification.

### Ticket E - `ARTIFACT_INDEX_RESOLVER_V1`

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
2. A070 summary + sidecar are indexed.
3. invalid YAML is represented safely.
4. content hash changes when relevant content changes.
5. secret-like content blocks export eligibility.
6. artifact changes after promote/sync produce stale/outdated status.

### Ticket F - `OPEN_BRAIN_EXPORT_CONTRACT_V1`

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

**Tests:**

1. valid artifact creates OB1 export payload.
2. no-secrets validator rejects token-like values.
3. content hash is included and stable.
4. unconfirmed classification is preserved as review state.
5. producer surface does not alter export schema.
6. absolute local paths are excluded from dedup identity.

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
5. Save an A070 draft.
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
- summary appears in A070 list
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
