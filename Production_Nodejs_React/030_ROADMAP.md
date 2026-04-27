# Channel Manager — Roadmap

**Status:** normative index · **Scope:** `Production_Nodejs_React` · **Last reviewed:** 2026-04-27

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
| Current status and priorities | This file |
| Phase 0, Bundles A/B/C1/C1b/C2 history | [`030_ROADMAP_DETAILS/historical-bundles.md`](./030_ROADMAP_DETAILS/historical-bundles.md) |
| §8b follow-ups and detailed active specs | [`030_ROADMAP_DETAILS/8b-followups.md`](./030_ROADMAP_DETAILS/8b-followups.md) |
| Backlog table, future scope, release cadence | [`030_ROADMAP_DETAILS/backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md) |
| Dual-target agents / sub-agents / skills (OpenClaw + Cursor) | [`030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) |
| IDE chat capture / A070 specifics | [`030_ROADMAP_DETAILS/ide-chat-capture-a070.md`](./030_ROADMAP_DETAILS/ide-chat-capture-a070.md) |
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
| Summary promotion to memory | Live (C2): explicit `POST /api/summaries/promote` / `POST /api/ide-project-summaries/promote`; no silent memory writes. |
| Local LLM / LM Studio | Wired; operator must still load model in LM Studio with sufficient `n_ctx` (`>= 16384`, 32768 recommended). |
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

---

## 4. Active / Next Blocks

| Block | Status | Next useful action |
| ----- | ------ | ------------------ |
| §8b.5 — IDE Memory Bridge | Summary → TTG scoring/review is implemented; current hardening loop is candidate-shape normalization and promote allowlist tightening. See [`SPEC_8B5_IDE_MEMORY_BRIDGE.md`](./030_ROADMAP_DETAILS/SPEC_8B5_IDE_MEMORY_BRIDGE.md). | Harden `agent_classification` review surfaces: normalize string/object candidates everywhere, make promote eligibility an explicit allowlist, and preserve classifier distributions as review evidence only. |
| §8b.8 / 6.9 — Channel Manager chat media attachments | V1 image send/mirror/render path is implemented; current hardening loop is media preview correctness and file-serving safety. See [`SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md`](./030_ROADMAP_DETAILS/SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md). | Harden V1 image path: fix optimistic `data:` previews, validate MIME/size before browser reads, serve mirrored media with symlink/scope protections, and render only `image/*` media as image parts. |
| C1c / §8b.7A — Dual-target Agent/Skill configuration | Active; OpenClaw **Apply** ~92–96%, **Runtime** ~55–70%; Cursor **Repo-Export** ~88–93%, **IDE-Parität** ~40–55%. See [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./030_ROADMAP_DETAILS/SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md). | Close Cursor export gap (~90–95%): `--prune-managed`, skill existence checks, MCP bridge verification. OpenClaw: configured-vs-runtime topology/readback, stale-session guidance. |
| 6.22 — IDE chat capture pipeline | Partially shipped; see [`030_ROADMAP_DETAILS/ide-chat-capture-a070.md`](./030_ROADMAP_DETAILS/ide-chat-capture-a070.md). | After path/mount UX stabilization, implement nightly summary-delta job and retention policy. |
| §8b.6 — Studio corpus onboarding | Planned gate before live Open Brain priority. | Ingest external materials into Studio Framework, normalize headers/structure, then treat export/sync as meaningful. |
| §8b.7 — TTG topology readout | Planned after §8b.5 is stable. | Define read-only effective topology shape (agent, model, channel skills, sub-agents, runtime confirmation). |

---

## 5. Backlog And Later Work

The backlog table and release cadence live in
[`030_ROADMAP_DETAILS/backlog-future-release.md`](./030_ROADMAP_DETAILS/backlog-future-release.md).

High-signal later items:

- Channel Manager chat media V1 is now active as §8b.8 / 6.9 above.
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
