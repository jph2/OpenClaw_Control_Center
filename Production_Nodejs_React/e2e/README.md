# Channel Manager E2E

Playwright smoke tests for the Channel Manager operator flows.

## E2E_GOLDEN_PATH_8B5

This test proves the current IDE memory bridge happy path:

1. Load `/channels`.
2. Open the `TARS in IDE` summary tab.
3. Install a temporary project mapping through the mapping API.
4. Save an A070 draft under `drafts/e2e/`.
5. Promote the draft to OpenClaw memory.
6. Verify UI status and backend sidecar metadata.
7. Clean up mapping, draft, sidecar, and promoted memory block.

## Setup

Start the normal dev stack first:

```bash
# backend
cd /media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center/Production_Nodejs_React/backend
npm run dev

# frontend
cd /media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center/Production_Nodejs_React/frontend
npm run dev -- --host 0.0.0.0
```

Install the E2E dependencies once:

```bash
cd /media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center/Production_Nodejs_React/e2e
npm install
npm run install:browsers
```

Run against localhost:

```bash
npm test
```

Run against the Tailscale URLs:

```bash
E2E_FRONTEND_URL=http://100.89.176.89:5173 \
E2E_BACKEND_URL=http://100.89.176.89:3000 \
npm test
```

Useful optional environment variables:

- `E2E_FRONTEND_URL`: default `http://127.0.0.1:5173`
- `E2E_BACKEND_URL`: default `http://127.0.0.1:3000`
- `E2E_A070_ROOT`: default auto-derived Studio A070 directory
- `E2E_OPENCLAW_WORKSPACE`: default `/home/claw-agentbox/.openclaw/workspace`
- `E2E_TTG_ID`: force a specific Telegram topic group id

Artifacts are written under `e2e/artifacts/`.
