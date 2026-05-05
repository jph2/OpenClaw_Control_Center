# SPEC_CHANNEL_RUNTIME_BINDING_V1

**Status:** proposed / next implementation slice  
**Owner surface:** OpenClaw Control Center / Channel Manager  
**Created:** 2026-05-05  
**Trigger:** TTG000/TTG001 model/session confusion after stale session-cache fixes

**See also:** [`SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md`](./SPEC_CM_UNIFIED_WORKER_DUAL_TARGET_PROJECTION_V1.md) — unified worker semantics and dual-target projection; timeline event types should eventually include delegations and worker identity when C1e progresses.

---

## 1. Big Picture

This project is not a single chat UI. It is a layered operating environment:

- **OpenClaw** is the runtime agent and gateway system. It owns agents, models,
  auth profiles, skills, runtime sessions, gateway transport, and transcript
  storage under `~/.openclaw/`.
- **Cursor** is the development and operations surface. Operators use it over
  SSH to edit code, inspect ports, run services, watch logs, and manage local or
  remote development processes.
- **Studio Framework** is the governed project and knowledge workspace. It holds
  architecture, roadmap, artifacts, migration records, operational notes, and
  durable project context.
- **OpenClaw Control Center** is this repo's management layer for the OpenClaw
  environment. It provides UI/backend surfaces for channels, agents, sub-agents,
  skills, model assignment, exports, and OpenClaw Apply.
- **Channel Manager** is the Control Center module that maps communication
  channels, especially Telegram groups/topics, onto OpenClaw agents and runtime
  configuration.

In this bounded context, a Telegram Topic Group is abbreviated as **TTG**. For
example:

- `TTG000_General_Chat`
- `TTG001_Idea_Capture`

For each managed Telegram channel, Channel Manager synthesizes an OpenClaw agent
entry such as `tars-1003732566515`, assigns model and skill policy, and writes
that intended configuration to `~/.openclaw/openclaw.json` through Apply.

---

## 2. Problem Statement

The stale cache and config-sync bugs are mostly fixed:

- OpenClaw session model/provider caches can be cleared during Apply.
- Automatic `authProfileOverride*` runtime caches can be cleared during Apply.
- User-owned model overrides are preserved.
- `sessionId` vs `sessionFile` UUID mismatches are resolved more defensively.
- Channel Manager can rehydrate OpenClaw `sessions.json` before resolving the
  canonical transcript file.

The remaining problem is now primarily an **identity and context-selection
problem**.

The operator believes they are testing:

```text
TTG001 Idea Capture
```

but the runtime UI may actually be showing:

```text
tars-1003732566515 / main
```

or:

```text
tars-1003732566515 / explicit:<uuid>
```

Those are valid OpenClaw sessions, but they are not the Channel Manager
operational channel session. This creates false evidence:

- Different transcript history appears.
- Old model names appear.
- Historical Kimi/DeepSeek/Nemotron failure bubbles appear.
- Apply appears broken even when `channel_config.json`, `openclaw.json`, and the
  canonical Telegram session are aligned.

---

## 3. Core Distinction

Channel Manager must not implicitly equate these identities:

```text
CM Target
= what Channel Manager means
= TTG001_Idea_Capture -> tars-1003732566515

Gateway Session
= what OpenClaw runtime session is currently addressed
= agent:tars-1003732566515:telegram:group:-1003732566515

Transcript Source
= which JSONL file the UI is rendering
= ~/.openclaw/agents/tars-1003732566515/sessions/<uuid>.jsonl
```

They can be aligned, but they are not the same kind of thing. The UI and backend
must validate alignment explicitly.

---

## 4. Proposed Domain Entity

Introduce a Control Center owned domain abstraction:

```ts
type ChannelRuntimeBinding = {
  channelId: string;
  channelKind: 'telegram_group' | 'telegram_topic_group';
  displayName: string;

  agentId: string;

  canonicalSession: {
    kind: 'telegram_group' | 'telegram_topic_group';
    gatewaySessionId: string;
    telegramGroupId: string;
    telegramTopicId?: string;
    expectedTranscriptFile?: string;
  };

  modelPolicy: {
    primaryModel?: string;
    fallbackModels?: string[];
  };

  skillPolicy: {
    enabledSkills: string[];
  };
};
```

This is not "just an OpenClaw session". It is the Control Center's explicit
truth for:

```text
Channel -> Agent -> Intended Session -> Runtime Config -> Transcript
```

For Channel Manager managed Telegram channels, the canonical Telegram
group/topic session is the operative source of truth for runtime testing,
transcript display, and model verification.

OpenClaw may still have `main`, `explicit:<uuid>`, DM, and other sessions. Those
remain valid inside the OpenClaw bounded context. They are not equivalent to the
Channel Manager canonical session.

---

## 5. Session Identity Contract

Add or formalize a resolved-session shape that downstream UI can compare:

```ts
type ResolvedSession = {
  agentId: string;

  logicalSessionId: string;
  // e.g. agent:tars-1003732566515:telegram:group:-1003732566515

  sessionKind:
    | 'telegram_group'
    | 'telegram_topic'
    | 'main'
    | 'explicit'
    | 'dm';

  storageSessionFile?: string;
  // e.g. ~/.openclaw/agents/.../sessions/<uuid>.jsonl

  source:
    | 'channel_manager'
    | 'gateway'
    | 'webchat'
    | 'migration'
    | 'manual';

  canonicalForChannelId?: string;
};
```

Every Channel Manager chat surface can then derive:

```ts
const aligned =
  resolvedSession.canonicalForChannelId === selectedChannelId;
```

The `sessionFile` UUID remains a storage identifier. It must not become the
primary domain identity for a managed channel.

---

## 6. Desired UX

### 6.1 Channel Manager Default

Channel Manager should offer channel-oriented actions:

```text
[Test TTG001 canonical session]
[Open transcript]
[Inspect runtime config]
[Advanced: other sessions]
```

Avoid ambiguous agent-oriented actions:

```text
[Open Agent Chat]
```

### 6.2 Webchat Deep Links

Links from Channel Manager must be fully qualified and channel-aware.

Preferred route:

```text
/webchat/channel/:channelId
```

or equivalent query contract:

```text
/chat?cmChannel=TTG001&sessionKind=telegram_group&sessionKey=-1003732566515
```

Server-side resolution should map `channelId` to the canonical runtime binding.
The client should not guess by scanning generic agent sessions.

### 6.3 Webchat Header

When opened from Channel Manager context, the Webchat header should show:

```text
CM Target:       TTG001 Idea Capture / tars-1003732566515
Gateway Session: telegram group -1003732566515
Transcript:      canonical TTG001 JSONL
Status:          aligned
```

For mismatch:

```text
CM Target:       TTG001 Idea Capture / tars-1003732566515
Gateway Session: main
Transcript:      main JSONL
Status:          mismatch
```

### 6.4 Mismatch Warning

When Channel Manager target and current OpenClaw session differ, show a
high-visibility warning:

```text
You are not viewing the Channel Manager session for TTG001.

Channel Manager target:
TTG001 Idea Capture -> tars-1003732566515 -> telegram:group:-1003732566515

Currently open:
tars-1003732566515 -> main

[Switch to TTG001 canonical session] [Continue in main anyway]
```

The switch action should be prominent. However, this must not become a permanent
modal trap for operators who intentionally inspect `main`, `explicit:<uuid>`, or
DM sessions during debugging. The warning should support an advanced
acknowledgement path:

- continue anyway for this view;
- suppress for a short TTL in the current browser/session context;
- keep the mismatch badge visible even after acknowledgement;
- never silently mark the state as aligned.

### 6.5 Other Sessions

`main`, `explicit:<uuid>`, and DM sessions should be hidden by default in
Channel Manager context. They may remain available under an advanced/debug
section:

```text
Canonical channel session
- telegram:group:-1003732566515

Other sessions for this agent
- main
- explicit:<uuid>
- DM: Jan Haluszka
```

---

## 7. Channel Runtime Timeline

The Channel Manager should not only expose a session picker. For operators, a
Telegram channel behaves like one chronological conversation stream. OpenClaw
internally uses agents, sessions, transcript files, model resolution, auth
profiles, skills, Apply operations, and gateway state. These internal facts are
best understood as events on a **channel-centered runtime timeline**.

The primary question is not:

```text
Which session exists for this agent?
```

It is:

```text
What happened in this channel, when, and was it on the canonical Telegram lane?
```

### 7.1 Current Binding State

Maintain or derive a fast current-state snapshot:

```ts
type ChannelRuntimeState = {
  channelId: string;
  agentId: string;

  canonicalSessionId: string;
  canonicalTranscriptFile?: string;

  currentConfiguredModel?: string;
  currentConfiguredSkills: string[];

  lastAppliedAt?: string;
  lastKnownGatewaySession?: string;

  alignmentStatus:
    | 'aligned'
    | 'mismatch'
    | 'unknown';
};
```

This state powers the compact UI badges:

```text
TTG001 Idea Capture
Agent:              tars-1003732566515
Canonical session:  telegram:group:-1003732566515
Current model:      nvidia/nemotron-3-super-120b-a12b
Status:             aligned
```

### 7.2 Append-Only Channel Runtime Events

Add an append-only event log for channel runtime/debug events. Do not try to
merge every message from every OpenClaw session into one synthetic truth. The
canonical lane is the operational truth; other lanes are off-canonical evidence.

This is a new subsystem, not a small visual patch. The first implementation must
be deliberately narrow. Events written by Channel Manager alone will not explain
all runtime behavior. Until Gateway/OpenClaw emits explicit signals, older
timeline entries reconstructed from `openclaw.json`, `sessions.json`, audit
logs, and transcript metadata must be marked as **derived** rather than treated
as authoritative event history.

```ts
type ChannelRuntimeEvent = {
  id: string;
  timestamp: string;

  channelId: string;
  agentId: string;

  eventType:
    | 'channel_selected'
    | 'channel_config_changed'
    | 'apply_started'
    | 'apply_completed'
    | 'apply_failed'
    | 'agent_generated'
    | 'canonical_session_resolved'
    | 'webchat_opened'
    | 'gateway_message_sent'
    | 'gateway_response_received'
    | 'transcript_written'
    | 'model_resolved'
    | 'skill_invoked'
    | 'session_mismatch_detected'
    | 'session_switched'
    | 'session_rebound'
    | 'session_file_migrated'
    | 'manual_override_detected'
    | 'session_cache_cleaned'
    | 'delegation_requested'
    | 'worker_run_started'
    | 'worker_run_completed'
    | 'worker_run_failed'
    | 'worker_result_attached'
    | 'parent_synthesis_completed'
    | 'cursor_export_completed'
    | 'cursor_task_mapping_warning';

  logicalSessionId?: string;
  sessionKind?:
    | 'telegram_group'
    | 'telegram_topic'
    | 'main'
    | 'explicit'
    | 'dm';
  transcriptFile?: string;

  model?: string;
  skills?: string[];

  canonical: boolean;
  lane:
    | 'config_apply'
    | 'canonical_telegram'
    | 'webchat_main'
    | 'explicit'
    | 'dm'
    | 'worker'
    | 'ide_export'
    | 'migration'
    | 'debug';

  severity?: 'info' | 'warning' | 'error';
  derived?: boolean;
  summary: string;
};
```

### 7.3 Timeline UX

Start with a simple linear timeline, not a complex graph:

```text
[TTG001 Idea Capture] [Aligned] [Canonical: telegram:g-...]

Now
|
|- 10:21  Switched Webchat to canonical session
|
|- 10:20  Warning: Webchat opened main session
|          Expected: telegram:group:-1003732566515
|          Actual:   main
|
|- 10:14  Telegram response written
|          Model: nvidia/nemotron-3-super
|          Transcript: canonical JSONL
|
|- 10:13  Apply completed
|          openclaw.json updated
|          stale session model caches cleaned
|
`- 10:12  Channel config changed
           Model changed to nvidia/nemotron-3-super
```

Later, add optional lanes when debugging needs it:

```text
Time    Config/Apply   Canonical Telegram   Webchat/main   explicit
10:12   config edit
10:13   apply ok
10:14                  msg -> response
10:20                                      opened main !
10:21                  switched canonical
```

### 7.4 Canonical Lane Rule

Each managed channel has one dominant lane:

```text
Canonical Telegram Lane
```

Everything else is secondary evidence:

```text
main lane
explicit lane
DM lane
debug lane
migration lane
```

If events overlap in a way that suggests two active operational paths for one
channel, treat that as a warning. It usually means one of:

- wrong session opened;
- stale explicit link;
- parallel Webchat context;
- session migration or rebind;
- DM confused with channel agent;
- transcript loaded from the wrong file;
- agent id reused or remapped.

### 7.5 What User Thought vs What System Did

The timeline should preserve this diagnostic distinction:

```text
User thought:
Testing TTG001 Idea Capture

System actually did:
Opened agent tars-1003732566515 main session

Impact:
Different transcript, non-canonical history, stale model impression
```

This is the highest-value debugging view for the repeated TTG000/TTG001
confusion.

---

## 8. Implementation Plan

1. **Backend: enforce session identity invariant**
   - Add validator for canonical Telegram sessions:
     `sessionKey` -> `sessionId` -> `sessionFile` basename must not drift.
   - Report drift clearly and provide an explicit repair path, not silent
     mutation in normal read paths.
   - Preserve `sessionFile` as storage correlation/debug metadata, not domain
     identity.

2. **Backend: add Channel Runtime Binding resolver**
   - Input: CM channel id / Telegram group id.
   - Output: `ChannelRuntimeBinding` plus `ResolvedSession`.
   - Reuse existing channel config and `sessionIndex` hydration logic.

3. **Backend: add channel-aware Webchat/session endpoint**
   - Route option: `GET /api/channels/:channelId/runtime-binding`.
   - Include CM target, canonical gateway session id, transcript file, session
     kind, and alignment status.

4. **Frontend: replace ambiguous "Open Agent Chat" from CM**
   - Use `Open canonical Telegram session` or `Test TTGxxx canonical session`.
   - Deep-link by channel id, not by agent only.

5. **Frontend: add identity badges**
   - `CM Target`
   - `Gateway Session`
   - `Transcript Source`
   - `Status: aligned | mismatch | unknown`

6. **Frontend: add mismatch warning**
   - Detect `cmChannel` context.
   - Compare current resolved session to canonical channel binding.
   - Offer one-click switch to canonical session.
   - Provide advanced acknowledgement/TTL for intentional off-canonical
     inspection.

7. **Frontend: group other sessions under advanced/debug**
   - Keep OpenClaw flexibility available.
   - Make non-canonical sessions visually secondary in CM context.
   - Keep storage/session UUIDs copyable and expandable for debugging.

8. **Backend/UI: add narrow Channel Runtime Timeline MVP**
   - Start with a derived/read-only timeline from Apply audit, current
     `sessions.json`, transcript tail metadata, and CM-owned Webchat open/switch
     events.
   - Add append-only event writes for new CM-owned actions going forward.
   - Keep canonical lane separate from off-canonical lanes.
   - Do not attempt full event sourcing until Gateway/OpenClaw can emit reliable
     runtime events.

9. **Tests**
   - Validator detects `sessionKey` / `sessionId` / `sessionFile` basename drift.
   - Resolver maps TTG channel -> synth agent -> canonical session key.
   - `main` session for same agent returns mismatch in CM context.
   - `explicit:<uuid>` for same transcript returns storage match but not domain
     identity unless it is bound through canonical channel metadata.
   - Mismatch warning renders with switch action.
   - Timeline marks canonical vs off-canonical events correctly.
   - Timeline does not silently merge `main` / `explicit` / DM events into the
     canonical channel lane.
   - Existing `sessionId` vs `sessionFile` rebind tests remain green.

---

## 9. Acceptance Criteria

- From Channel Manager, opening TTG001 cannot silently land on `main`.
- If a non-canonical session is open while `cmChannel=TTG001`, the UI reports
  mismatch.
- The operator can switch from mismatch to canonical channel session in one
  click.
- UI copy distinguishes CM target, Gateway session, and Transcript source.
- OpenClaw's `main`, `explicit:<uuid>`, and DM sessions remain accessible for
  advanced inspection but are not presented as equivalent to canonical channel
  sessions.
- `sessionFile` UUID is treated as storage metadata, not primary domain
  identity.
- Each managed channel can show a basic runtime timeline of Apply/config,
  session resolution, Webchat open/switch, message/response, model resolution,
  transcript write, mismatch, migration, and cache-cleanup events.
- Timeline events distinguish canonical lane from off-canonical lanes.
- The UI can explain "what the operator thought they were testing" vs "what
  session the system actually opened" for mismatch cases.

---

## 10. Risks

- Existing OpenClaw Webchat route semantics may not support channel-first URLs.
  Mitigation: start inside Control Center links and API responses, then mirror
  route behavior when OpenClaw UI integration is ready. If the Webchat is not in
  the same codebase/control surface, treat `/webchat/channel/:channelId` as an
  integration project rather than a local route-only change.
- Some historical `explicit:<uuid>` links may still be useful. Mitigation: keep
  them under advanced/debug and mark them as non-canonical unless mapped.
- Transcript source may align while Gateway session does not. Mitigation: render
  both identities separately and treat partial alignment as warning, not success.
- Future OpenClaw session migrations may change `sessions.json` shape.
  Mitigation: keep resolver defensive and prefer logical session identity over
  raw file UUID.
- A visual graph can become attractive noise. Mitigation: ship a simple
  chronological Channel Runtime Timeline first; add lanes only when the event
  density justifies them.
- Reconstructing old events from existing files will be incomplete. Mitigation:
  mark reconstructed events as derived and write explicit events for new CM-owned
  actions going forward.
- Over-blocking non-canonical sessions can make developer/debug workflows worse.
  Mitigation: support advanced acknowledgement/TTL and keep off-canonical
  inspection possible while visibly marked.
- External citations in roadmap/spec text can become false authority if stale or
  unverified. Mitigation: avoid unverified issue links in normative specs; use
  local observations and file paths unless a link has been checked.

---

## 11. Review Conclusion

The direction is architecturally sound: stop using "Agent + arbitrary Session" as
the primary UI axis for Channel Manager workflows. Use:

```text
Channel Runtime Binding -> canonical session
```

For humans, `TTG001_Idea_Capture` is the operative truth. OpenClaw session
details are the runtime/storage resolution underneath it.

The companion visualization should be a **Channel Runtime Timeline**: a
channel-centered chronological view that shows when the canonical lane was used,
when an off-canonical lane was opened, and what runtime/config events explain
the current state.
