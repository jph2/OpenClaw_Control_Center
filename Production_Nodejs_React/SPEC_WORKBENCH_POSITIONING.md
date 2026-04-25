# SPEC - Workbench Positioning

**Status:** normative direction  
**Scope:** Production_Nodejs_React Workbench  
**Last reviewed:** 2026-04-25

## 1. Product Definition

The Workbench is a **lean local editing and diff surface for artifacts and
source files**.

It is not a full IDE and is not intended to replace Cursor, VS Code, Codex, or
other dedicated development environments.

Short form:

> Workbench = lean artifact/worktree editor with diff-first workflows.

## 2. What The Workbench Is For

The Workbench should make it easy to:

- open local files from governed roots
- inspect Markdown, JSON, YAML, Python, JavaScript, TypeScript, and similar
  text-based artifacts/source files
- edit files locally
- compare local edits with the current on-disk state
- review agentic edit proposals
- save or discard changes deliberately
- inspect artifacts in the broader OpenClaw / Studio Framework / Open Brain
  context

The Workbench is most valuable when it gives the operator a fast, local,
diff-first way to understand and approve changes produced by humans or agents.

## 3. What The Workbench Is Not

The Workbench is not:

- a Cursor replacement
- a VS Code / Cloud Code clone
- a full language-server platform
- a marketplace/plugin ecosystem
- a collaborative cloud IDE
- an independent coding-agent platform
- an owner of TTG binding, memory promotion, Open Brain sync, or OpenClaw apply
  semantics

Those responsibilities remain with their owning layers:

- Channel Manager: channel config, chat, routing, apply, promote, sync status
- Studio Framework artifacts: durable artifact truth
- OpenClaw: runtime/memory continuity
- Open Brain: semantic/MCP-accessible long-term knowledge

## 4. Core Workflow

The Workbench should optimize for:

1. open file
2. inspect file
3. edit file
4. view diff
5. save or discard
6. review proposed agentic changes
7. render Markdown well enough for artifact review
8. keep code/YAML/JSON as robust text editing surfaces

Later extensions may add patch-apply or richer review workflows, but the center
of gravity remains local edit/diff/review, not a full IDE rebuild.

## 5. Architecture Boundaries

The Workbench may:

- read and write files inside allowed roots
- display Studio Framework artifacts as files
- link to or be linked from Channel Manager surfaces
- use shared style tokens and generic UI utilities

The Workbench must not:

- decide TTG binding
- promote into OpenClaw memory
- export/sync to Open Brain
- mutate `channel_config.json` or `openclaw.json`
- own chat media upload/preview logic
- become a hidden dependency of Channel Manager chat/config flows

## 6. Style Boundary

Workbench and Channel Manager should share theme tokens and global styling.

Do not fork per-feature CSS just because the code is feature-separated. Future
dark/light mode work should be implemented in the shared theme layer and then
consumed by both features.

