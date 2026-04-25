# Session Cleanup 2026-04-25 - Workbench / Channel Manager Boundary

## Context

The current bridge and Open Brain guardrails are committed and pushed. The next
cleanup loop should separate Channel Manager and Workbench on code boundaries
without splitting the repo, deploy, or runtime yet.

## Current Boundary Leak

The clearest frontend leak is:

- `frontend/src/pages/ChannelManager.jsx` imports `useWorkbenchStore` from
  `frontend/src/pages/Workbench.jsx`.

This couples Channel Manager to a Workbench page implementation instead of a
defined feature/public API.

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

1. Extract `useWorkbenchStore` from `Workbench.jsx` into:
   `frontend/src/features/workbench/state/useWorkbenchStore.js`.
2. Update `ChannelManager.jsx` to import only from the new state module or from
   a Workbench feature public entrypoint.
3. Move Workbench page/component code under `frontend/src/features/workbench/`.
4. Move Channel Manager page/component/hooks/utils under
   `frontend/src/features/channel-manager/`.
5. Add feature `index.js` public entrypoints.
6. Move generic frontend utilities into `frontend/src/shared/`.
7. Backend later: move routes/services into
   `backend/src/features/channel-manager/` and `backend/src/features/workbench/`.
8. Add import-boundary checks or at least a lightweight review checklist.

## Do Not Do Yet

- Separate repos.
- Separate deploys.
- Microfrontends.
- A second backend process.
- Broad shared-folder dumping ground.

## Acceptance

- No import from `pages/Workbench.jsx` inside Channel Manager code.
- App routes still work:
  - `/channels`
  - `/workbench`
- Backend tests remain green.
- Frontend build remains green.
- E2E golden path remains green.
