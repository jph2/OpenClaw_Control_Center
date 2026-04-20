Good news before I get to the test plan: I just re-checked with the correct field name. The apply pipeline wrote everything correctly to disk. The file on disk is *not* the problem. Which means we actually need the test to figure out **where the bit gets lost between `openclaw.json` and what you see on your screen**.

## 1. Opinion on voice-triggered TARS → MARVIN → CASE

**I agree. TARS as the unswitchable UI default is the right call.** Three reasons:

- The triad in `SOUL.md` is a **persona model**, not a routing model. It's closer to "change tone / change lens" than to "change which binary runs." A voice command ("Marvin, review this.") maps cleanly onto that: the main agent stays the same, but the persona the prompt asks for changes.
- Baking a triad picker into the channel row implies the three are interchangeable runtime agents, which they are not (ADR-008). Voice-triggered switching inside a session is more honest.
- It removes a persistent config knob that would drift from the soul file. `SOUL.md` stays the single source of truth for what the personas *are*; the channel binding stays simple (one main agent = TARS).

The only edge case worth noting: you lose the ability to say "this channel defaults to a MARVIN voice" without speaking. If that ever becomes a real need, it's a channel-level *preamble injection*, not a main-agent swap — cleanly separate concern. Which means `normalizeChannelsAssignedAgentTars` can stay exactly as it is. Good.

## 2. LM Studio/Gemma — parked

Agreed. Everything below uses `openai/gpt-4o` and your OpenAI provider.

## 3. What to test right now

First, here's what I **already verified on disk** so you don't chase ghosts:

| On disk, right now | Result |
|---|---|
| `channel_config.json` — all 15 channels | `model = "openai/gpt-4o"` ✓ |
| `openclaw.json` → 15 CM-owned `agents.list[]` | each `model.primary = "openai/gpt-4o"`, 2 skills ✓ |
| `openclaw.json` → 15 CM-owned `bindings[]` | each `agentId = "tars-<groupIdSlug>"`, `type: "route"`, peer matches ✓ |
| `openclaw.json` → `agents.defaults.model.primary` | still `openai-codex/gpt-5.4` (correct — operator-owned, CM must not touch it) |
| `openclaw-gateway.service` active-enter timestamp | 2026-04-20 06:27:00 — **same second** as the `openclaw.json` write. Gateway IS running with current config. |
| `bindings[].agentId` field name | confirmed to be the correct OpenClaw schema key (`AgentRouteBinding.agentId: string`) |

**So the bug — if any — is not in what CM wrote.** That leaves three candidate failure points, and the test is designed to tell them apart.

### The three surfaces, and what each actually consults

| Surface | Agent-resolution path | Expected model for group `-5168034995` |
|---|---|---|
| A. **Telegram** (message sent in TTG app) | Gateway Telegram ingest → `bindings[]` lookup by `peer.id` → synth agent `tars-5168034995` → `agents.list[0].model.primary` | **openai/gpt-4o** |
| B. **OpenClaw webchat** (browser UI at the gateway) | Webchat session bootstrap → hardcoded `agent:main` → `agents.defaults.model` | **openai-codex/gpt-5.4** (*expected wrong* — this is ADR-018) |
| C. **Channel Manager chat panel** (mirror of JSONL) | Reads the session JSONL from disk; does not resolve agent itself | whatever A or B *actually* used (it's a mirror) |

The key insight: **B is supposed to show the wrong model until the upstream gateway fix lands (ADR-018).** So "OpenClaw chat shows Codex" is not proof that the apply failed. Only **A** is authoritative for "did the config land."

### Mental model: where to “trust” things

- **Channel Manager + `channel_config.json`** = Source of truth for everything the CM owns (then **Apply** projects into `openclaw.json`).
- **`openclaw.json` on disk** = What the gateway *should* load after restart; spot-check after Apply.
- **OpenClaw Control UI / Webchat** = Useful for monitoring and ad-hoc chat; **not** the primary map of “my Telegram groups vs sessions,” and **not** authoritative for per-group model until ADR-018-style fixes land for column B.

### Probe test — one protocol, all three surfaces

Use a prompt that forces the model to name itself. GPT-4o will say "gpt-4" family; Codex will say "gpt-5" or "codex". Keep it tight:

```
Reply in ONE line only, no punctuation:
the exact model slug you believe yourself to be, in the form provider/model
```

For each channel you care about, do this:

**Step A — Telegram (authoritative).**

1. In the Telegram group, post the prompt. Include `@TarsIDEbot` (or whichever bot you use) if `requireMention` is on; it's off for all 15 groups right now, so you don't need to mention.
2. Observe the reply in Telegram.
3. **Pass:** reply is something like `openai/gpt-4o` or `openai/gpt-4`. **Fail:** reply is Codex/Kimi/Gemma.

**Step B — OpenClaw webchat (expected to be stale).**

1. Open the OpenClaw web UI for session `agent:main:telegram:group:<id>`.
2. Post the same prompt.
3. **Expected:** says `openai-codex/gpt-5.4` or similar. This is ADR-018, not a CM bug. Note the result and move on — do **not** spend time here until C1b.2c.

**Step C — CM chat panel (should mirror A).**

1. Open `http://100.89.176.89:5173/channels`, expand that channel, look at the live chat mirror.
2. You should see both your Telegram prompt and the reply appear, with the *same model identity* the Telegram surface showed.

### Test matrix — fill this in and the diagnosis is automatic

**Do not** spam all 15 groups first. Run **three** representatives; only if those pass, optionally spot-check the rest.

Pick from the three you debugged last time: `-5168034995` TTG001, `-1003752539559` TTG000, `-1003968061817` TTG060:

| Channel | A: Telegram reply model | B: Webchat reply model | C: CM mirror shows A? |
|---|---|---|---|
| TTG001 `-5168034995` | `openai/gpt-4o` ✓ | (ADR-018, unchanged) | yes ✓ |
| TTG000 `-1003752539559` | `openai/gpt-4o` ✓ | (ADR-018, unchanged) | yes, **live without refresh** ✓ |
| TTG060 `-1003968061817` | `openai/gpt-4o` ✓ | (ADR-018, unchanged) | yes ✓ |

### Full fleet acceptance — 2026-04-20 (operator sign-off)

- All **15** TTG rows in `channel_config.json` were exercised (Telegram +, where used, OC Web + CM). **A** and **C** behave as expected; **B** stays within **ADR-018** (webchat on `agent:main` / defaults), not a CM defect.
- **CM mirror:** real-time updates require **at most one** row on the **OpenClaw Chat** tab (browser ~6 SSE connections per host). Bulk **„Open Claw Chat all“** expands every row but only opens Chat on the **first** TTG.
- **TG510 / TG800 (`-1003635291803`, `-1003773208676`):** synth `sessions.json` had pinned `authProfileOverride: moonshot:default` → Kimi + literal **`NO_REPLY`**. Fixed by `scripts/cm-unpin-synth-session-auth.mjs` and gateway restart; config in `openclaw.json` was already `openai/gpt-4o`.

### Run 2026-04-20 — TTG000 outcome

- **A (Telegram):** authoritative path OK — reply came with `gpt-4o`.
- **B (Webchat):** stale as expected, matches ADR-018; not touched.
- **C (CM mirror):** after three stacked fixes (agent-id-agnostic session index, polling JSONL tailer, transport-prefix-aware chat-id normalization — see DISCOVERY §11) the CM panel now reflects A in real time without page reload. Emit/listener evidence in backend log: `emit newMessage chatId=-1003752539559 … listeners=1` followed by panel update within ~½ s.
- **Net conclusion:** "Apply to OpenClaw" pipeline is sound end-to-end for TTG000 and matches the wider **15-channel** acceptance (see „Full fleet acceptance“ above). Remaining column-B gap is upstream (ADR-018), not CM scope.

**Diagnosis from the matrix:**

- All-A `gpt-4o`, all-B `codex/gpt-5.4`, all-C yes → **system is working correctly.** The webchat column is cosmetic and closes with C1b.2c or the upstream fix.
- Any A says `codex` or `kimi` → **bindings aren't being honored**; open a gateway issue and grab the `~/.openclaw/logs/agent-*.log` line for that message.
- A correct, C blank / wrong → **CM mirror is stale** (usually a `sessions.json` resolve issue, not an apply issue).
- Any channel doesn't reply at all in Telegram → separate class of bug (ingest / bot-token / `getUpdates` conflict), not a model-apply issue; already covered by ADR-001.

### Two single-line sanity checks before you test

Only run these if a channel appears "dead" (replace `-5168034995` with the group id):

```bash
# Session metadata lives under ~/.openclaw/agents/<agentId>/sessions/sessions.json (not a single root sessions.json).
# Example: grep one group id across all agent session files:
grep -r "5168034995" /home/claw-agentbox/.openclaw/agents/*/sessions/sessions.json 2>/dev/null | head -20

# Does the binding actually match this peer in the live config?
/usr/bin/node -e 'const j=require("/home/claw-agentbox/.openclaw/openclaw.json"); console.log((j.bindings||[]).filter(b=>b.match?.peer?.id==="-5168034995"));'
```

## 4. Sub-agent / Orphan cleanup / defaults.model — roadmap order (2026-04-20)

These are `§5.1` / `030_ROADMAP.md` items. **Execution order** (aligned with the roadmap):

1. **Acceptance matrix** — **closed 2026-04-20:** triplet in the table above filled + full 15-channel sweep documented under „Full fleet acceptance“.
2. **C1b.2b** — **shipped 2026-04-20:** orphan prune on every Apply (preview shows removed CM `agents.list[]` / `bindings[]` when a channel disappears from `channel_config.json`).
3. **C1b.2e** — Telegram account policy UI (`groupPolicy` / `dmPolicy` / allowlists) — next implementation priority (silent ingest killer if mis-set).
4. **C1b.3** — sub-agent skill flavoring (CM toggles → observable OpenClaw behavior).
5. **C1b.2c** — opt-in CM control of `agents.defaults.model` **last**, after 2e + 3.

**C1b.2d** (stale `agent:main` session release) + CM live-mirror fixes are already shipped; send latency from CM is still **§8b.1** (CLI embedded fallback / gateway token — not CM UI code).

---

**Optional:** a `scripts/cm-probe-channel <groupId>` helper could print CM SoT / `openclaw.json` / last apply audit in a few lines — ask if you want it added to the repo.
