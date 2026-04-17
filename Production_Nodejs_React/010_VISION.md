# Channel Manager — Vision

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-17

> This file answers **why** the Channel Manager exists and **what it is not**.
> Architecture, current state and schedule are covered by
> [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md),
> [`030_ROADMAP.md`](./030_ROADMAP.md), and
> [`040_DECISIONS.md`](./040_DECISIONS.md).

---

## 1. Purpose

The **Channel Manager** is a private configuration and observability surface for a
multi-agent system whose primary runtime is **OpenClaw** (the Harness).

It is built to give the operator a single place where three things come together:

1. **Configure channels** — which Telegram Topic Group (TTG) talks to which
   main agent (TARS · MARVIN · CASE), with which sub-agents, which skills,
   and which MCP servers.
2. **Observe channels** — mirror the session-native OpenClaw transcript of the
   selected TTG so the operator can read the actual agent conversation without
   Telegram being the only window.
3. **Bridge work back into memory** — surface IDE/Cursor project summaries and,
   on explicit request, promote them into OpenClaw's long-term memory.

Everything else is either a means to these three ends or explicitly out of scope.

---

## 2. Principles

### 2.1 Gateway-first

**OpenClaw is the source of truth for agent traffic.**
The Channel Manager does not run its own Telegram `getUpdates` poller and does
not maintain a parallel chat model. Inbound data is read from the canonical
OpenClaw session JSONL; outbound data is delivered via the OpenClaw CLI (and,
later, a native session-send API). This principle exists to avoid the 409
`getUpdates` conflicts and the "two-truth" drift we encountered in earlier
iterations.

### 2.2 Configure-and-project, never overwrite silently

The Channel Manager owns **`channel_config.json`**. It **projects** that state
to the OpenClaw Gateway (`openclaw.json`) and to IDE hosts (`.cursor/*`) only
through explicit export endpoints and, for write operations, through an
**Apply** action with diff preview. There is no background writer into
`~/.openclaw` or `~/.cursor`.

### 2.3 Separation of config, runtime, and memory

Three domains with three different file owners:

| Domain  | Owner                 | Examples                                         |
| ------- | --------------------- | ------------------------------------------------ |
| Config  | Channel Manager       | `channel_config.json`, UI state                  |
| Runtime | OpenClaw (Harness)    | session JSONL, `sessions.json`, `openclaw.json`  |
| Memory  | OpenClaw workspace    | `~/.openclaw/workspace/memory/`, `MEMORY.md`     |

Cross-domain writes are always explicit, previewed and auditable.

### 2.4 TARS-only per channel, not an engine picker

A channel is bound to **one main agent** (TARS in the default triad). Sub-agents
provide skill specialization; MCP whitelisting narrows tool access; no UI
dropdown switches the engine mid-stream (removed decision, see `040_DECISIONS.md`).

### 2.5 Stable keys, ephemeral sessions

- **Stable:** Telegram `group_id`, session-key `agent:main:telegram:group:<id>`.
- **Ephemeral:** OpenClaw `sessionId` (UUID), `sessionFile` path.

The Channel Manager persists the stable identifiers only and resolves the
ephemeral ones at runtime.

---

## 3. The Harness triad

The operational context is the Harness persona triad — **TARS · MARVIN · CASE**
— described in `~/.openclaw/workspace/AGENTS.md` and `SOUL.md`. The Channel
Manager assumes the triad exists; it does not redefine it.

`SONIC` is a historical name; the mapping is **SONIC → CASE**.

---

## 4. Relationship to Studio Framework

The **Studio Framework** is the operator's outer knowledge base and artifact
repository (ARYS/GILD schema, A070 IDE summaries, skill definitions). The
Channel Manager:

- **Reads** A070 summaries to display them in the Cursor Summary tab.
- **Does not own** the pipeline that produces those summaries.
- **Does not write** into `Studio_Framework/` directly.

The canonical Studio root is resolved via `STUDIO_FRAMEWORK_ROOT` (defaulting
to `WORKSPACE_ROOT/Studio_Framework`).

---

## 5. Non-goals (MVP)

The following are intentionally **not** in scope for the current cycle:

- Running a second Telegram client or a parallel chat surface.
- Writing into OpenClaw's `openclaw.json` without explicit user confirmation.
- Writing into `~/.openclaw/workspace/memory/` automatically from summaries.
- Media (images, files) on the send path — text only until the gateway
  supports media natively (`030_ROADMAP.md` backlog).
- Engine-per-message selection (a channel stays bound to one main agent).
- Multi-user tenancy, authentication, or remote operator UIs.

---

## 6. Success criteria for the current cycle

A run is "successful" if the operator can, on a fresh machine:

1. Start the stack with one documented command.
2. Configure a TTG, assign one main agent, one sub-agent, two skills, one MCP —
   and see the mirrored `channel_config.json` on disk.
3. Send a message from the Channel Manager UI and see the agent reply within
   the same panel within ~3s of the reply landing in the session JSONL.
4. Promote an A070 summary into `memory/YYYY-MM-DD.md` after reviewing a
   preview and a diff, with an audit entry.
5. Never lose data to a silent write or a racing file poller.

If any of these breaks, we have a product regression, not a polish task.
