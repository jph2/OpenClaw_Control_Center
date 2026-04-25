# Cleanup Session — 2026-04-24

**Scope:** Channel Manager (Production_Nodejs_React) pre-flight cleanup before Roadmap §8b.4 gateway-native CM transport.

**Status:** Cleanup loop completed through Step 4 on 2026-04-24. §8b.4 now has a transport boundary, gated gateway-native send path, fast CM chat UX, model/live-state visibility, and optimistic-bubble reconciliation.

**Purpose:** Preserve today's review context in a small, actionable spec so the next implementation step does not depend on chat history.

---

## 1. Reviewed context

Normative docs:

- `020_ARCHITECTURE.md`
- `030_ROADMAP.md`
- `040_DECISIONS.md`
- `SESSION_HANDOVER_2026-04-20.md`

Backend focus:

- `backend/services/chat/sessionSender.js`
- `backend/services/chat/sessionIndex.js`
- `backend/services/chat/sessionTail.js`
- `backend/services/chat/sessionIngest.js`
- `backend/services/chat/messageModel.js`
- `backend/services/chat/openclawGatewayEnv.js`
- `backend/routes/chat.js`
- `backend/package.json`

Frontend focus:

- `frontend/src/hooks/useChatSession.js`
- file-size / ownership scan across `frontend/src`

Initial verification:

- `frontend`: `npm run build` succeeded, with Node version warning (`20.18.2`; Vite wants `20.19+` or `22.12+`) and a large bundle warning.
- `backend`: `npm test` is not currently a clean preflight; it runs manual scripts with Telegram/API side effects, starts server/watchers, and does not terminate cleanly.

Post-cleanup verification:

- `backend`: `npm test` now runs `NODE_ENV=test node --test test/*.test.js`, executes 68 tests, passes, and exits cleanly.
- `frontend`: `npm run build` still succeeds after the backend transport split; same Node/Vite version warning and large-bundle warning remain.
- `git diff --check -- . ':(exclude)Production_Nodejs_React/backend/.env'` is clean.
- Local native preflight: OpenClaw `2026.4.22` runs with `/usr/bin/node`
  (`v24.14.0`); the shell `node` in Cursor is still `v20.18.2`, so direct
  `node openclaw.mjs` fails. CM's CLI fallback explicitly resolves the Node 24
  binary. The native gateway loader dynamically finds the current
  `dist/call-*.js` module (`callGateway` + `randomIdempotencyKey`) and gateway
  env resolution finds a token plus `http://127.0.0.1:18789` without printing
  secrets.

Current worktree note:

- Only expected local modification before this cleanup doc: `Production_Nodejs_React/backend/.env`.

---

## 2. Review verdict

The architecture is fundamentally sound:

- OpenClaw Gateway remains authoritative for runtime sessions and Telegram ingest.
- Channel Manager is a config hub and mirror, not a second chat system.
- Writes into OpenClaw-owned files are explicit, previewed, backed up, and audited.
- The chat stack has already been split into focused modules (`sessionIndex`, `sessionTail`, `sessionIngest`, `messageModel`, `sessionSender`).

The system is not blocked by "spaghetti architecture", but it has a few sharp edges that should be cleaned before implementing §8b.4. This should be a small hygiene loop, not a broad refactor.

---

## 3. Findings

### F1 — `sessionSender.js` shell command construction is fragile

`sessionSender.js` builds a shell command string with `exec`, `nohup`, redirection, and user-provided message text. The current escaping handles quotes and newlines only.

Risk:

- Shell escaping remains fragile for arbitrary message text.
- More logic added to this path increases risk.
- It is the wrong foundation for the gateway-native transport.

Cleanup posture:

- Do not expand this shell path for §8b.4.
- Put the new gateway-native implementation behind a transport boundary.
- Keep CLI as fallback, but avoid touching it beyond necessary fallback wiring.
- Optional hardening later: convert fallback from `exec` string to `spawn` / `execFile` with an argument array and detached stdio.

### F2 — `030_ROADMAP.md` contradicts itself on `tools.gatewayToken`

The roadmap correctly states that `tools.gatewayToken` is invalid for `openclaw.json`, but a later status paragraph still repeats "add `tools.gatewayToken`" as an optional operator mitigation.

Risk:

- Future implementers may reintroduce the rejected config key.
- This can cause wasted debugging or schema failures.

Cleanup:

- Rewrite §8b.1 so the final status is consistent:
  - valid path: `OPENCLAW_GATEWAY_URL` + `OPENCLAW_GATEWAY_TOKEN` env injection
  - invalid path: `tools.gatewayToken` in `openclaw.json`
  - residual latency: CLI process startup, gateway-side bootstrap, JSONL tail polling

### F3 — ADR-012 conflicts with the optimistic user bubble

ADR-012 says "No optimistic append", but `useChatSession.js` now inserts a temporary optimistic user bubble and removes it when the mirrored JSONL line arrives.

Risk:

- The ADR overstates the prohibition and now disagrees with shipped UI behavior.
- Future cleanup may accidentally remove a useful latency UX fix.

Cleanup:

- Amend or supersede ADR-012:
  - still no local authoritative message store
  - still no local durable queue
  - temporary UI-only optimistic placeholders are allowed when marked, deduped, and removed on mirror confirmation

### F4 — Backend test script is too broad for regression preflight

`backend/package.json` uses `node --test`, which discovers and runs root-level manual scripts (`test-send.js`, `test-admins.js`, `test-case.js`, `test-zod*.js`) in addition to real tests under `backend/test/`.

Observed:

- Telegram API calls executed.
- Server/watchers started.
- Test process did not terminate cleanly.

Cleanup:

- Change default `npm test` to run only `test/**/*.test.js`.
- Optionally add `npm run test:manual` or leave root-level scripts as explicit operator tools.
- Ensure the cleaned backend test command exits.

### F5 — File-size hotspots exist, but are not immediate blockers

Largest files observed:

- `frontend/src/pages/ChannelManager.jsx` — 1568 lines
- `backend/services/openclawApply.js` — 1102 lines
- `frontend/src/pages/Workbench.jsx` — 1090 lines
- `backend/routes/channels.js` — 1000 lines
- several frontend panels/components around 600-850 lines

Risk:

- New feature logic can easily land in large files and increase coupling.

Cleanup posture:

- Do not start a broad split now.
- For §8b.4, add new gateway transport code in new focused modules.
- Only touch large files at their narrow integration points.

---

## 4. Proposed cleanup loop

### Step 1 — Documentation correction

Status: completed 2026-04-24.

Files:

- `030_ROADMAP.md`
- `040_DECISIONS.md`

Tasks:

- Fix §8b.1 so `tools.gatewayToken` is only mentioned as rejected / invalid.
- Add a short ADR note or superseding ADR for UI-only optimistic placeholders.
- Add or prepare an ADR entry for gateway-native CM transport if the implementation approach is chosen in this loop.

Acceptance:

- No normative doc suggests adding `tools.gatewayToken` to `openclaw.json`.
- ADR-012 no longer contradicts the shipped optimistic bubble.

### Step 2 — Test preflight hygiene

Status: completed 2026-04-24.

Files:

- `backend/package.json`
- optional: root-level manual scripts only if renaming or documenting them is necessary

Tasks:

- Restrict `npm test` to the real test directory.
- Keep manual Telegram/debug scripts out of automatic discovery.
- Run the cleaned backend tests and confirm the process exits.

Acceptance:

- `cd backend && npm test` runs only deterministic tests.
- No live Telegram send/getMe/admin call is triggered by default.
- Test process exits without hanging watchers.

### Step 3 — Transport boundary for §8b.4

Status: completed 2026-04-24.

Files likely involved:

- `backend/services/chat/sessionSender.js`
- `backend/services/chat/openclawGatewayTransport.js`
- `backend/services/chat/openclawCliTransport.js`
- `backend/services/chat/chatSendUtils.js`
- `backend/test/chatTransport.test.js`

Tasks:

- Introduced a small transport boundary around send:
  - gateway-native send path
  - CLI fallback path
  - feature flag / env switch
- Reused `openclawGatewayEnv.js` for explicit `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_URL` resolution.
- Keep JSONL tail as read-side fallback until gateway event subscription is proven.

Acceptance:

- New gateway-native work does not add more shell command construction.
- CLI fallback remains available for unsupported gateway builds.
- Transport selection is observable in API response/logs.

Implementation notes:

- Default remains CLI: unset/unknown `OPENCLAW_CM_SEND_TRANSPORT` resolves to `cli`.
- `OPENCLAW_CM_SEND_TRANSPORT=auto` attempts gateway-native only when auth/module loading is available; it falls back to CLI only before any native RPC is attempted.
- `OPENCLAW_CM_SEND_TRANSPORT=gateway` forces native send and surfaces gateway/native errors to the API caller.
- Native send calls OpenClaw gateway `chat.send` with canonical `sessionKey`
  when CM has one; otherwise `auto` falls back to CLI. This matches the current
  OpenClaw Control UI / WebChat protocol path more closely than the earlier
  generic `agent` RPC.

### Step 4 — Optional CLI fallback hardening

Status: completed 2026-04-24 as part of the transport split.

Tasks:

- Replaced `exec` string fallback with `spawn` args.
- Preserved existing `/tmp/openclaw-cm-send-*.log` behavior and startup-error sniff.
- Kept fallback transport names (`session-native-cli`, `legacy-telegram-deliver`) understandable.

Acceptance:

- User text is passed as an argument, not shell-interpolated.
- Existing fallback transport names remain understandable.

---

## 5. Non-goals

- No broad component split of `ChannelManager.jsx`.
- No rewrite of `openclawApply.js`.
- No change to the explicit Apply/backup/audit contract.
- No direct mutation of `~/.openclaw/openclaw.json` outside Apply.
- No attempt to fix OpenClaw webchat binding parity inside Channel Manager.
- No removal of legacy `/api/telegram/*` or `/api/openclaw/*` aliases in this loop unless specifically scoped.

---

## 6. Completion note

The cleanup loop and the practical §8b.4 chat UX slice are now done:

- CM chat perceived latency is in the same practical band as OpenClaw Control UI on the tested warm-gateway path.
- Native beta smoke passed: TTG000 send returned `session-native-gateway-chat`
  with ~79 ms API/gateway ACK and assistant output in the canonical JSONL.
- User optimistic bubbles are reconciled against timestamp-prefixed transcript mirror lines.
- The chat header exposes configured model vs live transcript model.
- Per-channel model changes sync to `agents.list[].model.primary`.
- `Apply to OpenClaw` now has an explicit pending/dirty indicator with baseline reset behavior.

Remaining follow-up is no longer blocking this cleanup:

- Keep CLI fallback as production-safe default until OpenClaw exposes a stable versioned gateway SDK/import surface.
- Re-run `OPENCLAW_CM_SEND_TRANSPORT=auto` / `gateway` smoke after the next OpenClaw upgrade before flipping defaults.
- Optional later improvement: consume gateway events directly instead of relying on JSONL/SSE transcript mirroring.
