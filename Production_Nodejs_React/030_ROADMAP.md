# Channel Manager — Roadmap

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-18

> The roadmap lists what is **done**, what is **in flight**, and what is
> **explicitly not yet in scope**. Long prose about *why* each decision was
> taken belongs in [`040_DECISIONS.md`](./040_DECISIONS.md); what the system looks like
> today belongs in [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md).

---

## 1. Snapshot (2026-04-18)

| Area                                | State                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Configuration tab                   | Functional; TTG CRUD, sub-agent CRUD, skills list, row heights persist                            |
| OpenClaw Chat mirror                | Functional; auto-scroll v3 live, tool chips collapsible, CLI routed through Node 24, dead code purged |
| Cursor Summary tab                  | Read-only MVP live; A070 list + renderer                                                         |
| IDE Bridge (MCP)                    | Live for `send_telegram_reply` and `change_agent_mode`                                           |
| Exports (read-only projections)    | Live: `/api/exports/{canonical,openclaw,ide,cursor}`                                             |
| Config Apply to `openclaw.json`     | Not yet exposed (Bundle C1)                                                                      |
| Summary promotion to memory/        | Not yet exposed (Bundle C2)                                                                      |
| `occ-ctl.mjs`                       | Not in tree; `npm start` / `npm run dev` are the current entrypoints                              |
| **Bundle A (performance + cleanup)**| **Closed 2026-04-18** — P1 fan-kill, P2 latency, P2b scroll v3, P3 dead code, P4 tool accordion, CLI Node-24 fix |

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

## 3. Bundle A — Performance and cleanup (done)

**Goal:** unbreak CPU and perceived latency, remove dead code and stale
fallbacks. No architectural changes. Landed as three commits in order P1 → P2 → P3.

### A / P1 — Fan kill (done)

- ✅ Replaced the 2-second sessions-directory polling in `telegramService.js`
  with two scoped `chokidar.watch()` instances: one on `sessions.json`
  (debounced 200 ms), one whose path set tracks the canonical `sessionFile`
  of each group currently present in `sessions.json`.
- ✅ Removed the internal rate-limit trampoline inside
  `hydrateOpenclawSessionIndex` and the per-call hydrate inside
  `resolveCanonicalSession` / `refreshChatMirrorFromCanonicalSession`.

### A / P2 — Perceived latency (done)

- ✅ `TelegramChat.jsx` switched to `behavior: 'auto'`, keyed the auto-scroll
  effect on `filteredMessages.length`, and added a `stuckToBottomRef` gate so
  auto-scroll only runs when the user is within 80 px of the bottom.
- ✅ SSE state updates (`INIT`, `SESSION_REBOUND`, `MESSAGE`) are wrapped in
  `startTransition()` so typing, button clicks and scroll stay responsive
  during bursts.

### A / P2b — Scroll-settle follow-up (done, third iteration)

Field tests of P2 and the first two P2b revisions both failed. Documenting
the dead ends so we don't reinvent them:

1. **v1 (sentinel + rAF).** `sentinel.scrollIntoView({block:'end'})` inside
   a single `requestAnimationFrame`. Missed late markdown / code-block
   layout (`scrollHeight` grew after the rAF fired).
2. **v2 (sentinel + rAF cascade + `ResizeObserver` on scroll container).**
   Added a 60 ms + 180 ms cascade and a `ResizeObserver` observing
   `containerRef`. The observer never actually fired: the scroll
   container is `flex: 1`, its border-box never resizes when content is
   added; only its `scrollHeight` does.
3. **v3 (final, MutationObserver + `scrollTop = scrollHeight`).** Rip
   out the sentinel, the rAF, the cascade, and the suppress-window
   boolean. Wrap the message list in a `messagesInnerRef` and observe
   it with a `MutationObserver` (`childList`, `subtree`, `characterData`).
   Any DOM change — new bubble, ReactMarkdown finishing, tool-output
   `<pre>` expanding, chevron-chip toggling — fires the observer and
   we set `scrollTop = scrollHeight` directly if the user is still
   pinned. The pin threshold is 80 px from the bottom. Our own
   programmatic scroll lands at `scrollHeight` exactly, so the
   resulting scroll event keeps `distanceFromBottom = 0` and the pin
   stays on without needing a suppress window.

The v3 implementation has four moving parts total (`messagesInnerRef`,
`stuckToBottomRef`, `handleContainerScroll`, one `MutationObserver`)
down from eight in v2, and makes no assumption about when markdown or
code blocks finish laying out.

### A / P3 — Dead code purge (done)

- ✅ Deleted `historyScanner.mjs`, `ActiveBotsList.jsx` and the
  `/api/telegram/bots/:chatId` route + `getChatBots`.
- ✅ Removed the `Telegraf` import, the `bot` / `relayBot` / `mainBotInfo` /
  `relayBotInfo` globals, the `scanHistory` hydration block, and the
  disabled `bot.launch()` scaffolding from `telegramService.js`.
- ✅ Removed the hardcoded `-3736210177 → -1003752539559` alias fix-up from
  both `CHAT_ID_ALIASES` and `routes/telegram.js`.
- ✅ Removed the `process.cwd()`-relative Prototyp fallback in
  `hydrateChannelAliasesFromDiskSync`; the function now requires
  `WORKSPACE_ROOT` and logs a single warning if it is missing.
- ✅ Removed `sendViaHttpGateway` and its call site in `sendMessageToChat`.
  The HTTP fast path was never reachable in practice; `sendMessageToChat`
  now goes straight to the `openclaw` CLI. It will be re-introduced only
  when the gateway exposes a functional
  `POST /api/v1/sessions/:sessionId/send`.

**Acceptance (observed):**

- CPU on an idle chat panel is effectively zero; fan no longer ramps.
- First paint of an open chat is well under 300 ms on a warm backend.
- `grep` for `historyScanner`, `Telegraf`, `sendViaHttpGateway`,
  `getChatBots`, `ActiveBotsList`, or the hardcoded group-id fallback
  returns no hits outside `_archive/` and standalone `backend/test-*.js`
  scripts.

### A / P4 — Tool call / tool result accordion (done)

Feedback on the live chat: `⚙️ [Tool Call: exec]` markers and raw
`System (Tool) BOT` output bubbles made the transcript hard to scan.
OpenClaw's own UI keeps those collapsed by default and reveals the
payload on click.

- ✅ Backend: `buildMsgObjFromGatewayLine` no longer flattens toolCall /
  toolResult into text markers. Instead it attaches two structured
  arrays to the message: `toolCalls: [{id, name, input}]` and
  `toolResults: [{id, toolUseId, toolName, output, isError}]`. The
  `output` field flattens nested `content` blocks (string or
  `[{type:"text", text}]`).
- ✅ Frontend: new `ToolCallChip` renders under an assistant bubble
  ("⚙ exec" chevron chip; click expands the JSON `input`). New
  `ToolResultBubble` replaces the entire `senderRole === 'toolResult'`
  bubble with a single-line preview ("Tool output · exec · <first 72
  chars>") that expands into a scrollable `<pre>` on click. Error
  results use a red accent.
- ✅ `stripToolCallMarkers` removes the residual
  `⚙️ [Tool Call: …]` / `✅ [Tool Result: …]` text so we don't render the
  same information twice during the transition period.
- ✅ `filteredMessages` keeps bubbles that have no plain text but do
  carry structured tool data, so a pure tool-call or tool-result
  message is never silently dropped.

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

## 8b. Out-of-scope follow-ups (known, not blocking Bundle A)

These items surfaced while closing Bundle A but live outside the
Channel Manager's own codebase, so they don't block Bundle B.

### 8b.1 · CLI gateway auth → agent cold-start latency

**Symptom:** each `openclaw agent --session-id … --message …` invocation
takes **~12 s** before the user message appears in the transcript and
**~25–30 s** before the final answer, on a warm box with a running
gateway.

**Root cause:** the CLI can reach the local `openclaw-gateway`
(`127.0.0.1:18789`) but rejects it because this build requires
`tools.gatewayToken` in `openclaw.json`. The `--token` flag was removed
in a recent CLI release. Every invocation therefore falls back to
*embedded* mode (`Error: gateway url override requires explicit
credentials → falling back to embedded`), which cold-boots a fresh
agent process and reloads the full session context (~130 k tokens)
before each turn.

**Workaround tested:** `/tmp/openclaw-cm-send-*.log` now carries a
visible `Gateway agent failed; falling back to embedded …` line for
every send, and the backend surfaces any shebang / import / CLI
startup error as `inject_cli_startup_error` 300 ms after the spawn.

**Planned fix (not ours):**

1. Bump the OpenClaw CLI to the latest build (user self-service;
   tentatively 4.15 once available) — expected to reintroduce a
   supported auth path.
2. Add `tools.gatewayToken` (or equivalent) to
   `~/.openclaw/openclaw.json` so the CLI uses the warm gateway
   daemon instead of a cold embedded agent. Expected latency:
   single-digit seconds for the user echo, model-bound for the reply.

**Channel Manager change needed:** none right now. When the CLI's
gateway-auth story stabilizes, `sessionSender.js` (Bundle B / P5)
gains a `--token` / env-based auth argument, gated behind presence
of `OPENCLAW_GATEWAY_TOKEN`. Until then: document, wait, move on.

### 8b.2 · React rendering cost during bursts

`[Violation] 'setTimeout' handler took 424 ms` / forced reflows during
SSE bursts are dominated by `ReactMarkdown` rendering large assistant
bubbles synchronously. Addressed structurally in Bundle B / P5 via the
`ChatPanel` split + optional message virtualization. Not on the critical
path for A.

---

## 9. Release cadence

- **Phase 0** — landed.
- **Bundle A** — landed as three commits (P1, P2, P3) in that order.
- **Bundle B** — one PR; `/api/telegram/*` aliases kept for **one release**,
  then removed in the following PR.
- **Bundle C1, C2** — one PR each, blocked on B.

Each PR updates `030_ROADMAP.md` (moves its block to "done") and appends a new
entry to `040_DECISIONS.md` only if it contains an irrevocable architectural
choice.
