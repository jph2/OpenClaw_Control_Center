---
title: "Discovery: Channel Manager ↔ OpenClaw ↔ IDE workbench (config bridge)"
status: draft
last_modified: "2026-04-18"
---

**Siehe auch:** konsolidierte Master-Dokumentation [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) (§2.9 IDE-Bridge & APIs).

# Discovery: Dual-target export & IDE surfaces

## Problem

`channel_config.json` is the **Channel Manager source of truth** for channels, engines (TARS / MARVIN / CASE), sub-agents, and skills selections. **OpenClaw** consumes `openclaw.json` and workspace layout; **Cursor** consumes `.cursor/rules/*.mdc`, `.cursor/agents/*.md`, skills, and `mcp.json`. These are **not** the same schema — a **single flat JSON** “for OpenClaw” is insufficient for Cursor without a **projection layer**.

## Cursor (2026) — on-disk shapes (high level)

| Concept | Typical location | Notes |
|--------|------------------|--------|
| Rules | `.cursor/rules/*.mdc` | YAML frontmatter + globs / `alwaysApply` |
| Skills | Folder per skill with `SKILL.md` (Agent Skills / open standard) | Often symlinked or copied under project |
| Subagents | `.cursor/agents/*.md` | YAML frontmatter: `name`, `description`, `model`, `readonly`, … |
| MCP | `.cursor/mcp.json` | Already wired to Channel Manager MCP in this repo |

**Implication:** “Export to Cursor” should emit **files** or a **bundle manifest** + content bodies, not only one JSON. The HTTP API returns a **JSON projection** describing where files would go and the payload; automation can write files in a follow-up step.

## OpenClaw

- **Governance file:** `~/.openclaw/openclaw.json` (group routing, models).  
- Channel Manager already **reads** groups and **merges** local `channel_config.json`.  
- A **full automatic write** into `openclaw.json` is **high risk** (schema drift); exports expose a **`openclawMergeHints`** object for manual or scripted merge — not silent overwrite.

## Canonical layer (implemented in code)

See `backend/services/ideConfigBridge.js`:

- **`buildCanonicalSnapshot(config)`** — normalised view of agents, subAgents, channels (IDs only).  
- **`buildOpenClawProjection(snapshot)`** — safe hints + channel rows.  
- **`buildCursorProjection(snapshot)`** — suggested `.cursor/agents` entries + skill IDs list.

## UI

- Row tabs: **Configuration** | **OpenClaw Chat** (gateway SSE mirror, same stream as before) | **Cursor Summary** (A070 markdown index under Studio).  
- Summaries API lists `Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/**/*.md` filtered by optional `telegramId`.

## Risks / cost

- **Paid APIs:** none in this bridge.  
- **Writing into `~/.openclaw` or `~/.cursor` from server:** disabled by default; exports are **read-only JSON** unless a future “apply” tool is added with explicit user consent.

## Abgrenzung: IDE-Summary / A070 vs. operativer Chat-Spiegel (18.04.2026)

| Spur | Rolle |
|------|--------|
| **OpenClaw Chat** (Tab) | **Session-nativer** Transcript-Mirror (SSE) — **kein** Ersatz für das Gateway; siehe [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.4. |
| **IDE project summary** (A070) | Markdown-Verdichtung aus dem Studio-Baum — **read-only** im MVP; **kein** zweiter Live-Chat. |

**Traceability** (Projekt/Lineage neben TTG) ist **nicht** Gegenstand dieser Discovery-Datei; kanonisch: [TRACEABILITY_SCHEMA_V1.1.md](../../Studio_Framework/020_Standards_Definitions_Rules/010_Schema/TRACEABILITY_SCHEMA_V1.1.md). **Restaurations-/Proxy-Themen** (17.04.) gehören in [OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md](OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md), nicht hier.
