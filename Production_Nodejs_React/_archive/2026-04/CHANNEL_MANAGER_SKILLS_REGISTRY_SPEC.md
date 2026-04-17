# Channel Manager — Workspace Skills Registry (Specification)

**Status:** registry implemented; presentation (filter / order) **planned** — see § [Filtering, ordering, and display](#filtering-ordering-and-display-planned)  
**Last updated:** 2026-04-18

## Goal

Expose **all** skills that exist under the OpenClaw workspace skills tree in the Channel Manager **Skills** tab without manually editing a hardcoded list in the backend each time a new folder appears.

## Source of truth

| Layer | Role |
|--------|------|
| **Bundled / managed catalog** | Fixed entries shipped with Channel Manager (`BUNDLED_SKILL_CATALOG` in `routes/channels.js`): built-in OpenClaw skills, ClawHub entries such as `notion`, etc. |
| **Workspace scan** | For every subdirectory `<OPENCLAW_WORKSPACE>/skills/<skillId>/` that contains `SKILL.md`, the backend builds one registry entry keyed by `skillId`. |

**Config consistency (2026-04-17, Hardening):** The parent **`channel_config.json`** must keep **`channels`**, **`agents`**, and **`subAgents`** as **JSON arrays** (never `{}` where an array is required). The registry merge assumes a valid config shape after backend normalization — see [OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md](OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md).

### Environment

- **`OPENCLAW_WORKSPACE`** (optional): absolute path to the workspace root. Default: `~/.openclaw/workspace`.
- Skills directory: **`<OPENCLAW_WORKSPACE>/skills`**.

## Parsing rules (`SKILL.md`)

1. Read the first YAML **frontmatter** block (between `---` lines).
2. **`name:`** (required for stable id): becomes the catalog key if present; otherwise the **directory name** is used.
3. **`description:`** (optional): becomes `desc`. Supports:
   - Double-quoted one-line strings (`description: "..."`).
   - Unquoted single-line descriptions.
4. **`channel_manager_category:`** or **`cm_category:`** (optional): Channel Manager filter badge. Allowed values: `utility`, `research`, `system`, `integration`, `orchestration`, `development`, `workspace`. Unknown values fall back to **`workspace`**.
5. Directories **without** `SKILL.md` are skipped. Names **`dist`** and dot-prefixed dirs are skipped.

## Merged metadata shape

Each skill in `metadata.skills` has: `desc`, `origin`, `cat`, `src`, `def`.

- Workspace-scanned rows: `origin: "workspace/skills"`, `src: "workspace"`, `def: false`.
- **Precedence:** workspace scan **overrides** bundled keys if the same `name` exists locally (allows a forked copy of a bundled skill to win).

## Live updates

- **Chokidar** watches `<OPENCLAW_WORKSPACE>/skills` (depth sufficient to catch `*/SKILL.md` changes).
- On add/change/unlink of `SKILL.md`, the backend emits the same **`configChange`** event as `channel_config.json`, so **`/api/channels/events` SSE** sends `CONFIG_UPDATED` and the React app invalidates the `['channels']` query (no full page reload).

## Non-goals (current)

- **No** scan of the global npm `openclaw` package tree for bundled skills (those remain in `BUNDLED_SKILL_CATALOG` until a later optional scanner).
- **No** validation that OpenClaw’s runtime actually loads every listed skill (CM is a **catalog + UI** for assignment, not the harness loader).

## Filtering, ordering, and display (planned)

The **Skills** tab today renders `Object.entries(SKILL_METADATA)` in **insertion order** of the merged catalog object (bundled keys first, then workspace scan keys in directory order — not guaranteed stable across OS). The following behaviour is **specified** for a follow-up implementation (see Implementation Plan **Sub-Task 6.11**).

### Filtering

| Mechanism | Behaviour |
|-----------|------------|
| **Category** | Dropdown or chips: `All` + each of `utility`, `research`, `system`, `integration`, `orchestration`, `development`, `workspace`. Filter by `metadata.skills[id].cat`. |
| **Origin / source** | Optional secondary filter: `bundled` \| `managed` \| `workspace` (map from `src`). Lets users hide workspace-only or focus on ClawHub-managed skills. |
| **Full-text** | Search box over **skill id**, **desc**, and optionally `origin` string. Client-side filter is sufficient for typical catalog sizes (on the order of 10² entries). |
| **Defaults only** | Toggle “Show DEFAULT skills only” using `def === true` (matches existing badge in UI). |

**Not required for v1:** multi-select category; saved filter presets (can be a later increment).

### Sorting

| Sort key | Notes |
|----------|--------|
| **Name (A–Z / Z–A)** | Stable, by catalog `id`. |
| **Category** | Group by `cat`, then by name within group. |
| **Source** | Group by `src` (`bundled` → `managed` → `workspace`), then by name. |
| **Recently changed (workspace)** | Optional: if filesystem `mtime` of `SKILL.md` is exposed on the entry (e.g. `skill.mdMtime` in metadata), sort descending. Requires backend to stat files during scan. |

Default recommended: **Name (A–Z)**.

### Custom order (“pinned” list)

Users may want a **manual order** that survives reloads (e.g. pin frequently used skills to the top). Spec:

1. **Persistence:** store an ordered array of skill ids, e.g. `skillsCatalogOrder: string[]`, in the same persisted UI/config store as Channel Manager (e.g. extend `channel_config.json` with a top-level key **or** a small sidecar `channel_manager_ui.json` next to it — decision at implementation time; sidecar avoids touching channel array schema on every reorder).
2. **Merge rule:** start from **custom order** (only ids that still exist in `metadata.skills`); append any **new** skills not in the list in **name** order at the end (or after “pinned” section per product choice).
3. **UI:** drag-and-drop handles on cards, or “Move up / down”, plus “Reset to alphabetical”.

### Client vs server

- **Filtering and sort** can be implemented **entirely in React** from `metadata.skills` (no new API), except optional `mtime` for “recent”.
- **Custom order** requires **read/write** of persisted preferences (one extra field in existing config read path or dedicated `GET/PUT` for UI prefs).

### SSE / invalidation

When the workspace registry changes, the skill **set** updates; **custom order** should retain valid ids and drop missing ids without user prompt.

## Related code

- `backend/services/workspaceSkillRegistry.js` — scan + parse.
- `backend/routes/channels.js` — merge, watcher.
- `frontend/src/pages/ChannelManager.jsx` — `skill.src === 'workspace'` and `resolveSkillFsPath()` for Workbench links; **planned:** filter/sort UI and persisted order (Implementation Plan **6.11**).
