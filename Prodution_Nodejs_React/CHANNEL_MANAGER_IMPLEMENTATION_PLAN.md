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
last_modified: "2026-04-14T17:15:00Z"
author: "AntiGravity"
provenance:
  git_repo: "Openclaw-OpenUSDGoodtstart-Extension"
  git_branch: "main"
  git_path: "Prodution_Nodejs_React/CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md"
tags: [implementation, channel_manager, telegram-hub, zod, private-ecosystem]
---

# Implementierungsplan: Centralized Channel Manager (V1.3)

**Release**: V1.4 | **Status**: Research-Complete / Phase 5 In-Progress | **Focus**: Rosetta-Sync & Context Continuity
**GlobalID**: 20260413_2050_IMPLEMENTATION_v1.3

**Last Updated:** 14.04.2026 17:15  
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

## 6. Phase: UI-Polishing, Persistence & Unified Brain (AKTIVE PHASE 🏗️)
Ziel: Bedienkomfort verbessern, Architektur-Lecks schließen und Wissens-Kontinuität sicherstellen.

- [x] **Sub-Task 6.0: AgentClaw IDE Integration** (VSIX Installation & CDP-Relay Aktivierung abgeschlossen ✅).

- [ ] **Sub-Task 6.1: Message-Filter Layer (System/Heartbeat Toggle)**
  - Implementierung eines UI-Toggles an zentraler Stelle im UI: `[ ] Show System/Agent Internal Tasks`.
  - **Funktion 1 (Ganze Nachrichten blocken):** Wenn Toggle "aus", droppe alle Nachrichten, die exakt "HEARTBEAT_OK" enthalten oder mit "Read HEARTBEAT.md" beginnen.
  - **Funktion 2 (Text bereinigen / RegEx-Wäsche):** Wenn Toggle "aus", schneide aus den verbleibenden validen Nachrichten den Metadaten-Block heraus.
    - Entferne Präfix: `\[\[reply_to_current\]\] `
    - Entferne JSON-Blöcke (RegEx): Alle Vorkommen von `Conversation info \(untrusted metadata\):` und `Sender \(untrusted metadata\):` inklusive der darauf folgenden ` ```json ... ``` ` Code-Blöcke komplett aus dem Markdown-String löschen, sodass nur die echte Nutzer-Nachricht (z.B. "Hallo zusammen PING4") übrig bleibt.
- [ ] **Sub-Task 6.2: Zod Normalization Layer** (Härtung der Pipeline gegen undefined/null-Crashes).
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

## 7. Phase: Model Context Protocol (MCP) Server Integration (Anti-Gravity Bridge) 🚀
Ziel: Anbindung von AntiGravity an den Channel Manager über einen lokalen MCP Server, sodass CASE (AntiGravity) vollkommen autonom und ohne eigene Tokens in den Telegram-Gruppen agieren kann.

- [x] **Sub-Task 7.1: MCP Server Setup (Node.js)**
  - Initialisierung eines dedizierten MCP Servers (`@modelcontextprotocol/sdk`).
  - Integration als Modul im bestehenden `backend/`-Verzeichnis oder standalone Prozess.
- [x] **Sub-Task 7.2: MCP Resources Injection (Context Hydration)**
  - Erstellen einer Ressource `memory://{telegram_id}`, die das physische Transkript aus `/workspace/memory/*.md` ausliest und AntiGravity zur Verfügung stellt.
  - Erstellen einer Ressource `config://{telegram_id}`, die die erlaubten CASE SKILLS aus dem Channel Manager als YAML/JSON für den System Prompt anbietet.
- [x] **Sub-Task 7.3: MCP Tools (Governance Actions)**
  - Tool: `send_telegram_reply(channel_id, message)`. CASE ruft dieses Tool auf. Der MCP Server leitet den Aufruf an das Channel Manager Backend weiter, welches die Nachricht sicher über das zentrale CASE Bot-Token versendet. Kein Token-Leakage in die IDE.
  - Tool: `change_agent_mode(tars|marvin|sonic)`. CASE kann temporär an eine andere Engine übergeben, wenn in der IDE ein anderer Fokus geboten ist.
- [x] **Sub-Task 7.4: Integration in AntiGravity (`.gemini/antigravity/` config)**
  - Registrierung des MCP Servers in der IDE-Umgebung ("mcp_servers" JSON).

## 8. Phase: Gateway & MCP Port-Stabilisierung (AKTIVE PHASE 🛠️)
Ziel: Behebung von Port-Konflikten (EADDRINUSE) und Stabilisierung der Port-Forwarding Architektur zwischen IDE, Backend und Frontend.

- [ ] **Sub-Task 8.1: Port-Standardisierung (Contract Fix)**
  - Festlegen fester Ports: **3000** für das Backend (wie vom User präferiert), **5173** für Vite, **4260** für die Workbench.
  - Update der `MCP-ChannelManager.mjs` auf den finalen Backend-Port.
- [ ] **Sub-Task 8.2: Deep-Clean Zombie-Prozesse**
  - Bereinigen aller verwaisten Node/Vite Prozesse auf 13.04/14.04-Basis.
  - Skript-basierte Prüfung der Port-Belegung vor dem Start.
- [ ] **Sub-Task 8.3: Validierung Test 4**
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

---
*Status: Phasen 1-7 abgeschlossen. Phase 8 (Stabilisierung) und Phase 10 (OpenClaw Control Center) aktuell in Arbeit.*
