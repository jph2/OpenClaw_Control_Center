---
arys_schema_version: "1.3"
id: "8c35d9a2-9b16-43e4-84fa-9f8d6de412a1"
title: "Implementierungsplan: Centralized Channel Manager"
type: PRACTICAL
status: active
trust_level: 3
agent_index:
  context: "Phased implementation plan for refactoring the Channel Manager to a Sovereign Telegram Hub."
  maturation: 3
  routing:
    phase1: "#1-phase-daten-integritat"
    phase5: "#5-phase-ui-polishing-persistence--unified-brain"
    phase6: "#6-phase-native-ide-telegram-integration-anti-gravity"
created: "2026-04-12T01:07:00Z"
last_modified: "2026-04-15T12:00:00Z"
author: "AntiGravity"
provenance:
  git_repo: "OpenClaw_Control_Center"
  git_branch: "main"
  git_path: "Production_Nodejs_React/CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md"
tags: [implementation, channel_manager, telegram-hub, zod, private-ecosystem]
---

# Implementierungsplan: Centralized Channel Manager (V1.3)

**Release**: V1.5 | **Status**: Phase 6 & 8 (teilweise), MCP/Cursor operational | **Focus**: Rosetta-Sync, Gateway-Delivery & IDE-MCP
**GlobalID**: 20260415_1200_IMPLEMENTATION_v1.5

**Last Updated:** 15.04.2026 12:00  
**Framework:** Horizon Studio Framework  
**Status:** active

---

## 1. Phase: Daten-Integrität & Backend-Fokus (Abgeschlossen ✅)
- [x] **Sub-Task 1.1**: Refactoring `ChannelManager.jsx`. Dinamische Modelle/Skills.
- [x] **Sub-Task 1.2**: Backend-Endpoints `/api/channels` Erweiterung.
- [x] **Sub-Task 1.3**: Initiales Zod-Schema Setup.
- [x] **Sub-Task 1.4**: Hot-Reload via `chokidar`.
- [x] **Sub-Task 1.5**: Domain-Driven File Ownership Durchsetzung.

## 2. Phase: Skill-Synchronisation ("Marvin"-Sync) (Abgeschlossen ✅)
- [x] **Sub-Task 2.1**: Fix der `sync_skills.py`.
- [x] **Sub-Task 2.2**: Hegel-Sync Implementierung.

## 3. Phase: Direct Telegram Conversation Stream (Abgeschlossen ✅)
- [x] **Sub-Task 3.1**: Telegram-Backend-Service via Telegraf.
- [x] **Sub-Task 3.2**: SSE-Stream (Server-Sent Events) Architektur.
- [x] **Sub-Task 3.3**: Native React-Chat-Komponente `TelegramChat.jsx`.

## 4. Phase: Native Multi-Bot Identity Flow (Abgeschlossen ✅)
- [x] **Sub-Task 4.1**: `.env` Update (TARS & CASE Token-Splitting).
- [x] **Sub-Task 4.2**: Refactoring `telegramService.js` (Asymmetric Relay).
- [x] **Sub-Task 4.3**: CASE Bot (@BotFather) Initialisierung.
- [x] **Sub-Task 4.4**: Verifizierung der Engine Antwort-Logik auf Relay-Nachrichten.
## 5. Phase: OpenClaw Source of Truth Integration (Gateway-First) (Abgeschlossen ✅)
**Status: Blueprint umgesetzt (14.04.2026)**
- [x] **Sub-Task 5.1 Abschaltung des Telegram Syncs**: Entferne `bot.launch()` und `getUpdates` aus dem lokalen Node.js Backend.
- [x] **Sub-Task 5.2 Gateway-Listener**: Verwende "Chokidar" (lokaler File-Scanner) um die Session-Transcript-Historie an das React-Frontend durchzuschleifen (SSE/GraphQL Bypass).
- [x] **Sub-Task 5.3 Outbound-CLI mit Zustellung (15.04.2026):** `telegramService.sendMessageToChat` nutzt `openclaw agent --channel telegram --to … --message … --deliver` (CLI-Default `--deliver` ist `false`). Message-Buffer wird immer für den Kanal-Key angelegt (SSE).

## 6. Phase: UI-Polishing, Persistence & Unified Brain (AKTIVE PHASE 🏗️)
Ziel: Bedienkomfort verbessern, Architektur-Lecks schließen und Wissens-Kontinuität sicherstellen.

- [x] **Sub-Task 6.0: AgentClaw IDE Integration** (VSIX Installation & CDP-Relay Aktivierung abgeschlossen ✅).

- [x] **Sub-Task 6.1: Message-Filter Layer (System/Heartbeat Toggle)**
  - Implementierung eines UI-Toggles an zentraler Stelle im UI: `[ ] Show System/Agent Internal Tasks`.
  - **Funktion 1 (Ganze Nachrichten blocken):** Wenn Toggle "aus", droppe alle Nachrichten, die exakt "HEARTBEAT_OK" enthalten oder mit "Read HEARTBEAT.md" beginnen.
  - **Funktion 2 (Text bereinigen / RegEx-Wäsche):** Wenn Toggle "aus", schneide aus den verbleibenden validen Nachrichten den Metadaten-Block heraus.
    - Entferne Präfix: `\[\[reply_to_current\]\] `
    - Entferne JSON-Blöcke (RegEx): Alle Vorkommen von `Conversation info \(untrusted metadata\):` und `Sender \(untrusted metadata\):` inklusive der darauf folgenden ` ```json ... ``` ` Code-Blöcke komplett aus dem Markdown-String löschen, sodass nur die echte Nutzer-Nachricht (z.B. "Hallo zusammen PING4") übrig bleibt.
- [x] **Sub-Task 6.2: Zod Normalization Layer** (Härtung der Pipeline gegen undefined/null-Crashes).
- [ ] **Sub-Task 6.3: Memory History Hydration (Rosetta Stone)**
  - Implementierung eines Scanners für `/home/claw-agentbox/.openclaw/workspace/memory/*.md`.
  - Abgleich der `agent:main:telegram:group:<ID>` Keys mit den Markdown-Metadaten.
- [ ] **Sub-Task 6.4: TARS Hub Deep-Link Integration**
  - Einbau der direkten Sprungmarken (`:18789/chat?session=...`) in die UI-Kanal-Karten.
- [ ] **Sub-Task 6.5: Atomic Config Persistence (Härtung)**
  - Implementierung des `POST /api/channels/config` Handlers mit automatischem Chokidar-Signal.
- [ ] **Sub-Task 6.6**: **Session Visibility**: Anzeige der `sessionKey` oder eines Parity-Indikators in der UI.
- [x] **Sub-Task 6.7**: Agent Quick-Navigation (Scroll-Into-View).
- [x] **Sub-Task 6.8**: IDE Override Toggle.

## 7. Phase: Model Context Protocol (MCP) Server Integration (IDE Bridge) 🚀
Ziel: Anbindung der IDE (AntiGravity / **Cursor**) an den Channel Manager über einen MCP-Server (stdio), sodass CASE ohne Bot-Tokens in der IDE in den Telegram-Kontext injizieren kann.

- [x] **Sub-Task 7.1: MCP Server Setup (Node.js)**
  - Initialisierung eines dedizierten MCP Servers (`@modelcontextprotocol/sdk`).
  - Standalone **`Backend_MCP/`** mit `package.json`, `npm install`, **`run-mcp.sh`** (SSH-Start von Windows).
  - Tool **`send_telegram_reply`** proxied an **`POST /api/telegram/send`** (body: `chatId`, `text`).
- [x] **Sub-Task 7.2: MCP Resources Injection (Context Hydration)**
  - Erstellen einer Ressource `memory://{telegram_id}`, die das physische Transkript aus `/workspace/memory/*.md` ausliest und AntiGravity zur Verfügung stellt.
  - Erstellen einer Ressource `config://{telegram_id}`, die die erlaubten CASE SKILLS aus dem Channel Manager als YAML/JSON für den System Prompt anbietet.
- [x] **Sub-Task 7.3: MCP Tools (Governance Actions)**
  - Tool: `send_telegram_reply(channel_id, message)`. CASE ruft dieses Tool auf. Der MCP Server leitet den Aufruf an das Channel Manager Backend weiter, welches die Nachricht sicher über das zentrale CASE Bot-Token versendet. Kein Token-Leakage in die IDE.
  - Tool: `change_agent_mode(tars|marvin|sonic)`. CASE kann temporär an eine andere Engine übergeben, wenn in der IDE ein anderer Fokus geboten ist.
- [x] **Sub-Task 7.4: Integration in AntiGravity (`.gemini/antigravity/` config)**
  - Registrierung des MCP Servers in der IDE-Umgebung ("mcp_servers" JSON).
- [x] **Sub-Task 7.5: Cursor & Remote-SSH (Stand 15.04.2026)**
  - **`C:\Users\<User>\.cursor\mcp.json` (Windows):** `openclaw-channel-manager` via `ssh -T laptop … run-mcp.sh`.
  - **`~/.cursor/mcp.json` (Laptop):** gleicher Server-ID mit direktem `/usr/bin/node …/MCP-ChannelManager.mjs` (kein `E:\`).
  - **Projekt**-`.cursor/mcp.json` mit identischer Server-ID entfernt (Doppel-Einträge vermieden).
- [x] **Sub-Task 7.6: CASE-Identität in Cursor (Stand 15.04.2026)**
  - **`~/.openclaw/workspace/.cursor/rules/case-cursor-identity.mdc`** (`alwaysApply: true`) — Session-Start: CASE lesen (`CASE_SOUL.md`), nicht TARS-Stimme für IDE-Aufgaben.
  - **`AGENTS.md`:** Agent-Tabelle CASE → **Cursor IDE**.
  - **`Studio_Framework/.cursor/rules/openclaw-channel-gems-context.mdc`** — Kontext für Edits unter `A075_Channel_Gems/`.

## 8. Phase: Gateway & MCP Port-Stabilisierung (AKTIVE PHASE 🛠️)
Ziel: Behebung von Port-Konflikten (EADDRINUSE) und Stabilisierung der Port-Forwarding Architektur zwischen IDE, Backend und Frontend.

- [x] **Sub-Task 8.1: Port-Standardisierung (Contract Fix)** (Port 3000, 5173, 4260 established via `occ-ctl.mjs` ✅).
- [x] **Sub-Task 8.2: Deep-Clean Zombie-Prozesse** (Automated termination logic implemented in start/stop script ✅).
- [ ] **Sub-Task 8.3: Validierung Test 4** (Sovereign MCP Bridge Verification).
  - Durchführung des Sovereign MCP-Bridge Tests (Send Telegram Reply) nach IDE-Reload.

## 9. Phase: MCP Governance & Whitelisting 🔮
Ziel: Granulare Steuerung (Whitelisting), auf welche in der IDE lokal installierten MCP-Server (z. B. `firecrawl`, `obsidian`, `lexware`) der CASE Agent in einem spezifischen Channel Zugriff hat.

- [ ] **Sub-Task 9.1: Schema-Erweiterung für MCP-Whitelists**
  - Erweiterung des `ChannelConfigSchema` im Backend um ein Feld `allowedMCPs` (z. B. Array of Strings).
- [ ] **Sub-Task 9.2: UI-Integration im Channel Manager**
  - Hinzufügen eines gelb akzentuierten "+ Add MCP" Dropdowns auf Kanalebene (neben oder unter den "Skills").
  - Dynamisches Parsen der lokal in der IDE definierten MCP-Server, um diese im Dropdown zur Verfügung zu stellen.
  - Visuelle Unterscheidung (Farbe, Labeling z. B. "INHERITED BY IDE") der aktivierten MCPs im Channel-Graphen.
- [ ] **Sub-Task 9.3: Policy-Injection via System Prompt**
  - Erweiterung der in Sub-Task 7.2 geschaffenen `config://{telegram_id}` Ressource.
  - Das Backend übergibt der IDE künftig das definierte `allowedMCPs`-Array, wodurch der System Prompt von CASE instruiert wird, in diesem Channel nur dedizierte Server anzusprechen.

## 10. Phase: OpenClaw Control Center Integration 🌌
Ziel: Schaffung eines "Single Point of Entry" zum Starten des Control Centers (Workbench + Channel Manager) und Dokumentation im Studio Framework.

- [x] **Sub-Task 10.1: Zentrale Steuerung (`occ-ctl.mjs`)**
  - Implementierung eines Controller-Scripts im Root der Extension.
  - Funktionen: Port-Check (3000, 4260, 5173), automatische Bereinigung von Zombies, verwalteter Start von Backend/Frontend/Workbench.
- [x] **Sub-Task 10.2: Dokumentation im Studio Framework**
  - Erstellung der [README_OpenClaw_Control_Center.md](file:///media/claw-agentbox/data/9999_LocalRepo/Studio_Framework/100_Framework_Reports_Dokus/README_OpenClaw_Control_Center.md).
  - Definition des Port-Contracts und der Start-Prozedur für TARS/AntiGravity/User.
- [x] **Sub-Task 10.3: Control Center Maintenance Skill**
  - Erstellung des [SKILL_Control_Center_Maintenance.md](file:///media/claw-agentbox/data/9999_LocalRepo/Studio_Framework/015_AgentSkills_Dev/20_Domain_Skills/SKILL_Control_Center_Maintenance.md).
  - Befähigung des Agenten, den Status des Control Centers autonom zu prüfen und ggf. Neustarts anzubieten.

## 11. Phase: Repository Renaming & Path Desensitization (RESEARCH PHASE 🏗️)
Ziel: Umbenennung des Repositories in `OpenClaw_Control_Center` und Ablösung harter Pfad-Abhängigkeiten zur Sicherstellung der Portabilität.

- [ ] **Sub-Task 11.1: Absolute Path Audit (Research Phase B)**
  - Vollständiger Scan der Quellcodes (`.js`, `.mjs`, `.sh`), Konfigs (`.json`) und Umgebungsvariablen (`.env`) nach hartkodierten `/media/claw-agentbox/...` Pfaden.
- [x] **Sub-Task 11.2: MCP Configuration Patching** (Updated `mcp_config.json` to new repo path and fixed typos ✅).
- [ ] **Sub-Task 11.3: ARYS/GILD Metadata Sync**
  - Massen-Update der `git_path` Einträge in den YAML-Headern aller Dokumente im Studio Framework und Extension-Repo.
- [x] **Sub-Task 11.4: Final Execution (Rename & Deployment)** (Directory renamed to `OpenClaw_Control_Center` ✅).
- [x] **Sub-Task 11.5: Ordner `Production_Nodejs_React` (15.04.2026):** Tippfehler `Prodution_Nodejs_React` → **`Production_Nodejs_React`** im Repo bereinigt.

---
*Status: Phasen 1–5 erweitert (5.3 Outbound), Phase 6–8 teilweise, Phase 7 inkl. Cursor/SSH, Phase 10/11 teilweise. Letzte Sync-Doku: 15.04.2026.*
