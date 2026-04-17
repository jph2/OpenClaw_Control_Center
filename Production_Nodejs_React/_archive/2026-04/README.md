# Archive — 2026-04

**Status:** reference-only · Archived on 2026-04-17 as part of Phase 0
documentation consolidation (see `040_DECISIONS.md` ADR-016).

The 14 documents below were the working set for the Channel Manager between
2026-04-10 and 2026-04-17. They accumulated correct, dated observations
alongside patches, retractions and mutually contradictory statements.
Their content has been **distilled** into four normative documents in the
parent folder:

- [`../../010_VISION.md`](../../010_VISION.md) — purpose, principles, non-goals
- [`../../020_ARCHITECTURE.md`](../../020_ARCHITECTURE.md) — current system
- [`../../030_ROADMAP.md`](../../030_ROADMAP.md) — phases and schedule
- [`../../040_DECISIONS.md`](../../040_DECISIONS.md) — ADR log

> **Do not edit these archived files.** New information belongs in the four
> normative documents above. Use the archive to trace historical context
> only.

---

## Breadcrumb — where each document's content now lives

### Specification and master docs

| Archived file                                   | Distilled into                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CHANNEL_MANAGER_SPECIFICATION.md`              | `020_ARCHITECTURE.md` (sections 2–7), `040_DECISIONS.md` (ADR-001, ADR-003, ADR-007, ADR-010, ADR-011, ADR-012) |
| `CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md`   | `020_ARCHITECTURE.md` §§3–8, Anti-patterns table §8; `040_DECISIONS.md` (ADR-002, ADR-006, ADR-009, ADR-013)  |
| `CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md`        | `030_ROADMAP.md` §§2–7 (bundles + backlog); residual MCP phases → `030_ROADMAP.md` §7 backlog                 |

### Rebuild and scope

| Archived file                                   | Distilled into                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `CHANNEL_MANAGER_CHAT_REBUILD_PLAN_2026-04-17.md` | `020_ARCHITECTURE.md` §6 (chat pipeline current state); `030_ROADMAP.md` §3 Bundle A |
| `CHANNEL_MANAGER_SCOPE_MVP_2026-04-15.md`       | `010_VISION.md` §5 (non-goals), `040_DECISIONS.md` ADR-012                        |

### Discovery and research

| Archived file                                   | Distilled into                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md`       | `020_ARCHITECTURE.md` §5 (MCP); `040_DECISIONS.md` ADR-005, ADR-015               |
| `CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md` | `040_DECISIONS.md` ADR-004 (three-concept separation)             |
| `CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md`       | `020_ARCHITECTURE.md` §4.2 (`skillsRegistry`); `030_ROADMAP.md` §7 (6.11 filter)  |
| `CHANNEL_MANAGER_TelegramSync_DISCOVERY.md`     | `020_ARCHITECTURE.md` §6 (read path), Anti-patterns §8; superseded by ADR-001 |
| `CHANNEL_MANAGER_TelegramSync_RESEARCH.md`      | `040_DECISIONS.md` ADR-001, ADR-013                                           |

### Testing, restoration, and operations

| Archived file                                   | Distilled into                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `CHANNEL_MANAGER_TESTING_PLAN.md`               | Residual value in `030_ROADMAP.md` §3 Bundle A acceptance criteria            |
| `OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md` | `020_ARCHITECTURE.md` §8 (Anti-patterns); `030_ROADMAP.md` §7 backlog (10.1)     |
| `WORKBENCH_DOCUMENTATION_10-04-2026.md`         | `020_ARCHITECTURE.md` §7 (Workbench file view)                                |
| `Channel_Manager_Anti-Gravity_Plugin_Overview.md` | `020_ARCHITECTURE.md` §5 (MCP), `040_DECISIONS.md` ADR-009                      |

---

## Why the archive exists

The previous layout had four levels of correctness coexisting in the same
folder at the same time:

1. The stable "ground truth" sections of the spec.
2. Dated patches appended as new subsections.
3. Mid-flight rebuild notes in a separate file.
4. A restoration report reacting to a broken worktree.

This produced an unintended reading load: to answer "what does the system do
today?", a reader had to merge four timelines manually. The four normative
documents in the parent folder replace that mental merge. The archive is
kept for traceability, audits, and the occasional historical lookup.

If you are tempted to update an archived document, **stop**: add to the
matching normative document instead, and if the change is architectural,
append a new ADR entry.
