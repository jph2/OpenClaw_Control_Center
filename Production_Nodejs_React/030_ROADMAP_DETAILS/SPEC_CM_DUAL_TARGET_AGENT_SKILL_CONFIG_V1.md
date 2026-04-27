# SPEC - CM Dual-Target Agent/Skill Configuration V1

**Status:** proposed active hardening block
**Scope:** Channel Manager source-of-truth to OpenClaw runtime and Cursor repo
projection
**Current maturity:** OpenClaw apply **90-95%**; Cursor projection/apply
**78-85%**
**Next target:** Cursor projection/apply **90-95%** with repeatable operator and
CI checks
**Review basis:** TARS / MARVIN / CASE countercheck, 2026-04-27

## 1. Goal

Channel Manager should be the operator-facing source of truth for:

- main engines / agents (TARS, MARVIN, CASE, ...)
- CM sub-agents (researcher, coder, reviewer, tester, ...)
- model selection
- channel skills and sub-agent skill contributions
- MCP / rule / IDE-facing policy where it belongs in Cursor-class tools

The same intent must be projected into two different target systems:

- **OpenClaw:** `openclaw.json`, workspace skills, gateway routing, and runtime
  bindings.
- **Cursor:** repo-local `.cursor/agents/*.md`, rules, MCP registration hints,
  stale export checks, and skill availability validation.

These targets do **not** share one schema. The contract is: CM stores intent,
then target-specific projections materialize only what each target can safely
consume.

## 2. Marvin Countercheck - Must Be True

This block is ready to implement, but only if the next slice treats runtime and
governance as first-class acceptance criteria.

OpenClaw "fully usable" means:

- Apply writes are not enough; the live gateway must prove it loaded the
  intended synth `agents.list[]` + `bindings[]`.
- Every TTG needs a read-only configured-vs-runtime view: CM channel, assigned
  agent, synth OpenClaw agent, model, skills, sub-agent skill contributions,
  session key, and account policy state.
- Stale session pins must be detected and surfaced when they can mask new
  bindings or model changes.
- ADR-018 remains an upstream webchat resolver issue. Telegram runtime is the
  acceptance signal until webchat uses the same binding lookup.
- Apply failures must be actionable: schema failure, CM reference failure,
  operator-owned collision, stale session, account policy block, restart
  failure, or runtime mismatch.

Cursor "90-95%" means:

- `apply-ide-export` and `check-ide-export-stale` are governed workflows for
  target repos, not occasional manual helpers.
- Generated Cursor files have an honest ownership model. If custom prose is
  advertised as preservable, the renderer must use managed blocks and preserve
  non-managed content.
- Skill IDs exported to `.cursor/agents/*.md` must be checked against known CM /
  target skill locations where possible, or surfaced as explicit warnings.
- MCP bridge verification after IDE reload is an acceptance test, not only an
  operator note.
- Cursor hardening is not primarily more UI. The first lift is schema,
  rendering, file safety, stale detection, tests, and target-repo enforcement.

## 3. Roadmap Placement

This spec owns **C1c / §8b.7A - Dual-target Agent/Skill configuration**.

It connects several existing roadmap lines:

- **C1/C1b shipped:** OpenClaw Apply is the foundation.
- **§8b.5:** IDE Memory Bridge and CM -> Cursor projection already exist.
- **§8b.7:** Effective topology readout should consume the runtime verification
  data defined here.
- **MCP whitelisting / Sovereign Bridge:** belongs as a later policy layer after
  the Cursor bundle contract is stable.
- **6.22+ producer adapters:** must write Studio artifacts / sidecars only; they
  must not become a second memory truth.
- **Open Brain live upsert:** remains downstream of corpus onboarding and must
  keep the existing no-secrets / dedup / review gates.

Suggested implementation labels:

- **C1c:** OpenClaw apply hardening + runtime readback warnings.
- **B2:** CM -> Cursor export hardening to 90-95%.
- **9.x:** MCP whitelisting / bridge verification after bundle v2.
- **6.22+:** Producer adapter ingestion into A070 artifacts.
- **G2:** Open Brain live upsert after corpus onboarding and policy gates.

## 4. Current State

### OpenClaw

OpenClaw integration is near production-usable:

- `backend/services/openclawApply.js` merges CM config into `openclaw.json`.
- C1/C1b are shipped: preview/confirm, backup, audit, undo, Telegram group
  policy, synth `agents.list[]`, matching `bindings[]`, model routing, skills,
  orphan prune, account policy, and gateway restart attempt.
- CM sub-agent skills are currently folded into CM-owned synth
  `agents.list[].skills`. This is the production contract today: CM sub-agents
  are not true OpenClaw runtime sub-agent rows.

Remaining OpenClaw work is hardening and proof, not basic wiring.

### Cursor

Cursor integration is real but not yet fully hardened:

- `GET /api/exports/ide` returns the IDE workbench bundle.
- `backend/services/ideConfigBridge.js` builds the Cursor-class projection.
- `scripts/apply-ide-export.mjs` materializes `.cursor/agents/*.md` under a
  chosen target repo.
- `scripts/check-ide-export-stale.mjs` compares the current CM bundle to
  `.cursor/cm-ide-export-fingerprint.json`.
- `Studio_Framework/.cursor/agents/*.md` already contains generated CM agent
  stubs.

Current Cursor output is mostly agent/sub-agent Markdown plus skill ID lists. It
does not yet prove that exported skill IDs, MCP config, rules, or target repo
state are fully available and fresh.

## 5. Authority Matrix

| Intent | CM source | OpenClaw target | Cursor target | Owner |
| ------ | --------- | --------------- | ------------- | ----- |
| Main agent / engine | `channel_config.json` `agents[]` | `agents.list[]` synth entries and route bindings | `.cursor/agents/<engine>.md` | CM projection |
| Channel assignment | `channels[].assignedAgent` | `bindings[]` route to synth agent | informational / future topology readout | CM projection |
| Model | `channels[].model` and optional defaults policy | `agents.list[].model.primary`, optional `agents.defaults.model.primary` | frontmatter/advisory only today | CM projection + operator runtime |
| Channel skills | `channels[].skills` | Telegram group `skills` + synth agent skills | skill IDs in generated docs today | CM projection |
| Sub-agent skills | `subAgents[].additionalSkills`, inactive filters | folded into synth `agents.list[].skills` | `.cursor/agents/<sub>.md` skill ID section | CM projection |
| Rules / MCP | CM config + host policy | OpenClaw gateway/tool policy | `.cursor/rules`, `.cursor/mcp.json` hints or operator-managed files | explicit operator action |
| Runtime proof | gateway / sessions / transcript state | effective binding/model/skills readback | stale check + target-file validation | future §8b.7 topology |

## 6. Missing To Make OpenClaw Fully Operational

OpenClaw is already usable through Apply. The remaining gap is confidence that
the live runtime matches what Apply wrote.

P0:

- Add post-apply verification that the gateway loaded the expected config or
  reports a clear degraded state.
- Add an effective topology readout for one TTG: channel -> binding -> synth
  agent -> model -> skills -> session key.
- Include Telegram account policy state in the readout so an allowlist or group
  policy cannot silently block a configured group.
- Validate CM references before Apply: assigned agent IDs, sub-agent parents,
  skill IDs, and model IDs should be known or explicitly warned.
- Keep the ADR-018 webchat mismatch visible: Telegram runtime is the acceptance
  signal until OpenClaw webchat uses the same binding resolver.

P1:

- Strengthen merged OpenClaw validation against the live OpenClaw schema for
  `agents.list[]`, `bindings[]`, Telegram account policy, and defaults.
- Add preview-to-write hash / `ifMatch` semantics so Apply writes exactly the
  state the operator previewed.
- Integrate stale-session release into Apply guidance when changed bindings or
  models are masked by pinned sessions.
- Track gateway restart/readback as a distinct degraded state: file write can be
  successful while runtime reload is not.

P2:

- Add backup/undo readback with before/after hashes and clearer restore target
  selection.
- Add deployment hardening for remote CM installs: auth/origin/CSRF posture for
  Apply routes.

## 7. Missing To Bring Cursor To 90-95%

Cursor needs the next hardening block. The goal is not to silently write
`~/.cursor`; it is to make repo-local Cursor projection repeatable, checked, and
safe.

P0:

- Define Cursor bundle v2 in `ideConfigBridge`: stable schema version, enabled
  state, descriptions/persona text, effective skill lists, inactive filters,
  parent validation, warnings, and normalized frontmatter.
- Extract a shared renderer for `.cursor/agents/*.md` so API export,
  `apply-ide-export.mjs`, and any legacy exporter use the same output.
- Replace whole-file replacement with managed-block semantics:
  `<!-- cm-managed:start --> ... <!-- cm-managed:end -->`; preserve custom prose
  outside the managed block.
- Validate safe IDs and paths before writing: no traversal, generated files stay
  under `.cursor/agents`, invalid IDs fail dry-run/write.
- Fingerprint v2 should include expected rendered content and file set, not only
  the bundle hash. Stale check must fail if target files drift.
- Add integration tests for marker skip, force overwrite, managed-block
  preservation, invalid path rejection, fingerprint mismatch, and stable output.

P1:

- Detect generated `.cursor/agents/*.md` files no longer present in CM. Report
  them in dry-run; require explicit `--prune-managed` or archive behavior.
- Add CI/pre-commit recipe for target repos, starting with Studio Framework:
  `check-ide-export-stale` must be part of the normal verification path.
- Add operator visibility in CM: IDE export status, target hints, dry-run/write
  command, stale status, missing skills warnings.
- Deprecate or wrap any legacy Cursor exporter so one renderer owns the format.
- Formalize the MCP bridge verification step after IDE reload. `config://` and
  `memory://` should be part of the acceptance path where relevant.

P2:

- Validate exported skill IDs against the target Cursor skill locations and CM
  skills registry where possible.
- Add MCP/rules advisory manifest: what belongs in host-level `~/.cursor/mcp.json`,
  what belongs in repo `.cursor/mcp.json`, and what must not be duplicated.
- Generate or refresh a repo rule that explains how CM-generated Cursor agents
  should be used, including the boundary between generated and custom prose.
- When `allowedMCPs` lands, project it through the same policy surface and make
  `config://{telegram_id}` show the effective allowed MCP set.

## 8. Acceptance Criteria

### OpenClaw

- Dry-run shows exactly which `agents.list[]`, `bindings[]`, skills, model, and
  policy rows will change.
- Apply refuses operator-owned collisions and invalid CM references.
- After Apply, runtime verification confirms or clearly fails:
  - gateway loaded the intended config
  - TTG resolves to the intended synth agent
  - model and skills match CM intent
  - account-level Telegram policy does not block the configured TTG
  - stale session state is not masking the new binding/model
- Apply UX offers or links the stale-session release path when a binding/model
  change is likely hidden by a pinned session.
- Audit contains before/after config hashes and gateway restart/readback state.

### Cursor

- `npm run apply-ide-export -- --dry-run --target <repo>` reports a complete
  file plan, warnings, stale generated files, invalid IDs, and skipped files.
- `--write` updates only generated/managed regions unless `--force` is explicit.
- `check-ide-export-stale` fails when CM changes, generated target files drift,
  required generated files are missing, or stale generated files remain.
- Generated `.cursor/agents/*.md` includes stable frontmatter, parent/engine
  metadata, effective skill IDs, and clear source-of-truth text.
- Target repo CI/pre-commit can enforce the stale check.
- Existing human-authored Cursor agent files are never overwritten silently.
- MCP bridge acceptance proves the target IDE can read the Channel Manager MCP
  resources after reload, or documents the host-level manual step still needed.

### Related System Gates

- Producer adapters write Studio artifacts and sidecars only; they never write
  memory truth directly.
- Open Brain sync refuses `needs_review`, `ambiguous`, `unknown`, and `blocked`
  bindings unless a later explicit policy says otherwise.
- Any future `allowedMCPs` contract is visible through `config://{telegram_id}`
  before it is treated as enforced.

## 9. Implementation Touch Points

OpenClaw:

- `backend/services/openclawApply.js`
- `backend/routes/exports.js`
- `backend/services/chat/sessionResolver` / session release scripts, where
  effective session state is read
- `030_ROADMAP_DETAILS/8b-followups.md` and §8b.7 topology work

Cursor:

- `backend/services/ideConfigBridge.js`
- `backend/test/ideConfigBridge.test.js`
- `scripts/apply-ide-export.mjs`
- `scripts/check-ide-export-stale.mjs`
- `scripts/ideExportFingerprint.mjs`
- possible new `scripts/lib/ideAgentRenderer.mjs`
- possible new script integration tests
- target repo examples under `Studio_Framework/.cursor/agents/`

## 10. Next Implementation Slice

Recommended next PR scope:

1. Cursor bundle v2 + shared renderer.
2. Safe path / safe ID validation.
3. Managed-block preservation.
4. Fingerprint v2 with rendered file set.
5. Tests for the script behavior above.
6. Target-repo stale-check recipe for Studio Framework.
7. Read-only OpenClaw validation warnings where they are cheap and low risk.

This slice should raise CM -> Cursor from **78-85%** to roughly **90-95%** if it
also includes target-repo stale-check instructions. OpenClaw can stay in the
same PR only for read-only validation/warnings; full gateway runtime readback
belongs with §8b.7 effective topology.

## 11. Risks And Better Implementation Choices

- Do not build a second target-specific source of truth. Cursor and OpenClaw
  projections must derive from the same CM snapshot.
- Do not add a large UI before the file contract is stable. UI can display dry
  runs and warnings later; renderer, fingerprint, and tests come first.
- Do not claim custom Cursor prose is preserved until managed-block semantics
  exist.
- Do not treat OpenClaw file-write success as runtime success. Gateway readback
  must be a separate state.
- Do not make project-level `.cursor/mcp.json` duplicate a host-level MCP server
  with the same ID.

## 12. Non-Goals

- No silent writes to `~/.cursor`.
- No hidden automatic writes to `~/.openclaw/openclaw.json`; Apply remains
  explicit preview/confirm.
- No attempt to model Cursor and OpenClaw as one shared on-disk schema.
- No silent memory writes; summary promotion remains explicit.
