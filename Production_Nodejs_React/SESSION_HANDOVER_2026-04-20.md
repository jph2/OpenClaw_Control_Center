# Session Handover — 2026-04-20 (CEST)

**Scope:** Channel Manager (Production_Nodejs_React) — OpenClaw Chat latency, UI polish, policy-panel refactor.  
**Status:** Pause. All described changes live on disk, not yet committed when this doc was written.  
**Audience:** next agent / operator picking up the thread.

---

## 1. Where we are (one screen)

| Area                                              | State on 2026-04-20 18:50 CEST                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Channel Manager **overview row** (TARS visibility) | **Done.** TARS agent tile rendered in collapsed state, status badge + TARS name on one row.    |
| **TTG numeric sort** (`TTG000 < TTG001 < TTG010`)  | **Done.** `frontend/src/utils/sortTtgChannels.js`; applied to list, `handleSelectAll`, bulk apply. |
| **Optimistic user bubble** in OpenClaw Chat       | **Done.** With prefix-stripping matcher so the mirrored `[Mon 2026-04-20 …] text` removes it. |
| **Session-tail poll** 400 ms → 200 ms             | **Done.** `backend/services/chat/sessionTail.js`.                                               |
| **Chat timestamps** with seconds                  | **Done.** `frontend/src/components/ChatPanel.jsx` — `hour:minute:second`, 24 h.                 |
| **CLI warm-gateway path**                         | **Already on warm path** as of 16:54 CEST via `backend/services/chat/openclawGatewayEnv.js`. Env `OPENCLAW_GATEWAY_URL` + `OPENCLAW_GATEWAY_TOKEN` are injected into the CLI child. Recent send log (`/tmp/openclaw-cm-send-ad454416-*.log`, 17:56 CEST) no longer shows `Gateway agent failed; falling back to embedded`. |
| **Policy panels** extracted to utils              | **Done.** `utils/defaultTelegramAccountPolicy.js` and `utils/defaultOpenclawAgentsDefaultsPolicy.js`; the corresponding `*Panel.jsx` files now import from there (fixes a Vite/ESM resolution bug with mixed default+named exports on `.jsx`). |
| **Roadmap §8b.1** (CLI gateway auth)              | **Corrected.** The earlier plan to add `tools.gatewayToken` to `openclaw.json` is wrong — the schema validator rejects it (`Unrecognized key "gatewayToken"`). Correct wiring is env-var based and already deployed. |
| **Gateway service**                               | Restarted during investigation; runs as user unit `openclaw-gateway.service` (PID 2440046, uptime from 18:48 CEST 2026-04-20 onward). |

**Not started / out of scope this session:**

- Roadmap §8b.4 — gateway-native CM transport (replaces `openclaw agent …` subprocess with direct WS-RPC). Expected to close the remaining ~20 s CLI-cold-start gap.
- Bootstrap optimisation (trimming `AGENTS.md` or raising `bootstrapMaxChars`) — small gain (~0.3–0.8 s); skip until §8b.4 lands.

---

## 2. What was actually implemented (file-by-file)

### 2.1 Channel Manager overview row — TARS always visible

`frontend/src/components/ChannelManagerChannelRow.jsx`

- `topBlock` now renders `agentDetails.name` **before** `tg.currentTask`, so the TARS tile appears in the collapsed state.
- Status badge and TARS name wrapped in a single `display:flex; gap; align-items:center` container → "ACTIV · TARS" on one row (user mockup).
- TARS tile is a clickable button; inline styles `width:'auto'; flex:'0 0 auto'; maxWidth:'100%'` override the global `button { width: 100% }` rule in `theme.css`.
- Redundant "konfigurieren" link removed.

### 2.2 Numeric TTG sort

New: `frontend/src/utils/sortTtgChannels.js`

```js
function ttgNumericPrefix(name) {
    if (name == null || typeof name !== 'string') return Number.MAX_SAFE_INTEGER;
    const m = name.match(/^(?:TTG|TG)(\d+)/i);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return parseInt(m[1], 10);
}

export function sortTtgChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0)
        return Array.isArray(channels) ? [...channels] : [];
    return [...channels].sort((a, b) => {
        const na = ttgNumericPrefix(a?.name);
        const nb = ttgNumericPrefix(b?.name);
        if (na !== nb) return na - nb;
        const cmpName = String(a?.name || '').localeCompare(String(b?.name || ''));
        if (cmpName !== 0) return cmpName;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
}
```

`frontend/src/pages/ChannelManager.jsx`

- `const displayChannels = useMemo(() => sortTtgChannels(backendChannels), [backendChannels]);`
- Used in the list render, `handleSelectAll`, and `applyBulkChannelRows`.

### 2.3 Optimistic user bubble + mirror dedupe

`frontend/src/hooks/useChatSession.js`

Two pieces:

1. On send (from the CM chat panel), insert an optimistic `{ senderRole: 'user', cmOptimistic: true, text }` bubble immediately.
2. When SSE `MESSAGE` events arrive, strip **up to four** leading bracketed prefixes (the mirrored user text from `openclaw agent` may look like `[Mon 2026-04-20 17:56 GMT+2] foo`) before comparing, and drop the matching optimistic bubble:

```js
function mirrorUserTextForOptimisticMatch(text) {
    let s = String(text || '').trim();
    for (let i = 0; i < 4; i++) {
        const m = s.match(/^\[[^\]]*]\s*/);
        if (!m) break;
        s = s.slice(m[0].length).trim();
    }
    return s;
}
```

Why 4? The gateway may prepend multiple brackets (timestamp, source, tag). Four is a safety ceiling — real input was observed with 1.

### 2.4 Session-tail poll

`backend/services/chat/sessionTail.js`

- `SESSION_TAIL_POLL_INTERVAL_MS` 400 → 200 ms.
- Observable effect: mirrored assistant text appears up to 200 ms faster. No CPU cost observed in field test.

### 2.5 Timestamps with seconds

`frontend/src/components/ChatPanel.jsx`

```js
new Date(msg.date * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
```

Purpose: latency debugging and stopwatch matching against gateway logs.

### 2.6 CLI warm-gateway env injection (already shipped earlier this day, 16:54 CEST)

New: `backend/services/chat/openclawGatewayEnv.js`
New: `backend/test/openclawGatewayEnv.test.js`
Touched: `backend/services/chat/sessionSender.js` (calls `buildEnvForOpenclawCliSpawn()`)

- Reads `gateway.auth.token` + `gateway.port` from `~/.openclaw/openclaw.json` (`OPENCLAW_CONFIG_PATH` override supported), cached by mtime.
- Merges into the CLI child `env` as `OPENCLAW_GATEWAY_TOKEN` (verbatim) + `OPENCLAW_GATEWAY_URL` (`http://127.0.0.1:<port>`) when not already set.
- The CLI (`openclaw agent --session-id … --message … --json`) then reaches the warm local gateway over WS-RPC and skips the embedded-mode fallback. Observed in `/tmp/openclaw-cm-send-ad454416-*.log` from 17:56 CEST: **no** "Gateway agent failed" line, model inference `meta.durationMs: 2870` ms.

### 2.7 Policy panels extracted

New: `frontend/src/utils/defaultTelegramAccountPolicy.js`
New: `frontend/src/utils/defaultOpenclawAgentsDefaultsPolicy.js`
Touched: `frontend/src/components/TelegramAccountPolicyPanel.jsx`, `OpenclawAgentsDefaultsPolicyPanel.jsx`

- Extracted the `DEFAULT_…_POLICY` constants out of the `.jsx` files into plain `.js` utility modules.
- Reason: Vite / ESM module resolution fails with the `Uncaught SyntaxError: does not provide an export named 'DEFAULT_…'` pattern when a `.jsx` module mixes a default component export with named constant exports.
- Pattern to follow for future shared constants: plain `.js` util file + re-export from the panel if needed for backwards compatibility.

### 2.8 Roadmap corrections

`Production_Nodejs_React/030_ROADMAP.md`

- §1 snapshot row "OpenClaw Chat mirror" now notes the 2026-04-20 UX additions.
- §8b.1 marks the earlier `tools.gatewayToken` plan as **wrong** (with the exact schema rejection and a verified-2026-04-20 note).
- §8b.4 `CM OpenClaw Chat — gateway-native path` added as the next major feature.

---

## 3. Best practices used / patterns to repeat

1. **Always inject gateway auth via env when spawning `openclaw …`** — schema changes and CLI flag churn are real; env vars are the stable surface. Use `backend/services/chat/openclawGatewayEnv.js` as the single source.
2. **Don't mix default + named exports in `.jsx` modules** that ship through Vite dev server without an explicit `esbuild` hint. Extract constants to a sibling `.js` utility. Cheap refactor, eliminates a real class of resolution failures.
3. **Optimistic UI bubble with normalize-then-match cleanup**: the mirrored-line text will almost always carry additional metadata prefixes. Strip bracketed prefixes greedily (capped) before string-equality. Keep the `cmOptimistic` flag on the temporary bubble so cleanup is scoped.
4. **Measure, don't guess, before committing a config change.** The `tools.gatewayToken` rabbit-hole cost us one false-start patch cycle. Proof by `openclaw gateway status --json` against the schema is cheap; do it first.
5. **Overview row layout:** when global CSS sets `button { width:100% }`, per-button layouts inside a flex row require explicit `width:'auto'; flex:'0 0 auto'` overrides. Prefer these inline overrides to a global theme change — scoped, visible in PR review.
6. **Numeric ordering over lexicographic** for TTG-prefixed entities. Extract prefix → sort by number → fall back to `localeCompare` on full name, then on id. Stable across partial data.

---

## 4. Active patterns in the codebase to be aware of

- **Two chat transports on the same machine:**
  - OpenClaw Control UI ("OC") — direct WS-RPC to the gateway. ~2–3 s round-trip on Kimi-K2.5.
  - Channel Manager ("CM") — **currently** spawns `openclaw agent` as a CLI child; gateway-warm now, but still pays CLI cold-boot (~1–2 s per message). JSONL-tail polling (`chokidar` + interval) is how assistant output reaches the browser. See §8b.4 to close this gap.
- **Session resolution is mirror-only on CM side.** The CM does **not** resolve agent/binding itself; it reads `~/.openclaw/agents/*/sessions/sessions.json` + the canonical session JSONL. Keep it that way — makes the gateway the single source of truth.
- **`~/.openclaw/openclaw.json` is operator-owned.** CM touches only CM-owned `agents.list[]` / `bindings[]` / `channels.telegram` / (opt-in) `agents.defaults.model.primary`. Do not drift into operator-owned keys (including `tools`, `gateway.auth`, etc.).
- **Logs to consult for latency work:**
  - `journalctl --user -u openclaw-gateway.service --since '-10min'` — gateway request lifecycle.
  - `/tmp/openclaw-cm-send-<sessionId>.log` — per-send CLI stderr + final JSON, contains `meta.durationMs`, `systemPromptReport`, `executionTrace.runner`.

---

## 5. Next steps (ordered)

1. **Measure current state** with all deployed fixes: send a probe message in CM/Telegram/OC and record stopwatch latencies. Expected: ~5–15 s for CM user bubble → assistant reply, ~3 s for OC, ~5–6 s for Telegram. If CM is still ≥ 20 s, re-check that the frontend/backend were actually restarted with the new code.
2. **Roadmap §8b.4 — gateway-native CM transport.**
   - Adopt the gateway WS client that OC uses (`openclaw/dist/plugin-sdk/src/gateway/call.js` pattern with `callGateway({ method: 'agent', params: { … } })`).
   - Implement behind a feature flag in `sessionSender.js`; keep CLI spawn as fallback for one release.
   - ADR in `040_DECISIONS.md` before merging.
3. **Optional: bootstrap hygiene.** Shrink `AGENTS.md` to ≤ 4000 chars so truncation stops firing per-request. One-time operator action; small perf win.
4. **Cleanup of the session backup:** `/home/claw-agentbox/.openclaw/openclaw.json.bak-20260420-184837` can be `trash`ed once §8b.4 is underway and the investigation is locked in.

---

## 6. Files / paths to know

| Kind                 | Path                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Gateway config       | `/home/claw-agentbox/.openclaw/openclaw.json`                                                  |
| Gateway service      | `openclaw-gateway.service` (user unit)                                                         |
| CLI binary           | `/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/openclaw.mjs`                       |
| Node ≥ 22 required   | `/usr/bin/node` (v24.x on this box); `OPENCLAW_NODE_BIN` overrides                              |
| CM backend chat      | `backend/services/chat/{sessionSender,sessionTail,sessionIndex,sessionIngest,openclawGatewayEnv}.js` |
| CM frontend chat     | `frontend/src/{hooks/useChatSession.js,components/ChatPanel.jsx,pages/ChannelManager.jsx}`     |
| Row UI               | `frontend/src/components/ChannelManagerChannelRow.jsx`                                         |
| Sort util            | `frontend/src/utils/sortTtgChannels.js`                                                        |
| Policy utils         | `frontend/src/utils/default{Telegram,OpenclawAgentsDefaults}Policy.js`                         |
| Roadmap              | `030_ROADMAP.md` (esp. §1, §8b.1 correction, §8b.4)                                            |
| WIP notes            | `000_WIP TEST_20.04.26.md` (full-fleet apply acceptance, unchanged this session)               |

---

## 7. Open hazards

- **`backend/.env` is tracked** and now carries the real `OPENCLAW_GATEWAY_TOKEN` value in addition to the two bot tokens that were already there. This is pre-existing pattern in the repo but the gateway token is new-in-repo. Consider either `.gitignore`-ing `.env` (breaking change for other operators) or resetting just that line before push. **Flagged to operator before commit.**
- The patch for Roadmap §8b.1 clearly marked the earlier suggested fix as wrong. Don't copy it back; follow §8b.4 instead.

---

_End of handover._
