# SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1

**Status:** active — schema-slice MVP accepted by ADR-022; Worker Run proof pending
**Owner surface:** OpenClaw Control Center / Channel Manager (data model + projections)
**Created:** 2026-04-30
**Last updated:** 2026-05-05
**Depends on / relates to:**
- [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) — Apply + IDE export mechanics, maturity gates
- [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md) — CM target vs gateway session vs transcript; channel runtime timeline
- [`SPEC_GOVERNANCE_STACK_V1.md`](./SPEC_GOVERNANCE_STACK_V1.md) — control plane vs OpenClaw workspace vs IDE projection

---

## 1. Why this spec exists

[`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) defines **how** Channel Manager projects intent into OpenClaw and Cursor today and what “done” means for **hardening** (apply accuracy, export stale checks, runtime readback).

This spec defines the **next architectural evolution**: a **single logical model** for engines and workers that both targets can interpret, without pretending OpenClaw and Cursor share one runtime — while closing the **semantic gap** where the same CM field means “extra skills” in one world and “separate agent file” in another, and neither yet guarantees a **testable worker** (own model policy, bounded context, delegation contract, audit).

External review prompts and operator expectations now assume **Dual-Target**: Telegram/OpenClaw remains **channel-multiplex**; Cursor remains **repo-global** for `.cursor/agents/*.md` unless additional mechanisms are introduced.

**Normative stance:** current CM `subAgents[]` must be treated as **Skill Roles /
Capability Roles**, not as runtime workers. The label **Worker** is reserved for
entities that satisfy the operational checklist in §3. Do not "upgrade" all
existing roles by naming alone.

---

## 2. Problem statement

### 2.1 Colliding meanings of “Sub-Agent”

Three concepts must stay separated in UI, docs, and JSON:

| Layer | Meaning |
| ----- | ------- |
| **CM `subAgents[]`** | Configuration role: parent engine, `additionalSkills`, toggles. **Not** automatically a separate OpenClaw `agents.list` row or a Cursor Task spawn. |
| **OpenClaw runtime subagents** | Gateway-spawned background sessions (`agents.defaults.subagents`, spawn/delegation). **Not** the same as CM `subAgents[]`. |
| **Target “echter Worker”** | Operationally checkable identity (see §3). May map to dedicated `agents.list` entries, spawn policy, and/or IDE agent files + optional Task-type mapping. |

Today, **Apply** implements ADR-004-style behavior: CM sub-agents **fold** into one synth agent’s skill allowlist per Telegram channel. **IDE export** implements the opposite shape: **one file per** CM sub-agent. Operators easily confuse “I enabled MARVIN in CM” with “a separate runtime agent answered.”

This is the biggest flaw to remove:

```text
Skill Role selected in CM
  != separate OpenClaw agent
  != separate model
  != separate session
  != Cursor Task subagent
```

The safe current truth is:

```text
Skill Role selected in CM
  -> contributes skills to the channel synth agent
  -> may be exported as an IDE Agent Profile
  -> has no runtime worker identity unless explicitly projected as one
```

### 2.2 Dual-target asymmetry (not fixable by wording alone)

- **OpenClaw:** Per TTG, a **distinct** synth agent id (`<engine>-<groupSlug>`), model, merged skills, binding — **channel-first**.
- **Cursor:** Exported `.cursor/agents/*.md` set is **per target repo**, not per Telegram group; channel-specific disablement of a “worker” is not represented as separate trees without new product decisions (multi-repo export, presets, generated overlays).

Any **unified CM model** must encode **projection rules** per target, not assume feature parity.

### 2.3 Observability and canonical session

Worker delegation and model identity amplify confusion if [**Channel Runtime Binding**](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md) is unresolved: CM target, gateway session, transcript source, and “who produced this line” must remain distinguishable. A **channel runtime timeline** is the preferred UX umbrella for Apply events, session resolution, webchat opens, delegations, model usage, and transcript writes.

---

## 3. Operational definition: “echter Worker” / Agent (testable)

A **worker** (or dedicated agent) **in this architecture** is **not** defined philosophically. Minimum properties (MVP checklist for “counts as real”):

1. **Runtime identity** — stable id in the target system (OpenClaw `agents.list` id, spawn correlation id, or IDE agent file name / session correlation); not only a bullet list inside another agent’s prompt.
2. **Model / provider policy** — own `model.primary` (or explicit **documented inheritance** with a non-default override path and audit).
3. **Bounded work context** — clear boundary vs parent (tools/skills allowlist, workspace scope, or session kind); no silent full transcript merge unless policy says so.
4. **Delegation contract** — parent → child handoff and return path (artifact refs, summary, or structured result); machine- or human-auditable.
5. **Audit trail** — in Control Center or transcript, reconstructable: *which* worker took *which* step; aligns with timeline spec where applicable.
6. **Visibility** — may be **silent** in Telegram but **not** invisible in CM (effective topology / timeline / debug pane).
7. **Parent aggregation** — worker output is integrated by a parent/engine step unless a later ADR explicitly allows worker speech into the channel.

Until these are satisfied, CM should label the entity as **Skill bundle / CM role** or **IDE agent stub**, not “Worker (runtime).”

---

## 4. Target architecture (intent)

### 4.1 Four bounded contexts

The CM must model intent once, then project it honestly into different targets.

| Context | What it owns | What it must not pretend |
| ------- | ------------ | ------------------------ |
| **Channel Manager** | Intent model: channel targets, engines, skill roles, worker specs, projection rules, observed runtime state. | It does not prove runtime truth merely because config exists. |
| **OpenClaw** | Execution runtime: `openclaw.json`, gateway binding, sessions, transcripts, auth/model state. | It does not share Cursor's repo-global agent-file semantics. |
| **Cursor / IDE** | Workbench projection: `.cursor/agents/*.md`, optional task-type mapping, repo export manifests. | A generated Markdown file is not proof of a live OpenClaw worker. |
| **Delegation / Worker Runs** | Operational child work: parent run, worker run, bounded input, model policy, result artifact, audit. | A skill bundle is not delegation. |

The desired control-plane chain is:

```text
Channel Target
  -> selected Engine
  -> selected Skill Roles
  -> selected Worker Specs
  -> OpenClaw Projection
  -> Cursor Projection
  -> observed Runtime Binding / Timeline Events
```

### 4.2 Channel Manager as canonical snapshot

Preserve and extend the pattern already implemented in `ideConfigBridge`-style snapshots:

- **`agents[]`** — engines (TARS, CASE, …).
- **`subAgents[]`** — legacy logical children with `parent`, skills, toggles; new UI label should be **Skill Roles**.
- **`channels[]`** — assignment, per-channel model, inactive sub-agents, etc.

**Extension (conceptual, not yet schema-final):** per logical entity (engine,
role, or worker), **projection metadata**:

- **`kind`:** `engine` | `skillRole` | `runtimeWorker` | `ideProfile` | `external`.
- **`openclawProjection`:** `mergeIntoSynth` | `dedicatedAgentsListEntry` | `runtimeSpawnPolicy` | `notApplicable`.
- **`cursorProjection`:** `agentMarkdown` | `taskTypeMapping` | `agentMarkdownAndTaskType` | `notApplicable`.
- **`runtimeIdentity`:** `none` | `merged` | `dedicatedPerTask` | `dedicatedLongLived` | `external`.
- **`visibility`:** `telegramVoice` | `backgroundOnly` | `ideOnly` | `debugOnly`.

Exact field names and validation belong in a follow-on **schema spec** or ADR once §8b.7C implementation starts.

### 4.3 Minimum logical model for a real worker

The first schema slice should not be large, but it must carry the semantics that
make a worker testable:

```ts
type WorkerSpec = {
  id: string;
  displayName: string;
  kind: 'skillRole' | 'runtimeWorker' | 'ideProfile' | 'hybrid';
  parentId: string;
  status: 'active' | 'inactive' | 'experimental' | 'deprecated';

  modelProfile: 'inherit' | string;
  providerProfile?: 'inherit' | string;
  authProfileRef?: string;

  contextBoundary:
    | 'sharedSummaryOnly'
    | 'selectedTranscriptWindow'
    | 'freshContext'
    | 'dedicatedSession';

  skillPolicy: {
    allowedSkills: string[];
    deniedSkills: string[];
    skillInheritance: 'none' | 'fromParent' | 'fromChannel' | 'fromEngine';
    riskTier: 'readOnly' | 'writeProposed' | 'writeAllowed' | 'externalSideEffects';
  };

  delegationContract: {
    inputContract: string;
    outputContract: string;
    acceptanceCriteria?: string[];
    maxRuntimeMs?: number;
    maxTokens?: number;
    maxCost?: number;
    requiresHumanApproval?: boolean;
    canSpeakToChannel: boolean;
  };

  openclawProjection: {
    mode: 'mergeIntoSynth' | 'dedicatedAgentsListEntry' | 'runtimeSpawnPolicy' | 'notApplicable';
    sessionPolicy?: 'reuseParent' | 'dedicatedPerTask' | 'dedicatedLongLived';
    transcriptPolicy?: 'parentOnly' | 'workerOnly' | 'linked';
    maxConcurrent?: number;
  };

  cursorProjection: {
    mode: 'agentMarkdown' | 'taskTypeMapping' | 'agentMarkdownAndTaskType' | 'notApplicable';
    workspaceTargetId?: string;
    taskType?: string;
    mappingStatus?: 'verified' | 'manual' | 'stale' | 'unmapped';
  };
};
```

This is intentionally a **conceptual shape**, not an immediate config migration.
The first implementation may store a smaller subset, but it must not collapse
`skillRole`, `runtimeWorker`, and `ideProfile` back into one ambiguous
"sub-agent" bucket.

### 4.3.1 Accepted schema-slice MVP (ADR-022)

ADR-022 accepts a pre-proof **schema slice**, not the full `WorkerSpec` above.
The first persisted shape is top-level `workerCandidates[]`:

```ts
type WorkerCandidateV1 = {
  schemaSlice: 'c1e-worker-candidate-v1';
  id: string;
  displayName: string;
  parentId: string;
  sourceSkillRoleId?: string;
  enabled: boolean;
  status: 'candidate' | 'active' | 'inactive' | 'experimental' | 'deprecated';
  modelProfile: 'inherit' | string;
  skillIds: string[];
  deniedSkillIds: string[];
  contextBoundary: 'sharedSummaryOnly' | 'freshContext' | 'dedicatedSession';
  riskTier: 'readOnly' | 'writeProposed';
  canSpeakToChannel: false;
  openclawProjection: {
    mode: 'dedicatedAgentsListEntry';
    sessionPolicy: 'dedicatedPerTask';
    transcriptPolicy: 'linked';
    maxConcurrent: number;
  };
  cursorProjection?: {
    mode: 'notApplicable' | 'agentMarkdown' | 'taskTypeMapping';
    mappingStatus: 'unmapped' | 'manual' | 'verified' | 'stale';
    taskType?: string;
  };
};
```

Apply projects active candidates to CM-owned headless OpenClaw
`agents.list[]` rows with id `worker-<id>`. It does **not** create Telegram
`bindings[]` for workers, and `canSpeakToChannel` is forced to `false`.

### 4.4 OpenClaw projection paths (options, not commitment)

- **Today for Skill Roles:** `mergeIntoSynth` for CM sub-agents (skills only).
- **Accepted first worker path (G2):** dedicated headless `agents.list[]` rows per explicit `workerCandidates[]` entry.
- **Later option:** documented use of **OpenClaw runtime subagents** with CM-driven spawn policy; bindings may remain **one outward-facing synth per channel** with internal delegation (product decision).

Recommended order:

1. Keep channel synth as the only Telegram speaker.
2. Add one headless worker pattern.
3. Return worker output to the parent as a result artifact or structured summary.
4. Let the parent synth decide what, if anything, is spoken into Telegram.

Direct worker-to-Telegram speech should remain off by default.

### 4.5 Cursor projection paths

- **Today:** `agentMarkdown` per engine and per CM sub-agent (`model: inherit` default).
- **Gap:** Cursor **Task** / background subagents use **fixed `subagent_type` enums** — not automatically CM `subAgents[].id`. A **mapping table** (CM worker id → allowed Task type) or explicit “not supported” is required for parity claims.

Cursor exports must carry a visible preset/manifest:

```text
IDE export target: repo-alpha
Export preset: repo-global baseline | channel TTG001 view | custom domain preset
Includes: engines, skill roles, worker specs
Task mappings: verified / unmapped / stale
OpenClaw parity: not implied
```

### 4.6 Non-goals

- Single shared on-disk schema for OpenClaw and Cursor remains a **non-goal** (consistent with [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) §12).
- Full parity between Telegram channels and repo-global Cursor workspaces is a **non-goal**.
- Automatically upgrading all existing CM `subAgents[]` to live workers is a **non-goal**.
- Treating `.cursor/agents/*.md` as proof of runtime worker identity is a **non-goal**.
- Allowing workers to speak directly into Telegram without a later ADR is a **non-goal**.

---

## 5. Programme phases (suggested)

| Phase | Outcome |
| ----- | ------- |
| **P0 — Vocabulary & UI honesty** | Rename/display current CM `subAgents[]` as **Skill Roles / Capability Roles** in user-facing surfaces. Add projection badges: `OpenClaw: merged into synth`, `Runtime Worker: no`, `Cursor: agent file`. No runtime change required. |
| **P1 — Projection hints in CM model** | Snapshot / config supports projection metadata; Apply and IDE export consume overlapping subset; warnings when Cursor cannot express channel-specific worker sets. |
| **P2 — Worker Spec layer** | Introduce `WorkerSpec` / `Worker Candidate` next to legacy Skill Roles. Do not migrate all roles. Exactly selected roles can be promoted. |
| **P3 — First OpenClaw worker path** | At least one headless worker pattern (dedicated list entry or spawn policy) shipped with audit + readback gates from C1c/C1d. Parent remains Telegram voice. |
| **P4 — Cursor Task / parity where feasible** | Optional mapping; document **Nicht-Ziele** where repo-global export cannot mirror TTG multiplex. |
| **P5 — Timeline integration** | Worker steps and delegation events appear on [**Channel Runtime Timeline**](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md) MVP event set. |

Phasing is ordered for **risk reduction**; P1 may partially overlap C1d timeline MVP.

---

## 6. Acceptance criteria (architecture level)

- CM **never** implies a separate OpenClaw runtime agent for CM `subAgents[]` unless `openclawProjection` resolves to a dedicated identity and Apply implements it.
- Dual-target docs explain **channel-multiplex** (OpenClaw) vs **repo-global** (Cursor default).
- “Echter Worker” claims in UI or marketing copy match §3 checklist.
- A worker can have its own model profile or an explicit audited inheritance policy; a role without this remains a Skill Role.
- Worker outputs are observable as Worker Runs or timeline/audit events before they can influence canonical channel answers.
- Cursor export manifests state whether exported files represent a repo-global preset, channel view, or custom preset.
- [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) remains the **implementation** owner for export/apply hardening; this spec **does not** duplicate its P0/P1 script matrices — it **constrains** future schema and projection design.

---

## 7. Migration strategy

### 7.1 Do first: semantics without runtime risk

The fastest valuable change is **not** to create workers. It is to stop
mislabeling skill composition:

```text
Current CM sub-agent -> Skill Role / Capability Role
OpenClaw projection  -> merged into channel synth
Cursor projection    -> IDE Agent Profile
Runtime identity     -> none
```

This is a small UI/documentation slice and should happen before any runtime
worker work. It prevents users from believing that a checked role has a separate
model, session, or voice.

### 7.2 Add worker candidates next to roles

Selected Skill Roles may become **Worker Candidates**. Promotion requires extra
fields: model policy, context boundary, delegation contract, audit level, and
projection modes. The UI action should be explicit:

```text
Enable as Runtime Worker
```

The operator then chooses one of:

```text
OpenClaw: keep merged only
OpenClaw: dedicated headless worker
OpenClaw: spawn policy
Cursor: agent file
Cursor: task-type mapping
Cursor: no projection
```

### 7.3 First real worker

Start with exactly one worker type. Preferred candidates:

- **Reviewer Worker** — read-only / write-proposed, low side-effect risk.
- **Research/Summary Worker** — bounded context, summary output, no direct Telegram speech.
- **Policy Checker Worker** — deterministic output contract and good audit value.

Definition of Done for the first worker:

- own Worker Run id;
- model policy or audited inheritance;
- bounded input envelope;
- result artifact or structured summary;
- parent aggregation step;
- timeline event trail;
- no direct canonical Telegram write unless explicitly enabled.

---

## 8. Risk model and guardrails

### 8.1 Cost explosion

Workers create additional model calls and contexts. Guardrails:

- `maxConcurrent` per channel and per worker;
- `maxTokens`, `maxRuntime`, and optional `maxCost`;
- human approval for high-cost or external-side-effect runs;
- default to one worker MVP before parallel worker orchestration.

### 8.2 Context leaks

Workers must not silently inherit the whole Telegram transcript, repo, secrets,
or auth profiles. Guardrails:

- default `contextBoundary: sharedSummaryOnly`;
- explicit delegation envelope;
- no auth profile inheritance without `authProfileRef`;
- audit: "why did this worker see this input?"

### 8.3 Race conditions

Worker results must not directly overwrite canonical answers or artifacts.
Guardrails:

- parent remains aggregator;
- worker outputs are proposals or result artifacts;
- trace ids: `parentRunId`, `workerRunId`, `delegationId`;
- locks or sequencing for side-effect tools.

### 8.4 Channel vs repo truth

OpenClaw is channel-multiplex; Cursor is repo-global by default. Guardrails:

- visible Cursor export preset;
- export manifest with source CM config hash;
- mapping table for CM worker -> Cursor task type;
- no implicit parity from file names.

---

## 9. Timeline and observability requirements

C1e should reuse the [Channel Runtime Timeline](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md)
as the UX backbone. MVP worker events:

```text
delegation_requested
worker_run_started
worker_run_completed
worker_run_failed
worker_result_attached
parent_synthesis_completed
cursor_export_completed
cursor_task_mapping_warning
```

Timeline entries should record:

- channel target;
- parent run id;
- worker id / worker run id;
- model profile used;
- context policy used;
- transcript or result artifact link;
- canonical/off-canonical status.

Do not put full prompts, secrets, token streams, or every tool-call detail in
the standard timeline view. Deep links can expose debug payloads for operators.

---

## 10. UI naming rules

Dangerous labels:

- `Sub-Agent` without qualifier;
- `Agent` for everything;
- `Runs in Cursor` for Markdown files;
- `OpenClaw Worker` for merged skills.

Preferred labels:

| Label | Use for |
| ----- | ------- |
| **Skill Role** | Today's CM `subAgents[]`: skill composition only. |
| **IDE Agent Profile** | Generated `.cursor/agents/*.md` projection. |
| **Runtime Worker** | Entity satisfying §3 and projected into runtime. |
| **Worker Run** | A concrete delegated execution. |
| **Channel Synth** | The per-channel OpenClaw `agents.list[]` speaker. |
| **Task-Type Mapping** | Explicit Cursor task/subagent mapping, if verified. |

Example current-state badge:

```text
Research Role
OpenClaw: merged into Channel Synth
Cursor: exported as IDE Agent Profile
Runtime Worker: disabled
```

Later:

```text
Review Worker
OpenClaw: spawnable Runtime Worker
Cursor: mapped to task type "review"
Runtime Identity: dedicated per task
Audit: input/output linked
```

---

## 11. Implementation size estimate

This is not one refactor. It splits into sizes:

| Slice | Rough effort | What changes |
| ----- | ------------ | ------------ |
| **Vocabulary / projection badges** | 0.5-1.5 days | UI labels, docs, snapshots, no runtime change. |
| **WorkerSpec model + manifest** | 2-5 days | Schema design, validation, export manifest, read-only UI. |
| **First headless OpenClaw worker** | 1-2 weeks | Apply path, run identity, model policy, result artifact, readback. |
| **Robust delegation subsystem** | 2-4+ weeks | parent/child runs, budget, cancellation, timeline, races, security gates. |

The recommended path is therefore: **rename first, model second, one worker
third**, never "turn every sub-agent into a worker" as a bulk migration.

---

## 12. ADR pointer

**Recorded as accepted for the schema-slice MVP in**
[`040_DECISIONS.md`](../040_DECISIONS.md) (**ADR-022**). The accepted first
worker path is explicit `workerCandidates[]` projected as dedicated headless
OpenClaw `agents.list[]` rows.

The current P3 proof slice records headless Worker Runs in
`Prototyp/channel_CHAT-manager/worker_runs_audit.jsonl` with a bounded input
envelope, result artifact, event trail, and parent-aggregation status. CM can
also request OpenClaw's native subagent spawn path for the headless worker and
records the returned `childSessionKey` / OpenClaw `runId` when accepted. This
proves live spawn wiring while keeping `canSpeakToChannel: false`. Completion
readback and richer parent aggregation remain the next P3 criteria.

---

## 13. Implementation touch points (forward reference)

Likely surfaces when P1+ starts:

- `Prototyp/channel_CHAT-manager/channel_config.json` schema + normalization
- `backend/services/ideConfigBridge.js` — bundle extensions
- `backend/services/openclawApply.js` — beyond `computeEffectiveSynthSkills` when workers get dedicated rows or policies
- `backend/services/channelRuntimeBinding.js` — runtime state, timeline links, worker event correlation
- Channel Manager UI — labels, topology readout, timeline (with [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md))
- [`030_ROADMAP.md`](../030_ROADMAP.md) — status for **§8b.7C / C1e**
- `040_DECISIONS.md` — only after the dedicated-list-entry vs spawn-policy implementation choice becomes durable

---

## 14. References (internal)

- [`030_ROADMAP.md`](../030_ROADMAP.md) — programme index
- [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) — mechanical dual-target implementation detail
- [`SPEC_CHANNEL_RUNTIME_BINDING_V1.md`](./SPEC_CHANNEL_RUNTIME_BINDING_V1.md) — canonical session and timeline model
- [`SPEC_GOVERNANCE_STACK_V1.md`](./SPEC_GOVERNANCE_STACK_V1.md) — control plane / runtime / IDE authority boundaries
- [`Production_Nodejs_React/_archive/2026-04/CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md`](../_archive/2026-04/CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md) — CM subAgents vs OpenClaw runtime subagents
- OpenClaw subagents (external): `https://docs.openclaw.ai/tools/subagents`

---

*End of SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.*
