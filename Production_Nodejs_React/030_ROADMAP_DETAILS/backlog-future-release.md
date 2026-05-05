> **Note:** This file was split from `030_ROADMAP.md` on 2026-04-26 for easier navigation and smaller context windows. The canonical entry point is [`030_ROADMAP.md`](../030_ROADMAP.md).

# Backlog, future scope, release cadence

## 7. Backlog (kept, not scheduled)

These items were on the previous plan's task list and remain valid but are
not part of the A → B → C1 → C2 sequence above.

| Id     | Item                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| 6.3   | Memory history hydration (Rosetta scanner for `memory/*.md`).                           |
| 6.4   | TARS Hub deep-link integration (`:18789/chat?session=…`) from channel cards.            |
| 6.5   | Atomic config persistence hardening (chokidar signal on `POST /api/channels/config`).   |
| 6.6   | Session visibility: show `sessionKey` / parity indicator in the UI.                     |
| 6.9   | **Promoted active 2026-04-27:** Channel Manager chat media attachments — see §8b.8 and [`SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md`](./SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md). First slice: images; later phases: audio/video/files after gateway and safety gates. |
| 6.10b | A070 summary drafts from Channel Manager UI (`POST /api/ide-project-summaries`); **landed** — residual polish/guards per §8b.5. |
| 6.22  | **IDE chat capture pipeline:** **slice 2026-04-27:** `GET/POST …/capture/{status,run,settings,ensure-path,mount…}` + CM UI (Summaries tab) + `backend/services/ideChatCapture.js` (Cursor `workspaceStorage` → `capture/` + `manifest.jsonl`). **CM UX:** Linux SMB via **Step 0** terminal mount + mandatory **Step 1 Save path**; in-UI SMB wizard removed from the primary flow; save-status + diagnostics distinguish saved/path OK vs missing. **Remaining:** nightly Studio summary-delta job, other IDEs, retention policy. See [`ide-chat-capture-a070.md`](./ide-chat-capture-a070.md), `SPEC_8B5` §15–§15.10. |
| 6.11  | Skills tab filter/sort/search/custom order.                                             |
| 6.17  | Mark `toolResult` lines so they are not rendered as plain user-facing chat history.     |
| 6.18  | Session-native send binding (evidence `API_DIRECT_TEST_1814`).                          |
| 6.19  | Workbench / Channel Manager boundary hardening — see §8b.9.                             |
| 6.20  | Workbench diff-first artifact/worktree editor hardening — see [`SPEC_WORKBENCH_POSITIONING.md`](./SPEC_WORKBENCH_POSITIONING.md). |
| 6.21  | Slash-command parity and no-fake-send guardrails in CM chat — see §8b.10.               |
| 8.3   | MCP Sovereign Bridge verification after IDE reload.                                     |
| 9.*   | MCP whitelisting: `allowedMCPs` schema, UI, policy injection.                           |
| 10.1  | Replacement for `occ-ctl.mjs` (Makefile or root `package.json`).                        |
| 11.1  | Absolute-path audit across `.js`/`.mjs`/`.sh`/`.json`.                                  |
| 11.3  | ARYS/GILD metadata sync (`git_path` mass update).                                       |
| 6.23  | **(Optional)** **Workbench / CM — operator corpus discovery & tag hygiene.** **(A) Search:** portable **name + metadata** search and optional **semantic** index over a **rebuilt** governed corpus (old Everything + local RAG pattern; **not** Open Brain / memex). Prior art in **`General_Dev`:** `Master_Rules/.cursor/skills/framework-rag/scripts/framework_rag.py` (Ollama + SQLite; `framework_rag.db` is legacy cache only). Lesson record: `gendev-lesson-portable-search`. **(B) Tag vocabulary lint:** merge/validate YAML `tags:` (and related front matter) against a canonical tag map and semantic index. Prior art in **`General_Dev`:** `Master_Rules/master_tag_system.yml`, `Master_Rules/TAG_SEMANTIC_INDEX.md`. Lesson record: `gendev-lesson-tag-vocabulary-lint`. **Trace:** studio batch `Studio_Framework/095_Migration_Staging/General_Dev/<batch-id>/lessons/`; [`SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md`](./SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md) §7 (*Portable Studio search*, *Studio tag vocabulary and tag lint*). |
| 6.24  | **CM chat composer — context-window indicator.** Add a compact remaining-context / token-budget indicator in the composer chrome, ideally as a circular meter near attachment + send controls. Show usable remaining budget, degrade gracefully when provider/runtime cannot expose exact numbers, and avoid fake precision. |
| 6.25  | **CM chat composer — stop / interrupt button.** Add an operator-visible stop control near the send area so active assistant runs can be interrupted cleanly without losing the transcript. Define backend/session semantics first: cancel generation vs stop tool loop vs mark run interrupted. |
| 6.26  | **CM chat composer — mid-run follow-up injection / "keep thinking with this".** Evaluate whether OpenClaw sessions can accept additional user input while a run is still progressing (Codex-style). If runtime allows it, expose a safe UI affordance for adding guidance during an active run; otherwise document the hard boundary and fallback UX. |
| 6.27  | **CM chat history — edit and resend previous user prompt.** Add classic message edit/retry affordance for prior user prompts, with explicit transcript semantics (new message derived from edited prompt vs destructive rewrite). Prefer traceable resend over hidden history mutation. |
| 6.28  | **CM multi-chat visibility / split chat workspaces.** The operator should be able to keep at least two OpenClaw chat sessions visible or quickly switchable at the same time without one chat panel collapsing the other (e.g. General + Idea Capture). Minimum useful target: dual visible chat panes/tabs or pinned parallel chat surfaces for fast cross-session hopping. |
| 6.29  | **Promoted active 2026-05-05:** **Channel Runtime Binding / canonical session model.** Channel Manager must stop treating `main`, `explicit:<uuid>`, DM, and Telegram group sessions as equivalent in managed channel context. Introduce a channel-first binding abstraction: CM target -> canonical OpenClaw agent -> canonical Telegram gateway session -> canonical transcript source. Add channel-aware deep links, identity badges, mismatch warnings, advanced grouping for non-canonical sessions, and a channel-centered runtime timeline with canonical/off-canonical lanes. See [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md). |

---

## 8. Future (out of scope for this cycle)

- **Triad weighting in the channel UI** (three sliders summing to 100 %);
  depends on Harness/OpenClaw semantics and schema work.
- **Main-agent dynamic spawn flag** (a main agent allowed to spawn additional
  sub-agents at runtime); depends on OpenClaw runtime contract.
- **Multi-user or remote operator UIs.**
- **Engine-per-message picker** — explicitly rejected in `040_DECISIONS.md`
  §ADR-007; do not re-raise without a new decision record.

---

## 9. Release cadence

- **Phase 0** — landed.
- **Bundle A** — landed as three commits (P1, P2, P3) in that order.
- **Bundle B** — closed 2026-04-18 (P5 + P4). `/api/telegram/*` and
  `/api/openclaw/*` remain as **one-release** thin aliases; remove in the
  following PR after clients migrate.
- **Bundle C1** — apply MVP landed 2026-04-18 (`requireMention` merge + UI).
- **Bundle C1b** — slice closed (§5.1, 2026-04-20): **C1b.1** … **C1b.3** as above; **C1b.2c** workspace-default model opt-in shipped. Further C1b work only if re-scoped. See §5.1 in [`historical-bundles.md`](./historical-bundles.md).
- **Bundle C2** — landed 2026-04-18 (summary → memory promote + modal).
- **Local LLM (LM Studio) wiring** — landed 2026-04-18: `lmstudio` provider registered, plugin enabled, all CM channels and `agents.list[]` re-pointed to `lmstudio/google/gemma-4-26b-a4b`. Open dependency: LM Studio `n_ctx ≥ 16384` (operator action, see §8b.3 in [`8b-followups.md`](./8b-followups.md)). Webchat-vs-binding parity is upstream (§8b.2a, ADR-018).

Each PR updates `030_ROADMAP.md` (snapshot / pointers) and detail files under `030_ROADMAP_DETAILS/` when a block changes. Append a new entry to `040_DECISIONS.md` only if it contains an irrevocable architectural choice.
