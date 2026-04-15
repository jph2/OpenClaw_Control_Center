# OpenClaw OpenUSDGoodstart UI Extensions

Read-only workbench MVP for browsing laptop-hosted OpenClaw-related repositories from a browser.

## Components

- **Landing Page** (`index.html`) - Central hub with links to all tools
- **Workbench** (`workbench/`) - Classic folder tree document browser
- **Channel Manager** (`channel-manager/`) - Telegram channel config UI with Skill Tree visualization
- **Workbench Mobile** (`workbench/mobile/`) - React Native iOS/Android app

## Quick Start

```bash
# Start all services and open landing page
./start-extension.sh start

# Or start individually:
npm start                    # Workbench only (port 4260)
cd channel-manager && ./channel-manager.sh start  # Channel Manager only (port 3401)
```

Open: `file:///media/claw-agentbox/data/9999_LocalRepo/OpenClaw_Control_Center/index.html`

## Auto-Start with OpenClaw

### Option 1: Systemd Service (Recommended)

```bash
sudo cp openclaw-extensions.service /etc/systemd/system/
sudo systemctl enable openclaw-extensions
sudo systemctl start openclaw-extensions
```

### Option 2: OpenClaw Hook

The hook script is automatically called when OpenClaw starts (if `.auto-start-enabled` exists):

```bash
touch .auto-start-enabled  # Enable auto-start
./openclaw-hook.sh         # Manual trigger
```

## Workbench Features

- approved root selection:
  - workspace
  - openclaw
  - studio-framework
  - ui-extensions
- classic folder tree view with nested open/close navigation
- separate scrolling for navigation vs document reading
- open file by URL
- raw markdown/text view
- rendered markdown preview
- mermaid rendering in preview mode
- stable browser URL parameters
- latest docs list aggregated across all enabled roots
- editable absolute + relative path fields
- filename search within the selected root with kind/age/size filters
- image preview with scalable overview controls
- PDF preview
- resizable sidebar and outline pane
- markdown heading outline panel

## Channel Manager

Web UI for managing OpenClaw Telegram channels with persistent model and skill assignments.

```bash
cd channel-manager
./channel-manager.sh start  # Start server on port 3401
./channel-manager.sh open   # Open browser
```

Features:
- Channel list with model dropdown
- Per-channel skill assignment
- Interactive Skill Tree visualization (force-directed graph)
- Persistent configuration

See [channel-manager/README.md](channel-manager/README.md) for details.

## Landing Page

Central hub at `index.html` showing:
- Status of all services (Workbench + Channel Manager)
- Quick-start buttons
- Links to all tools
- Server logs

## Why this exists

The current OpenClaw chat/web surface is good for conversation but weak as a collaborative artifact browser. This MVP adds a separate workbench surface so referenced docs are actually readable and navigable from another machine.

## Run

```bash
npm install
npm start
```

Default URL:
- `http://localhost:4260`

## Example links

- workspace docs folder:
  - `http://localhost:4260/?root=workspace&dir=docs`
- a specific markdown file in preview mode:
  - `http://localhost:4260/?root=workspace&path=docs/openclaw-four-repo-strategy-v1.md&mode=preview`
- raw mode:
  - `http://localhost:4260/?root=workspace&path=docs/openclaw-four-repo-strategy-v1.md&mode=raw`

## Repository (Git remote)

Canonical GitHub repository (current name: **OpenClaw_Control_Center**):

- **SSH:** `git@github.com:jph2/OpenClaw_Control_Center.git`
- **HTTPS:** `https://github.com/jph2/OpenClaw_Control_Center.git`

If a clone still uses the legacy remote (`Openclaw-OpenUSDGoodstart-UI_Extensions` or similar), Git may print GitHub’s *repository moved* hint. Point `origin` at the URL above to clear it:

```bash
git remote set-url origin git@github.com:jph2/OpenClaw_Control_Center.git
git remote -v
```

## Safety notes

This MVP is intentionally read-only and restricts file access to approved root directories.

## Next likely improvements

- latest-docs landing page
- heading outline / table of contents
- recent files
- image and PDF preview
- OpenClaw chat integration hooks for clickable document links
- optional annotation/review layer
