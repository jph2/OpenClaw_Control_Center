# Channel Manager — Roadmap

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-17

> The roadmap lists what is **done**, what is **in flight**, and what is
> **explicitly not yet in scope**. Long prose about *why* each decision was
> taken belongs in [`040_DECISIONS.md`](./040_DECISIONS.md); what the system looks like
> today belongs in [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md).

---

## 1. Snapshot (2026-04-17)

| Area                                | State                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Configuration tab                   | Functional; TTG CRUD, sub-agent CRUD, skills list, row heights persist |
| OpenClaw Chat mirror                | Functional MVP (gateway-first read, CLI send); perf work pending       |
| Cursor Summary tab                  | Read-only MVP live; A070 list + renderer                               |
| IDE Bridge (MCP)                    | Live for `send_telegram_reply` and `change_agent_mode`                 |
| Exports (read-only projections)    | Live: `/api/exports/{canonical,openclaw,ide,cursor}`                   |
| Config Apply to `openclaw.json`     | Not yet exposed (Bundle C1)                                            |
| Summary promotion to memory/        | Not yet exposed (Bundle C2)                                            |
| `occ-ctl.mjs`                       | Not in tree; `npm start` / `npm run dev` are the current entrypoints   |

---

## 2. Phase 0 — Documentation consolidation (done today)

**Outcome:** 14 patched/dated documents distilled into 4 normative docs:

- `010_VISION.md` — purpose, principles, non-goals
- `020_ARCHITECTURE.md` — the current system
- `030_ROADMAP.md` — this file
- `040_DECISIONS.md` — ADR log

Source documents moved to `_archive/2026-04/` with a breadcrumb pointer
(`_archive/2026-04/README.md`). The archive is **reference-only**; new
information lands in the four normative docs.

---

## 3. Bundle A — Performance and cleanup (next)

**Goal:** unbreak CPU and perceived latency, remove dead code and stale
fallbacks. No architectural changes. Lands as one PR (three commits).

### A / P1 — Fan kill

- Replace 2-second sessions-directory polling in `telegramService.js` with
  `chokidar.watch()` scoped to the active canonical `sessionFile`(s).
- Remove `hydrateOpenclawSessionIndex` calls from the hot paths
  (`resolveCanonicalSession`, `sendMessageToChat`); keep a single debounced
  watcher on `sessions.json`.

### A / P2 — Perceived latency

- `TelegramChat.jsx`: switch `scrollToBottom` to `behavior: 'auto'`; only
  scroll when the container is near the bottom; skip auto-scroll for messages
  that are filtered out.
- Wrap SSE `setMessages` updates in `startTransition` where they cause visible
  stutter.

### A / P3 — Dead code purge

- Delete `historyScanner.mjs`, the `Telegraf` import, the `bot` / `relayBot`
  globals, `getChatBots`, the hardcoded `-3736210177` alias fix-up, and the
  Prototyp-path fallback.
- Delete `sendViaHttpGateway` and its call site in `sendMessageToChat` until
  the OpenClaw gateway exposes a functional
  `POST /api/v1/sessions/:sessionId/send`.

**Acceptance:**

- CPU on idle chat panel drops to near zero.
- First paint of an open chat under ~300 ms on a warm backend.
- No references to `historyScanner`, `Telegraf`, `sendViaHttpGateway`, or the
  hardcoded group-id fallback remain in `grep`.

---

## 4. Bundle B — Refactor (after A)

**Goal:** split the god objects so Bundle C can be built on clean seams.
Keep external API stable; mount aliases for one release.

### B / P5 — Service split

Split `telegramService.js` into focused modules under `backend/services/chat/`:

- `sessionIndex.js` — `sessions.json` watcher + group/session mapping.
- `sessionTail.js` — chokidar tail of one canonical JSONL.
- `messageModel.js` — `buildMsgObjFromGatewayLine` and UI-shape helpers.
- `sessionSender.js` — `openclaw` CLI wrapper (and, later, native session send).
- `channelAliases.js` — channel alias resolution from `channel_config.json`.

Frontend: extract `useChatSession(groupId)` hook; rename `TelegramChat.jsx`
to `ChatPanel.jsx` (render-only).

### B / P4 — Route consolidation

Merge `routes/telegram.js` and `routes/openclaw.js` into `routes/chat.js`
exposing `/api/chat/:groupId/{session,stream,send}`. Delete the dynamic
`await import` workaround in `routes/openclaw.js`. Keep `/api/telegram/*`
and `/api/openclaw/session/*/send` mounted as thin aliases for **one**
release, then remove.

**Acceptance:**

- No single service file > ~250 lines.
- No dynamic imports in route files.
- Old paths still respond; new paths documented in `020_ARCHITECTURE.md`.

---

## 5. Bundle C1 — Config apply (after B)

**Goal:** let the operator promote `channel_config.json` state into the
OpenClaw Gateway's `openclaw.json`, safely.

### Backend

- `POST /api/exports/openclaw/apply` with:
  - `dryRun: true` as default.
  - JSON-schema check of the projected object.
  - File lock on `~/.openclaw/openclaw.json`.
  - Timestamped backup (`openclaw.json.<ts>.bak`).
  - Atomic write (temp file + `rename`).
  - Audit entry (who, when, diff hash).
  - One-click undo: restore from the last `.bak`.

### Frontend

- **Apply** button on the Configuration tab.
- Modal with a readable diff between disk and projection, schema errors, and
  destination path.
- "Undo last apply" button while a recent `.bak` is present.

**Acceptance:**

- No apply can happen without explicit Confirm in the dialog.
- Backups accumulate to a bounded number (rotate after N).
- Schema failure blocks write.

---

## 6. Bundle C2 — Summary → memory promotion (after C1)

**Goal:** let the operator explicitly carry an IDE/Cursor summary into
OpenClaw's memory space.

### Backend

- `POST /api/summaries/promote` writing into
  `~/.openclaw/workspace/memory/YYYY-MM-DD.md` with:
  - Append semantics, not replace.
  - De-duplication (skip if the exact block already exists).
  - `MEMORY.md` **only** as an explicit destination opt-in.
  - Audit entry.

### Frontend

- **Promote to OpenClaw memory** button on each summary entry in the Cursor
  Summary tab.
- Modal:
  - Destination selector (default: today's daily file).
  - Full preview of the text to be written.
  - Dedup warning when the block already exists in the destination.
  - Confirm / Cancel.

**Default mode:** manual-with-preview (see `040_DECISIONS.md` §ADR-014).

**Acceptance:**

- Nothing lands in `memory/` without an explicit click.
- `MEMORY.md` requires an additional opt-in from the destination selector.

---

## 7. Backlog (kept, not scheduled)

These items were on the previous plan's task list and remain valid but are
not part of the A → B → C1 → C2 sequence above.

| Id     | Item                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| 6.3   | Memory history hydration (Rosetta scanner for `memory/*.md`).                           |
| 6.4   | TARS Hub deep-link integration (`:18789/chat?session=…`) from channel cards.            |
| 6.5   | Atomic config persistence hardening (chokidar signal on `POST /api/channels/config`).   |
| 6.6   | Session visibility: show `sessionKey` / parity indicator in the UI.                     |
| 6.9   | Native chat media (images/files) — requires gateway support.                            |
| 6.10b | Write new A070 summary markdown from the UI (today: read-only).                         |
| 6.11  | Skills tab filter/sort/search/custom order.                                             |
| 6.17  | Mark `toolResult` lines so they are not rendered as plain user-facing chat history.     |
| 6.18  | Session-native send binding (evidence `API_DIRECT_TEST_1814`).                          |
| 8.3   | MCP Sovereign Bridge verification after IDE reload.                                     |
| 9.*   | MCP whitelisting: `allowedMCPs` schema, UI, policy injection.                           |
| 10.1  | Replacement for `occ-ctl.mjs` (Makefile or root `package.json`).                        |
| 11.1  | Absolute-path audit across `.js`/`.mjs`/`.sh`/`.json`.                                  |
| 11.3  | ARYS/GILD metadata sync (`git_path` mass update).                                       |

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

- **Phase 0** — this commit.
- **Bundle A** — one PR; three commits (P1, P2, P3) in that order.
- **Bundle B** — one PR; `/api/telegram/*` aliases kept for **one release**,
  then removed in the following PR.
- **Bundle C1, C2** — one PR each, blocked on B.

Each PR updates `030_ROADMAP.md` (moves its block to "done") and appends a new
entry to `040_DECISIONS.md` only if it contains an irrevocable architectural
choice.
