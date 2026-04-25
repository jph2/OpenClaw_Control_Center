# MCP Server - Current Purpose, Status, and Recommended Boundary

Date: 2026-04-25
Scope: `backend/mcp-server.mjs`
Status: existing adapter, underdocumented, should be treated as an integration module

## TL;DR

The MCP server in this repo is **not** the Channel Manager UI and **not** the Workbench.
It is a small **stdio integration bridge for IDE clients** (Cursor / AntiGravity style usage).

Today it exposes a few MCP resources and tools so an IDE can:

- read Channel Manager config context
- read channel-related memory/transcript context
- trigger selected Channel Manager actions through the backend HTTP API

Architecturally, it should be treated as:

- **not a source of truth**
- **not a core domain module**
- **not part of the Workbench**
- **an adapter/integration layer around the Channel Manager backend API**

## What it currently does

File: `backend/mcp-server.mjs`

### Resources

- `config://channels`
  - returns the overall channel config JSON
- `memory://{telegram_id}`
  - reads a memory/transcript-like file for a Telegram id
- `config://{telegram_id}`
  - returns config for one channel

### Tools

- `send_telegram_reply(channel_id, message)`
  - calls `POST /api/telegram/send`
- `change_agent_mode(channel_id, agent_key)`
  - calls `POST /api/channels/update`

So in practice it is a **local MCP wrapper around selected backend reads/writes**.

## Current judgment

The server is useful as an integration idea, but currently looks like a legacy / transitional adapter.

Reasons:

- it is underdocumented
- it lives in `backend/` but is not a normal Express route module
- it uses stdio, not the normal app server lifecycle
- it contains localhost assumptions
- it contains hardcoded / older path assumptions
- it still reflects earlier prototype-era structure in places
- its architectural boundary is not documented clearly enough

## Recommended architectural placement

Best current interpretation:

- **Channel Manager** = domain UI + config/chat/summary/export backend
- **Workbench** = file/editor/browser tool surface
- **MCP Server** = IDE integration adapter

That means the MCP server should be treated as a **third concern**, separate from both Channel Manager and Workbench.

Recommended target placement later:

```text
backend/src/features/ide-bridge/mcp/
```

or, if separation should be even clearer:

```text
integrations/mcp-channel-manager/
```

## Recommended boundary

The clean boundary should be:

```text
IDE client
  -> MCP server
  -> Channel Manager backend API
  -> Channel Manager / OpenClaw state
```

Not this:

```text
IDE client
  -> ad hoc file/path knowledge inside MCP
  -> direct truth decisions
```

The MCP server should remain:

- an adapter
- thin
- API-driven where possible
- non-authoritative
- explicit about what it can read and mutate

## What it should not become

The MCP server should **not**:

- become a second truth path beside artifacts / Channel Manager
- own TTG truth
- own memory truth
- contain business rules that differ from backend/API rules
- silently invent state from weak hints
- drift into Workbench responsibilities

## Documentation best practice

For this component, **one local README is the right first step**.

A README next to the component should cover:

1. purpose
2. start/run mode
3. resources/tools exposed
4. backend endpoints it depends on
5. environment variables / path assumptions
6. security boundary
7. current limitations
8. target future placement

A **second document is only needed** if you want to lock architectural decisions, for example:

- "MCP server is adapter only"
- "MCP server must only use backend contracts, not private file knowledge"
- "MCP server is not a truth source"

Those belong in an ADR / decision doc, not in a long README.

## Practical recommendation

Short version:

- **README:** yes, definitely
- **second document:** only if you want to ratify architecture decisions formally

So the best practice here is:

- keep the operational and descriptive material in this README
- put irreversible architectural decisions into `040_DECISIONS.md` or a dedicated ADR

## Recommended next cleanup steps

1. Document how the MCP server is started in practice.
2. Remove or isolate hardcoded prototype paths.
3. Make backend dependencies explicit.
4. Treat it as `ide-bridge` / `integration` code in future structure.
5. If kept alive, add a small smoke test for resource/tool availability.

## Note on placement

At the time of writing, there was **no clearly existing dedicated MCP / CP folder** in this repo structure.
So this README is placed next to the backend component area as the least disruptive first documentation step.
