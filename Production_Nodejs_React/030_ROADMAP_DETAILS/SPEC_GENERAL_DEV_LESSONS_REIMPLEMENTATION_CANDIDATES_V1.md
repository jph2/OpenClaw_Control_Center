# SPEC - General_Dev Lessons And Reimplementation Candidates V1

**Status:** active companion spec to §8b.6 migration; **first mirror-batch lesson triage
closed 2026-04-28** (batch `2026-04-27-1fe240e` — see Studio
`lessons/STUDIO_BRIDGE.md`).  
**Scope:** identify what `General_Dev` taught us, document missed capabilities,
and turn high-value legacy patterns into candidates for deliberate
reimplementation in `Studio_Framework` / Channel Manager  
**Non-goals:** automatic porting, bulk code reuse, treating legacy tools as
production-ready, or importing old local machine assumptions as canonical truth

## 1. Purpose

The `General_Dev` migration is not only a file movement problem. It is also a
knowledge archaeology problem: the source tree contains working patterns,
operator workflows, indexing systems, domain routing concepts, search utilities,
header tooling, Obsidian/Open Brain experiments, and many small lessons that may
not belong in final Studio artifact folders as-is.

This spec creates a separate track for extracting those lessons and turning them
into **reimplementation candidates**.

The rule is:

> Migrate durable knowledge as artifacts; reimplement useful capabilities as
> clean Studio/CM-native systems.

Hardening addition:

> A lesson is not a feature request until it has evidence, a target surface, a
> safety review, and a decision owner.

## 2. Relationship To The Migration Spec

This spec is a companion to
[`SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`](./SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md).

| Track | Question | Output |
| --- | --- | --- |
| §8b.6 migration | Which files enter Studio, with which headers and target paths? | Staged files, manifests, normalized artifacts, import reports. |
| §8b.6B lessons/reimplementation | What did `General_Dev` already solve or attempt that Studio should learn from? | Lesson records, capability gaps, reimplementation candidates, design notes. |

The two tracks share source inventory and security findings, but they should not
be conflated. A file may be rejected for final artifact import while still
containing an idea worth reimplementing.

Lesson mining must also feed back into the migration reports:

- if a source file is not imported but contains a useful pattern, the import
  report should link to the lesson record
- if a lesson depends on a final imported artifact, the lesson record should
  reference the final Studio path once available
- if a lesson is rejected as unsafe or obsolete, the reason should be preserved
  so it is not rediscovered repeatedly

## 3. Source Areas To Mine

Initial source areas likely to contain reusable lessons:

| Source area | What to learn from it |
| --- | --- |
| `Master_Rules/` | ARYS standards, templates, routing identity, framework governance, operator checklists. |
| `Master_Rules/TAG_SEMANTIC_INDEX.md` | Semantic tag discovery, query-to-tag mapping, retrieval vocabulary. |
| `Master_Rules/master_tag_system.yml` | Canonical or semi-canonical tag taxonomy and tag governance. |
| `Master_Rules/.cursor/skills/framework-rag/` | Local framework RAG pattern: indexing, embeddings, query UX, skill packaging. |
| `Master_Rules/040_Framework_TOOLS/` | Header normalization, ARYS management, validators, cleanup utilities. |
| `Context_Index.md` / `HORIZON_INDEX.md` / framework indexes | Human/operator navigation model and “what should I look at now?” workflows. |
| `Domain_*` | Domain-to-TTG routing model, domain-specific guardrails, standards, and templates. |
| `General_*` | Cross-cutting research/tutorial/content/admin workflows and what final Studio categories need. |
| `opencode.json` and MCP config experiments | Which MCP integrations were useful, risky, obsolete, or worth formalizing. |
| Obsidian experiments | Vault-like browsing, backlinks, local knowledge workflows, possible producer/mirror role. |
| OpenBrain/database sync experiments | Prior art for markdown-to-database, memory plane, and graph/index concepts. |
| Everything workflow notes | Fast filename search UX that may inspire a portable Studio search surface. |

## 4. Lesson Record Format

Every lesson or missed capability should be captured as a structured record,
not as vague prose. Recommended path:

```text
Studio_Framework/095_Migration_Staging/General_Dev/<batch-id>/lessons/<candidate-id>.md
```

Recommended fields:

```yaml
---
id: gendev-lesson-<slug>
title: <short capability or lesson>
status: candidate
source:
  repo: General_Dev
  commit: <source sha>
  paths:
    - <relative path>
  evidence_type: code|doc|workflow|config|index|operator-note|mixed
category: search|tags|headers|domain-routing|rag|obsidian|open-brain|mcp|workflow|security|tooling|ux
target_surface: studio-framework|channel-manager|cursor-skill|openclaw|documentation|defer
decision: reimplement|document-only|archive|defer|reject
priority: high|medium|low
risk: low|medium|high
owner_surface: <team/system expected to own this if promoted>
superseded_by: <existing Studio/CM feature or null>
review:
  status: unreviewed|triaged|accepted|rejected
  reviewer: <operator or reviewer>
  reviewed_at: <iso timestamp or null>
---
```

Body sections:

1. **What existed in General_Dev**
2. **What problem it solved**
3. **What is still valuable**
4. **What should not be copied**
5. **Studio/CM-native reimplementation idea**
6. **Dependencies and risks**
7. **Existing-system comparison**
8. **Acceptance criteria**

Evidence rules:

- Quote or summarize the smallest source excerpt needed to understand the
  lesson; do not copy sensitive source content into the lesson record.
- Link to source paths and commits rather than duplicating full legacy files.
- Record **anti-patterns** (and their matching positive practices), not only ideas
  worth rebuilding — “negative lesson” in checklists means the same track as an
  anti-pattern; see `README_ANTI_PATTERNS_STUDIO.md` for canonical naming.
- If the source path is sensitive, use a redacted path category plus private
  reviewer note instead of exposing the raw content in shared docs.

## 5. Candidate Taxonomy

### A. Search And Discovery

Legacy inputs:

- Everything filename search workflow
- `framework_rag.py`
- `TAG_SEMANTIC_INDEX.md`
- `Context_Index.md`
- `HORIZON_INDEX.md`

Candidate reimplementations:

- Studio-native artifact search that combines filename, header fields, tags,
  TTG/domain, source provenance, and body search.
- Portable replacement for Everything-based workflows on Linux/Windows.
- Rebuilt local RAG index generated from normalized Studio files, not from raw
  `General_Dev` state.
- “What should I inspect first?” operator index derived from active roadmap,
  TTG, project, and recent migration batches.

Hardening checks:

- Define whether the search source is raw files, normalized Studio files, or
  reports; avoid mixing them silently.
- Require deterministic rebuilds so search/RAG output can be reproduced after a
  migration batch changes.
- Keep machine-local Everything paths as workflow notes only.

### B. Tags And Semantic Vocabulary

Legacy inputs:

- `master_tag_system.yml`
- `TAG_SEMANTIC_INDEX.md`
- tag validator/sync/proposer scripts under research tooling

Candidate reimplementations:

- Current Studio tag vocabulary with deprecated/alias tags.
- Tag linting during artifact onboarding.
- Query-to-tag suggestion for imports and summaries.
- Mapping from General_Dev domain tags to TTG/Studio tags.

Hardening checks:

- Every promoted tag needs owner, description, allowed aliases, and deprecated
  spelling if applicable.
- Do not create duplicate near-synonym tags without an alias/deprecation plan.
- Tag suggestions are evidence, not automatic final metadata.

### C. Header And Artifact Governance

Legacy inputs:

- ARYS 1.2 standard
- `arys_manager.py`
- `arys_header_normalize_v12.py`
- `structural_validator.py`

Candidate reimplementations:

- Studio header normalization CLI.
- Header lint report surfaced in Channel Manager artifact index.
- Batch “missing/invalid/outdated header” report for migration staging.
- Safe auto-fix mode for non-semantic header fields only.

Hardening checks:

- Separate safe mechanical fixes from semantic fixes that need review.
- Require before/after diff output for any auto-fix.
- Do not rewrite frozen `General_Dev`; tooling targets staging copies only.

### D. Domain Routing And TTG Mapping

Legacy inputs:

- `Domain_*` folder structure
- `ROUTER_IDENTITY_DOMAIN.md`
- domain-specific standards and guardrails

Candidate reimplementations:

- Domain-to-TTG mapping table with confidence and review state.
- Domain-specific import policies.
- TTG candidate classifier evidence sourced from folder, header, tags, and body.
- Read-only topology/ownership view that shows which migrated knowledge belongs
  to which TTG/domain.

Hardening checks:

- Folder names can propose TTG candidates but cannot confirm bindings.
- Ambiguous mappings must stay reviewable rather than becoming hidden defaults.
- Preserve source domain identity even when final Studio location is different.

### E. Obsidian And Knowledge Navigation

Legacy inputs:

- Obsidian MCP experiments
- Vault/backlink-style workflows
- index and navigation documents

Candidate reimplementations:

- Treat Obsidian as optional producer/mirror, not canonical storage.
- Generate Studio-compatible backlinks or graph reports from normalized files.
- Decide whether Obsidian sync is a future import producer, export target, or
  out of scope.

Hardening checks:

- Do not import local vault paths, plugin configs, or private note locations as
  canonical Studio config.
- Clarify producer vs mirror vs export-target before implementation.
- Avoid creating a second source of truth beside Studio Framework.

### F. Open Brain / Memory Plane

Legacy inputs:

- markdown-to-database sync experiments
- memex and memory-plane designs
- OpenBrain prior art under agentic-intelligence areas

Candidate reimplementations:

- Open Brain export contract based only on normalized Studio files.
- Stub/audit first; live upsert only after corpus trust gates.
- Graph/index model that preserves source provenance, TTG, tags, and project
  identity.

Hardening checks:

- Old database sync scripts are prior art, not current implementation authority.
- Live upsert remains blocked until normalized corpus, export audit, and security
  gates pass.
- Graph identifiers must be stable and traceable to Studio source files.

### G. MCP / Tool Configuration

Legacy inputs:

- `opencode.json`
- MCP config attempts
- Cursor skill experiments

Candidate reimplementations:

- MCP whitelist policy and schema.
- Tool config import review that strips secrets and local paths.
- Candidate list of integrations worth recreating in current Cursor/OpenClaw
  config rather than copying old config files.

Hardening checks:

- Config files are sensitive by default until scanned.
- Old MCP servers need current auth, schema, security, and usefulness review.
- Do not preserve disabled/experimental integrations unless a current owner
  accepts them.

### H. Operator Workflow And UX

Legacy inputs:

- Horizon/context indexes
- domain router docs
- quick search workflows
- local helper scripts

Candidate reimplementations:

- Migration dashboard: source inventory, risk counts, candidate decisions.
- Roadmap-aware “next useful action” navigator.
- Review queue for “missed capability” candidates.
- Operator runbooks for freeze, staging, header normalization, and import.

Hardening checks:

- UX candidates must identify the operator decision they improve.
- Avoid dashboards that only mirror reports without enabling action.
- Keep destructive actions behind explicit review and confirmation.

### I. Negative Lessons And Anti-Patterns

Legacy inputs:

- Broken local paths
- stale generated indexes
- duplicate taxonomies
- script behavior that mutates source files
- ambiguous domain/router truth
- old configs with secrets or machine-local assumptions

Candidate outputs:

- Documented anti-patterns (and paired positive practices) in
  `Studio_Framework/020_Standards_Definitions_Rules/040_Quality_enforcement/README_ANTI_PATTERNS_STUDIO.md`
  and onboarding checklists.
- Regression checks to prevent reintroducing the same failure mode.
- `reject` or `archive` decisions with enough rationale to avoid rediscovery.

## 6. Evaluation Rubric

Each candidate is scored before implementation:

| Criterion | Question |
| --- | --- |
| Current value | Does this solve a real workflow problem today? |
| Fit | Does it belong in Studio Framework, Channel Manager, Cursor skill, OpenClaw, or docs only? |
| Portability | Does it work without Windows-only paths or local machine assumptions? |
| Safety | Could it expose secrets, private ops data, or unsafe automation? |
| Maintainability | Can we test and maintain it in the new architecture? |
| Duplication | Does the new stack already solve this in a better way? |
| Blast radius | Can it be built as a small slice without destabilizing current CM/Studio flows? |
| Evidence strength | Is there enough source evidence to justify the candidate? |
| Owner clarity | Is there an obvious owner surface for the rebuilt capability? |
| Reversibility | Can the first slice be removed or disabled safely if wrong? |

Decision values:

- `reimplement` - build a clean native version
- `document-only` - preserve the lesson in docs but do not build
- `archive` - keep as historical reference only
- `defer` - valuable, but blocked by another roadmap item
- `reject` - not useful, unsafe, or superseded

Promotion rules:

- A candidate cannot become an implementation task while `review.status` is
  `unreviewed`.
- `high` risk candidates require an explicit security/privacy note.
- Candidates superseded by existing CM/Studio behavior should default to
  `document-only`, `archive`, or `reject`.
- Implementation tasks must reference acceptance criteria, owner surface, and
  test strategy.

## 7. First Candidate List

These are the first reimplementation candidates to extract during the migration
inventory:

| Candidate | Source signal | Likely target | Initial priority | First hardening requirement |
| --- | --- | --- | --- | --- |
| Portable Studio search | Everything workflow, `framework_rag.py`, indexes | Studio/CM search tooling | High | Define canonical indexed corpus and reproducible rebuild path. |
| Studio tag vocabulary and tag lint | `master_tag_system.yml`, `TAG_SEMANTIC_INDEX.md` | Studio standards + onboarding lint | High | Merge aliases/deprecations before adding new tags. |
| Header normalization CLI/report | ARYS tooling | Studio Framework + CM artifact index | High | Separate safe auto-fixes from semantic review fields. |
| General_Dev domain -> TTG mapper | `Domain_*`, router identity docs | CM/Studio migration tooling | High | Keep mappings as review evidence until confirmed. |
| RAG rebuild from normalized corpus | framework-rag skill | Studio/Cursor skill | Medium | Regenerate from final Studio files only; ignore old DB/cache. |
| Obsidian producer/mirror decision | Obsidian MCP experiments | Future spec/ADR | Medium | Decide producer vs mirror vs export target before building. |
| Open Brain graph/upsert prior art | DB sync / memex experiments | OB1 export/upsert roadmap | Medium | Stub/audit only until corpus trust gates pass. |
| MCP config whitelist candidates | `opencode.json` and MCP notes | C1c / MCP whitelist | Medium | Treat config as sensitive and scan before copying excerpts. |
| Operator context/horizon navigator | Context/Horizon indexes | CM roadmap/workbench UX | Medium | Tie every view to an operator decision or drop it. |
| Admin/ops privacy policy | `General_Admin_Ops__ownREPO` | Security/import policy | High | Private-by-default; no shared import without explicit review. |
| Anti-pattern / migration failure registry | broken paths, stale caches, duplicate taxonomies | [`README_ANTI_PATTERNS_STUDIO.md`](../../../Studio_Framework/020_Standards_Definitions_Rules/040_Quality_enforcement/README_ANTI_PATTERNS_STUDIO.md) + onboarding checklists | High | Single canonical Studio registry; lesson id `gendev-lesson-negative-patterns` = legacy label only. |

## 8. Workflow

1. During read-only inventory, mark source files that contain capability lessons,
   not only artifact content.
2. De-duplicate candidates against existing Studio/CM capabilities before
   creating new roadmap work.
3. Create lesson records in the staging batch.
4. Review candidates separately from file-import decisions.
5. Promote accepted candidates into one of:
   - roadmap item
   - Studio standard/playbook
   - Channel Manager implementation task
   - Cursor skill
   - ADR/spec
6. Do not implement from raw legacy code without a new design note and safety
   review.
7. Periodically prune or close stale candidates so the lessons list does not
   become a second backlog with no owner.

## 9. Acceptance Criteria

V1 is complete when:

- The migration inventory produces at least one `lessons/` report per processed
  source batch.
- High-value systems from `General_Dev` are classified as reimplement,
  document-only, archive, defer, or reject.
- The first candidate list has owner surface, priority, risk, and acceptance
  criteria.
- At least one high-priority candidate is promoted into a concrete implementation
  plan after review.
- Reimplementation candidates are traceable to source paths and commits, without
  making raw `General_Dev` code canonical.
- Rejected, archived, and superseded candidates are recorded with rationale.
- Sensitive source excerpts are redacted or kept out of shared lesson records.
- Candidate promotion requires owner surface, de-dup check, safety review, and a
  test/verification strategy.

## 10. Explicit Guardrails

- Do not copy old scripts into production just because they worked once.
- Do not preserve Windows-specific local paths as canonical config.
- Do not import old RAG databases or embedding caches as truth.
- Do not expose admin/finance/private material while mining lessons.
- Do not create `confirmed` TTG bindings from folder names alone.
- Do not let lesson mining delay the source freeze and basic migration inventory.
- Do not create an implementation task from a lesson without checking whether
  current Studio/CM already solves it.
- Do not allow lesson records to contain secrets, private data, or full copies of
  sensitive legacy files.
- Do not treat old architectural intent as current truth without validating it
  against the new roadmap and runtime.

## 11. Closed batch reference (2026-04-27-1fe240e)

**Triage closed** 2026-04-28. Lesson markdown records are **archived** (not deleted) under:

`Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/_archive/2026-04-27-1fe240e/`

**Outcomes, deferrals, and upcoming items** (single screen): [`STUDIO_BRIDGE.md`](../../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/STUDIO_BRIDGE.md)

**Batch staging/import closure (operator):** [`BATCH.md`](../../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md)

Channel Manager roadmap: **§8b.6B** batch triage marked **closed** in `030_ROADMAP.md` §3; **§8b.6** staging/import pass for this freeze marked **closed** in §3 (2026-04-29). Follow-up implementation is **§8b.6C**, **§8b.6D**, review queues, and backlog **6.23** — not a new lesson pass for this wave.

This SPEC remains the **methodology** for future `General_Dev` mirror batches or other legacy corpora.
