# SPEC — Governance stack: Channel Manager, OpenClaw workspace, IDE projection (V1)

**Status:** normative  
**Scope:** Cross-repo clarity for operators and for **any** LLM backend (executive behavior varies by model; **written sources of truth** must not).  
**See also:** [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) (CM → OpenClaw + Cursor projection mechanics). **Worker semantics / dual projection programme:** [`SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md`](./SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md) (§8b.7C / C1e).

## 1. Three layers (top to bottom)

| Layer | What it is | What it owns |
| --- | --- | --- |
| **A — Channel Manager** (`OpenClaw_Control_Center` app + SPECs) | Operator control plane: **what** is active and **when** it is applied | Effective agent/sub-agent/skill **selection**, model routing, bindings, **Apply to OpenClaw**, **IDE export** (`apply-ide-export`), audit UX. **Not** the canonical text of soul, triad philosophy, or workspace-wide guardrails. |
| **B — OpenClaw runtime + workspace** | Live harness + **home** for identity and rules | **`openclaw.json`**, gateway, sessions. **Workspace** `~/.openclaw/workspace/`: **`AGENTS.md`**, **`SOUL.md`**, **`GOVERNANCE.md`**, `memory/`, and **OpenClaw-managed skills / guardrails** as you define them there. This is the **governing body** for *behavioral* and *cross-tool* policy. |
| **C — IDE / Cursor** (e.g. `Studio_Framework/.cursor/*`) | **Ancillary projection** | **`.cursor/agents/*.md`**: CM-generated stubs (managed blocks). **`.cursor/rules`**: **one** short pointer file (`openclaw-workspace-authority.mdc`, `alwaysApply: true`) — must **not** introduce new “law” duplicating A or B. |

```text
Channel Manager (intent, apply, export)
        ↓
OpenClaw runtime (openclaw.json, gateway)
        ↓
OpenClaw workspace (AGENTS, SOUL, GOVERNANCE, skills-as-hosted-here)
        ↓
Cursor/IDE (.cursor = pointers + CM export; not a second constitution)
```

## 2. Why this matters (LLM variance)

Different models differ in tool use, verbosity, and edge-case handling. The **stack** stays stable only if:

- **One** written norm (workspace + CM SPECs) is cited for disputes.
- Editor-only copies do **not** drift into a second, conflicting rulebook.

## 3. Hard rules

- **Studio_Framework** keeps **one** `.cursor/rules` file — **`openclaw-workspace-authority.mdc`** — as an IDE bootstrap pointer; **do not** add further normative `.mdc` shards there (avoid a second rulebook).
- **Do not** place **authoritative** rules, skills definitions, soul, or identity **only** in `Studio_Framework/.cursor/rules` (or any sibling repo’s `.cursor/rules`) as long-form policy.
- **Do not** treat `.cursor/agents/*.md` as the **source** of persona/soul — generator stubs describe **CM wiring**; **behavioral basis** is **`SOUL.md`** and **`AGENTS.md`** on the OpenClaw workspace host.
- **Migration / corpus gates** (e.g. admin ops quarantine) are **SPEC’d in this repo** (e.g. `SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`); Studio may mirror **playbooks** but not override CM migration law. **Per-batch closure** (staging/import complete, consumed snapshots, review queues) is recorded in Studio `095_Migration_Staging/General_Dev/<batch-id>/BATCH.md`.

## 4. References

- `~/.openclaw/workspace/AGENTS.md` — authority statement; slim boot files.
- [`010_VISION.md`](../010_VISION.md) — product vision; workspace memory boundaries.
- [`SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md`](./SPEC_CM_DUAL_TARGET_AGENT_SKILL_CONFIG_V1.md) — dual-target implementation detail.
