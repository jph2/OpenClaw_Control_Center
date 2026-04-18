# Channel Manager — Vision

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-18

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

1. **Configure channels** — which Telegram Topic Group (TTG) is bound to **one
   main agent**, with a **model** choice for that agent’s run on this channel,
   **sub-agents** attached to the channel, and **skills** layered as **agent /
   sub-agent defaults plus extra skills per channel** (the same TTG can give TARS
   a different skill set than another TTG). MCP allowlisting narrows tools. The
   operator’s **source of truth** for this picture is **`channel_config.json`**;
   governed slices are **pushed into OpenClaw** only via explicit **Apply**
   (preview, confirm, audit) — see §2.2, **Bundle C1** (shipped) and **C1b**
   (roadmap §5.1).
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

**Today (Bundle C1):** Apply merges **`requireMention`** into
`channels.telegram.groups` in `openclaw.json`. **Bundle C1b** extends the merge
to additional fields the OpenClaw schema allows (e.g. **model** under
**`agents.*`**, **skills** on groups and/or agent allowlists), using a **versioned
mapping table** — never ad hoc keys that the gateway rejects. Background:
[`030_ROADMAP.md`](./030_ROADMAP.md) §5.1 and
[`_archive/2026-04/CHANNEL_MANAGER_TelegramSync_RESEARCH.md`](./_archive/2026-04/CHANNEL_MANAGER_TelegramSync_RESEARCH.md) §2.4–2.5.

### 2.3 Separation of config, runtime, and memory

Three domains with three different file owners:

| Domain  | Owner                 | Examples                                         |
| ------- | --------------------- | ------------------------------------------------ |
| Config  | Channel Manager       | `channel_config.json`, UI state                  |
| Runtime | OpenClaw (Harness)    | session JSONL, `sessions.json`, `openclaw.json`  |
| Memory  | OpenClaw workspace    | `~/.openclaw/workspace/memory/`, `MEMORY.md`     |

Cross-domain writes are always explicit, previewed and auditable.

### 2.4 One main agent per channel; model is not a second “engine switch”

A channel is bound to **one main agent** (typically **TARS** in the default
triad). The operator may choose a **different LLM per channel** for that main
agent’s runs; that is a **model** binding, not a second main-agent picker (see
`040_DECISIONS.md` §ADR-007 — no triad **engine** dropdown on the channel).
Sub-agents provide specialization; **skills** stack as defaults plus per-channel
additions. **Channel Manager “sub-agents”** are configuration roles; **OpenClaw
runtime sub-agents** (spawn sessions) and **external orchestration** (e.g.
Paperclip) are different concepts — see `040_DECISIONS.md` §ADR-004 and the
research note linked in §2.2.

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
2. Configure a TTG, assign one main agent, model choice, one sub-agent, layered
   skills, and MCP scope — and see the mirrored `channel_config.json` on disk.
3. Send a message from the Channel Manager UI and see the agent reply within
   the same panel within ~3s of the reply landing in the session JSONL.
4. Use **Apply to OpenClaw** to merge governed fields from Channel Manager into
   `openclaw.json` with preview, explicit confirm, backup, and undo (**C1**
   shipped for `requireMention`; **C1b** broadens the merge — `030_ROADMAP.md`
   §5.1).
5. Promote an A070 summary into OpenClaw memory (`memory/YYYY-MM-DD.md` or
   `MEMORY.md` with extra acknowledgement) after preview and confirm, with an
   audit entry (**Bundle C2** — shipped; `030_ROADMAP.md` §6).
6. Never lose data to a silent write or a racing file poller.

If any of these breaks, we have a product regression, not a polish task.
