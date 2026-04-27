# QA 8b.5 - IDE Memory Bridge

Date: 2026-04-27 (maturity refresh — C1c Cursor export hardening landed)
Scope: Final next-session gates after the §8b.5 bridge foundation
Open Brain guardrail: `SPEC_OPEN_BRAIN_BOUNDARY_CONDITIONS.md`

## Status

§8b.5 is a **tested** bridge: project mappings, artifact headers, classifier +
TTG review UI, artifact index, Open Brain export + stub/HTTP sync, and **B**
(CM → `.cursor/agents` apply + stale fingerprint) are in production code paths.
**Producer adapters** and **first-party OB1/MCP upsert** remain the largest gaps.

Maturity snapshot (Reifegrad — Schätzung, keine Messautomatik):

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
| **B: CM → Cursor** (`apply-ide-export`, engines + subs, stale v2, managed blocks) | 88-93% |
| Producer Adapters (Codex/Cursor/OpenCode) | 18-30% |

### C1c dual-target — Reifegrad (Schätzung, Stand 2026-04-27)

Zusätzlich zur Zeile **B** oben: Aufspaltung nach **Zielsystem** und **Was genau gemeint ist**.

| Ziel | Teilaspekt | Reifegrad |
| ---- | ---------- | --------- |
| **CM → OpenClaw** | Apply: Merge, Backup, Kollisionen, Synth-ID-Kollisionsverweigerung, `channelConfigWarnings`, Gateway-Restart-Hinweis | **92-96%** |
| **CM → OpenClaw** | Runtime: Gateway/TTG effektive Topologie, Live-Readback, Session-Pins vs. Binding | **55-70%** |
| **CM → Cursor** | Repo-Export: Bundle v2, Managed Blocks, Fingerprint v2, On-Disk-Managed-Hash, Orphan-Stale, Duplikat-Checks | **88-93%** |
| **CM → Cursor** | Volle IDE-Parität: Skills physisch vorhanden, MCP/Rules, Verifikation nach Reload | **40-55%** |

**C1c / §8b.7A:** Normative Detail-Spec und nächste Gates in
[`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md).

### Next slice — Summary -> TTG scoring/review

Planning status: **ready for implementation start** after operator go-ahead.

| Gate | Expected result |
| ---- | --------------- |
| Hard-signal precedence | Explicit TTG, artifact `current_ttg`, and project mapping outrank classifier output. |
| Classifier distribution | Summary title/body, tags, artifact type, TTG definitions, and adapter hints produce ranked TTG percentages. |
| Ambiguity handling | Near-ties or weak matches become `ambiguous` / `needs_review`; promotion remains blocked. |
| Operator confirmation | Confirm writes `current_ttg` + `binding.status: confirmed` to the artifact header. |
| Audit / sidecar | Candidates, percentages, evidence, timestamp, and selected TTG are persisted without hidden transcript text. |
| Read-back safety | Promotion read-back stays marker/hash based; no text similarity is used for memory confirmation. |

Remaining gates (high level):

1. **Producer adapters** — durable artifact writes from Cursor/Codex/OpenCode surfaces.
2. **OB1/MCP** — first-party upsert path beyond HTTP adapter; policy as you define it.
3. **Summary routing polish** — implement the Summary -> TTG scoring/review slice above.
4. **Polish** — §8b.7 topology / gateway `tools.effective` verification when API stable.

### Reifegrad — drei Dokumente (Stand 2026-04-27)

Die **numerische Tabelle** oben ist die Referenz; sie ist an **drei Stellen** mit dem Code abgestimmt:

| Dokument | Inhalt |
| -------- | ------ |
| **`QA_8B5_IDE_MEMORY_BRIDGE.md`** (diese Datei) | Datum + Status-Text; **Master-%** (Artifact Header 88–93%, Classification 72–80%, Index 85–90%, OB Export 88–93%, OB Sync 62–72%, **B** 88–93%, Producer 18–30%); **C1c-Tabelle** OpenClaw vs Cursor; **Next-slice QA** Summary → TTG scoring/review. |
| **`SPEC_8B5_IDE_MEMORY_BRIDGE.md`** | **Gleiche %-Tabelle** (inkl. Zeile **B**); Verdict; **§7A Summary → TTG Scoring + Review**; Implementierungsreihenfolge und Acceptance Criteria. |
| **`030_ROADMAP.md`** §8b.5 | **Current status**; **Maturity** als kompakte Prozentspannen + Verweis auf QA/SPEC; nächster Bauabschnitt: Hybrid-TTG-Scoring mit Review-Gate und Header-Writeback. |
| **`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`** | C1c Zielbild, Akzeptanzkriterien, offene Gates (Runtime-Readback, `--prune-managed`, Skill/MCP). |

Normative binding statuses:

- `confirmed`
- `inferred`
- `needs_review`
- `ambiguous`
- `unknown`
- `blocked`

`confirmed` must be backed by durable artifact header, project mapping,
explicit human selection, or reviewed governed record. Agent classification
alone is not confirmation.

## 1. Browser UI Flow

Ticket: `E2E_GOLDEN_PATH_8B5`

**Goal:** Verify the third tab as an operator flow, not only as API/backend
logic.

**Setup:**

- Frontend: `http://100.89.176.89:5173/channels`
- Backend health: `http://100.89.176.89:3000/api/health`
- `projectId = "e2e-bridge-smoke"`
- draft path under `drafts/e2e/`
- setup uses `PUT /api/ide-project-summaries/project-mappings`

**Steps:**

1. Open `http://100.89.176.89:5173/channels`.
2. Open a TTG row, e.g. `TTG000_General_Chat`.
3. Switch to **TARS in IDE · IDE project summary**.
4. Ensure the E2E project mapping exists.
5. Set adapter to `manual`.
6. Set project id to `e2e-bridge-smoke`.
7. Save a new A070_ide_cursor_summaries draft.
8. Select the newly created file from the A070_ide_cursor_summaries list.
9. Verify the preview ledger fields:
   - TTG
   - Project
   - Surface
   - Binding
   - Method
   - Target
   - Last promoted
10. Click **Promote to OpenClaw memory…**.
11. Run the dry-run check.
12. Confirm promote.
13. Return to the selected summary.

**Expected:**

- New summary appears in the list.
- Status before promote is `Draft saved` or `Not promoted`.
- After promote, status becomes `Read-back confirmed`.
- Target memory file is shown.
- Last promoted timestamp is shown.
- No duplicate memory block is appended when the same summary is promoted again.
- Sidecar has `binding.method = "project_mapping"`.
- Sidecar has `promotion.status = "readback_confirmed"`.

**Evidence to capture:**

- Screenshot before promote.
- Screenshot after `Read-back confirmed`.
- Target memory file path and marker.

**Automated proof (2026-04-25):**

- Test package: `e2e/`
- Test: `tests/e2e-golden-path-8b5.spec.js`
- Command: `cd e2e && npm test`
- Last local result: `1 passed`
- Covered path:
  - temporary mapping via `PUT /api/ide-project-summaries/project-mappings`
  - browser open of `/channels`
  - third tab open via `TARS in IDE, all`
  - draft save under `drafts/e2e/`
  - sidecar assertion: `binding.status = "confirmed"`
  - sidecar assertion: `binding.method = "project_mapping"`
  - promote dry-run + confirm
  - sidecar assertion: `promotion.status = "readback_confirmed"`
  - UI assertion: `Read-back confirmed`
  - cleanup of mapping, draft, sidecar, and promoted memory block

## 2. Ambiguous Binding

**Goal:** Ensure uncertain TTG binding never silently becomes confirmed.

**Current implementation note:**

- Resolver exists and is covered by backend tests.
- Valid explicit TTG wins.
- Invalid explicit TTG does not fall through to weaker hints.
- Conflicting non-explicit signals become `ambiguous`.

**Already automated:**

- `backend/test/ttgBindingResolver.test.js`
- `backend/test/projectMappingStore.test.js`

**Manual UI check still useful:**

- Create or load an ambiguous sidecar.
- Confirm the third tab surfaces `Ambiguous binding`, method, reason, and
  candidates.

## 3. Real Cursor/Codex Ingest

Ticket: producer adapters after artifact-centered gates. Codex can come first,
but it is no longer an architecture-critical gate.

**Goal:** Verify the work-unit contract with real IDE/session metadata rather
than hardcoded demo metadata.

**Current implementation note:**

- Adapter interfaces exist.
- UI no longer hardcodes Codex + fixed project root as truth.
- Real Cursor/Codex metadata readers are still pending.
- Producer adapters must create/update artifacts and must not bypass artifact
  metadata, TTG binding, review states, or Open Brain export rules.

**Steps once adapter input exists:**

1. Capture one real Cursor work context and one real Codex work context.
2. Normalize each into the shared work-unit contract.
3. Save each as a summary in A070_ide_cursor_summaries (with sidecar metadata).
4. Inspect sidecar metadata.

**Expected for Cursor input:**

- `surface = "cursor"`
- `agent` reflects Cursor/IDE source, not hardcoded `codex`.
- `projectId` is stable and matches the repository identity.
- `ttgId` is explicit, `unknown`, or `ambiguous`; never guessed silently.

**Expected for Codex input:**

- `surface = "codex"`
- `agent = "codex"` or a more specific Codex agent id where available.
- `projectId` is stable and matches the repository identity.
- `ttgId` follows explicit session/project mapping or is `unknown`.

## 4. Open Brain Boundary Conditions

**Goal:** Ensure Studio Framework artifacts are OB1-ready before sync exists.

**Expected:**

- Artifacts are the durable truth; producer surfaces are provenance only.
- OpenClaw memory remains operational agent memory.
- Open Brain receives curated artifact exports / upserts, not raw hidden IDE
  transcripts.
- No secrets appear in artifacts, sidecars, promote blocks, export payloads, or
  evidence.
- Export payloads include:
  - `artifact.id`
  - `sourcePath`
  - `contentHash`
  - TTG binding
  - project identity where present
  - producer provenance
  - sync/audit fields
- Dedup/fingerprint behavior is required before broad sync.

**Tests to add:**

1. export payload rejects secrets / token-like values.
2. content hash is stable for semantically unchanged content.
3. duplicate export uses upsert/dedup identity instead of creating noise.
4. unreviewed `needs_review` classification does not sync as confirmed.
5. source artifact remains authoritative after Open Brain sync.
6. absolute local paths are excluded from dedup identity.
7. policy-driven sync refuses `needs_review`, `ambiguous`, `unknown`, and
   `blocked`.
8. `Promote`, `Export`, and `Sync` audit events are distinct.

## 5. Artifact Header Binding

Ticket: `ARTIFACT_HEADER_BINDING_V1`

**Goal:** Verify that Discovery/Research artifacts can bind through durable
YAML header metadata instead of a project mapping.

**Setup:**

- Artifact has `initial_ttg`.
- Artifact has `current_ttg`.
- `current_ttg` points to a canonical `TTG###` definition.
- No project mapping is required for this flow.

**Expected:**

- Sidecar has `binding.status = "confirmed"`.
- Sidecar has `binding.method = "artifact_header"`.
- `ttgId` is taken from `current_ttg.id`.
- `initial_ttg` remains history and does not override `current_ttg`.
- malformed/missing YAML becomes `unknown` or `needs_review`, not a crash.

**Tests to add:**

1. current TTG confirms artifact-header binding.
2. initial TTG is used only as history fallback.
3. explicit TTG wins over artifact header.
4. conflicting non-explicit hints become `ambiguous`.
5. malformed YAML is safe.

## 6. Artifact Index / Resolver

Ticket: `ARTIFACT_INDEX_RESOLVER_V1`

**Goal:** Build a machine-readable index of Studio Framework artifacts before
syncing to Open Brain or promoting to operational memory.

**Expected index fields:**

- artifact id
- source path
- artifact type/status
- tags
- current/initial TTG
- project id / repo slug
- content hash
- last modified timestamp
- binding status/method

**Tests to add:**

1. index includes A010 Discovery/Research artifacts.
2. index includes A070_ide_cursor_summaries and sidecars.
3. missing/invalid headers are represented as `unknown` / `needs_review`.
4. content hash changes when content changes.
5. index never includes secrets.
6. promote/export/sync/review UI consume the same index resolver output.
7. artifact content change after promote sets promote status `stale`.
8. artifact content change after Open Brain sync sets sync status
   `outdated_sync`.

## 7. Agent-assisted TTG Classification

Ticket: `AGENT_TTG_CLASSIFICATION_V1`

**Goal:** If the human forgot the binding, propose a TTG from canonical TTG
definition docs without pretending the proposal is confirmed truth.

**Expected:**

- Method is `agent_classification`.
- Status is one of:
  - `inferred`
  - `needs_review`
  - `ambiguous`
  - `unknown`
- Agent classification never writes `confirmed` without human confirmation.
- Evidence is stored:
  - matched TTG definition
  - content/tags that drove the decision
  - confidence
  - alternative candidates when present

**Tests to add:**

1. raw idea -> `TTG001_Idea_Capture`.
2. structured discovery/research -> `TTG010_General_Discovery_Plus_Research`.
3. unspecific conversation residue -> `TTG000_General_Chat`.
4. multiple plausible TTGs -> `ambiguous`.
5. no useful match -> `unknown`.
6. artifact header/project mapping outranks classification.
7. classification evidence includes classifier version, candidates,
   confidence, signals, review state, and confirmation fields.
8. human confirmation persists to artifact header or governed sidecar/registry;
   UI-only confirmation is rejected.

## Recommended Order

1. `ARTIFACT_HEADER_BINDING_V1`.
2. `ARTIFACT_INDEX_RESOLVER_V1`.
3. `OPEN_BRAIN_EXPORT_CONTRACT_V1`.
4. `AGENT_TTG_CLASSIFICATION_V1`.
5. `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`.
6. Producer adapters: Codex, Cursor, OpenCode, Telegram/Chat exports.
7. Extend Playwright with artifact-header and Open Brain export/sync cases.
