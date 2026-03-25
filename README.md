# OpenClaw OpenUSDGoodstart UI Extensions

Read-only workbench MVP for browsing laptop-hosted OpenClaw-related repositories from a browser.

## Current MVP

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
- latest workspace docs list
- markdown heading outline panel

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

## Safety notes

This MVP is intentionally read-only and restricts file access to approved root directories.

## Next likely improvements

- latest-docs landing page
- heading outline / table of contents
- recent files
- image and PDF preview
- OpenClaw chat integration hooks for clickable document links
- optional annotation/review layer
