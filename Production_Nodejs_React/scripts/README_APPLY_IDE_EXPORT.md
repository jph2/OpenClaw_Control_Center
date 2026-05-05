# Apply IDE export (B — Cursor `.cursor/agents`)

Materializes **engine + Skill Role IDE profile** stubs from Channel Manager into a target repo’s `.cursor/agents/*.md`.

- **Source of truth:** `Prototyp/channel_CHAT-manager/channel_config.json` (and CM UI).
- **Does not** write `~/.cursor` — only the path you pass as `--target`.
- **Safe default:** existing agent files **without** a CM export marker are **skipped** unless you pass `--force`.
- **v2:** managed region between `<!-- cm-managed:start -->` and `<!-- cm-managed:end -->`; prose **below** the end marker is preserved across `--write`. The top file marker is `<!-- cm-ide-export:v2 … -->` (v1 files are still detected for skip/force semantics).

## From local config (no running server)

Set `WORKSPACE_ROOT` to the parent of `OpenClaw_Control_Center` (same as backend), then:

```bash
cd Production_Nodejs_React/backend
export WORKSPACE_ROOT=/path/to/parent-of-OpenClaw_Control_Center

npm run apply-ide-export -- --dry-run --target /path/to/Studio_Framework
npm run apply-ide-export -- --write --target /path/to/Studio_Framework
```

Or pass an explicit config:

```bash
node ../scripts/apply-ide-export.mjs --write --target /path/to/repo \
  --config /path/to/OpenClaw_Control_Center/Prototyp/channel_CHAT-manager/channel_config.json
```

## From running Channel Manager API

```bash
node scripts/apply-ide-export.mjs --write --target /path/to/repo \
  --api-base http://127.0.0.1:3000
```

## Workflow

1. Edit agents/Skill Roles/skills in CM → **Apply to OpenClaw** as usual.
2. Run this script with `--dry-run`, review the list (bundle **warnings** and **orphan** CM files may appear).
3. Run with `--write`, then **commit** the `.cursor/agents` diff in the IDE repo.

## Stale check (CI / pre-commit)

After `--write`, `.cursor/cm-ide-export-fingerprint.json` stores **fingerprint v2** (hash of per-file **managed-region** shas) plus a legacy v1 payload hash. If `channel_config.json` changes but you forgot to re-run apply, someone edited a managed region on disk, or a CM-managed `.cursor/agents/*.md` file remains after it disappeared from CM:

```bash
cd Production_Nodejs_React/backend
export WORKSPACE_ROOT=/path/to/parent-of-OpenClaw_Control_Center
npm run check-ide-export-stale -- --target /path/to/Studio_Framework
```

- Exit **0** — fingerprint v2 matches current CM **and** on-disk managed regions match.
- Exit **1** — stale, drift, or orphan CM-managed file; re-run apply and remove/resolve orphans.
- Exit **2** — no fingerprint file yet (run `--write` once).

Older fingerprint files may still use schema `cm.ide-export-fingerprint.v1`; re-run `--write` once to upgrade to v2.

## Markers

CM-owned files are recognized by a first-line `<!-- cm-ide-export:v1|v2 … -->` marker.

Custom agent docs without this marker are not overwritten unless `--force`.
