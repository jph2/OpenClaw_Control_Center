# SPEC — §8b.6E Legacy Rules / Guardrails Reclassification V1

**Status:** active cleanup spec  
**Created:** 2026-04-30  
**Owner surface:** `Studio_Framework` review queues + OpenClaw workspace governance + Channel Manager roadmap/specs  
**Parent roadmap items:** §8b.6 General_Dev migration, §8b.6B lessons/reimplementation, §8b.6D domain mapping, `SPEC_GOVERNANCE_STACK_V1.md`
**Boot-level governance rule:** `~/.openclaw/workspace/GOVERNANCE.md` → “Intelligence placement policy (active)”

## 1. Problem

`General_Dev` contained an older attempt to make answers stable by placing
rules, guardrails, domain knowledge, agent hints, routing files, templates,
indexes, and tool experiments close to the corpus. That was useful prior art,
but it mixed several kinds of intelligence in one tree:

- durable Studio artifacts and topic-group work products
- domain-specific best practices, anti-patterns, examples, and patterns
- governing behavior for agents and harnesses
- IDE/Cursor rule projections
- Channel Manager routing/config ideas
- old scripts, indexes, RAG caches, vendor reference dumps, and local logs

The current architecture has clearer owners:

- **Studio Framework** stores durable artifacts, topic-group work products,
  domain patterns, examples, and reviewable knowledge.
- **OpenClaw workspace** stores behavioral governance: soul, AGENTS, memory
  policy, harness rules, and cross-tool guardrails.
- **Channel Manager** is part of `OpenClaw_Control_Center` and is the operator
  control plane: config, bindings, Apply, IDE export, topology, and roadmap/spec
  ownership.
- **Cursor / IDE files** are projections and pointers, not a second rulebook.

The first General_Dev import wave therefore pulled too much legacy governance
into Studio. The remediation is not “delete everything”; it is to classify,
extract, rewrite, and place each useful piece in its correct owner surface.

This SPEC is the **operational roadmap work item** for enforcing the boot-level
governance rule during the intense cleanup phase. `GOVERNANCE.md` defines the
rule a fresh agent must understand; this SPEC defines how the migration/review
work applies that rule to legacy `General_Dev` material.

## 2. Existing Roadmap Fit

This is **not** a separate unrelated programme. It is the missing precision
inside existing migration work:

| Existing item | What it already covers | What §8b.6E adds |
| --- | --- | --- |
| §8b.6 General_Dev migration | freeze, staging, review queues, deliberate admit | Review-queue disposition by intelligence ownership |
| §8b.6B lessons / reimplementation | what legacy systems solved and what to rebuild | Converts “lessons” into a placement decision, not raw copying |
| §8b.6D domain mapping | source prefix to Studio/TTG mapping | Prevents domain mapping from becoming governance import |
| Governance stack spec | CM / OpenClaw / IDE ownership | Applies the stack to legacy rules and guardrails in review |

## 3. Scope

Primary review input:

- `Studio_Framework/095_Migration_Staging/General_Dev/RULES_to_REVIEW/`
- especially `.../020_Standards_Definitions_Rules/060_Domain_Guardrails/`

Canonical review root:

- `/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework/095_Migration_Staging`

Channel Manager root:

- `/media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center`

Related inputs:

- `Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/reports/domain-governance-harness-review.md`
- `Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md`
- `SPEC_GOVERNANCE_STACK_V1.md`
- `SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`
- `SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md`

Out of scope:

- copying raw legacy rules back into active Studio or OpenClaw without rewrite
- making staged material export-ready by path alone
- treating old `Domain_*` folder names as confirmed TTG bindings
- preserving old local logs, caches, or machine-specific config as canonical truth

## 4. Placement Contract

Every reviewed item must receive one primary disposition:

| Disposition | Target owner | Examples |
| --- | --- | --- |
| `studio-artifact` | `Studio_Framework/050_Artifacts/` | discoveries, research, tutorials, manuals, channel/topic work products |
| `studio-pattern` | Studio artifact or standards lane after curation | domain best practices, anti-patterns, reusable examples, checklists |
| `openclaw-governance` | `~/.openclaw/workspace/` | soul, AGENTS, GOVERNANCE, cross-tool behavior rules, memory policy |
| `channel-manager-spec` | `OpenClaw_Control_Center/Production_Nodejs_React/030_ROADMAP_DETAILS/` or implementation | binding rules, Apply/export behavior, topology, operator controls |
| `tooling` | maintained Studio/CM/OpenClaw tool lane | scripts that are still needed after path/env/security audit |
| `reference` | reference archive or external source pointer | vendor/API dumps, large PDFs, generated indexes kept as source evidence |
| `archive-only` | migration/review archive | historical context not used in active behavior |
| `discard` | remove after recorded decision | local logs, stale caches, duplicate generated outputs |

Rule: **a file’s old path is evidence, not destiny.** The review decides by
function and current architecture, not by where General_Dev happened to store it.

Language rule: **governing documentation inside Studio Framework is always
English.** Research/tutorial content may be German, but governing-layer material
must be English so every agent/backend can apply it consistently.

## 5. Review Process

Governance enforcement rule: during §8b.6E, reviewers and agents must not treat
old folder placement as authority. Every item in `RULES_to_REVIEW` is reviewed
against the active `GOVERNANCE.md` intelligence-placement policy before it can
return to an active location.

1. **Inventory the review set.** Group by domain, file kind, size, and risk.
2. **Classify by owner surface.** Use the placement contract above.
3. **Extract the useful idea.** Do not promote raw legacy governance text if it
   conflicts with the current stack.
4. **Rewrite into the target voice.** Studio artifacts, OpenClaw governance, and
   CM specs have different purposes and should not share boilerplate.
5. **Admit in small cuts.** Pull one domain or one concept at a time.
6. **Record disposition.** Keep a table or report mapping reviewed source path
   to disposition, target, and rationale.
7. **Remove empty ghost anchors.** If a Studio path only exists as a placeholder
   and the chosen owner is elsewhere, remove the placeholder after references
   have been updated.

## 6. Immediate Decision: `060_Domain_Guardrails`

The active Studio path:

`Studio_Framework/020_Standards_Definitions_Rules/060_Domain_Guardrails/`

is currently only a placeholder after the review move. It is **not required**
as a durable active folder if domain-specific knowledge is admitted into clearer
targets:

- `050_Artifacts/` for discoveries, research, tutorials, examples, and curated
  domain patterns
- OpenClaw workspace for cross-tool governing behavior
- Channel Manager specs/config for routing/apply/export behavior
- tools/reference/archive lanes for scripts, generated indexes, and vendor data

Recommended next action:

1. Keep the **review queue** as the canonical holding area.
2. Remove the active `060_Domain_Guardrails` placeholder once roadmap/docs no
   longer point to it as an expected active content lane.
3. Replace future “domain guardrail” language with **domain patterns / best
   practices / anti-patterns / examples** unless it truly governs agent behavior.

## 7. Acceptance Criteria

§8b.6E is complete when:

- `RULES_to_REVIEW` has a disposition table or per-domain plan for all imported
  legacy rule/guardrail material.
- No active Studio path contains raw legacy agent governance, soul, harness, or
  IDE rule material.
- Useful domain knowledge has been rewritten into Studio artifacts/patterns or
  reference docs.
- Governing behavior has either been rejected or moved into the OpenClaw
  workspace / Channel Manager spec surface.
- Large generated/vendor/reference material is not treated as active guardrail
  content.
- Any removed placeholders are reflected in roadmap/docs so future sessions do
  not chase ghost paths.

