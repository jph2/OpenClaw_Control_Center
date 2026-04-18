---
title: C1b.2 — Model + agents.* mapping spec
status: signed-off 2026-04-18 · implementing as C1b.2a (additive upsert)
last_reviewed: 2026-04-18
depends_on: C1 (apply pipeline, lock/backup/undo/audit) · C1b.1 (groups.skills merge)
blocks: none (C1b.3 sub-agent/skills extension builds on this)
related:
  - ./CHANNEL_MANAGER_TelegramSync_RESEARCH.md (§2.4 — 2.5)
  - ../../020_ARCHITECTURE.md
  - ../../030_ROADMAP.md (§5.1)
  - ../../040_DECISIONS.md (ADR-004, ADR-005, ADR-007)
---

# C1b.2 — Model + `agents.*` mapping (Channel Manager → OpenClaw)

> **Purpose.** Freeze the field-level contract the **Apply to OpenClaw** path
> will use when it pushes **per-channel model** (and the main-agent identity)
> from `channel_config.json` into `~/.openclaw/openclaw.json`, **before** we
> touch `agents.list[]` / `bindings[]`.
>
> The user-visible regression that triggered this spec: CM shows `GPT-4o`
> for a channel, OpenClaw chat still renders the previous model
> (e.g. `Kimi`). Root cause: C1 / C1b.1 only merge
> `channels.telegram.groups[id].{requireMention,skills}`; there is **no
> per-group model slot** in the OpenClaw channel schema, so the pushed model
> never reaches the gateway. (Confirmed against `zod-schema.channels.d.ts`
> and the live `openclaw.json`.) This spec defines the correct target paths
> and a safe rollout.

---

## 1. Source of truth (Channel Manager)

Relevant fields per channel in
`Prototyp/channel_CHAT-manager/channel_config.json → channels[]`:

| Field | Type | Example |
| --- | --- | --- |
| `id` | string (group id) | `"-5168034995"` |
| `name` | string | `"TG001_Idea_Capture"` |
| `assignedAgent` | string (agent id from `agents[]`) | `"tars"` |
| `model` | string (fully-qualified provider/model) | `"openai/gpt-4o"` |
| `skills` | string[] (extra skills on the channel) | `[]` |
| `inactiveSubAgents` | string[] | `["researcher","documenter"]` |

And top-level:

| Collection | Role |
| --- | --- |
| `agents[]` | CM’s main-agent definitions (`tars`, `marvin`, `case`) + default skills |
| `subAgents[]` | CM’s sub-agent definitions (Researcher, Coder, Reviewer, …) — **UI-only** by ADR-004 |

**Out-of-scope for C1b.2:** `subAgents[]`, `inactiveSubAgents`,
`caseSkills`, `inactiveCaseSkills`, `ideOverride`. These are either
UI-only (ADR-004) or belong to C1b.3.

---

## 2. Target surfaces in `openclaw.json`

Confirmed against `plugin-sdk/src/config/zod-schema.agents.d.ts`.

### 2.1 `agents.defaults`

```jsonc
{
  "agents": {
    "defaults": {
      "model": { "primary": "<provider/model>", "fallbacks": ["…"] },
      "models": { "<provider/model>": { "alias": "GPT-4o" }, … },
      "skills": [ "<skill-id>", … ]
    }
  }
}
```

- `model`: gateway-wide **default** model. Any agent without its own
  `model` override falls back to this.
- `models`: alias dictionary (display name ⇢ canonical id) — **leave as
  the operator set it**; never rewrite from CM.
- `skills`: default skills allowlist for agents that don’t override.

### 2.2 `agents.list[]`

```jsonc
{
  "id": "tars-tg001",
  "name": "TARS · TG001_Idea_Capture",
  "model": { "primary": "openai/gpt-4o" },
  "skills": [ "clawflow", "skill-creator" ],
  "comment": "managed-by: channel-manager; source: -5168034995"
}
```

Key points:

- `agents.list[].model` is either a string or `{ primary, fallbacks }`.
- `agents.list[].skills` is an **allowlist** — a **non-empty** array
  replaces `agents.defaults.skills`, per research §2.5.
- `id` is free-form; we need an **idempotent** naming convention
  (see §3).
- `comment` is the **ownership marker** — CM-managed entries carry
  `managed-by: channel-manager; source: <groupId>`. Any entry without
  this marker is **operator-owned** and never rewritten or deleted by
  Apply.

### 2.3 `bindings[]` (route variant)

```jsonc
{
  "type": "route",
  "agentId": "tars-tg001",
  "comment": "managed-by: channel-manager; source: -5168034995",
  "match": {
    "channel": "telegram",
    "peer": { "kind": "group", "id": "-5168034995" }
  }
}
```

- Routes inbound messages on `telegram:<groupId>` to our synthesized
  agent id, which carries the per-channel model + skills override.
- Same ownership marker rules as §2.2.

### 2.4 `channels.telegram.groups[id]`

Unchanged from C1b.1: `{ requireMention, skills }` only. **No model
field exists on this object** — this is the exact reason the current
"File already matches this projection" feedback loop is misleading for
the user, and why we need §2.2 + §2.3.

---

## 3. Mapping rules

### 3.1 Per-channel synthesized agent id

```
<assignedAgent>-<groupIdSlug>
```

where `<groupIdSlug>` is `groupId` stripped of the leading `-` and
truncated to 16 chars if longer. Examples:

| Channel | CM `assignedAgent` | Synth `agents.list[].id` |
| --- | --- | --- |
| `-5168034995` / TG001 | `tars` | `tars-5168034995` |
| `-1003752539559` / TG000 | `tars` | `tars-1003752539559` |

Stable + deterministic ⇒ Apply is idempotent.

### 3.2 Per-channel agent entry

For every channel `c` in `channel_config.json`:

```jsonc
{
  "id": "<synth id>",
  "name": "<agent label> · <channel name>",
  "model": { "primary": c.model },
  "skills": dedupe(agents[c.assignedAgent].defaultSkills ∪ c.skills)
                 minus agents[c.assignedAgent].inactiveSkills,
  "comment": "managed-by: channel-manager; source: <c.id>"
}
```

- `skills` materialization is explicit (non-empty) so it **replaces**
  defaults cleanly — per research §2.5. If CM has no per-channel
  extras and no `inactiveSkills`, we emit the agent entry **without**
  `skills`, so defaults apply.
- `model` is always emitted when `c.model` is set. If `c.model` is
  empty / null, we emit the agent entry **without** `model` → falls
  back to `agents.defaults.model`.

### 3.3 Per-channel binding

```jsonc
{
  "type": "route",
  "agentId": "<synth id>",
  "comment": "managed-by: channel-manager; source: <c.id>",
  "match": { "channel": "telegram", "peer": { "kind": "group", "id": c.id } }
}
```

### 3.4 `agents.defaults` handling

**C1b.2 does not rewrite `agents.defaults.model`, `agents.defaults.models`, or `agents.defaults.skills`.**
These stay operator-owned. Rationale: operators run `openclaw`
directly against the gateway outside CM too; silently replacing their
workspace-wide defaults with the "majority CM model" is exactly the
regression ADR-005 warns about.

If the operator later wants CM to also manage the workspace default,
that is an **explicit opt-in** toggle in a later bundle (C1b.2b), not
the default behavior.

### 3.5 Idempotency, merge, orphan cleanup

Apply runs inside the same lock / atomic-write / backup / audit envelope
as C1. Within the lock, after reading current `openclaw.json`:

1. **Upsert CM-owned entries.** For each CM channel:
   - If `agents.list[].id === synthId` with the **CM marker**, replace
     its `model` / `skills` / `name` from §3.2.
   - Else insert a new entry.
   - Never touch entries without the CM marker.
2. **Upsert CM-owned bindings** — same rule keyed on
   `binding.comment` marker **and** `binding.match.peer.id`.
3. **Orphan cleanup** — remove any `agents.list[]` / `bindings[]` entry
   that carries the CM marker **and** whose `source: <groupId>` no
   longer appears in `channel_config.json`. (This keeps Apply fully
   idempotent when the operator deletes a channel in CM.)
4. **Validate the merged document** against
   `MergedOpenClawC1b2Schema` (see §4) before touching disk. On any
   Zod failure, the dry-run preview surfaces the error; no write
   occurs.

---

## 4. Validation extensions

`openclawApply.js → MergedOpenClawSchema` currently only sanity-checks
`channels.telegram.groups`. C1b.2 extends it to assert:

- `agents.defaults.model`, if present, matches `string | { primary, fallbacks }` (we never write here, but we read and pass through).
- `agents.list[]` entries carrying the CM marker match the narrow shape
  from §3.2 exactly (strict `{ id, name?, model?, skills?, comment }` —
  no unknown keys, so we can never accidentally strip operator-only
  fields).
- `bindings[]` entries carrying the CM marker match the strict route
  shape from §3.3.

Pre-existing operator-owned entries pass through unchanged and unchecked
beyond the OpenClaw built-in schema.

---

## 5. Dry-run UX

`OpenClawApplyModal.jsx` needs a second diff panel — or the existing
panel extended — so the operator sees, before confirming:

- Which `agents.list[].id`s would be **added** / **updated** / **removed (orphan)**.
- Which `bindings[]` would be **added** / **updated** / **removed**.
- Per-channel effective model (sourced from CM) and skill allowlist.

Copy-proposed banner inside the modal:

> "C1b.2 writes per-channel synthesized **agents.list[]** entries and
> matching **bindings[]** routes, both tagged `managed-by: channel-manager`.
> Your existing operator-authored agents and bindings are **never**
> modified. `agents.defaults.*` is **not** touched in this bundle."

---

## 6. Rollout phases (suggested)

| Phase | Scope | Risk |
| --- | --- | --- |
| **C1b.2-design** (this doc) | Lock contract; get user sign-off | None |
| **C1b.2a** | `agents.list[]` + `bindings[]` upsert for current channels (no orphan cleanup yet) | Medium — new objects in openclaw.json |
| **C1b.2b** | Orphan cleanup of stale CM-owned entries | Medium |
| **C1b.2c (opt-in)** | Manage `agents.defaults.model` when the operator explicitly checks "CM controls workspace default" | High if default — keep off |
| **C1b.3** | Sub-agent policy + per-channel skill overrides beyond main agent | Medium |

Each phase ships behind the same Apply modal with preview, confirm,
backup, undo, audit.

---

## 7. Non-goals / explicitly excluded

- Spawning CM "sub-agents" (Researcher / Coder / Reviewer / Documenter /
  Tester) as OpenClaw runtime sub-agents. ADR-004 stands: CM
  sub-agents remain a **UI-level configuration concept**. Runtime
  spawn sessions (`sessions_spawn`, `agent:<id>:subagent:<uuid>`) are
  a harness concern.
- Paperclip / `reportsTo` org-hierarchy writes. Research §2.4 keeps
  this out of scope.
- Engine-per-message picker. ADR-007 still rejects this; raising it
  requires a new ADR.
- Touching `agents.defaults.models` (the alias dictionary). That is
  pure operator metadata.

---

## 8. Risks & rollback

- **Risk: CM-synth agent id collides with an operator-authored agent
  id.** Mitigation: before write, refuse to proceed if an entry with
  the synth id exists but lacks the CM marker. Apply fails with a
  clear error; operator renames and retries.
- **Risk: binding routes a channel before the synth agent is fully
  populated.** Mitigation: write `agents.list[]` upserts before
  `bindings[]` upserts within the same atomic temp-file → rename; the
  gateway only sees the coherent final document.
- **Rollback:** unchanged from C1 — newest `.bak` restore via
  `POST /api/exports/openclaw/undo`. Since we never remove or mutate
  operator-owned entries, a restore fully reverts to the pre-CM state.

---

## 9. Sign-off decisions (2026-04-18)

All four open questions were resolved with the operator:

1. **Synth id convention — `<assignedAgent>-<groupIdSlug>`.**
   Human-readable form wins (e.g. `tars-5168034995`); easier to trace
   back to CM intent when inspecting `agents.list[]`.
2. **Skills scope for C1b.2 — main-agent allowlist only.**
   `agents[c.assignedAgent].defaultSkills ∪ c.skills` minus
   `agents[c.assignedAgent].inactiveSkills`. Sub-agent skill flavoring
   (Researcher / Coder / Reviewer / Documenter / Tester) remains
   UI-only per ADR-004 and is explicitly deferred to **C1b.3**.
3. **`agents.defaults.model` stays operator-owned in C1b.2.** Opt-in
   control via a later **C1b.2c** toggle. C1b.2a / C1b.2b never write
   the workspace default.
4. **C1b.2a ships additive-first.** Upsert of CM-marked
   `agents.list[]` entries and `bindings[]` routes only; **no
   deletions** of stale CM-marked entries in this phase. Orphan
   cleanup is its own shipment as **C1b.2b**.

## 10. Test plan (pre-code checklist for C1b.2a)

---

## 10. Test plan (pre-code checklist for C1b.2a)

- Unit tests (Node `--test`) around a new `buildAgentsAndBindingsApplyPatch(cm)` function:
  - Single channel, defaults-model fallback vs explicit model.
  - Two channels sharing `assignedAgent` but different `model` →
    two distinct `agents.list[]` entries.
  - Skills union / inactive subtraction logic.
  - Idempotency: running twice yields identical output.
  - Orphan cleanup: removing a channel from CM and re-running Apply
    drops the matching CM-marked entries, leaves operator-marked
    entries intact.
- Integration smoke: dry-run on the live `openclaw.json`; inspect the
  diff in `OpenClawApplyModal`.
- Gateway reload test: after a real Apply, `openclaw agent --agent
  tars-<groupId> --message "ping"` routes to the new model.
