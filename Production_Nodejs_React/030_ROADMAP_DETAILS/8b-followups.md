> **Note:** This file was split from `030_ROADMAP.md` on 2026-04-26 for easier navigation and smaller context windows. The canonical entry point is [`030_ROADMAP.md`](../030_ROADMAP.md).

# §8b — Out-of-scope follow-ups

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

**Current status (2026-04-26):** §8b.5 now has a belastbarer, getesteter
Bridge-Unterbau with clean binding and mapping semantics. Landed slices:
A070_ide_cursor_summaries sidecar metadata, `bridgeStatus`, marker-based promote/read-back, UI
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
`current_ttg` headers; `current_ttg` is the operative routing truth. **Ticket C
`ARTIFACT_HEADER_BINDING_V1` landed 2026-04-25:** backend parses Markdown
frontmatter for `current_ttg` / `initial_ttg`, resolver priority includes
`artifact_header`, sidecar metadata stores header evidence, and the
`POST /api/ide-project-summaries` path is covered by integration tests. Open
Brain integration shifts the architecture to **artifact-centered memory**:
Cursor, Codex, OpenCode, Telegram, and Chat are producer surfaces; Studio
Framework artifacts are durable truth; OpenClaw memory is operational agent
continuity; Open Brain is the long-term semantic/MCP knowledge layer.
**Maturity (Reifegrad):** project-mapping + promote/read-back **~90%**; artifact
header + index + classifier + TTG review UI **~80–90%**; Open Brain export **~90%**;
sync **stub + HTTP + audit + UI ~65–72%**; **B (CM → Cursor)** apply + fingerprint
stale check **~78–85%** — see `QA_8B5_IDE_MEMORY_BRIDGE.md` / `SPEC_8B5` tables.
**Not done yet:** first-party **OB1/MCP** upsert, **producer adapters** (incl. **6.22** IDE chat capture pipeline — `SPEC_8B5` §15), §8b.7
topology readout, and residual TTG-review polish. **live OB1** priority stays
downstream of **§8b.6** corpus onboarding where you freeze data imports (see
`010_VISION.md` §4).

**Next-session gates:**

1. ✅ **Ticket C — `ARTIFACT_HEADER_BINDING_V1`**: parse Discovery/Research YAML
   headers, map `current_ttg` into the work-unit binding result, and surface
   `binding.method = "artifact_header"` in sidecar/UI.
2. ✅ **Ticket E — `ARTIFACT_INDEX_RESOLVER_V1`**: index Studio artifacts by
   stable id, path, type, tags, TTG binding, project binding, and content hash.
3. ✅ **Ticket F — `OPEN_BRAIN_EXPORT_CONTRACT_V1`**: define the Studio artifact
   export/upsert payload for OB1 `thoughts`, including metadata, source path,
   content hash, no-secrets validation, and dedup identity. Implemented as a
   read-only contract builder; no OB1 sync/write occurs yet.
4. ◐ **Ticket D — `AGENT_TTG_CLASSIFICATION_V1`**: backend classifier and
   artifact-index integration landed. If the human leaves no TTG, the index can
   classify against canonical `TTG*.md` definitions and record
   `inferred` / `needs_review` / `ambiguous` rather than pretending the result
   is confirmed. **Backend confirm path landed 2026-04-26:** `artifact-binding/confirm`
   writes `current_ttg` + confirmed binding into the Markdown header and returns
   a fresh index record. **CM UI slice landed 2026-04-26:** IDE tab
   **Studio artifacts · TTG review** loads the artifact index, lists non-confirmed
   records (sorted with relevance to the active TTG row), and posts confirm with
   optional candidate picks. **Playwright:** `e2e/tests/e2e-golden-path-8b5.spec.js`
   includes **confirms TTG for a Studio artifact via the TTG review tab** (stub
   under `050_Artifacts/…`, then assert index `binding.status === 'confirmed'`).
   **Remaining:** further TTG-review polish if the list grows noisy (filters are optional in UI). **E2E:** export preview + stub sync in `e2e/tests/e2e-golden-path-8b5.spec.js` (2026-04-26).
5. ◐ **Ticket G — `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`**: **slice 2026-04-26**
   `POST /api/ide-project-summaries/open-brain-sync` with `dryRun` (default true)
   and stub provider (`OPEN_BRAIN_SYNC_PROVIDER=stub`, default): writes
   `open_brain_sync_audit.json` next to `channel_config.json`, merges
   `openBrain.syncStatus` / `thoughtId` into `GET …/artifact-index`. **HTTP adapter**
   (`OPEN_BRAIN_SYNC_PROVIDER=http` + URL) posts the export payload; **Not done:**
   first-party MCP client, dedicated CM sync status column polish.
6. **Producer adapters**: Codex, Cursor, OpenCode, Telegram/Chat exports create
   or update artifacts; they do not define memory truth. **Automated Cursor/IDE chat capture** now has a partial CM implementation (**backlog 6.22**):
   backend capture endpoints + Summaries UI + CLI-first Linux path workflow. The
   durable contract remains `A070_ide_cursor_summaries/capture/` +
   `manifest.jsonl`; details live in
   [`ide-chat-capture-a070.md`](./ide-chat-capture-a070.md),
   `SPEC_8B5_IDE_MEMORY_BRIDGE.md` **§15**, and
   `Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/README_A070_IDE_Summaries.md`.
7. ~~Extend `E2E_GOLDEN_PATH_8B5` with Open Brain **export preview** and stub **sync**~~ **Done 2026-04-26.** HTTP/live OB1 E2E when a stable test double exists.
8. **§8b.6 — Studio corpus onboarding:** ingest external-repo artifacts into
   Studio Framework; mandatory header/structure normalization before treating
   bulk imports as export/sync-ready (vision §4; roadmap §8b.6).

**Recommended order:** Treat **live OB1/MCP upsert** as **downstream** of a
**Studio corpus onboarding** pass (see **§8b.6**): ingest material from other
repos into Studio Framework, then normalize headers/structure; only then prioritize
Ticket G live sync. Until the corpus is ready, **contract + stub audit** in CM
are sufficient preparation. Ticket D polish (preview/filters) and producer
adapters can proceed in parallel where they do not block onboarding.

**Goal:** Turn the third Channel Manager workspace tab into the operational
bridge between producer work (Cursor/Codex/OpenCode/Chat/Telegram), TTG
context, Studio artifacts, Studio A070_ide_cursor_summaries, OpenClaw memory, and Open
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
   - path to a file under A070_ide_cursor_summaries
   - source/provenance metadata (operator, timestamp, model/agent where known)
   - promotion target in OpenClaw memory
2. Harden the existing **TARS in IDE · IDE project summary** tab:
   - create/edit summary drafts in A070_ide_cursor_summaries
   - save under Studio A070_ide_cursor_summaries
   - preview existing summaries
   - promote selected summaries to OpenClaw memory
   - read back OpenClaw memory in the same TTG row
3. Map producer context into the same artifact contract:
   `.cursor/agents`, `.cursor/rules`, `.cursor/mcp.json`, exported IDE bundle,
   Codex session notes, OpenCode context, Telegram/Chat exports, and future
   producers must create or update the same artifact metadata instead of
   becoming parallel context systems.
4. Add a per-TTG sync/status signal for this tab:
   - no summary in A070_ide_cursor_summaries yet
   - draft saved but not promoted
   - promoted to OpenClaw memory
   - read-back confirmed / stale / unknown
5. Keep writes explicit. Saving a summary in A070_ide_cursor_summaries and promoting into OpenClaw
   memory are separate operator actions; no silent mutation of identity,
   auth, or memory files.

**Acceptance:**

- From a TTG row, the operator can capture current producer work into an A070_ide_cursor_summaries
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

**Dependencies:** Existing C2 summary/memory promote endpoints, A070_ide_cursor_summaries write
support, IDE bundle/export bridge, and the current §8b.4 chat beta.

### 8b.6 · General_Dev -> Studio corpus migration & header normalization

**Status (freeze `2026-04-27-1fe240e`, 2026-04-29):** **Staging and import pass closed** at batch level. Operator truth + review pointers: Studio [`BATCH.md`](../../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/BATCH.md). Channel Manager `030_ROADMAP.md` §3 lists this closure; §4 tracks ongoing **programme** work (review queues, §8b.6C, future freezes).

**Detailed spec:** [`SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md`](./SPEC_GENERAL_DEV_STUDIO_MIGRATION_V1.md)

**Intent:** `General_Dev` contains the last ~1.5 years of work: domain folders,
general folders, ARYS-classified artifacts, tag/index systems, RAG/search tools,
Obsidian/Open Brain experiments, and operational material. Before Open Brain
live sync is worth prioritizing, this corpus must be migrated into
`Studio_Framework/` through a repeatable quality/security gate.

**Required migration shape:**

1. **Freeze source** — commit and push `General_Dev`, then record the source
   commit in each migration batch.
2. **Inventory first** — generate a read-only overview of domains, general
   folders, file counts, headers, indexes, tags, search/RAG tooling, Obsidian and
   Open Brain signals, and risk areas.
3. **Stage/quarantine** — copy candidates into
   `Studio_Framework/095_Migration_Staging/General_Dev/<batch-id>/` with
   `manifest.jsonl`, `inventory.md`, header/security/target-map reports, and no
   export eligibility.
4. **Normalize** — update ARYS/Studio headers, source provenance, TTG/project
   mapping, tags, local paths, and links in staging copies only.
5. **Admit deliberately** — move only accepted files into final Studio targets
   such as `050_Artifacts/…` or relevant standards/tooling areas.
6. **Reindex after import** — regenerate search/RAG/tag indexes from normalized
   Studio files; do not treat legacy Everything/RAG DB state as canonical.

**Hard constraints:**

- No one-shot bulk copy from `General_Dev` into final Studio folders.
- No mutation of `General_Dev` during migration transforms.
- No live OB1 upsert from raw or staged material.
- Admin/finance/ops and MCP/config material require explicit security review.

**Studio playbook (normative):** `Studio_Framework/050_Artifacts/README_ARTIFACT_INGESTION_AND_ONBOARDING.md`

**Dependencies:** Studio-side playbooks or automation for inventory, staging,
header normalization, duplicate detection, and security checks. CM continues to
prepare OB1/export/audit contracts, but final import governance lives in the
Studio corpus.

### 8b.6B · General_Dev lessons & reimplementation candidates

**Status (batch `2026-04-27-1fe240e`):** triage **closed 2026-04-28** — lesson records archived under Studio `095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/_archive/`; outcomes in [`STUDIO_BRIDGE.md`](../../../Studio_Framework/095_Migration_Staging/General_Dev/2026-04-27-1fe240e/lessons/STUDIO_BRIDGE.md). See `030_ROADMAP.md` §3.

**Detailed spec:** [`SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md`](./SPEC_GENERAL_DEV_LESSONS_REIMPLEMENTATION_CANDIDATES_V1.md)

**Intent:** The `General_Dev` migration must not only ask "which files should be
imported?" It must also ask "what did the old system already solve that the new
Studio/CM stack should learn from?" Some legacy material should become final
artifacts; other material should become clean reimplementation candidates.

**Candidate themes:**

1. Search and discovery: Everything workflow, `framework_rag.py`, context and
   horizon indexes.
2. Tags and semantic vocabulary: `TAG_SEMANTIC_INDEX.md`,
   `master_tag_system.yml`, tag validators/proposers.
3. Header and artifact governance: ARYS tools, header normalization,
   structural validators.
4. Domain routing and TTG mapping: `Domain_*`, router identity docs, domain
   guardrails.
5. Obsidian, Open Brain, MCP/tool config, and operator UX experiments.

**Required output per candidate:** source path/commit, problem solved, what is
still valuable, what should not be copied, target surface, risk, priority, and
decision (`reimplement`, `document-only`, `archive`, `defer`, `reject`).

**Hard constraint:** raw legacy tools are not promoted to production by copying
them. Valuable behavior is re-specified and rebuilt in the current Studio/CM
architecture after review.

### 8b.6E · Legacy rules / guardrails reclassification

**Status (2026-04-30):** active cleanup spec created after the full
`060_Domain_Guardrails/` tree was moved from active Studio standards into
`RULES_to_REVIEW`. This is now the roadmap enforcement track for the
boot-level `~/.openclaw/workspace/GOVERNANCE.md` intelligence-placement policy.
It corrects the first import wave: legacy General_Dev rules, guardrails, router
files, harness ideas, and domain knowledge must be reviewed by **function and
owner surface**, not restored by old path.

**Detailed spec:** [`SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md`](./SPEC_8B6E_LEGACY_RULES_GUARDRAILS_RECLASSIFICATION_V1.md)

**Intent:** Decide where each useful piece of legacy intelligence belongs in
the new stack:

1. **Studio Framework** keeps durable artifacts, TTG work products, domain
   best practices, anti-patterns, examples, patterns, and referenceable
   knowledge.
2. **OpenClaw workspace** owns behavioral governance: soul, AGENTS,
   GOVERNANCE, memory policy, harness rules, and cross-tool guardrails.
3. **Channel Manager** owns orchestration: effective config, bindings,
   Apply/export, topology, and operator-facing specs.
4. **Cursor / IDE** receives projections and pointers only.
5. Scripts, generated indexes, large vendor dumps, and local logs are routed to
   tooling, reference/archive, or discard decisions.

**Next useful action:** build disposition tables for `RULES_to_REVIEW`, starting
with `060_Domain_Guardrails`, then remove any active Studio ghost placeholders
once roadmap/docs no longer need them as transition anchors.

### 8b.7 · TTG agent topology visualization (after §8b.5)

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

### 8b.8 · Channel Manager Chat Media Attachments (active hardening)

**Status:** pulled forward from backlog on 2026-04-27; V1 image send/mirror/render
path has landed and is now in a hardening loop.

**Spec:** [`SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md`](./SPEC_CHANNEL_MANAGER_CHAT_MEDIA_V1.md)

**Goal:** Let the Channel Manager OpenClaw Chat handle structured media
attachments as one logical chat message, without introducing a Workbench
dependency. Start with one image + optional text; plan audio/video/files as
later explicit phases.

**Why:** Operators will need to paste screenshots or visual context into a TTG
conversation. This belongs to the Channel Manager chat surface, not the
Workbench. It should be built after the Channel Manager / Workbench boundary is
clean enough that media upload, preview, and rendering do not become another
cross-feature leak.

**Product rule:** Chat messages should be represented as structured content
parts, not only as a plain text string. V1 supports:

- `text`
- `image`

Existing text-only messages must normalize to:

```ts
parts: [{ type: 'text', text: messageText }]
```

**Phasing:**

1. **V1 image:** one image per user message, optional text/caption, paste/attach,
   preview, inline render, enlarge preview, mirror normalization.
2. **V1b audio:** one audio clip/file per message, duration/size limits,
   player UI, no autoplay.
3. **V2 video/files:** video and general files only after gateway support,
   storage policy, MIME allowlist, and retention rules are explicit.

**Out of scope for V1:**

- Multi-image messages.
- General file/PDF/video/audio upload in the first implementation slice.
- Workbench media browser or Workbench file-tree integration.
- A generalized asset library.
- Text-marker hacks where the UI guesses an image from raw transcript text.

**Architecture rules:**

- This is a **Channel Manager chat** feature.
- No imports from Workbench pages or Workbench stores.
- Media normalization belongs in the chat message model / backend adapter
  layer; React bubbles render structured `parts[]`.
- Backend must validate MIME type and size before accepting or forwarding
  media.
- Allowed V1 MIME types: `image/png`, `image/jpeg`, `image/webp`; `image/gif`
  only if explicitly enabled. No SVG in V1. Audio/video require later explicit
  MIME allowlists and size/duration gates.

**Likely implementation order:**

1. Introduce message-part normalization for existing text messages.
2. Add composer attachment state and image preview.
3. Add image bubble renderer.
4. Add backend media send endpoint or gateway-native media forwarding once the
   gateway path is confirmed.
5. Extend mirror/read normalization for media events.
6. Add browser QA: paste image + optional text, send, render, mirror.
7. Only after V1 is green: define audio and video follow-up gates.

**Acceptance:**

- User can paste one image into the Channel Manager chat composer.
- User can send image-only or image + text as one logical message.
- Existing text messages behave unchanged.
- Chat history displays image and text together.
- Mirror/read path renders image messages from structured data.
- No Workbench dependency is introduced.
- Build/test/E2E remain green.

**Current hardening loop (2026-04-27 review):**

1. Fix optimistic preview rendering for local `data:` URLs.
2. Validate image MIME/size before reading browser files into memory.
3. Harden mirrored media file serving against symlinks/path escape and add
   `nosniff`.
4. Render only `image/*` media from `MediaPath(s)` as image parts.
5. Keep gateway-only media send semantics; CLI fallback must fail visibly.

### 8b.9 · Workbench / Channel Manager Boundary Hardening (later)

**Status:** follow-up, not blocking current §8b.5 work.

**Cleanup baseline:** [`SESSION_CLEANUP_2026-04-25.md`](./SESSION_CLEANUP_2026-04-25.md)

**Workbench product boundary:** [`SPEC_WORKBENCH_POSITIONING.md`](./SPEC_WORKBENCH_POSITIONING.md)

**Closed already:**

- Workbench state moved out of the Workbench page.
- Channel Manager no longer imports from the Workbench page.
- Channel Manager and Workbench pages moved under feature folders.
- Feature public entrypoints exist.
- Global theme CSS moved to `frontend/src/shared/styles/theme.css`.

**Remaining hardening:**

1. Move feature-owned Channel Manager components/hooks/utils under
   `frontend/src/features/channel-manager/`.
2. Move feature-owned Workbench components/hooks/utils under
   `frontend/src/features/workbench/` as they appear.
3. Move generic frontend utilities into `frontend/src/shared/`.
4. Later, move backend routes/services into feature folders:
   `backend/src/features/channel-manager/` and `backend/src/features/workbench/`.
5. Add import-boundary checks or a lightweight review checklist.

**Style rule:** Keep theme tokens and global styling shared. Do not fork CSS per
feature. Future dark/light mode and style alignment should build on the shared
theme layer, not on duplicate Channel Manager / Workbench stylesheets.

**Product rule:** The Workbench is a lean artifact/worktree editor with
diff-first workflows. It is not a full IDE replacement and must not own TTG,
memory promotion, OpenClaw Apply, Open Brain sync, or Channel Manager chat
media behavior.

**Acceptance:**

- No feature page imports implementation details from another feature page.
- Shared styles remain a single source of truth.
- Feature-owned UI/code sits in the owning feature folder.
- Shared utilities are intentionally shared, not a dumping ground.
- Build and E2E remain green after each slice.

### 8b.10 · Slash-Command Parity And Send-Path Correctness (later)

**Status:** proposed, not next.
**Priority:** medium.
**Depends on:** §8b.4 gateway-native chat path stabilization.

**Problem:** Channel Manager Chat does not yet have clean parity with native
OpenClaw Chat for slash inputs. Normal text messages are sent through the
OpenClaw path and mirrored, but slash inputs such as `/new` can appear locally
in Channel Manager without arriving in the native OpenClaw chat or executing as
real commands. That creates a dangerous pseudo-send state: the UI can suggest
that something was sent even when the true command/send path did not happen.

**Goal:** Slash inputs must either dispatch through an explicit command path or
fail visibly. They must not create normal optimistic user bubbles unless a real
dispatch is confirmed.

**V1 scope:**

1. Detect leading `/` inputs in the composer as command candidates.
2. Separate normal text sends from command requests, either by request type or
   endpoint.
3. Suppress normal optimistic user bubbles for unconfirmed commands.
4. Show pending/success/failure command states explicitly.
5. Check core cases: `/new`, `/reset`, `/status`, `/commands`, `/reasoning`,
   `/model`, `/approve`, `/focus`, `/unfocus`, `/session`.

**Out of scope:**

- Custom slash commands.
- Full command palette / autocomplete v2.
- Command ACL management UI.

**Acceptance:**

- `/new` no longer appears as a local-only sent message.
- Unsupported or undispatchable commands fail visibly.
- `/status` and `/commands` produce either native results or clear fallback
  errors.
- Successful command effects are reflected in session/mirror behavior.
- E2E covers at least one successful command and one failed command.

### 8b.6C · Studio ARYS header governance (high priority)

Companion to `§8b.6` migration: implement **Studio-native** header tooling (lesson `gendev-lesson-header-normalization`) without importing legacy General_Dev Python mutators wholesale.

**Normative index:** [`SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md`](./SPEC_8B6C_STUDIO_ARYS_HEADER_GOVERNANCE_V1.md) · **Roadmap row:** [`030_ROADMAP.md`](../030_ROADMAP.md) §4 Active / Next Blocks.

**V1 (landed in Studio_Framework repo):** read-only scan `tools/arys_header_governance/scan-markdown-headers.mjs` over `050_Artifacts/` by default.

### 8b.6D · Domain → Studio artifact & TTG mapping (critical priority)

Drives **orderly General_Dev import**: each `Domain_*` / agreed `General_*` root gets a **mapping row** (or explicit `deferred`). Narrative seed: **`ROUTER_IDENTITY_DOMAIN.md`**; machine truth: versioned YAML in the migration batch.

**Normative index:** [`SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md`](./SPEC_8B6D_DOMAIN_TTG_ARTIFACT_MAPPING_V1.md) · **Roadmap:** [`030_ROADMAP.md`](../030_ROADMAP.md) §4.

---
