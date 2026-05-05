# SPEC - General_Dev -> Studio Framework Migration V1

**Status:** active · batch `2026-04-27-1fe240e` **staging/import pass closed** 2026-04-29 (operator narrative: Studio [`BATCH.md`](../../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md)). Ongoing: `*_to_REVIEW` queues, manifest deferrals, §8b.6C/D maturation, future freezes.
**Scope:** migration planning, inventory, quality/security gates, and controlled
import of `General_Dev` knowledge artifacts into `Studio_Framework`  
**Owner surface:** Studio Framework corpus + Channel Manager roadmap/audit support  
**Non-goals:** one-shot bulk copy, silent Open Brain upsert, rewriting the
`General_Dev` source tree in place

## 1. Why This Exists

`General_Dev` contains roughly the last 1.5 years of work: domain documents,
general research, standards, tools, indexes, tag systems, RAG/search scripts,
Obsidian/Open Brain experiments, and operational material. Much of it is already
classified with ARYS-style headers, but it was created under an older framework
shape and cannot simply be copied into `Studio_Framework/050_Artifacts/`.

The migration must preserve knowledge while improving trust:

- keep a fixed source snapshot so imports are reproducible
- inventory what exists before moving anything
- update or normalize headers and traceability
- classify domain folders and general folders into Studio/TTG targets
- quarantine sensitive or low-quality material until reviewed
- carry over useful search/tag/index tooling without importing stale machine
  paths or old local assumptions as new truth

## 2. Source Truth And Freeze Gate

Before any migration run, `General_Dev` must be frozen as a source snapshot.

**Freeze gate:**

1. Fetch remote state and verify the current branch, upstream, and ahead/behind
   status.
2. Review the working tree before committing. Do **not** blindly commit
   generated files, credentials, `.env` files, finance exports, local database
   caches, or machine-local config.
3. Commit only intended source changes.
4. Pull/rebase or merge remote changes using normal project policy if the branch
   is behind.
5. Push the current branch.
6. Record branch, remote URL, full source commit, short source commit, and freeze
   timestamp in the migration batch manifest.

No migration tool should mutate the `General_Dev` source files. All transforms
operate on copied material in a staging layer. If a source bug is found, fix it
in `General_Dev`, commit/push again, then start or refresh the migration batch.

**Stop condition:** if the freeze review finds likely secrets, private finance
data, untracked local caches, unresolved conflicts, or unexplained large
generated output, stop the migration and resolve the source repository first.

## 3. Current Source Inventory Signals

Initial exploration found these important source areas:

| Source area | Migration meaning |
| --- | --- |
| `Master_Rules/` | Legacy framework hub: ARYS standards, templates, tag systems, RAG/search tooling, Cursor skills, indexes. |
| `Domain_*` | Domain/TTG-like areas. Treat as candidate domain-to-TTG mappings, not as final Studio categories. |
| `General_*` | Cross-cutting material such as research, tutorials, scripts/apps, social media, and admin/ops. |
| `090_FRAMEWORK_DESCRIPTION_EVOLUTION/` | Memex/registry/open-brain style schema and ingestion experiments. |
| Root files | Router/domain identity, logs, local utilities, OpenCode/MCP config, and bridge notes. |

Known useful systems to preserve or re-home:

- `Master_Rules/TAG_SEMANTIC_INDEX.md`
- `Master_Rules/master_tag_system.yml`
- `Master_Rules/.cursor/skills/framework-rag/scripts/framework_rag.py`
- `Master_Rules/040_Framework_TOOLS/arys_manager.py`
- `Master_Rules/040_Framework_TOOLS/arys_header_normalize_v12.py`
- `Master_Rules/040_Framework_TOOLS/structural_validator.py`
- `opencode.json` MCP hints, including Obsidian-related configuration
- OpenBrain/database sync experiments under `Domain_Agentic_Intelligence/`

Known risk areas:

- Windows-specific paths (`E:\\SynologyDrive`, `C:\\Users\\...`, Everything
  search locations)
- finance/admin/ops files under `General_Admin_Ops__ownREPO`
- possible secrets or environment-specific config in MCP/OpenCode files
- very large generated indexes or vendor/spec markdown
- obsolete RAG database state that should be regenerated from normalized files

## 4. Target Architecture

The migration has three layers:

```text
General_Dev@source_commit
  -> Studio_Framework/095_Migration_Staging/General_Dev/<batch-id>/
  -> Studio_Framework/<final governed target>
```

### Layer A - Frozen Source

`General_Dev` remains the historical source. It is read-only for migration
tools.

### Layer B - Migration Staging / Quarantine

Recommended staging root:

```text
Studio_Framework/095_Migration_Staging/General_Dev/<yyyy-mm-dd>-<source-short-sha>/
```

Each batch contains:

| Path | Purpose |
| --- | --- |
| `manifest.jsonl` | One line per source file with source path, hash, type, size, header status, target proposal, and gate state. |
| `inventory.md` | Human-readable summary of the batch. |
| `reports/header-report.md` | Missing/outdated/invalid ARYS or Studio header fields. |
| `reports/security-report.md` | Secrets, PII, local paths, finance/admin flags, unsafe file types. |
| `reports/target-map.md` | Proposed final Studio target for each accepted item. |
| `reports/duplicates-report.md` | Exact and near-duplicate matches against current Studio files. |
| `reports/exclusions.md` | Files intentionally skipped with reason and whether they should be revisited. |
| `normalized/` | Copied files after header/path/link normalization, not yet final. |
| `private-quarantine/` | Optional local-only holding area for sensitive material. It should not be committed unless explicitly approved. |
| `rejected/` | Non-sensitive files excluded from migration with reason. |

Staging is a quality/security gate. Material in staging is **not** export-ready
and must not be used by Open Brain live sync as canonical knowledge.

**Versioning rule:** manifests and reports should be versioned by default.
Normalized copies may be versioned only for the active reviewed batch. Sensitive
or private material belongs in `private-quarantine/` or external private storage
and must not be committed to shared Studio history by default.

**Indexing rule:** `095_Migration_Staging/` must be excluded from any artifact
index, Open Brain export, live upsert, or runtime memory promotion until a file
has been admitted into its final governed target.

### IDE / Cursor (ancillary)

Normative migration and quarantine policy lives in **this SPEC** and related CM documents — **not** as long-form rules under `Studio_Framework/.cursor/rules` (that tree holds **one** pointer stub: `openclaw-workspace-authority.mdc`). For the global stack (Channel Manager vs OpenClaw workspace vs IDE), see [`SPEC_GOVERNANCE_STACK_V1.md`](./SPEC_GOVERNANCE_STACK_V1.md). Admin/finance/ops defaults: quarantine and `private-quarantine/` per tables above.

### Layer C - Governed Studio Target

Only accepted files move into final Studio locations such as:

- `050_Artifacts/A010_discovery-research/`
- `050_Artifacts/A020_tutorial-prep/`
- `050_Artifacts/A050_admin-ops/`
- `050_Artifacts/A060_socialmedia/`
- `050_Artifacts/A900_manuals-docs/`
- domain/standard/tooling areas when the content is framework-governance rather
  than artifact output

The final import must follow
`Studio_Framework/050_Artifacts/README_ARTIFACT_INGESTION_AND_ONBOARDING.md`.

### 4.1 Batch closure (staging / import pass complete)

A migration **batch** may declare **staging and import pass complete** when, for
that source **freeze**, planned admits into governed targets, consumptions into
`CONSUMED_IMPORTS___DONE/`, and quarantines/deferrals are finished — i.e. no
further “hidden” bulk import is expected **inside** the batch folder.

**Canonical operator narrative** for each batch lives in:

`Studio_Framework/095_Migration_Staging/General_Dev/<batch-id>/BATCH.md`

That file names **remaining work** explicitly: sibling folders under
`095_Migration_Staging/General_Dev/` whose names end in `_to_REVIEW` (or
equivalent), plus `manifest.jsonl` rows still **`deferred`**, **`proposed`**, or
**`blocked`**. **New** bulk staging from `General_Dev` requires a **new** freeze
and **new** `batch-id`; do not treat a closed batch as an open import bucket.

## 5. Classification And Target Mapping

Folder names are useful starting signals, not final truth.

| Source pattern | First-pass interpretation | Example target strategy |
| --- | --- | --- |
| `Domain_*` | TTG/domain-like corpus | Map to TTG candidates and Studio domain/reference areas; do not flatten blindly. |
| `General_Research/` | research/discovery | `A010_discovery-research/` after dedup and header upgrade. |
| `General_Tutorials/` | educational material | `A020_tutorial-prep/` or `A900_manuals-docs/`. |
| `General_SocialMediaContentStrategy/` | social/content corpus | `A060_socialmedia/` (already partially migrated; compare before copying). |
| `General_Admin_Ops__ownREPO/` | admin/finance/ops | quarantine by default; import only reviewed non-sensitive docs into `A050_admin-ops/`. |
| `Master_Rules/010_GEN_STANDARDS/` | standards | compare with current Studio standards; promote selectively. |
| `Master_Rules/030_GEN_TEMPLATES/` | templates | compare with Studio templates; merge selectively. |
| `Master_Rules/040_Framework_TOOLS/` | tools | port as maintained scripts only after path/env audit. |

Every proposed target should include:

- final path
- reason
- confidence (`high`, `review`, `blocked`)
- source evidence (`folder`, `frontmatter`, `body`, `tags`, `operator`)
- risk class (`normal`, `large`, `private`, `secret-risk`, `license-risk`,
  `generated`, `vendor`)
- required operator decision if ambiguous

Target mapping states:

| State | Meaning |
| --- | --- |
| `proposed` | Tool or reviewer has suggested a target, but no final decision exists. |
| `accepted` | Operator/reviewer approved the target and import is allowed after all gates pass. |
| `blocked` | Security, privacy, license, duplicate, or mapping issue prevents import. |
| `deferred` | Worth revisiting, but not part of this batch. |
| `rejected` | Not useful or not appropriate for Studio. |

## 6. Header Upgrade Contract

Existing ARYS-style headers are preserved where valid, but the importer must
normalize them to current Studio expectations.

Required normalized fields:

- `arys_schema_version`
- `id`
- `title`
- `type`
- `status`
- `trust_level`
- `visibility`
- `created`
- `last_modified`
- `tags`

Recommended migration fields:

```yaml
source:
  repo: General_Dev
  commit: <source sha>
  path: <relative source path>
  sha256: <content hash>
migration:
  batch_id: <yyyy-mm-dd>-<source-short-sha>
  state: staged|accepted|rejected
  target_path: <relative Studio path or null>
  target_state: proposed|accepted|blocked|deferred|rejected
  gates:
    source_identity: pass|fail
    type: pass|fail|exception
    header: pass|fail|fixed
    security: pass|fail|quarantine
    duplicate: pass|fail|review
    link: pass|fail|todo
  reviewed_by: <operator or reviewer>
  reviewed_at: <iso timestamp>
  notes: <short rationale>
```

TTG/project fields are added only when supported by evidence:

- `current_ttg`
- `initial_ttg`
- `project`
- `binding`

Classifier suggestions may be stored as review evidence, but must not create a
`confirmed` binding automatically.

Header normalization rules:

- Preserve original `created` values when trustworthy; otherwise record an
  inferred value and explain it in migration notes.
- Update `last_modified` only for the normalized copy or final imported file,
  not in the frozen source tree.
- Resolve `id` collisions before import. Prefer stable source-derived IDs only
  when they do not collide with current Studio artifacts.
- Never invent `confirmed` TTG/project binding from folder names alone.
- Keep original source metadata under `source.*` so rollback and auditing remain
  possible.

### First-screen overview window (skim + bulk header sharpening)

Many Studio and legacy `General_Dev` markdown files already combine three
skim-friendly layers: YAML front matter (formal identity), optional early tag
lines (usually in the body), and a short human summary (**Executive Summary**,
**Purpose**, **TL;DR**, **Overview**, or equivalent). For migration, treat this
as a deliberate **first-screen contract**, not a decorative intro.

**Goal:** Within the first **~50 lines** of the file (counted from line 1,
including the YAML block), a reader or automation pass should be able to answer,
without scrolling further:

- what this file is for
- what kind of artifact or standard it is (`type`, scope)
- who it is for (`visibility` / audience hints in the summary)
- how stale or authoritative it is (`status`, dates, summary context)

**What this window is for:**

- **Human skim:** fast triage during inventory and review.
- **Bulk header sharpening:** semi-automated or LLM-assisted passes may read
  primarily this window **plus** the formal YAML keys already present, then
  propose header fixes (title precision, `status`, dates, `trust_level`,
  `visibility`, missing required keys). The aim is **formal correctness and
  clarity of identity**, not a wholesale rewrite of the document body.

**What this window is not:**

- It is **not** the main channel for tag taxonomy work. Tags in front matter may
  be normalized mechanically (format, duplicates, obvious typos), but **semantic
  tag expansion or re-clustering** should be a **separate batch** with its own
  review, so bulk header runs stay predictable and auditable.
- It does **not** replace full-file gates for security, license/provenance, or
  secrets. Those scans must still read the whole file (or defined sampling
  rules) regardless of the first-screen rule.

**Recommended early-body shape (after the closing `---`):**

1. One short **H1 or bold title line** aligned with `title` in YAML, or skip if
   redundant with a following summary heading.
2. A single **Executive Summary / Purpose / Overview** block of **3–10 lines**:
   intent, scope, non-goals in one glance.
3. Optional **metadata table** (version, date, namespace) if that was the legacy
   style, as long as it stays inside the first-screen budget.

**Bulk editing rules:**

- Operate **only on staging copies** in `normalized/`, never on frozen
  `General_Dev` sources.
- Every automated batch must support: **dry-run**, per-file diff, manifest line
  with `header: pass|fail|fixed`, and a maximum batch size for human review.
- If the model or script cannot confidently sharpen the header from the
  first-screen window plus YAML, mark the file `header: review` instead of
  guessing.

**Exceptions (do not force the first-screen contract blindly):**

| Pattern | Why |
| --- | --- |
| Giant semantic indexes (for example tag/router indexes over thousands of lines) | The value is the table, not a summary block; mark `type`/`exception` in manifest. |
| Generated or vendor specs | May have no useful summary; use `license-risk` / `vendor` and a minimal stub overview only if review demands it. |
| Intentional append-only logs | Overview may belong at the top **only if** operators agree; otherwise document the exception. |

**Is this rule “dumb”?** Only if it is applied rigidly to files whose purpose is
not “readable article/spec”. As written here — a **skim contract** with
explicit exceptions and with security/license gates still running on the full
file — it is a practical operator and automation constraint, not a dogmatic
format law.

## 7. Quality And Security Gates

Each file passes through these gates before final import:

1. **Source identity gate** - source commit, relative path, size, hash recorded.
2. **Type gate** - supported file type or explicit exception.
3. **Header gate** - ARYS/Studio header exists and validates.
4. **Security gate** - no secrets, keys, `.env` values, private finance data, or
   unsafe local machine paths.
5. **License/provenance gate** - third-party, copied, vendor, and generated
   material is labeled before import.
6. **Target gate** - accepted final Studio path and owner/category.
7. **Duplicate gate** - compare against already migrated Studio artifacts.
8. **Link gate** - internal links either repaired, marked TODO, or intentionally
   archived.
9. **Index exclusion gate** - staging files are confirmed excluded from artifact
   index/export/upsert.
10. **Operator sign-off** - accepted files are reviewed before final placement.

Blocked material remains in staging or rejected reports. No blocked material is
published into final Studio artifact directories.

Hardening stop conditions:

- Any high-confidence secret or credential is found.
- Any finance/admin/ops file is proposed for shared import without explicit
  review.
- The duplicate report shows an existing Studio artifact that may already be the
  canonical version.
- More than a small pilot batch would be copied without human-readable target
  mapping.
- A normalization tool would rewrite source files instead of staging copies.

## 8. Search, Tags, Everything, Obsidian, And Open Brain

### Everything

Everything is useful as a Windows filename-search workflow and historical clue,
but it is not portable enough to become the Studio search source of truth.
Document operator usage separately if needed; migrate no machine-local
Everything paths into canonical Studio headers.

### Tags

`TAG_SEMANTIC_INDEX.md` and `master_tag_system.yml` are high-value inputs. They
should be merged into Studio tag utilities only after:

- duplicate and deprecated tags are identified
- source domain meaning is preserved
- new tags are connected to current Studio retrieval conventions

### RAG / search tools

`framework_rag.py` and related skills are migration candidates, but the database
or embedding cache is not canonical. After accepted imports land, regenerate any
RAG index from the normalized Studio corpus.

### Obsidian

Obsidian integrations should be treated as external-producer experiments until
there is a current Studio contract for vault sync. Keep config references in the
inventory; do not import local Obsidian vault paths as canonical truth.

### Open Brain

Old OpenBrain/Open Brain sync scripts are prior art. V1 migration does not run a
live OB1 upsert. The goal is to produce a normalized corpus that the existing
Channel Manager export/stub audit can trust.

## 9. Implementation Slices

### Slice 0 - Source freeze

- Commit and push `General_Dev`.
- Record branch, remote, and commit hash.
- Store the hash in the batch manifest.

### Slice 1 - Read-only inventory

- Walk `General_Dev`.
- Emit counts by folder, file type, header status, size bucket, and risk flags.
- Produce an inventory report without copying or changing files.
- Emit a machine-readable inventory summary so later batches can be compared
  against the frozen source snapshot.

### Slice 2 - Staging layer

- Create `095_Migration_Staging/General_Dev/<batch-id>/`.
- Copy candidate files by batch, preserving source relative path metadata.
- Write `manifest.jsonl` and reports.
- Ensure staging paths cannot collide when two source files share a basename.
- Keep raw sensitive material out of versioned staging unless explicitly
  approved.

### Slice 3 - Header and security normalization

- Normalize headers in staging copies.
- Flag unresolved TTG/project mappings.
- Run secret/local-path/PII checks.
- Produce before/after header diffs for reviewed files.
- Apply the **first-screen overview window** rule where applicable: confirm the
  first ~50 lines give a clear overview, or record a documented exception in
  the manifest.
- Require explicit exceptions for binary, generated, vendor, finance, or config
  files.

### Slice 4 - Pilot import

- Start with one small, high-value domain or already-partial area
  (`General_SocialMediaContentStrategy` / `A060_socialmedia` is a good pilot).
- Import only accepted files into final Studio targets.
- Write a migration report mapping source -> staging -> final path.

### Slice 5 - Domain batches

- Process `Domain_*` and `General_*` in reviewable batches.
- Prefer one domain/topic batch per PR or work session.

### Slice 6 - Reindex and export audit

- Rebuild Studio search/tag/RAG indexes from normalized files.
- Run Channel Manager artifact index and Open Brain export/stub audit.
- Only then consider live Open Brain upsert work.

### Slice 7 - Regression and rollback

- Verify imported files can be removed or moved by reverting the import commit.
- Keep source -> staging -> final path mapping complete enough to audit every
  imported file.
- Confirm no staged/rejected/private-quarantine material appears in export
  payloads.

## 10. Acceptance Criteria

V1 is successful when:

- `General_Dev` has a recorded frozen source commit.
- A top-level inventory exists with folder/file/header/risk summary.
- A staging batch exists with manifest and reports.
- Staging reports include security, header, duplicate, exclusion, and target-map
  outputs.
- At least one pilot area is imported into final Studio targets with source
  provenance and current headers.
- Security-sensitive material is either excluded or explicitly quarantined.
- Existing tag/search/index systems are catalogued and either migrated,
  regenerated, or intentionally deferred.
- Channel Manager artifact index and export audit see only normalized final
  Studio artifacts, not raw staging files.
- Every imported file can be traced back to source commit, source path, staging
  record, gate decisions, and final target path.
- For markdown artifacts covered by the first-screen rule, either the first
  ~50 lines provide a clear overview or the manifest records an approved
  exception (for example index/register files).

## 11. Open Questions

- Exact TTG mapping table for each `Domain_*` folder.
- Whether `095_Migration_Staging/` should be versioned fully, partially, or only
  via reports and manifests.
- Whether finance/admin material should ever enter shared Studio history or stay
  in a private repo with pointers only.
- Whether the RAG/search tooling should become a Studio Framework tool, a Cursor
  skill, or a Channel Manager backend capability.
- Whether Obsidian is a source producer, a read-only mirror, or out of scope for
  the first migration pass.
