# Session Cleanup 2026-04-25 - Workbench / Channel Manager Boundary

## Context

The current bridge and Open Brain guardrails are committed and pushed. The next
cleanup loop should separate Channel Manager and Workbench on code boundaries
without splitting the repo, deploy, or runtime yet.

## Current Boundary Leak

Status: closed in the first cleanup slice.

The clearest frontend leak is:

- `frontend/src/pages/ChannelManager.jsx` imports `useWorkbenchStore` from
  `frontend/src/pages/Workbench.jsx`.

This couples Channel Manager to a Workbench page implementation instead of a
defined feature/public API.

Resolution:

- `useWorkbenchStore`, `normalizeWorkbenchDir`,
  `applyWorkbenchSearchParams`, and `USER_HOME_FALLBACK` now live in
  `frontend/src/features/workbench/state/useWorkbenchStore.js`.
- `Workbench.jsx` imports its own state from the Workbench feature module.
- `ChannelManager.jsx` imports the Workbench store from the feature state
  module, not from the Workbench page.
- `ChannelManager.jsx` and `Workbench.jsx` have moved to feature-owned page
  modules:
  - `frontend/src/features/channel-manager/pages/ChannelManagerPage.jsx`
  - `frontend/src/features/workbench/pages/WorkbenchPage.jsx`
- Feature public entrypoints exist at:
  - `frontend/src/features/channel-manager/index.js`
  - `frontend/src/features/workbench/index.js`
- Shared styling is intentionally centralized at
  `frontend/src/shared/styles/theme.css`, imported once from `main.jsx`.

## Target Shape

Keep one repo, one React app, and one Express backend for now.

Frontend:

```text
frontend/src/
├─ app/
├─ features/
│  ├─ channel-manager/
│  └─ workbench/
└─ shared/
```

Backend:

```text
backend/src/
├─ app/
├─ features/
│  ├─ channel-manager/
│  ├─ workbench/
│  └─ health/
└─ shared/
```

## Boundary Rules

- Feature pages must not import from other feature pages.
- Channel Manager may link to Workbench or use a documented Workbench public
  entrypoint.
- Workbench may display files/artifacts but must not own TTG, binding, promote,
  export, or sync domain decisions.
- Shared code is only for schemas, constants, low-level filesystem/security
  helpers, generic UI, and generic utilities used by both features.
- Producer adapters feed artifacts; they do not bypass artifact metadata,
  review states, OpenClaw promote, or Open Brain export/sync rules.

## Recommended Migration Order

1. Done: extract `useWorkbenchStore` from `Workbench.jsx` into:
   `frontend/src/features/workbench/state/useWorkbenchStore.js`.
2. Done: update `ChannelManager.jsx` to import only from the new state module.
3. Done: move Workbench page code under `frontend/src/features/workbench/`.
4. Done: move Channel Manager page code under
   `frontend/src/features/channel-manager/`.
5. Done: add feature `index.js` public entrypoints.
6. Done: move global theme CSS into `frontend/src/shared/styles/`.
7. Move feature-owned components/hooks/utils under their feature folders.
8. Move generic frontend utilities into `frontend/src/shared/`.
9. Backend later: move routes/services into
   `backend/src/features/channel-manager/` and `backend/src/features/workbench/`.
10. Add import-boundary checks or at least a lightweight review checklist.

## Do Not Do Yet

- Separate repos.
- Separate deploys.
- Microfrontends.
- A second backend process.
- Broad shared-folder dumping ground.

## Acceptance

- No import from `pages/Workbench.jsx` inside Channel Manager code.
- Global theme is imported once from `frontend/src/shared/styles/theme.css`
  and remains shared between Channel Manager and Workbench.
- App routes still work:
  - `/channels`
  - `/workbench`
- Backend tests remain green.
- Frontend build remains green.
- E2E golden path remains green.

## Implementation Notes 2026-04-25

Completed in the first boundary cleanup slice:

- `ChannelManagerPage.jsx` now lives under
  `frontend/src/features/channel-manager/pages/`.
- `WorkbenchPage.jsx` now lives under
  `frontend/src/features/workbench/pages/`.
- Workbench state lives under
  `frontend/src/features/workbench/state/useWorkbenchStore.js`.
- Feature entrypoints exist for Channel Manager and Workbench.
- Global styles live under `frontend/src/shared/styles/theme.css`.

Verification performed after the move:

- `git diff --check`
- frontend `npm run build`
- E2E golden path `npm test` under `Production_Nodejs_React/e2e`

Known follow-up:

- Move feature-owned Channel Manager components/hooks/utils into the
  Channel Manager feature folder.
- Move feature-owned Workbench components/hooks/utils into the Workbench feature
  folder as they appear.
- Keep theme/design tokens shared; do not fork CSS per feature.
