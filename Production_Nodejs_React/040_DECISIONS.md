# Channel Manager — Decisions

**Status:** normative · **Scope:** Production_Nodejs_React · **Last reviewed:** 2026-04-18

> This file is the **Architectural Decision Record** for the Channel Manager.
> Each entry captures one irreversible-enough choice, the forces behind it,
> and the date it was ratified. New entries are appended; older entries are
> never rewritten silently — they are **superseded** by a new entry that
> references them.
>
> For current state see [`020_ARCHITECTURE.md`](./020_ARCHITECTURE.md), for schedule
> [`030_ROADMAP.md`](./030_ROADMAP.md), for framing [`010_VISION.md`](./010_VISION.md).

---

## ADR-001 — Gateway-first architecture

**Date:** 2026-04-14 · **Status:** accepted

**Context.** Two concurrent bot-token pollers (OpenClaw Gateway and the
Node backend) produced `409 Conflict: terminated by other getUpdates request`
and silent traffic drops (AP-06B). The Node backend had grown an independent
Telegram ingest path that could diverge from the OpenClaw session JSONL.

**Decision.** The OpenClaw Gateway is the **single authoritative** ingest for
Telegram. The Channel Manager reads the canonical session JSONL from disk and
emits SSE to the UI. No Telegram `getUpdates` loop in this repo.

**Consequences.** Removes the 409 class of errors. Makes the mirror a true
mirror. Send path must route through the gateway (CLI today, native API
later).

---

## ADR-002 — SSE, not WebSocket, for UI updates

**Date:** 2026-04-10 · **Status:** accepted

**Context.** Updates are strictly server → client (config changes, transcript
lines). WebSocket adds bidirectional framing we do not need and brings in
state negotiation, heartbeats, and reconnection complexity (AP-05).

**Decision.** All push channels (`/api/channels/events`, `/api/chat/:groupId/stream`;
legacy `/api/telegram/stream/:id`)
are SSE with `Content-Type: text/event-stream` and long-lived proxy timeouts
(`timeout: 0`, `proxyTimeout: 0` in Vite).

**Consequences.** Simpler code, native browser reconnect. Dev and Preview must
share the same proxy configuration; static hosts without proxy produce a 404
that misleads people into "route is missing."

---

## ADR-003 — Session-native read, not Telegram-only projection

**Date:** 2026-04-17 · **Status:** accepted

**Context.** Early iterations mirrored only lines where the user payload
included `chat_id` in "Conversation info." Webchat/OpenClaw control UI often
sends only a `Sender (untrusted metadata)` header without the Telegram id,
so the buffer for affected channels stayed empty.

**Decision.** The mirror resolves `group_id → sessionFile` via `sessions.json`
(with rebind on change) and tails the canonical OpenClaw JSONL directly.
Primary identity is **Telegram `group_id` + session-key
`agent:main:telegram:group:<id>`**; `sessionId` and `sessionFile` are
runtime-only.

**Consequences.** A channel is never "blind" because Telegram metadata is
missing. On `sessionFile` change, the backend emits `SESSION_REBOUND` and the
frontend treats it as a fresh `INIT`.

---

## ADR-004 — CM sub-agents ≠ OpenClaw runtime sub-agents ≠ workspace skills

**Date:** 2026-04-17 · **Status:** accepted

**Context.** Three distinct things share similar names and blur easily:

- **Workspace skills:** files under `OPENCLAW_WORKSPACE/skills/*/SKILL.md`.
- **OpenClaw runtime sub-agents:** sessions spawned by an agent at runtime.
- **Channel Manager sub-agents:** UI configuration roles (researcher, coder,
  reviewer, documenter, tester).

**Decision.** The three stay distinct in code, in schemas, and in UI labels.
The Channel Manager lists workspace skills and lets the operator **assign**
them to a channel's main agent or sub-agents; it does **not** claim those
sub-agents are the same as OpenClaw runtime sub-agents.

**Consequences.** Naming in code uses prefixes where ambiguity is possible
(`backendSubAgents`, `workspaceSkills`). Skill badges carry the source
(`Inherited from {Name} · sub-agent`) to remove the ambiguity at a glance.

---

## ADR-005 — No silent writes into foreign domains

**Date:** 2026-04-17 · **Status:** accepted

**Context.** `channel_config.json` needs to be reflected into the OpenClaw
Gateway's `openclaw.json` and into IDE host files under `~/.cursor/`. An
earlier draft considered background sync.

**Decision.** The Channel Manager **projects** state via read-only endpoints
(`/api/exports/*`) and writes into foreign domains **only via an explicit
Apply** action (Bundle C1). No background writer into `~/.openclaw/` or
`~/.cursor/`.

**Consequences.** Operator always sees what will change before it changes.
Backup + atomic write + audit are mandatory on every Apply path. **Bundle C1b**
extends the *merge slice* into `openclaw.json` (and related targets) using the
same explicit Apply UX; the mapping table and OpenClaw version pin live in
`030_ROADMAP.md` §5.1 and implementation, with a new ADR only if an irrevocable
merge rule is locked (e.g. skills replace vs union semantics).

---

## ADR-006 — Vite proxy is the only dev path for `/api`

**Date:** 2026-04-17 · **Status:** accepted

**Context.** `vite preview` without proxy produced mysterious 404 for
`/api/channels/events`. Browser caches made this look like "the backend route
is gone." Multiple people lost hours to this (AP-04's cousin).

**Decision.** A shared `apiProxy` config is used for both `server` and
`preview` in `vite.config.js`. Optional `VITE_API_BASE_URL` is supported for
direct backend access; changes to it require restarting Vite.

**Consequences.** 404 on `/api/*` in the browser is a **stack** problem
(wrong process on 5173, no proxy, or backend down) — never a signal to
rewrite routes.

---

## ADR-007 — TARS-only per channel; no engine dropdown

**Date:** 2026-04-15 · **Status:** accepted

**Context.** A mid-flight proposal added an engine selector per channel
("choose TARS/MARVIN/CASE here"). It conflicts with the Harness persona model
(SOUL.md) and the triad intent.

**Decision.** A channel has one bound main agent. The triad exists at the
persona level inside the Harness, not as a UI picker. Sub-agent assignment and
MCP whitelisting are the channel-level knobs.

**Consequences.** No engine-dropdown UI. If triad weighting ever lands, it
will be **sliders summing to 100 %** injected into prompts, not an engine
switcher (see `030_ROADMAP.md` §Future).

---

## ADR-008 — Harness triad: TARS · MARVIN · CASE (SONIC → CASE)

**Date:** 2026-04-14 · **Status:** accepted (external)

**Context.** The operator runs a persona triad anchored in `SOUL.md`. The
legacy name `SONIC` is still visible in some downstream paths and in memory
files.

**Decision.** Canonical names are **TARS**, **MARVIN**, **CASE**. `SONIC`
maps to **CASE** wherever it shows up. `~/.cursor/rules/openclaw-harness-hint.mdc`
and `~/.openclaw/workspace/AGENTS.md` are the authoritative sources.

**Consequences.** The Channel Manager does not re-explain the triad; it trusts
it and renders the current configuration.

---

## ADR-009 — MCP, not ACP, for IDE bridge

**Date:** 2026-04-12 · **Status:** accepted

**Context.** Two viable IDE-bridge protocols: MCP (stdio) and ACP. ACP adds
mTLS and richer typing; MCP is simpler, well-supported in Cursor and
AntiGravity, and matches our "stdio process with scoped resources" model.

**Decision.** Use MCP via `@modelcontextprotocol/sdk`. `Backend_MCP/` ships a
stdio server; Windows launches over `ssh -T`, Linux calls `node` directly.

**Consequences.** MCP config is per-host. Copying `mcp.json` across OSes is
an anti-pattern (AP-17).

---

## ADR-010 — Session-key parity `agent:main:telegram:group:<id>`

**Date:** 2026-04-14 · **Status:** accepted

**Context.** Inventing new session keys for existing channels breaks the
Rosetta mapping between Telegram group, OpenClaw session, and historical
memory files (AP-16).

**Decision.** The session key is always `agent:main:telegram:group:<id>` where
`<id>` is the Telegram group id. This key is the stable link to
`~/.openclaw/workspace/memory/*.md` and must never be rewritten.

**Consequences.** The Channel Manager persists only the stable identifiers;
it looks up ephemeral `sessionId` / `sessionFile` at runtime from
`sessions.json`.

---

## ADR-011 — TTG naming is enforced at the backend

**Date:** 2026-04-17 · **Status:** accepted

**Context.** Telegram Topic Group naming (`TTG000`, `TTG001`, …) cannot rely
on user discipline or a Cursor rule alone. A backend guard is the only
enforceable layer.

**Decision.** `CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES=1|true|yes` turns
on Zod validation for persisted channel names in
`backend/utils/ttgChannelNameValidation.js`. Names must start with `TTG` +
three digits. Default value for a new row in strict mode is
`TTG000 group <channelId>`.

**Consequences.** Skills and Cursor rules that advise the prefix are
**complements**, never the sole mechanism. Tests live in
`backend/test/ttg-channel-name-validation.test.js`.

---

## ADR-012 — Channel Manager is a config + mirror, not a second chat hub

**Date:** 2026-04-15 · **Status:** superseded by ADR-019 (UI-only optimistic placeholders)

**Context.** There is a temptation to grow a full chat product inside the
Channel Manager: optimistic append, per-client message store, draft queue,
etc. Every such feature needs a second source of truth for messages.

**Decision.** The Channel Manager is a **configuration hub** and a **mirror**
of the OpenClaw session transcript. No optimistic append; no local message
queue; sending is a request to OpenClaw whose result becomes visible through
the same SSE mirror.

**Consequences.** Kept the chat stack simple. Performance issues (Bundle A)
are local; they are not symptoms of missing store infrastructure.

---

## ADR-019 — UI-only optimistic placeholders are allowed

**Date:** 2026-04-24 · **Status:** accepted · **Supersedes:** ADR-012 wording only

**Context.** ADR-012 correctly rejected a second authoritative chat store, but
its wording also rejected every optimistic UI append. On 2026-04-20 the CM chat
panel gained a temporary user bubble to reduce perceived latency while the
OpenClaw mirror catches up. The placeholder is marked `cmOptimistic`, is not
persisted, and is removed when the mirrored JSONL user line arrives.

**Decision.** Channel Manager remains a **configuration hub** and **mirror** of
OpenClaw's session transcript. It may render UI-only optimistic placeholders
when they are explicitly marked, never durable, never treated as authoritative,
and deduped/removed once the OpenClaw mirror confirms the message. Local
message queues, per-client stores, and alternate transcript ownership remain
rejected.

**Consequences.** The UX can acknowledge a send immediately without changing
the source of truth. Gateway/session JSONL remains authoritative for ordering,
history, and assistant output.

---

## ADR-020 — CM chat send uses a transport boundary

**Date:** 2026-04-24 · **Status:** accepted

**Context.** Roadmap §8b.4 needs CM chat sends to move from `openclaw agent`
subprocesses toward the same warm gateway path OpenClaw Control UI uses. The
old `sessionSender.js` mixed session resolution, shell command construction,
OpenClaw runtime discovery, gateway env injection, logging, and API result
shape in one place. Replacing that directly would make rollback and comparison
hard.

**Decision.** `sessionSender.js` remains the stable orchestration boundary and
delegates actual I/O to explicit transports:

- `openclawCliTransport.js` for the existing fallback path.
- `openclawGatewayTransport.js` for gateway-native `chat.send` RPC.

The default transport is still CLI. Native send is gated by
`OPENCLAW_CM_SEND_TRANSPORT=auto|gateway`; `auto` may fall back only before a
native RPC is attempted, while `gateway` surfaces native failures. The gateway
transport uses explicit gateway auth from env / `openclaw.json` and supports
`OPENCLAW_GATEWAY_CALL_MODULE` for the current OpenClaw runtime call module.
The CLI fallback uses `spawn` args rather than shell-interpolated command
strings.

**Consequences.** CM can test and compare gateway-native sends without changing
the production default or losing the known CLI fallback. A 2026-04-24 beta
smoke verified `session-native-gateway-chat` on the warm gateway. Remaining
risk is a stable SDK export for `callGateway`, native-default rollout, and
gateway event subscription for transcript pushes; those are follow-ups, not a
blocker for the current CM chat UX slice.

---

## ADR-013 — Atomic writes and `.passthrough()` defaults

**Date:** 2026-04-14 · **Status:** accepted

**Context.** Direct writes to `channel_config.json` caused partial files on
crash; `Zod.strict()` dropped UI-only fields on read/write cycles (AP-03/09);
`.optional()` treated `null` as invalid (AP-01).

**Decision.**

- `channel_config.json` is written atomically (temp file + `rename`).
- Zod schemas default to `.passthrough()` at the object boundary where UIs
  attach metadata; fields that must be stripped are done so explicitly.
- Optional fields receive `undefined`, never `null`.

**Consequences.** Fewer "what happened to my field?" bugs. Slightly more code
discipline at the schema layer.

---

## ADR-014 — Summary → memory: manual-with-preview default

**Date:** 2026-04-17 · **Status:** accepted

**Context.** Memory (`~/.openclaw/workspace/memory/`, `MEMORY.md`) is
expensive to un-pollute. Three modes were on the table: auto-on-save,
manual-with-preview, review-first (PR-style).

**Decision.** The MVP default is **manual-with-preview**: the operator clicks
"Promote to OpenClaw memory" on a specific A070 summary; a modal shows the
destination, the full text to write, and a dedup check; Confirm performs the
atomic append; audit log records the event. `MEMORY.md` requires an
additional destination opt-in.

**Consequences.** Nothing enters long-term memory without an explicit click
and a visible preview. Auto-on-save is explicitly rejected for the MVP.
Review-first is a later possibility but not scheduled.

---

## ADR-015 — Config Apply requires diff preview and backup

**Date:** 2026-04-17 · **Status:** accepted

**Context.** Writing into `openclaw.json` without review destroys
hand-tuned governance fields (AP-12 pattern from `openclaw onboard`).

**Decision.** `POST /api/exports/openclaw/apply` is `dryRun: true` by default,
requires a visible diff, enforces a Zod schema check, writes a timestamped
`.bak`, performs an atomic write, and appends to the audit log. A one-click
undo restores the most recent `.bak`.

**Consequences.** No Apply button in the UI without diff preview and
destination. Backup retention rotates to avoid unbounded growth.

---

## ADR-017 — Local LLMs: providers ≠ aliases; use real `lmstudio` provider

**Date:** 2026-04-18 · **Status:** accepted

**Context.** Channel Manager and `~/.openclaw/openclaw.json` previously
referenced `local-pc/google/gemma-4-26b-a4b` as if `local-pc` were a
provider. It was not — it appeared only inside `agents.defaults.models`
(the alias map) without a matching `models.providers.local-pc` block. The
gateway logged `Unknown model: local-pc/...` and silently fell back to
`moonshot/kimi-k2.5`, hiding the misconfiguration from operators.

**Decision.** Local-LLM model slugs in any CM-emitted config (channel
defaults, synth `agents.list[]`, alias maps) **must reference a registered
provider** under `models.providers.<provider>`. For LM Studio specifically:

- Provider id is `lmstudio` (matches the built-in OpenClaw
  `plugins.entries.lmstudio` extension and the gateway's provider
  registry).
- Slug is `lmstudio/<model-id-as-served-by-LM-Studio>` (e.g.
  `lmstudio/google/gemma-4-26b-a4b`).
- Provider declaration carries a realistic `contextWindow` and
  `maxTokens` so OpenClaw's bootstrap planner does not over-pack the
  prompt.
- Defaults in `backend/routes/channels.js` (the merged-channel projection
  and the row-create fallback) and in `Prototyp/.../channel_config.json`
  use the same `lmstudio/...` slug as canonical.

**Consequences.** No more silent Kimi fallback for local-model channels.
Adding a new local backend in the future means **registering a provider
first**, then aliasing — never the reverse. Tests guard the default slug
to prevent regression to `local-pc/...`.

---

## ADR-018 — Webchat session resolution is upstream (gateway), not CM

**Date:** 2026-04-18 · **Status:** accepted

**Context.** After C1b.2a, the OpenClaw webchat for a Telegram-bound group
session (`agent:main:telegram:group:<id>`) continues to display
`agents.defaults.model`, while inbound Telegram traffic for the same group
is correctly answered by the per-channel model registered via the synth
`agents.list[]` + `bindings[]` pair. Two paths, two resolvers, two
answers.

**Decision.** Channel Manager will **not** mutate
`agents.defaults.model` to make the webchat badge match the binding-routed
model. Doing so:

1. would silently rewrite a workspace-wide default the operator set in
   `~/.openclaw/openclaw.json`,
2. would not actually fix the webchat for any channel that does not happen
   to be the workspace default,
3. would mask a resolver bug in the gateway's webchat session bootstrap,
   not fix it.

The right fix lives in the OpenClaw gateway: the webchat session bootstrap
must perform the same `bindings[]` lookup the inbound Telegram path
performs, find the matching synth agent for the peer, and use its model.

**Consequences.** The "OpenClaw chat shows the wrong model" complaint is
documented as a **known upstream limitation** (`030_ROADMAP.md` §8b.2a),
not a CM bug. Telegram traffic remains the canonical signal that "the
per-channel model is live." **C1b.2c (2026-04-20)** adds an *opt-in* slice
(`openclawAgentsDefaultsPolicy.applyModelOnOpenClawApply` + `modelPrimary` in
`channel_config.json`) so an operator can push `agents.defaults.model.primary`
on **Apply** only when explicitly enabled — never silently; upstream webchat
resolver work remains the proper long-term fix (ADR-018 decision above).

---

## ADR-021 — Open Brain integration is artifact-centered

**Date:** 2026-04-25 · **Status:** accepted

**Context.** The initial §8b.5 bridge plan treated Codex/Cursor ingestion as a
major next gate. After reviewing Open Brain (OB1), the better boundary is one
level higher: Open Brain is a tool-agnostic semantic knowledge layer and MCP
memory substrate. If Studio Framework artifacts are the durable source of
truth, producer tools such as Codex, Cursor, OpenCode, Telegram, and Chat do
not need bespoke truth paths.

**Decision.** The Channel Manager / Studio / OpenClaw / Open Brain integration
is artifact-centered:

- Studio Framework artifacts carry stable identity, metadata, TTG binding,
  project/discovery context, content hash, and provenance.
- OpenClaw memory is operational agent continuity.
- Open Brain is the long-term semantic index and MCP-accessible shared brain.
- Producer adapters create or update artifacts; they do not bypass artifact
  headers, sidecars, review states, dedup, no-secrets rules, or audit.
- Open Brain export/sync uses explicit contracts and fingerprints; no secrets
  are allowed in exportable artifacts or payloads.

**Consequences.** `CODEX_ADAPTER_V1` and future Cursor/OpenCode adapters are
demoted from architecture-critical truth sources to producer/importer
conveniences. The new core gates are artifact header binding, artifact indexing,
Open Brain export contract, reviewable agent classification, and audited Open
Brain sync. See `SPEC_OPEN_BRAIN_BOUNDARY_CONDITIONS.md`.

---

## ADR-016 — Documentation: four normative files, everything else archived

**Date:** 2026-04-17 · **Status:** accepted

**Context.** The repo accumulated 14 partly overlapping documents (spec,
implementation plan, documentation, rebuild plan, discovery notes, research
notes, testing plan, restoration report, scope MVP, skills research, skills
registry spec, workbench docs, plugin overview, IDE bridge discovery). Each
was correct at its date; together they contradicted each other in places.

**Decision.** Consolidate into four normative files (`010_VISION.md`,
`020_ARCHITECTURE.md`, `030_ROADMAP.md`, `040_DECISIONS.md`). Move the sources into
`_archive/2026-04/` with a breadcrumb `README.md` explaining where their
content now lives. New information lands in the four files; the archive is
reference-only.

**Consequences.** One concise entry-point per question (why / what / when /
how-decided). Older context remains searchable via the archive.

---

## ADR-021 — MCP server is an IDE integration adapter, not a truth source

**Date:** 2026-04-25 · **Status:** accepted

**Context.** The repo contains a stdio MCP server (`backend/mcp-server.mjs`)
used by IDE clients. It currently sits under `backend/`, but it is neither the
Channel Manager UI nor the Workbench. Without an explicit boundary, it risks
becoming a second path for truth, routing, or memory semantics.

**Decision.** The MCP server is treated as an **IDE integration adapter**:

- It is not a source of truth.
- It is not part of the Workbench domain.
- It is not allowed to define TTG truth, memory truth, or artifact truth.
- It should stay thin and prefer stable backend/API contracts over private
  file/path knowledge wherever possible.
- Its role is to expose selected Channel Manager / OpenClaw context and actions
  to IDE clients over MCP stdio.

**Consequences.** The MCP server should be documented and evolved as an
integration boundary (`ide-bridge` / adapter layer), not as core domain logic.
Operational documentation lives next to the component; irreversible
architecture decisions belong here in ADR form. Future refactors should move it
into a clearer integration/module location without folding it into Workbench or
letting it become a parallel authority.
