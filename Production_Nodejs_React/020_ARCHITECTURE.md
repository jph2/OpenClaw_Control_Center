# Channel Manager — Architecture

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-17

> Describes **what the system is today** (2026-04-17) and the boundaries it
> should respect. For *why*, see [`010_VISION.md`](./010_VISION.md). For *when*, see
> [`030_ROADMAP.md`](./030_ROADMAP.md). For *which tradeoff and why that one*, see
> [`040_DECISIONS.md`](./040_DECISIONS.md).
>
> Historical, dated and patch-level documents have been moved to
> [`_archive/2026-04/`](./_archive/2026-04/).

---

## 1. System context

```
          ┌─────────────────────────────────────────────┐
          │                Telegram cloud               │
          └──────────────────┬──────────────────────────┘
                             │ (MTProto / Bot API)
                             ▼
 ┌──────────────────────────────────────────────────────┐
 │          OpenClaw Gateway / Harness (authoritative)  │
 │  ~/.openclaw/                                        │
 │    ├─ agents/main/sessions/*.jsonl  (runtime)        │
 │    ├─ agents/main/sessions.json     (index)          │
 │    └─ openclaw.json                 (governance)     │
 └──────────┬─────────────────────────────┬─────────────┘
            │ reads (fs watch)            │ writes (CLI)
            ▼                             ▲
 ┌──────────────────────────────────────────────────────┐
 │   Channel Manager (this repo)                        │
 │   Production_Nodejs_React/                           │
 │     ├─ backend  (Node + Express)                     │
 │     └─ frontend (React + Vite)                       │
 │   State:  channel_config.json                        │
 └──────────┬────────────────────────┬────────────┬─────┘
            │ exports                │ reads      │ mirrors
            ▼                        ▼            ▼
       openclaw.json         A070 summaries   IDE bundle
      (apply w/ preview)     (Studio_Framework) (.cursor/*)
```

- **Authoritative:** OpenClaw Gateway (sessions, governance, memory).
- **Mirror/config:** Channel Manager (UI config, transcript viewer).
- **Consumers:** IDE (Cursor / AntiGravity) via MCP bridge and exports.

---

## 2. Runtime surface

### 2.1 Processes

| Process         | Port            | Started via     | Responsibility                               |
| --------------- | --------------- | --------------- | -------------------------------------------- |
| Express backend | `3000`          | `npm start`     | REST + SSE + `channel_config.json` writer    |
| Vite dev server | `5173`          | `npm run dev`   | React UI + `/api` proxy (dev and preview)    |
| MCP stdio       | n/a (stdio)     | `run-mcp.sh`    | IDE ⇆ Channel Manager bridge                  |
| OpenClaw        | `8080`, `4260`  | external        | Gateway (Telegram, sessions)                 |

The historic multi-process launcher `occ-ctl.mjs` is **not present** in the
current repo. Starting is done via `npm` scripts; documenting a single-command
replacement (Makefile or root `package.json`) is an **Ops backlog** item, not a
chat-architecture concern.

### 2.2 Environment

- `WORKSPACE_ROOT` — Studio workspace root (absolute path).
- `STUDIO_FRAMEWORK_ROOT` — Studio Framework root (default `$WORKSPACE_ROOT/Studio_Framework`).
- `VITE_API_BASE_URL` — optional; when set, the frontend uses direct backend URLs for `fetch` and `EventSource`.
- `WORKBENCH_EXTRA_ROOTS`, `WORKBENCH_ALLOW_FS_ROOT` — additional allowed roots for the Workbench file view.
- `CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES` — when `1`/`true`, the TTG name prefix is enforced at write time.
- `OPENCLAW_SESSIONS_JSON_PATH` — optional override for `sessions.json` location.

### 2.3 Ports and proxy

Dev and Preview share one `apiProxy` with `timeout: 0` and `proxyTimeout: 0`
for SSE. A `404` in the browser for `/api/channels/events` almost always means
the request is hitting something other than Express on `:3000` (wrong static
host, missing proxy, or backend not up). See `040_DECISIONS.md` §ADR-006.

---

## 3. Frontend

### 3.1 Shape

`frontend/src/pages/ChannelManager.jsx` is the single page, split into three
top-level tabs plus channel row sub-tabs:

| Tab (top)          | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| **Manage Channels**| TTG list with configuration, chat mirror and Cursor summary sub-panels. |
| **Agents**         | Main-agent triad + sub-agents CRUD (`createSubAgent`, `deleteSubAgent`).|
| **Skills**         | Workspace skills registry view (filter/sort planned).                   |

Row sub-tabs per channel:

1. **Configuration** — agents, sub-agents, skills, MCP whitelist, TTG name.
2. **OpenClaw Chat** — session-native transcript (SSE stream).
3. **TARS in IDE · IDE project summary** — A070 summaries list + renderer.

### 3.2 Key frontend components

- `TelegramChat.jsx` — mirror-only chat panel. Receives SSE `INIT` and
  `newMessage` events, renders with `React.memo` bubbles. *Known hotspot,
  scheduled for split in Bundle B.*
- `ChannelManagerChannelRow.jsx` — two-`<tr>` layout (row + footer with
  Open/Collapse and resize handle), constants `ROW_HEIGHT_COLLAPSED=260`,
  `ROW_HEIGHT_EXPANDED=1010`. Row heights persist to `localStorage` under
  `ag-channel-row-heights`.
- `IdeProjectSummaryPanel.jsx` — lists and renders A070 summaries from
  `/api/ide-project-summaries` (alias `/api/summaries`).
- `utils/apiUrl.js` — single helper to compose URLs from optional
  `VITE_API_BASE_URL` or relative `/api/...` paths; used consistently for
  `fetch` and `EventSource`.

### 3.3 State model

- **Server cache:** React Query for `/api/channels` (with retry/backoff).
- **UI state:** local `useState` / `useReducer` per concern.
- **Persisted UI:** a minimal `localStorage`-backed set (row heights, active
  tab, optional skills order — last one is a planned Skills-tab preference).

SSE errors reconnect with backoff; logs are throttled to avoid noise while the
backend is restarting.

---

## 4. Backend

### 4.1 Routes (`backend/routes/`)

| File              | Responsibility                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `channels.js`     | `channel_config.json` read/write, agents/sub-agents CRUD, SSE hot-reload (`/events`), TTG  |
|                   | validation, config normalization (`normalizeParsedChannelConfig`).                         |
| `telegram.js`     | `GET /stream/:chatId` (SSE mirror), `POST /send` (legacy send alias).                      |
| `openclaw.js`     | `POST /session/:sessionId/send` (native session send alias).                               |
| `exports.js`      | `GET /api/exports/{canonical,openclaw,ide,cursor}` — read-only projections.                |
| `summaries.js`    | `GET /api/summaries`, `GET /api/summaries/file` — A070 summaries (read-only).              |
| `workbench.js`    | File-tree under allowed roots; respects `WORKBENCH_EXTRA_ROOTS` and FS-root flag.          |

`telegram.js` and `openclaw.js` will be merged into `routes/chat.js` in
**Bundle B / P4** (`/api/chat/:groupId/{session,stream,send}`), with the two
existing mount paths kept as thin aliases for one release.

### 4.2 Services (`backend/services/`)

| File                    | Current responsibility                                              | Bundle B target                                |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `telegramService.js`    | god-object: session index, session tail, build UI message, session  | Split into `chat/{sessionIndex, sessionTail,   |
|                         | send (CLI + dead HTTP fast path), channel alias resolution,         | messageModel, sessionSender, channelAliases}`. |
|                         | SSE event emitter, polling timers.                                  |                                                |
| `ideConfigBridge.js`    | `buildCanonicalSnapshot`, `buildOpenClawProjection`,                | Unchanged.                                     |
|                         | `buildIdeWorkbenchBundle`, `buildCursorProjection`.                 |                                                |
| `channelConfigWriter.js`| atomic writer for `channel_config.json`.                            | Unchanged.                                     |
| `skillsRegistry.js`     | scans `OPENCLAW_WORKSPACE/skills`, exposes skill metadata.          | Add filter/sort API (Backlog).                 |

### 4.3 Session identity

The binding model the backend enforces:

| Key                                          | Stability  | Used for                                              |
| -------------------------------------------- | ---------- | ----------------------------------------------------- |
| Telegram `group_id`                          | stable     | Primary UI/channel id, exported as TTG                |
| `agent:main:telegram:group:<id>`             | stable     | Rosetta key (memory, sessions.json mapping)           |
| OpenClaw `sessionId` (UUID)                  | ephemeral  | Internal session handle; resolved from `sessions.json`|
| `sessionFile` (path)                         | ephemeral  | The canonical JSONL currently tied to the group       |

Rebind: when `sessions.json` shows a new `sessionFile` for a known `group_id`,
the backend emits `SESSION_REBOUND` over SSE with a fresh buffer; the frontend
treats it like `INIT`.

### 4.4 Config schema (`channel_config.json`)

Root shape (enforced by `normalizeParsedChannelConfig`):

```
{
  "channels":  [ ... ],    // always array
  "agents":    [ ... ],    // always array; TARS/MARVIN/CASE defaults
  "subAgents": [ ... ],    // always array; researcher, coder, reviewer, ...
  "metadata":  { ... }
}
```

Validation via Zod. Guardrails learned the hard way (see anti-patterns below):

- Empty objects `{}` are normalized to `[]` on read.
- `.passthrough()` is used where frontends append UI-only metadata.
- `null` is never sent to a `.optional()` Zod field; `undefined` only.

### 4.5 Write discipline

- `channel_config.json` is the only file this repo writes to without explicit
  user action, and only via the atomic writer.
- `openclaw.json` is never written without an Apply confirmation (Bundle C1).
- `~/.cursor/*` is never written in the background.
- `~/.openclaw/workspace/memory/*` is never written without user confirmation
  (Bundle C2).

---

## 5. IDE bridge (MCP)

`Backend_MCP/` ships a stdio MCP server (`MCP-ChannelManager.mjs`) that exposes:

**Tools**

- `send_telegram_reply(channel_id, message)` — proxies to `POST /api/telegram/send`.
- `change_agent_mode(tars|marvin|case)` — channel-scoped focus swap (no
  engine-dropdown semantics).

**Resources**

- `memory://{telegram_id}` — read-only view into `~/.openclaw/workspace/memory/*`.
- `config://{telegram_id}` — channel-scoped skill/MCP policy as JSON/YAML.

Client registration is **per-host**: Windows `C:\Users\<u>\.cursor\mcp.json`
launches via `ssh -T … run-mcp.sh`; the Linux laptop `~/.cursor/mcp.json`
invokes `node` with a direct path. Project-level `.cursor/mcp.json` must not
duplicate the same server id.

---

## 6. Chat pipeline — current state

### 6.1 Read path (to UI)

1. Browser opens `EventSource /api/telegram/stream/:chatId`.
2. Backend resolves `chatId` → `sessionFile` (via `sessions.json`).
3. Backend tails the canonical JSONL and emits SSE events: `INIT`,
   `newMessage`, `SESSION_REBOUND`.
4. Frontend renders through `TelegramChat.jsx` + memoized `MessageBubble`.

### 6.2 Send path (from UI)

1. Frontend `POST /api/telegram/send` (legacy alias) or
   `POST /api/openclaw/session/:sessionId/send` (native alias).
2. Backend `sendMessageToChat` runs the OpenClaw CLI:
   `openclaw agent --channel telegram --to <chatId> --message <text> --deliver`.
3. Echo surfaces in the session JSONL → same SSE path as inbound.

### 6.3 Known pain points (Bundle A)

- ~~Session directory polling loop in `telegramService.js` (`readdirSync` +
  `statSync` every 2s) drives measurable CPU load.~~ **Resolved in Bundle A/P1**:
  replaced by a chokidar watcher on `sessions.json` plus one watcher whose
  path set tracks the canonical `sessionFile` of every group in
  `sessions.json`. Orphan `*.jsonl` files are never watched.
- ~~`sendViaHttpGateway` (HTTP fast path to `:8080/api/v1/sessions/:id/send`)
  always falls through (`"fetch failed"`).~~ **Resolved in Bundle A/P3**:
  removed entirely; `sendMessageToChat` now goes straight to the `openclaw`
  CLI. The HTTP endpoint will be re-introduced only when the gateway actually
  exposes it.
- ~~`scrollToBottom` with `behavior: 'smooth'` runs on every message and
  contributes to perceived latency.~~ **Resolved in Bundle A/P2**: scroll uses
  `behavior: 'auto'`, is keyed on `filteredMessages.length`, and is gated by a
  `stuckToBottomRef` so the user's reading position is preserved.
- Inline `await import('../services/telegramService.js')` in `routes/openclaw.js`
  is a circular-dependency smell scheduled to disappear with the route merge
  in Bundle B/P4.

---

## 7. Workbench file view

The Workbench tab (separate from Channel Manager tabs but shipped by the same
backend) exposes a filesystem tree under a set of allowed roots:

- Default: `WORKSPACE_ROOT`.
- Optional: `WORKBENCH_EXTRA_ROOTS`, `homedir()`, bundled OpenClaw skills
  under `~/.npm-global/…`, and optionally `/` when
  `WORKBENCH_ALLOW_FS_ROOT=true`.

All filesystem reads are isolated in `try/catch` so EACCES on unrelated system
directories (`/etc`, `/lost+found`) never kills the tree scan.

---

## 8. Anti-patterns we already paid for

Shortlist preserved from the restoration and documentation history; see
`040_DECISIONS.md` for the rulings they drove.

| Code     | Pattern                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| AP-01    | `null` sent to a Zod `.optional()` field — produces 500; use `undefined`.                   |
| AP-02/11 | `path.join('/', x)` escapes the workspace; never use `/` as `WORKSPACE_ROOT`.               |
| AP-03    | Zod without `.passthrough()` silently drops UI-only fields on write.                        |
| AP-04    | `nodemon` zombies hold ports; 502 is often "Zombie Proxy", not code.                        |
| AP-05    | WebSocket is overkill for one-way updates; **SSE over WebSocket**.                          |
| AP-06    | Bot-to-bot: Telegram ignores `TARS_2` bot echoes; use **CASE Relay-Bot**.                   |
| AP-06B   | Two poller processes on the same bot token → 409; **gateway-first** resolves this.          |
| AP-07    | Nested flexbox without `min-width: 0` collapses on ellipsis; use CSS Grid for content.      |
| AP-08    | `.env` served as binary; whitelist via `path.basename()`.                                   |
| AP-09    | `Zod.strict()` vs. UI metadata → `.passthrough()` or explicit strip.                        |
| AP-10    | Express masks SDK errors; add error mappers to surface Telegram 400 at the frontend.        |
| AP-12    | Wizard (`openclaw onboard`) may overwrite hardened JSON; confirm before running.            |
| AP-13    | Do not hardcode API keys in `models.json`; only in `auth-profiles.json`.                    |
| AP-14    | `allowedOrigins: ["*"]` is for day one; tighten to Tailscale IPs for real use.              |
| AP-15    | ID drift between `models.json` and `openclaw.json` → models show "no auth" while logged in. |
| AP-16    | Never invent a new session key for an existing channel; use the `agent:main:...` parity.    |
| AP-17    | Copying `mcp.json` across OSes breaks: separate Windows and Linux configs.                  |

---

## 9. Boundaries in one sentence

The Channel Manager **owns its config**, **mirrors OpenClaw's runtime**, and
**reads Studio artifacts** — and never writes into another owner's domain
without an explicit, previewed, auditable action.
