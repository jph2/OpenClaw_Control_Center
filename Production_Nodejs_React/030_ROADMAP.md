# Channel Manager — Roadmap

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-20

> The roadmap lists what is **done**, what is **in flight**, and what is
> **explicitly not yet in scope**. Long prose about *why* each decision was
> taken belongs in [`040_DECISIONS.md`](./040_DECISIONS.md); what the system looks like
> today belongs in [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md).

---

## 1. Snapshot (2026-04-18)

| Area                                | State                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Configuration tab                   | Functional; TTG CRUD, sub-agent CRUD, skills list, row heights persist                            |
| OpenClaw Chat mirror                | Functional; auto-scroll v3 live, tool chips collapsible, CLI send + JSONL mirror; **2026-04-20 UX:** optimistic user bubble, 200 ms session tail poll, bubble timestamps with seconds (until §8c native gateway path) |
| Cursor Summary tab                  | Read-only MVP live; A070 list + renderer                                                         |
| IDE Bridge (MCP)                    | Live for `send_telegram_reply` and `change_agent_mode`                                           |
| Exports (read-only projections)    | Live: `/api/exports/{canonical,openclaw,ide,cursor}`                                             |
| Config Apply to `openclaw.json`     | **C1 + C1b.1 + C1b.2a + C1b.2b + C1b.2c + C1b.2e + C1b.3:** per-channel groups + synth `agents.list[]` / `bindings[]` (skills include **C1b.3**) + orphan prune; optional **`channels.telegram` account policy**; optional **`agents.defaults.model.primary`** when `openclawAgentsDefaultsPolicy.applyModelOnOpenClawApply`. **Stale Telegram sessions** — `scripts/cm-release-telegram-session` (**C1b.2d**). |
| Summary promotion to memory/        | **Live (C2):** `POST /api/summaries/promote` + IDE tab modal (daily `memory/*.md` or `MEMORY.md`) |
| `occ-ctl.mjs`                       | Not in tree; `npm start` / `npm run dev` are the current entrypoints                              |
| **Bundle A (performance + cleanup)**| **Closed 2026-04-18** — P1 fan-kill, P2 latency, P2b scroll v3, P3 dead code, P4 tool accordion, CLI Node-24 fix |
| **Bundle B (refactor)**             | **Closed 2026-04-18** — P5 chat service split, P4 `/api/chat/*` + legacy route aliases                          |
| **Local LLM (LM Studio)**           | Wired 2026-04-18: `models.providers.lmstudio` + enabled `plugins.entries.lmstudio` in `~/.openclaw/openclaw.json`; channels and `agents.list[]` use `lmstudio/google/gemma-4-26b-a4b`. Bootstrap trimmed (`bootstrapMaxChars: 4000`, `bootstrapTotalMaxChars: 14000`, `experimental.localModelLean: true`). **Open dependency:** the LM Studio app must load the model with `n_ctx ≥ 16384` (32768 recommended) — not auto-configurable from this repo. |
| **OpenClaw webchat ↔ binding parity** | **Known limitation (not in CM scope):** the OpenClaw webchat opens session `agent:main:telegram:group:<id>` and therefore shows `agents.defaults.model`, while inbound Telegram traffic routes through CM's `bindings[]` and uses the per-channel model. Fix lives in OpenClaw upstream (resolve the synth agent for the Telegram peer in the webchat session resolver). See `040_DECISIONS.md` ADR-018. |

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

**In plain terms:** Bundle B is “housekeeping”: it does not add operator-facing
features, but it cuts the chat stack into testable pieces and one coherent HTTP
surface so C1/C2 (writes into `openclaw.json` and memory) do not land on a
monolith. When B is done, you should see the same UI behavior with clearer file
boundaries and documented `/api/chat/*` routes.

### B / P5 — Service split

Split `telegramService.js` into focused modules under `backend/services/chat/`:

- `sessionIndex.js` — `sessions.json` watcher + group/session mapping.
- `sessionTail.js` — chokidar tail of one canonical JSONL.
- `messageModel.js` — `buildMsgObjFromGatewayLine` and UI-shape helpers.
- `sessionSender.js` — `openclaw` CLI wrapper (and, later, native session send).
- `channelAliases.js` — channel alias resolution from `channel_config.json`.

Frontend: extract `useChatSession(groupId)` hook; rename `TelegramChat.jsx`
to `ChatPanel.jsx` (render-only).

- ✅ **Done 2026-04-18** — modules under `backend/services/chat/`, facade
  `telegramService.js`, `useChatSession` + `ChatPanel.jsx`.

### B / P4 — Route consolidation

Merge `routes/telegram.js` and `routes/openclaw.js` into `routes/chat.js`
exposing `/api/chat/:groupId/{session,stream,send}`. Delete the dynamic
`await import` workaround in `routes/openclaw.js`. Keep `/api/telegram/*`
and `/api/openclaw/session/*/send` mounted as thin aliases for **one**
release, then remove.

- ✅ **Done 2026-04-18** — canonical `routes/chat.js` + thin alias routers;
  frontend uses `/api/chat/*`; MCP still uses legacy `POST /api/telegram/send`.

**Acceptance:**

- No single service file > ~250 lines.
- No dynamic imports in route files.
- Old paths still respond; new paths documented in `020_ARCHITECTURE.md`.

---

## 5. Bundle C1 — Config apply (after B)

**Goal:** let the operator promote `channel_config.json` state into the
OpenClaw Gateway's `openclaw.json`, safely.

### Backend

- ✅ `POST /api/exports/openclaw/apply` — landed 2026-04-18.
  - `dryRun: true` default; `dryRun: false` + `confirm: true` required to write.
  - Zod validation of merged document (`channels.telegram.groups` sanity + passthrough).
  - File lock (`proper-lockfile`) on `OPENCLAW_CONFIG_PATH` or `~/.openclaw/openclaw.json`.
  - Timestamped backup (`openclaw.json.<iso>.bak`), rotate after **10**.
  - Atomic write (temp + `rename`).
  - Append-only audit: `channel-manager-openclaw-apply-audit.jsonl` beside `openclaw.json`.
  - **Merge scope:** for each channel in `channel_config.json`, upsert
    `channels.telegram.groups[<id>].requireMention` from `require_mention` and
    `channels.telegram.groups[<id>].skills` from `skills` (**C1b.1**, deduped ids); do not
    remove gateway-only groups; do not touch `botToken` / `gateway` / other keys.
- ✅ `POST /api/exports/openclaw/undo` with `{ confirm: true }` — restores newest `.bak`.
- ✅ `GET /api/exports/openclaw/apply-status` — `canUndo`, backup count, destination path.

### Frontend

- ✅ Header action **Apply to OpenClaw…** (Manage Channels) opens `OpenClawApplyModal`.
- ✅ Redacted side-by-side diff, destination path, **Confirm apply**, **Undo last apply**, refresh.

**Acceptance:**

- No apply can happen without explicit Confirm in the dialog.
- Backups accumulate to a bounded number (rotate after N).
- Schema failure blocks write.

**Follow-ups:**

- **Bundle C1b (§5.1)** — **closed 2026-04-20** (model + synth agents + bindings + account policy + workspace default model + sub-agent skills + orphan prune; see §5.1).
- Optional separate JSON Schema file for stricter validation.
- **C1b.2d (productize)** — surface stale `sessions.json` pins in Apply preview and offer release (today: [`scripts/cm-release-telegram-session`](./scripts/cm-release-telegram-session)).

---

## 5.1. Bundle C1b — Master config → OpenClaw (extended Apply)

**Status:** **closed (2026-04-20)** · **Depends on:** C1 (apply pipeline, audit, undo) · **Blocks:** nothing in the A → B chain.

**Suggested next (same product area, not a new bundle letter):** **C1b.2d productization** — in **Apply to OpenClaw** preview, detect `agent:main:telegram:group:<id>` (and related) pins in `~/.openclaw/agents/main/sessions/sessions.json` for peers whose binding/model changes on this Apply; offer **Release session** (reuse logic from [`scripts/cm-release-telegram-session`](./scripts/cm-release-telegram-session)) with explicit confirm. Until then the script remains the operator path.

**Shipped (C1b.1 — 2026-04-18):** `channels.telegram.groups[id].skills` is merged from `channel_config.json` `channels[].skills` (deduped string ids) together with `requireMention`, via the same Apply / undo / audit path. Empty CM list → empty `skills` array on the group in `openclaw.json`.

**Shipped (C1b.2a — 2026-04-18):** Per-channel **model** + main-agent **skills allowlist** now ride the same Apply pipeline, written as synthesized `agents.list[]` entries (id `<assignedAgent>-<groupIdSlug>`, e.g. `tars-5168034995`) plus matching `bindings[] { type: 'route', match: { channel: 'telegram', peer: { kind: 'group', id } } }`. Every CM-emitted entry carries `comment: "managed-by: channel-manager; source: <groupId>"`. Operator-authored entries are detected by the absence of that marker and are **never** modified. Synth-id and telegram-peer collisions against operator-owned rows are surfaced to the UI; a write with any collision is refused (HTTP 409). See spec: [`_archive/2026-04/CHANNEL_MANAGER_C1b.2_MODEL_MAPPING_SPEC.md`](./_archive/2026-04/CHANNEL_MANAGER_C1b.2_MODEL_MAPPING_SPEC.md) (sign-off: §9).

**Shipped (C1b.2b — 2026-04-20):** **Orphan prune** on every Apply (after the C1b.2a upsert): CM-marked `agents.list[]` / `bindings[]` whose managed `source` group id is **not** present in `channel_config.json` `channels[].id` are removed. Preview + audit log surface `orphanPruneSummary` (counts + id list). Operator-owned rows untouched.

**Shipped (C1b.2d — stale-session release, 2026-04-20):** when an Apply changes the binding for a Telegram peer that already has a session entry pinned to a provider-specific `authProfileOverride` in `~/.openclaw/agents/main/sessions/sessions.json`, that pinned session short-circuits the new binding and the model change has no visible effect. Interim tool: [`scripts/cm-release-telegram-session`](./scripts/cm-release-telegram-session) (`--list`, `--dry-run`, `--restart`) — backs up `sessions.json`, removes the stale `agent:main:telegram:group:<id>` entry, optionally restarts the gateway; next inbound message then binds through the CM-written `bindings[]` → synth agent → CM model. Productize as part of Apply (detect + offer release in the preview modal) once the manual tool has proven itself in practice. Tracks ADR-018 on the upstream side. **Also shipped 2026-04-20:** CM live-mirror follow-ups (agent-id-agnostic session index, polling JSONL tailer, transport-prefix-aware chat-id normalization; see [DISCOVERY §11](./_archive/2026-04/CHANNEL_MANAGER_TelegramSync_DISCOVERY.md#11-runtime-lessons--channel-manager-live-mirror-2026-04-20)). TTG000 acceptance test passed: Telegram → OC Web + CM panel synchronized in real time without page reload.

**Shipped (C1b.2e — 2026-04-20):** **Telegram account policy** in CM: Manage Channels panel + `channel_config.json` → `telegramAccountPolicy` (`applyOnOpenClawApply`, `groupPolicy`, `dmPolicy`, `allowFrom`, `groupAllowFrom`). **Apply** merges into `openclaw.json` `channels.telegram` only when `applyOnOpenClawApply` is true (explicit opt-in, same posture as C1b.2c). Preview lists the JSON patch; `GET /api/channels` adds `openclawTelegramAccountLive` for comparison with the live gateway file. `POST /api/channels/updateTelegramAccountPolicy` persists the slice. *Context:* account-level gates run *above* per-group bindings and can drop traffic silently (e.g. `groupPolicy: allowlist` + empty `groupAllowFrom` — TTG001/TTG000 regression, 2026-04-20).

**Shipped (C1b.3 — 2026-04-20):** **Sub-agent skill flavoring** — CM synth `agents.list[].skills` unions active `subAgents` (`parent` = channel `assignedAgent`, `enabled !== false`, not in `inactiveSubAgents`) `additionalSkills` minus each sub’s `inactiveSkills`, deduped (same layering as the TTG UI; ADR-004 unchanged).

**Shipped (C1b.2c — 2026-04-20):** **Workspace default model (opt-in)** — `channel_config.json` → `openclawAgentsDefaultsPolicy` (`applyModelOnOpenClawApply`, `modelPrimary`). **Apply** sets `agents.defaults.model.primary` only when the opt-in is true and `modelPrimary` is non-empty; existing `model` object fields (e.g. `fallbacks`) are preserved. Manage Channels panel + `POST /api/channels/updateOpenclawAgentsDefaultsPolicy`; `GET /api/channels` adds `openclawAgentsDefaultsLive.modelPrimary`. Complements ADR-018 (never silent).

**Recommended execution order (operator + implementer, 2026-04-20):** (1) Acceptance matrix in [`000_WIP TEST_20.04.26.md`](./000_WIP%20TEST_20.04.26.md) as needed. (2) **C1b.2b** — shipped. (3) **C1b.2e** — shipped. (4) **C1b.3** — shipped. (5) **C1b.2c** — shipped. **C1b.2d** + CM mirror hardening shipped; remaining CLI-send latency is tracked in **§8b.1** and the proper CM-side remedy is **§8b.4** gateway-native transport.

**Goal:** align operator expectations with reality: **Channel Manager** is the single place to define per-channel **agent model**, **sub-agent / skill policy**, and related knobs that OpenClaw’s gateway actually honors, then **push** them through the same explicit **Apply** path (preview, confirm, backup, audit) already used for `requireMention`.

**Background (for implementers):** OpenClaw-native semantics for **multi-agent routing**, **spawn sub-agents** (policy / session keys), **skills** allowlists, and the boundary vs **Paperclip** (external orchestration) are summarized with doc links in [`_archive/2026-04/CHANNEL_MANAGER_TelegramSync_RESEARCH.md`](./_archive/2026-04/CHANNEL_MANAGER_TelegramSync_RESEARCH.md) §2.4–2.5 — use when building the C1b mapping table and ADR-004 wording.

**Why a separate bundle:** C1 deliberately merged only `requireMention` after schema regressions (e.g. forbidden keys crashing the engine). C1b requires a **documented mapping** from `channel_config.json` fields to **`openclaw.json` (and any gateway fields)** per OpenClaw version, plus clarity on **ADR-004** (CM sub-agents vs runtime sub-agents vs workspace skills — what gets written vs what stays UI-only).

**Scope (draft — refine before implementation):**

1. **Inventory** — list which Channel Manager Configuration fields must become OpenClaw truth (model id, tools/MCP allowlists, group overrides vs `agents.defaults`, etc.).
2. **Contract** — confirm with OpenClaw schema or team which paths are legal; add validation so Apply **never** emits invalid JSON.
3. **Merge implementation** — extend `openclawApply.js` (or successor) with field-level merge rules; preserve gateway-only keys; same lock/backup/audit semantics as C1.
4. **UI** — extend **Apply to OpenClaw** preview so operators see **all** fields in the merge slice (not only `requireMention`); optional toggles per category if rollout is phased.
5. **Docs** — update `010_VISION.md` / `020_ARCHITECTURE.md` and add or amend **ADR** when the mapping is locked.

**Acceptance (high level):**

- After Apply + gateway reload (or documented procedure), **OpenClaw chat shows the model (and other pushed settings)** that Channel Manager shows for that channel, modulo documented exceptions.
- No silent writes; failed Zod/schema validation never truncates `openclaw.json`.
- ADR-004 consequences remain explicit in UI labels and in the merge spec (“written to OpenClaw” vs “Channel Manager only”).

**Out of scope for C1b unless re-scoped:** changing OpenClaw runtime to spawn CM “sub-agents” as native sub-agents; triad sliders; engine-per-message picker (see §8).

---

## 6. Bundle C2 — Summary → memory promotion (after C1)

**Goal:** let the operator explicitly carry an IDE/Cursor summary into
OpenClaw's memory space.

**Status:** shipped 2026-04-18.

### Backend

- ✅ `POST /api/summaries/promote` (also `/api/ide-project-summaries/promote`) —
  reads source under **Studio A070**, appends into:
  - `~/.openclaw/workspace/memory/YYYY-MM-DD.md` (daily), or
  - `~/.openclaw/workspace/MEMORY.md` (workspace root; extra `memoryMdAck`).
  - Append semantics, not replace.
  - De-duplication via stable `<!-- CM_PROMOTE_<sha256> -->` marker (skip if present).
  - Audit: `channel-manager-memory-promote-audit.jsonl` under the OpenClaw workspace.
  - `dryRun: true` (default) for preview; `dryRun: false` + `confirm: true` to write.
  - File lock (`proper-lockfile`) on the destination markdown.

### Frontend

- ✅ **Promote to OpenClaw memory…** on the **TARS in IDE** tab when an A070 file
  is selected (`MemoryPromoteModal.jsx`).
- Modal: destination (daily date picker vs `MEMORY.md`), **Check destination** dry
  run, append preview, duplicate warning, **Confirm promote**.

**Default mode:** manual-with-preview (see `040_DECISIONS.md` §ADR-014).

**Acceptance:**

- Nothing lands in memory without an explicit click and confirm.
- `MEMORY.md` requires checkbox acknowledgement before confirm.

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

**Symptom:** CM sends still feel slower than OpenClaw Control UI because
each message goes through a short-lived `openclaw agent ...` CLI process,
then the UI observes the result through the JSONL mirror. Older field runs
showed **~12 s** until user echo and **~25–30 s** until final answer when
the CLI missed gateway auth and fell back to embedded startup.

**Correct auth contract (cleanup correction 2026-04-24):** do **not** add
`tools.gatewayToken` to `~/.openclaw/openclaw.json`. That is not a valid
`openclaw.json` key in the installed CLI build; the schema validator rejects
it with `Unrecognized key "gatewayToken"`. The CLI error hint about
`gatewayToken in tools` refers to the plugin-SDK call options bag, not the
`tools` block of `openclaw.json`.

**Channel Manager state:** `sessionSender.js` injects gateway credentials into
the CLI child process via env:

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_URL`

Values come from the process env first, otherwise from
`gateway.auth.token` + `gateway.port` in `openclaw.json`
(`OPENCLAW_CONFIG_PATH` override supported). This is the supported warm-gateway
path for the current CLI behavior.

**Verified 2026-04-20 (18:50 CEST):** `/tmp/openclaw-cm-send-ad454416-*.log`
no longer showed `Gateway agent failed; falling back to embedded`. The CLI
reached the warm gateway. `runner: "embedded"` in `executionTrace` is the
gateway-side runner type (`runner?: "embedded" | "cli"`), not proof of a
CLI-level fallback. Measured model inference for one Kimi-K2.5 send was
`meta.durationMs = 2870` ms.

**Residual latency:** remaining CM-visible delay comes from CLI process
startup, gateway-side bootstrap work, and JSONL-tail observation
(`sessionTail` now polls at 200 ms). Proper remedy is §8b.4:
gateway-native CM transport. CLI auth/Node checks remain relevant only for
the fallback path. If the fallback is used, ensure Node for the CLI spawn is
>= v22 (`OPENCLAW_NODE_BIN` or runtime resolver), then verify logs before
changing config.

### 8b.2a · OpenClaw webchat reads `agents.defaults.model`, not the Telegram binding

**Symptom:** after Apply, Telegram traffic in the affected group is answered
by the model you set in CM (Gemma via LM Studio, Kimi, GPT-4o, …), but the
OpenClaw webchat session for that same group still shows the **defaults**
model (Codex / GPT-4o today).

**Root cause (not ours):** the webchat resolves the session as
`agent:main:telegram:group:<id>` and therefore consults
`agents.defaults.model` instead of looking up the synth agent
(`<assignedAgent>-<groupIdSlug>`) registered by the matching
`bindings[] { type:'route', match.peer.id }` row. The Telegram inbound path
already does the binding lookup, which is why Telegram messages get the
right model and webchat doesn't.

**Channel Manager change needed:** **none.** C1b.2a writes a correct,
schema-legal `agents.list[]` + `bindings[]` pair. Any further change here
would just paper over the upstream resolver bug.

**Planned upstream fix:** open an issue against the OpenClaw repo asking the
webchat session bootstrap to use the same binding lookup as the Telegram
inbound path. Workaround for the operator until then: trust the Telegram
chat as the source of truth for "is the per-channel model live?" and ignore
the webchat model badge for non-default agents.

### 8b.3 · LM Studio context window must be set in the LM Studio app

**Symptom:** even with `models.providers.lmstudio` correctly configured and
`agents.defaults.bootstrapMaxChars` trimmed, an `openclaw infer model run`
against `lmstudio/google/gemma-4-26b-a4b` can fail with
`n_keep: <N> >= n_ctx: <M>`. The OpenClaw side declares `contextWindow:
32768`, but LM Studio loads the model with whatever `n_ctx` was configured
in its UI (often 8k–11k by default).

**Channel Manager change needed:** none. The provider declaration is in
`~/.openclaw/openclaw.json` and the bootstrap trim is in the same file. The
fix lives in the LM Studio app: load the model with `n_ctx ≥ 16384`
(OpenClaw's catalog minimum); 32768 matches the provider declaration.

**Operator checklist:**

1. LM Studio → Developer → load `google/gemma-4-26b-a4b` with `n_ctx 32768`
   (or 16384 minimum) and "Server Running" on `:1234`.
2. From the agentbox: `curl -s http://100.104.23.43:1234/v1/models` lists
   the model.
3. `openclaw infer model run --model lmstudio/google/gemma-4-26b-a4b
   --prompt "ping"` returns without an `n_ctx` error.
4. `scripts/cm-preflight` automates 2 + 3 plus gateway-active check.

### 8b.2 · React rendering cost during bursts

`[Violation] 'setTimeout' handler took 424 ms` / forced reflows during
SSE bursts are dominated by `ReactMarkdown` rendering large assistant
bubbles synchronously. Addressed structurally in Bundle B / P5 via the
`ChatPanel` split + optional message virtualization. Not on the critical
path for A.

### 8b.4 · CM OpenClaw Chat — gateway-native path (implemented 2026-04-24)

**Goal:** Channel Manager **OpenClaw Chat** should use the **same transport as OpenClaw Control UI**: authenticated **WebSocket (or documented HTTP)** to the local gateway (`gateway.port` / `gateway.auth`), not `openclaw agent …` subprocess spawns per message + JSONL tail for user-visible latency.

**Why:** OC achieves **~2–3 s** perceived round-trip on a warm gateway; CM today pays **CLI spawn + embedded fallback risk + mirror poll** delay (see §8b.1). Native gateway I/O aligns CM with Telegram-adjacent responsiveness.

**Scope (Channel Manager):**

1. Gateway client in Node (reuse protocol from OC / OpenClaw docs): connect with `OPENCLAW_GATEWAY_TOKEN`, send user turns to the bound Telegram/session peer, subscribe to assistant events.
2. Replace or bypass `sessionSender.js` CLI path for **`POST /api/chat/.../send`** when gateway RPC is available; keep CLI as **fallback** behind a flag if needed for unsupported builds.
3. SSE to the browser: push messages from gateway events (and/or continue tailing JSONL only as backup) so transcript order matches Telegram.
4. Document operator env: token, port, TLS/off-LAN same as OC.

**Implementation slice landed 2026-04-24:**

- `sessionSender.js` is now an orchestrator over two transports:
  `openclawGatewayTransport.js` and `openclawCliTransport.js`.
- Default remains `OPENCLAW_CM_SEND_TRANSPORT=cli` / unset. `auto` attempts
  native gateway only when credentials/module loading are available, then falls
  back before any native RPC is attempted. `gateway` forces native and surfaces
  failures.
- Gateway-native send uses explicit `OPENCLAW_GATEWAY_TOKEN` /
  `OPENCLAW_GATEWAY_URL` (including values derived from `openclaw.json`) and
  calls gateway `chat.send` with canonical `sessionKey` when known.
- CLI fallback was moved from shell command construction to `spawn` args while
  keeping the existing `/tmp/openclaw-cm-send-*.log` behavior.
- Beta smoke 2026-04-24: one TTG000 send returned
  `transport=session-native-gateway-chat`, `gatewayResultId` populated,
  `gatewayCallMs=76`, `apiTotalMs=79`, and the assistant response landed in the
  canonical session JSONL.

**Completion slice landed 2026-04-24:**

- Live warm-gateway comparison now puts CM perceived latency in the same band
  as OpenClaw Control UI for the tested TTG/model path.
- CM chat header now shows configured model plus live transcript model, with
  provider-normalized comparison (`moonshot/kimi-k2.5` vs `kimi-k2.5`, etc.).
- Per-channel model changes now sync to the correct OpenClaw runtime location:
  `agents.list[].model.primary` for the CM-owned synth agent, not the
  schema-illegal `channels.telegram.groups[*].model`.
- Optimistic user bubbles are replaced when the OpenClaw transcript mirror
  arrives, including timestamp-prefixed user lines and session rebinding.
- `Apply to OpenClaw` now exposes pending changes with a pulsing
  `Press to apply...` state and clears when the operator returns to the last
  clean CM baseline or confirms Apply.

**Residual follow-up (not blocking §8b.4):**

- Keep CLI as the safe production fallback until OpenClaw exposes a stable
  versioned gateway SDK/import surface; current native import discovery still
  needs to tolerate hash-named runtime files.
- Gateway event subscription can later replace JSONL/SSE mirroring, but the
  current transcript mirror is fast enough for the measured UX target.
- Consider flipping default from `cli` to `auto` only after another cold/warm
  smoke pass on the next OpenClaw release.

**Acceptance:**

- Stopwatch: CM chat **user bubble** latency and **assistant** latency are now
  within the same practical band as OC on the same machine (modulo model).
- No regression for session binding / TTG group ids / `resolveCanonicalSession`.
- Roadmap §8b.1 mitigations remain relevant for **fallback** CLI only.

**Dependencies:** Stable gateway RPC surface (versioned) remains desired before
making native/auto the default.

### 8b.5 · TARS in IDE — Cursor/Codex/OpenClaw memory bridge (next)

**Spec:** `SPEC_8B5_IDE_MEMORY_BRIDGE.md`
**Open Brain guardrail:** `SPEC_OPEN_BRAIN_BOUNDARY_CONDITIONS.md`

**Current status (2026-04-25):** §8b.5 now has a belastbarer, getesteter
Bridge-Unterbau with clean binding and mapping semantics. Landed slices:
A070 sidecar metadata, `bridgeStatus`, marker-based promote/read-back, UI
status display, backend tests, resolver/adapter safety rail
(`ttgBindingResolver.js`, `ideWorkUnitAdapters.js`), and an operator-managed
`projectMappings[]` store in `channel_config.json`. Mapping writes use lock +
temp-file/rename. Resolver policy is frozen and tested: valid explicit wins,
invalid explicit does not guess, non-explicit conflicts become `ambiguous`.
The UI no longer hardcodes new summaries as Codex with a fixed project root; it
collects adapter/project hints and lets the backend normalize + resolve against
the persisted mapping store. `E2E_GOLDEN_PATH_8B5` is implemented as a
Playwright proof of the current browser operator flow. Artifact-owned TTG
binding is now specified for Discovery/Research work via `initial_ttg` and
`current_ttg` headers; `current_ttg` is the operative routing truth. Open Brain
integration shifts the architecture to **artifact-centered memory**: Cursor,
Codex, OpenCode, Telegram, and Chat are producer surfaces; Studio Framework
artifacts are durable truth; OpenClaw memory is operational agent continuity;
Open Brain is the long-term semantic/MCP knowledge layer.
**Maturity:** project-mapping bridge and promote/read-back core are usable now;
artifact-header Discovery/Research binding, agent-assisted fallback
classification, Open Brain export/sync, and producer adapters are not complete
yet.
**Remaining production gates:** artifact-header resolver ingestion,
artifact index/resolver, Open Brain export contract, agent-assisted TTG
classification with review states, and Open Brain sync.

**Next-session gates:**

1. **Ticket C — `ARTIFACT_HEADER_BINDING_V1`**: parse Discovery/Research YAML
   headers, map `current_ttg` into the work-unit binding result, and surface
   `binding.method = "artifact_header"` in sidecar/UI.
2. **Ticket E — `ARTIFACT_INDEX_RESOLVER_V1`**: index Studio artifacts by
   stable id, path, type, tags, TTG binding, project binding, and content hash.
3. **Ticket F — `OPEN_BRAIN_EXPORT_CONTRACT_V1`**: define the Studio artifact
   export/upsert payload for OB1 `thoughts`, including metadata, source path,
   content hash, no-secrets validation, and dedup identity.
4. **Ticket D — `AGENT_TTG_CLASSIFICATION_V1`**: if the human leaves no TTG,
   classify against canonical `TTG*.md` definitions and record
   `inferred` / `needs_review` rather than pretending the result is confirmed.
5. **Ticket G — `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`**: upsert reviewed artifacts
   into Open Brain and record returned thought ids / fingerprints / audit.
6. **Producer adapters**: Codex, Cursor, OpenCode, Telegram/Chat exports create
   or update artifacts; they do not define memory truth.
7. Extend `E2E_GOLDEN_PATH_8B5` with artifact-header and Open Brain export/sync
   cases after the corresponding tickets land.

**Recommended order:** wire `ARTIFACT_HEADER_BINDING_V1`, then
`ARTIFACT_INDEX_RESOLVER_V1`, then `OPEN_BRAIN_EXPORT_CONTRACT_V1`, then
`AGENT_TTG_CLASSIFICATION_V1`, then Open Brain sync. Producer adapters follow
as convenience importers.

**Goal:** Turn the third Channel Manager workspace tab into the operational
bridge between producer work (Cursor/Codex/OpenCode/Chat/Telegram), TTG
context, Studio artifacts, Studio A070 summaries, OpenClaw memory, and Open
Brain.

**Why:** After gateway-native chat works, the next architectural risk is not
graph visualization; it is split-brain context. Work done in the IDE must be
captured, mapped to the correct TTG/project context, and promoted into
OpenClaw memory explicitly enough that TARS can use it without hidden state or
stale assumptions, while keeping Open Brain sync tool-agnostic and
artifact-centered.

**Scope (first slice):**

1. Define the canonical IDE work-unit shape:
   - producer surface (`cursor`, `codex`, `opencode`, `telegram`, `chat`, future tools)
   - project root / repository identity
   - bound TTG/channel id
   - artifact header binding (`initial_ttg`, `current_ttg`) for pre-project
     Discovery/Research work
   - Open Brain export identity (`artifact_id`, `source_path`, `content_hash`)
   - A070 summary path
   - source/provenance metadata (operator, timestamp, model/agent where known)
   - promotion target in OpenClaw memory
2. Harden the existing **TARS in IDE · IDE project summary** tab:
   - create/edit A070 summary drafts
   - save under Studio A070
   - preview existing summaries
   - promote selected summaries to OpenClaw memory
   - read back OpenClaw memory in the same TTG row
3. Map producer context into the same artifact contract:
   `.cursor/agents`, `.cursor/rules`, `.cursor/mcp.json`, exported IDE bundle,
   Codex session notes, OpenCode context, Telegram/Chat exports, and future
   producers must create or update the same artifact metadata instead of
   becoming parallel context systems.
4. Add a per-TTG sync/status signal for this tab:
   - no A070 summary yet
   - draft saved but not promoted
   - promoted to OpenClaw memory
   - read-back confirmed / stale / unknown
5. Keep writes explicit. Saving an A070 summary and promoting into OpenClaw
   memory are separate operator actions; no silent mutation of identity,
   auth, or memory files.

**Acceptance:**

- From a TTG row, the operator can capture current producer work into an A070
  summary or Studio artifact and promote it into OpenClaw memory without leaving
  Channel Manager.
- The OpenClaw memory read-only pane shows the promoted result or a clear
  stale/unknown state.
- The artifact/summary contains enough provenance to map producer work back to
  TTG, project, model/agent where known, source file paths, and Open Brain
  export identity.
- Cursor, Codex, OpenCode, Telegram, and Chat are documented as producers of
  the same artifact contract, not separate one-off integrations.
- No regression to the §8b.4 gateway-native chat path.

**Dependencies:** Existing C2 summary/memory promote endpoints, A070 write
support, IDE bundle/export bridge, and the current §8b.4 chat beta.

### 8b.6 · TTG agent topology visualization (after §8b.5)

**Goal:** Add a visual operator surface for one TTG's effective runtime shape:
main agent → assigned model → channel skills → sub-agents → sub-agent skills.

**Why:** Once TTG routing, skill loading, sub-agent skill merging,
gateway-native chat, and IDE/Codex memory promotion are proven, the next useful
UI layer is observability of what a conversation channel is actually composed
of. The current tables remain the editing surface; the topology is a read-only
map for fast inspection and debugging.

**Scope (first slice):**

1. Define a CM topology data shape from existing sources:
   `channel_config.json`, OpenClaw effective tools/skills, canonical session,
   active model, and gateway/runtime metadata where available.
2. Add a read-only **Topology** view per TTG/channel row:
   - selected TTG / conversation channel
   - main agent + active model
   - channel-level skills
   - active sub-agents
   - skills contributed by each sub-agent
3. Keep the first implementation in the current React app. A different
   rendering island (Svelte/Lit/etc.) is allowed later only if the graph
   renderer materially benefits from it; do **not** refactor CM just to match
   another UI stack.
4. Treat this as observability first, not control: no execution buttons or
   runtime mutation until the read-only topology is correct and trusted.

**Acceptance:**

- A selected TTG shows the same effective agent/skill/sub-agent picture that
  the gateway will use at runtime.
- The graph updates after Apply/rebind without requiring a page reload.
- Missing runtime metadata degrades to the configured CM topology with a clear
  "not yet confirmed at runtime" state.
- No regression to the Channel Manager's core table/config workflow.

**Dependencies:** Complete §8b.5 and identify a stable source for
runtime-effective tools/skills (`tools.effective(sessionKey=...)` or
equivalent gateway API).

---

## 9. Release cadence

- **Phase 0** — landed.
- **Bundle A** — landed as three commits (P1, P2, P3) in that order.
- **Bundle B** — closed 2026-04-18 (P5 + P4). `/api/telegram/*` and
  `/api/openclaw/*` remain as **one-release** thin aliases; remove in the
  following PR after clients migrate.
- **Bundle C1** — apply MVP landed 2026-04-18 (`requireMention` merge + UI).
- **Bundle C1b** — slice closed (§5.1, 2026-04-20): **C1b.1** … **C1b.3** as above; **C1b.2c** workspace-default model opt-in shipped. Further C1b work only if re-scoped. See §5.1.
- **Bundle C2** — landed 2026-04-18 (summary → memory promote + modal).
- **Local LLM (LM Studio) wiring** — landed 2026-04-18: `lmstudio` provider registered, plugin enabled, all CM channels and `agents.list[]` re-pointed to `lmstudio/google/gemma-4-26b-a4b`. Open dependency: LM Studio `n_ctx ≥ 16384` (operator action, see §8b.3). Webchat-vs-binding parity is upstream (§8b.2a, ADR-018).

Each PR updates `030_ROADMAP.md` (moves its block to "done") and appends a new
entry to `040_DECISIONS.md` only if it contains an irrevocable architectural
choice.
