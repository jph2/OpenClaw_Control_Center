# Channel Manager — Roadmap

**Status:** normative index · **Scope:** `Production_Nodejs_React` · **Last reviewed:** 2026-04-30

> This file is the **one-screen entry point** for what is done, what is active,
> and where the detail specs live. Long implementation history is intentionally
> split into `030_ROADMAP_DETAILS/` so future sessions can load only the relevant block
> and preserve context-window budget.

---

## 1. How To Read This Roadmap

Use this file first. Then open only the linked detail file for the block you are
working on.

| Need | Open |
| ---- | ---- |
| **Governance stack** (CM vs OpenClaw workspace vs Cursor — rules, soul, skills) | [`030_ROADMAP_DETAILS/SPEC_GOVERNANCE_STACK_V1.md`](./030_ROADMAP_DETAILS/SPEC_GOVERNANCE_STACK_V1.md) |
| Current status and priorities | This file |
| Phase 0, Bundles A/B/C1/C1b/C2 history | [`030_ROADMAP_DETAILS/historical-bundles.md`](./030_ROADMAP_DETAILS/historical-bundles.md) |
| §8b follow-ups and detailed active specs | [`030_ROADMAP_DETAILS/8b-followups.md`](./030_ROADMAP_DETAILS/8b-followups.md) |
| Backlog table, future scope, release cadence | [`030_ROADMAP_DETAILS/backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md) |
| Dual-target agents / sub-agents / skills (OpenClaw + Cursor) | [`030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) |
| **Unified worker model + dual projection** (logical agents/workers, OpenClaw vs Cursor semantics) | [`030_ROADMAP_DETAILS/SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md) |
| Channel Runtime Binding / canonical session model | [`030_ROADMAP_DETAILS/SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_RUNTIME_BINDING_V1.md) |
| IDE chat capture / A070 specifics | [`030_ROADMAP_DETAILS/ide-chat-capture-a070.md`](./030_ROADMAP_DETAILS/ide-chat-capture-a070.md) |
| General_Dev -> Studio migration plan | [`030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`](./030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md) |
| §8b.6D — Domain → artifact & TTG mapping | [`030_ROADMAP_DETAILS/SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md) |
| §8b.6C — Studio ARYS header governance | [`030_ROADMAP_DETAILS/SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md) |
| §8b.6E — Legacy rules / guardrails reclassification | [`030_ROADMAP_DETAILS/SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md) |
| General_Dev lessons / reimplementation candidates | [`030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md`](./030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md) |
| Architecture | [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md) |
| ADRs / irreversible decisions | [`040_DECISIONS.md`](./040_DECISIONS.md) |

**Preservation rule:** Do not delete detail from the roadmap system. If a block
becomes too long for this index, move it into a linked file under
`030_ROADMAP_DETAILS/` and leave a short status row here.

---

## 2. Snapshot

| Area | State |
| ---- | ----- |
| Configuration tab | Functional; TTG CRUD, sub-agent CRUD, skills list, row heights persist. |
| OpenClaw Chat mirror | Functional; auto-scroll v3, tool chips collapsed, optimistic user bubble, gateway-native transport slice shipped with CLI fallback. Next active backlog pull-forward: structured chat media attachments. |
| Cursor / IDE summaries tab | Live; A070 summary list/renderer, summary drafts, memory promote modal, project mapping, artifact index/review, Open Brain export/stub sync. |
| IDE chat capture | **Partially shipped (6.22):** backend capture endpoints + Summaries UI. Linux flow is **Step 0 terminal mount** + **required Step 1 Save path**. Old in-UI SMB wizard removed. Remaining: nightly summary-delta job, retention, other producers. |
| IDE Bridge (MCP) | Live for `send_telegram_reply` and `change_agent_mode`. |
| Exports | Live: `/api/exports/{canonical,openclaw,ide,cursor}`; IDE export apply + stale-check v2 (managed blocks, orphan detection). Repo-Export ~88–93%; next: prune-managed, skill/MCP verification toward 90–95%. |
| Config Apply to `openclaw.json` | C1/C1b shipped: group policy, synth agents/bindings, skills merge, orphan prune, account policy, defaults model opt-in, stale-session release script. Next: runtime verification/readback. |
| Channel Runtime Binding / canonical sessions | **New active spec.** Channel Manager must treat managed Telegram channels as channel-first runtime bindings, not generic agent-session pickers. Distinguish CM target, Gateway session, Transcript source, and channel runtime timeline. See [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_RUNTIME_BINDING_V1.md). |
| **Unified worker + dual projection (§8b.7C / C1e)** | **New architecture programme.** Single logical model for engines/workers with **per-target projection** (OpenClaw: merged skills vs dedicated list/spawn; Cursor: `.md` agents vs Task-type mapping; channel-multiplex vs repo-global honesty). Operational “echter Worker” is **testable** (identity, model policy, context boundary, delegation contract, audit). See [`SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md). Implementation hardening remains under C1c/C1d; this spec **owns semantics and phasing**. |
| Summary promotion to memory | Live (C2): explicit `POST /api/summaries/promote` / `POST /api/ide-project-summaries/promote`; no silent memory writes. |
| Local LLM / LM Studio | Wired; operator must still load model in LM Studio with sufficient `n_ctx` (`>= 16384`, 32768 recommended). |
| Studio ARYS header governance (§8b.6C) | **V1 read-only scan** lives in sibling repo `Studio_Framework/tools/arys_header_governance/`; normative spec [`SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md). |
| **Domain → artifact & TTG mapping (§8b.6D)** | **Established for freeze `2026-04-27-1fe240e`.** Reports and checklist: Studio [`reports/domain-mapping-status.md`](../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/reports/domain-mapping-status.md). Future freezes re-use the versioned YAML template under each new `batch-id`. Normative spec: [`SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md). |
| **Legacy rules / guardrails reclassification (§8b.6E)** | **Active cleanup.** Review imported `General_Dev` rules/guardrails by owner surface: Studio artifacts/patterns, OpenClaw governance, Channel Manager specs/config, tooling, reference/archive, or discard. Spec: [`SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md). |
| **Governance stack** (CM vs OpenClaw workspace vs IDE) | [`SPEC_GOVERNANCE_STACK_V1.md`](./030_ROADMAP_DETAILS/SPEC_GOVERNANCE_STACK_V1.md): CM = control plane / Apply–export; **`~/.openclaw/workspace/`** = soul, `GOVERNANCE.md`, skills; Studio = **one** `.cursor/rules/openclaw-workspace-authority.mdc` pointer (no extra normative `.mdc` shards). |
| OpenClaw webchat ↔ Telegram binding parity | Known upstream limitation (ADR-018): webchat session resolver still reads defaults for some group sessions. |

---

## 3. Closed Blocks

Details live in [`030_ROADMAP_DETAILS/historical-bundles.md`](./030_ROADMAP_DETAILS/historical-bundles.md).

| Block | Status |
| ----- | ------ |
| Phase 0 — documentation consolidation | Closed; four normative docs plus archive pointer. |
| Bundle A — performance and cleanup | Closed 2026-04-18; fan-kill, latency, scroll v3, dead code purge, tool accordion. |
| Bundle B — refactor | Closed 2026-04-18; chat service split and `/api/chat/*` route consolidation. |
| Bundle C1 — Config Apply MVP | Closed 2026-04-18; preview/confirm/backup/audit apply path. |
| Bundle C1b — Master config → OpenClaw | Closed 2026-04-20; model routing, synth agents, skills, account policy, defaults opt-in, stale-session script. |
| Bundle C2 — Summary → memory promotion | Closed 2026-04-18; explicit dry-run/confirm promote into OpenClaw memory. |
| §8b.6B — General_Dev lessons / reimplementation candidates (batch triage) | **Closed 2026-04-28** for mirror batch `2026-04-27-1fe240e`: lesson records archived under `Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/_archive/`; outcomes in [`STUDIO_BRIDGE.md`](../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/STUDIO_BRIDGE.md). Follow-up work: **§8b.6C**, **§8b.6D**, backlog **6.23**. Methodology for future batches: [`SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md`](./030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md). |
| §8b.6 — batch `2026-04-27-1fe240e` staging & import pass | **Closed 2026-04-29** at batch level: planned admits, consumptions, and quarantines for this freeze are complete. Canonical narrative + review pointers: Studio [`BATCH.md`](../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md). Remaining work is **explicit review queues** (`095_Migration_Staging/General_Dev/*_to_REVIEW/`) and manifest **deferred / proposed / blocked** rows — not hidden “open staging” inside the batch folder. **New** bulk migration requires a **new** `General_Dev` freeze and batch id. |

---

## 4. Active / Next Blocks

| Block | Status | Next useful action |
| ----- | ------ | ------------------ |
| §8b.5 — IDE Memory Bridge | Summary → TTG scoring/review is implemented; current hardening loop is candidate-shape normalization and promote allowlist tightening. See [`SPEC_8B5_IDE_MEMORY_BRIDGE.md`](./030_ROADMAP_DETAILS/SPEC_8B5_IDE_MEMORY_BRIDGE.md). | Harden `agent_classification` review surfaces: normalize string/object candidates everywhere, make promote eligibility an explicit allowlist, and preserve classifier distributions as review evidence only. |
| §8b.8 / 6.9 — Channel Manager chat media attachments | V1 image send/mirror/render path is implemented; current hardening loop is media preview correctness and file-serving safety. See [`SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md). | Harden V1 image path: fix optimistic `data:` previews, validate MIME/size before browser reads, serve mirrored media with symlink/scope protections, and render only `image/*` media as image parts. |
| C1c / §8b.7A — Dual-target Agent/Skill configuration | Active; OpenClaw **Apply** ~92–96%, **Runtime** ~55–70%; Cursor **Repo-Export** ~88–93%, **IDE-Parität** ~40–55%. See [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md). | Close Cursor export gap (~90–95%): `--prune-managed`, skill existence checks, MCP bridge verification. OpenClaw: configured-vs-runtime topology/readback, stale-session guidance. |
| C1d / §8b.7B — Channel Runtime Binding / canonical session model | **New active refactor.** The remaining TTG000/TTG001 confusion is an identity/context-selection problem: CM target, Gateway session, Transcript source, and visible event history can diverge. See [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_RUNTIME_BINDING_V1.md). | Introduce a Channel Runtime Binding resolver, open CM webchat links by channel id/canonical Telegram session, add mismatch warnings, move `main` / `explicit:<uuid>` / DM sessions into advanced/debug context, and add a channel-centered runtime timeline. |
| **C1e / §8b.7C — Unified worker model & dual-target projection** | **New programme.** Escapes the collision between CM `subAgents[]` (skills-only merge into OpenClaw synth vs separate Cursor `.md` files), OpenClaw **runtime** subagents, and Cursor **Task** subagent types. Defines testable **worker** semantics and projection metadata so CM stays **single source of truth** without claiming impossible IDE parity. Current CM sub-agents should be treated as **Skill Roles / Capability Roles** until explicitly promoted. See [`SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md). | P0: vocabulary + projection badges (`merged into synth`, `Runtime Worker: no`). P1: projection hints in CM snapshot/schema design. P2: WorkerSpec layer beside legacy Skill Roles. **Before P3:** satisfy `040_DECISIONS.md` Gate **G2** (choose OpenClaw worker mechanism) and respect **G7** (no full WorkerSpec config migration before proof/schema-slice ADR). P3: one headless OpenClaw worker path or spawn policy + readback. P4: Cursor Task mapping where feasible + repo-global limits. P5: timeline worker events aligned with [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_RUNTIME_BINDING_V1.md). |
| 6.22 — IDE chat capture pipeline | Partially shipped; see [`030_ROADMAP_DETAILS/ide-chat-capture-a070.md`](./030_ROADMAP_DETAILS/ide-chat-capture-a070.md). | After path/mount UX stabilization, implement nightly summary-delta job and retention policy. |
| §8b.6 — General_Dev -> Studio corpus migration (programme) | **Freeze `2026-04-27-1fe240e`:** staging and import pass **closed** 2026-04-29 ([`BATCH.md`](../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md)). Waves 1–2, script/tool intake, and pilot consumption are done; consumed snapshots live under `CONSUMED_IMPORTS___DONE/` in that batch. The **migration programme** stays open for: draining `*_to_REVIEW` queues, validating promoted tools, clearing deferred manifest rows, §8b.6C header maturation, and any **future** source freeze. Spec: [`SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`](./030_ROADMAP_DETAILS/SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md). | Work the review queues and manifest deferrals; validate the six promoted tools in their target environments. Do not assume further bulk import from `1fe240e` without a documented reopen decision — prefer a new batch after a new freeze. |
| **§8b.6D — Domain → Studio artifact & TTG mapping** | **Functional cut** is proven for `2026-04-27-1fe240e` (see Studio [`reports/domain-mapping-status.md`](../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/reports/domain-mapping-status.md)). Same methodology applies to future batches; versioned YAML per `batch-id`. See [`SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md). Prior art: archived lesson `gendev-lesson-domain-ttg-mapper`. | When opening a **new** freeze: copy the mapping template pattern, re-run classifier validation, and keep accepted-prefix import tooling restricted to true artifact/standards lanes. |
| **§8b.6E — Legacy rules / guardrails reclassification** | **Active cleanup + governance enforcement.** Implements the boot-level `GOVERNANCE.md` intelligence-placement policy for imported `General_Dev` rules/guardrails: review by function, not old path. Studio keeps durable artifacts, domain patterns, best practices, anti-patterns, and examples; OpenClaw owns behavioral governance; Channel Manager owns orchestration/config/specs; scripts/reference/vendor dumps go elsewhere. See [`SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md). | Build disposition tables for `RULES_to_REVIEW`, starting with `060_Domain_Guardrails`; enforce `GOVERNANCE.md` placement decisions before anything returns to active paths; remove active ghost placeholders once docs no longer depend on them. |
| **§8b.6C — Studio ARYS header governance** | **High priority / next slice.** Replace legacy General_Dev Python header stack with **Studio-native**, read-first tooling: structural scans, duplicate `id` reports, mechanical vs semantic review split; optional later apply with dry-run. **V1 shipped:** `Studio_Framework/tools/arys_header_governance/scan-markdown-headers.mjs`. See [`SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md`](./030_ROADMAP_DETAILS/SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md). Prior art: archived lesson `gendev-lesson-header-normalization`; legacy `General_Dev/Master_Rules/040_Framework_TOOLS/arys_header_normalize_v12.py` (+ validators). | Run default scan on `050_Artifacts/` before releases or in CI; extend with per-type rules, manifest `header: fixed/review`, and CM artifact index hooks. |
| §8b.7 — TTG topology readout | Planned after §8b.5 is stable. | Define read-only effective topology shape (agent, model, channel skills, sub-agents, runtime confirmation). |

---

## 5. Backlog And Later Work

The backlog table and release cadence live in
[`030_ROADMAP_DETAILS/backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md).

High-signal later items:

- **(Optional)** Workbench **corpus search** + **tag vocabulary lint** (same backlog **6.23**) — not Open Brain; prior art in `General_Dev`: `Master_Rules/.cursor/skills/framework-rag/scripts/framework_rag.py`; `Master_Rules/master_tag_system.yml`; `Master_Rules/TAG_SEMANTIC_INDEX.md`. See [`backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md).
- Channel Manager chat media V1 is now active as §8b.8 / 6.9 above.
- **Chat UX cluster (backlog 6.24–6.28):** remaining-context indicator, stop/interrupt button, optional mid-run follow-up injection, edit+resend for prior prompts, and multi-chat visibility / dual-session handling. See [`backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md).
- Workbench / Channel Manager boundary hardening: [`SPEC_WORKBENCH_POSITIONING.md`](./030_ROADMAP_DETAILS/SPEC_WORKBENCH_POSITIONING.md) and [`SESSION_CLEANUP_2026-04-25.md`](./030_ROADMAP_DETAILS/SESSION_CLEANUP_2026-04-25.md).
- Slash-command parity and no-fake-send guardrails in CM chat (§8b.10).
- MCP whitelisting and Sovereign Bridge verification (after C1c / Cursor bundle v2 contracts stabilize).
- Replacement for the missing `occ-ctl.mjs` entrypoint.

---

## 6. Current IDE Capture Operator Truth

This is repeated here because it caused the most recent confusion:

1. **Step 0** makes `workspaceStorage` readable by the backend host
   (manual CIFS mount, local tree, WSL path, or other mount).
2. **Step 1 Save path is required** for normal setups. It persists the exact
   `workspaceStorage` path to `ide_capture_settings.json`; otherwise the backend
   does not know which path to scan. The normal exception is a server-side
   `CURSOR_WORKSPACE_STORAGE_ROOT` env override.
3. **Step 2 `mkdir -p` is optional** and only creates missing directories; it
   never copies chats and is unnecessary if Step 0 already created/mounted the
   tree.

If diagnostics say **reachable on API host**, the mount/path problem is solved;
debug remaining capture issues as extraction, permissions, last-run errors, or
downstream summary work.

**Git (this repo, `main`):** `874f51d` — CLI-first capture flow, `030_ROADMAP_DETAILS/`
split, UI/docs alignment; `9b56316` — ignore `**/ide_capture_settings.json` at repo
root so operator paths stay local. **Studio_Framework** (runbook + A070 `capture/`
hygiene): `c6dce69`, `547c9e1`.

---

## 7. Maintenance Rule

Each PR or work session updates:

1. `030_ROADMAP.md` for status rows and routing.
2. The owning detail file under `030_ROADMAP_DETAILS/` for full context.
3. `040_DECISIONS.md` only for durable architecture decisions.

Avoid appending long handover prose directly to this file.
