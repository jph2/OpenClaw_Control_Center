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
last_modified: "2026-04-17T23:30:00Z"
author: "AntiGravity"
provenance:
  git_repo: "OpenClaw_Control_Center"
  git_branch: "main"
  git_path: "Production_Nodejs_React/CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md"
tags: [implementation, channel_manager, telegram-hub, zod, private-ecosystem]
---

# Implementierungsplan: Centralized Channel Manager (V1.3)

**Release**: V1.8 | **Status**: Phase 6 & 8 (teilweise), MCP/Cursor operational | **Focus**: Rosetta-Sync, Gateway-Delivery, IDE-MCP, TTG bulk UI & Sub-Agent-CRUD, Integrations-Roadmap
**GlobalID**: 20260417_1800_IMPLEMENTATION_v1.8

**Last Updated:** 17.04.2026 (Sprint: Doku §3.6 / §12 — Backend↔OpenClaw↔IDE, TTG-Validierung; UI: zwei `<tr>` pro Zeile, Bulk nur „Manage Channels“, 1010px + Scroll)  
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
- [x] **Sub-Task 2.3: Workspace Skills Registry (Filesystem → Channel Manager)** (15.04.2026)  
  - **Spec:** [CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md](CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md).  
  - **Backend:** `scanWorkspaceSkillsCatalog()` lädt `OPENCLAW_WORKSPACE/skills/<id>/SKILL.md`, merged mit `BUNDLED_SKILL_CATALOG` in `GET /api/channels` → `metadata.skills`.  
  - **Live:** Chokidar auf dem Skills-Baum feuert bei `SKILL.md`-Änderungen dasselbe SSE wie Channel-Config (`CONFIG_UPDATED`).  
  - **Frontend:** unverändert außer bestehendem `src: workspace` / Workbench-Pfad (bereits unterstützt).  
  - **Follow-up (UX):** Sub-Task **6.11** (Phase 6) — Filter, Sortierung, Reihenfolge; Spec: [CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md](CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md).

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
- [ ] **Sub-Task 6.9: Native Chat — Bilder & Medien (Upcoming, nicht implementiert)**  
  **Geplant, nicht in Arbeit:** End-to-End für Bilder aus dem Channel Manager (Paste/Drop, Upload, Telegram-Zustellung).  
  - **Backend:** Neuer Endpoint oder Erweiterung von `POST /api/telegram/send` um multipart/Base64; ggf. Telegram Bot API `sendPhoto` oder OpenClaw-CLI sobald Medien offiziell unterstützt werden.  
  - **Frontend:** Vorschau, Fortschritt, Fehler; Entfernen des reinen „nicht unterstützt“-Hinweises zugunsten echter Übertragung.  
  - **Spec:** §6.3 in `CHANNEL_MANAGER_SPECIFICATION.md`.  
  **Bis dahin:** Nur Text; UI-Hinweis bei Bild-Paste bleibt.

- [x] **Sub-Task 6.10: IDE project summary Tab + Studio A070 (MVP)** — **teilweise / Phase 1 live (16.04.2026)**  
  **Verbindlich:** [CHANNEL_MANAGER_SCOPE_MVP_2026-04-15.md](CHANNEL_MANAGER_SCOPE_MVP_2026-04-15.md), [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3, [README_A070_IDE_Summaries.md](../../Studio_Framework/050_Artifacts/A070_ide_cursor_summaries/README_A070_IDE_Summaries.md).  
  - **Frontend (done):** Dritter **Zeilen-Sub-Tab** **„TARS in IDE · IDE project summary“** (`IdeProjectSummaryPanel`); **OpenClaw Chat**-Label für den Gateway-SSE-Spiegel; Panel listet & rendert Markdown aus A070 via **`/api/ide-project-summaries`** (Alias **`/api/summaries`**).  
  - **Backend (done MVP):** `GET /api/summaries`, `GET /api/summaries/file` (read-only, `STUDIO_FRAMEWORK_ROOT` / Default `WORKSPACE_ROOT/Studio_Framework`).  
  - **Offen (6.10b):** Schreiben neuer Summary-MD aus dem UI, Promotion nach OpenClaw `memory/` — weiterhin Follow-up.  
  - **Pipeline IDE → A070:** unverändert Skill/Cron-seitig; A070 bleibt kanonische Studio-Landing-Zone.

- [x] **Sub-Agent-Zeilen pro `(subId, skillId)` + Hauptagent-Zeilen ohne globales Dedupe (16.04.2026)**  
  Mehrere Zeilen für dieselbe Skill-ID, wenn mehrere Träger; `ChannelManagerChannelRow.jsx` Merge + stabile `key`-Zeilen. Spec §3.2c.

- [ ] **Future (Backlog): Hauptagent-Flag „darf Sub-Agents / Zusatz-Agenten dynamisch starten“**  
  Abhängigkeit: Harness/OpenClaw-Semantik; Schema + API + Exporte; Spec §3.2e.

- [ ] **Future (nicht umgesetzt): Triad-Gewichtung im Kanal-UI**  
  Drei Schieberegler (TARS / MARVIN / CASE / …) mit Summe 100 %, Injection in Prompts; **kein** Kanal-Dropdown für Engine — siehe [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.2b.

- [x] **Sub-Task 6.12: Kanonisches Config-Modell + Dual-Export (16.04.2026)**  
  - **Discovery:** [CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md); **Master-Doku** [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) §2.9.  
  - **Code:** `backend/services/ideConfigBridge.js` — `buildCanonicalSnapshot`, `buildOpenClawProjection`, `buildIdeWorkbenchBundle`, `buildCursorProjection` (Legacy-Wrapper).  
  - **API:** `GET /api/exports/canonical|openclaw|ide|cursor` (read-only JSON, **kein** automatisches Überschreiben von `openclaw.json`).  
  - **Rationale:** Channel Manager JSON allein reicht nicht für IDE-Dateibaum (`.cursor/agents`, Rules, MCP); Zwischenschicht liefert **projizierbare** Ziele.

- [x] **Sub-Task 6.13: Cursor Subagents Spiegel (Studio repo) (16.04.2026)**  
  - **`Studio_Framework/.cursor/agents/*.md`** für researcher, documenter, coder, reviewer, tester — inhaltlich an CM-Subagents gebunden (siehe Dateien).  
  - **Hinweis:** Vollständige „Übernahme“ Skills/Rules bleibt 6.11 / MCP / zukünftige Sync-Skripte.

- [x] **Sub-Task 6.14: Workbench multi-root + Deep-Link-Zuverlässigkeit + Skill-Herkunft-UX (16.04.2026)**  
  - **Backend:** `resolveWorkbenchPath` / `getWorkbenchAllowedRoots` — `WORKSPACE_ROOT` plus optionale Roots (`WORKBENCH_EXTRA_ROOTS`, gebündelte OpenClaw-Skills unter `~/.npm-global/...`, User-`homedir()`, optional `/` via `WORKBENCH_ALLOW_FS_ROOT`); alle `/api/workbench/*`-Routen umgestellt; `.env.example` dokumentiert.  
  - **Frontend Workbench:** `normalizeWorkbenchDir('/')`; `applyWorkbenchSearchParams` nach `persist.onFinishHydration` + SPA; Quick-Buttons Home / data / FS-Root; persist-Version 2.  
  - **Channel Manager:** effektive Skill-Liste **Kanal → Sub-Agents → Hauptagent**, damit Duplikat-IDs die **Sub-Agent-Quelle** zeigen; Badge **Inherited from {Name} · sub-agent**.  
  - **Doku/Spec:** [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) §2.10, [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.2c / R6.

- [ ] **Sub-Task 6.11: Skills-Tab — Filter, Sortierung, Reihenfolge, Suche**  
  **Spec:** [CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md](CHANNEL_MANAGER_SKILLS_REGISTRY_SPEC.md) § *Filtering, ordering, and display (planned)*.  
  - **Filter:** Kategorie (`cat`), optional nach Quelle (`src`: bundled / managed / workspace), Volltext über ID + Beschreibung (+ optional `origin`); Toggle „nur DEFAULT“ (`def`).  
  - **Sortierung:** Name A–Z/Z–A, Kategorie, Quelle; optional „zuletzt geändert“, wenn Backend `mtime` von `SKILL.md` mitliefert.  
  - **Eigene Reihenfolge:** persistente ID-Liste (Drag-and-Drop oder Hoch/Runter), Merge-Regel für neu hinzugekommene Skills; „Zurück auf alphabetisch“. Speicherort: Top-Level in `channel_config.json` oder Sidecar `channel_manager_ui.json` (Implementierungsentscheid).  
  - **Technik:** Filter/Sort primär clientseitig aus `metadata.skills`; Persistenz lesen/schreiben über bestehende Config-API oder kleinen UI-Settings-Endpunkt.  
  - **SSE:** bei Registry-Update benutzerdefinierte Reihenfolge bereinigen (unbekannte IDs entfernen).  
  - **Extras (optional):** gespeicherte Filter-Presets; Gruppierung einklappbar nach Kategorie.

- [x] **Sub-Task 6.15: TTG-Benennung, Bulk-Zeilenhöhen, Sub-Agent Create/Delete, Dev-Resilienz (16.–17.04.2026)**  
  - **Spec:** [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.5, §3.6.  
  - **Frontend — Header:** **CSS-Grid** (`minmax(0,auto) | minmax(0,1fr) | auto` wenn Tab Kanäle, sonst zwei Spalten); vier zentrale Buttons (**Collapse all**, **Configure all**, **Open Claw Chat all**, **TARS in IDE, all**) mit `className="header-actions"` — **horizontal**, nur wenn `activeTab === 'channels'`. **Toolbar** unter dem Header (Select All, Bulk-Model, Bulk-Skill) nur in `renderManageChannels()` — damit ebenfalls nur auf **Manage Channels**.  
  - **Frontend — Zeile:** Zwei `<tr>` pro Kanal (`React.Fragment`): Hauptzeile (Checkbox, TTG, Workspace) + **Footer-`<tr>`** (`colSpan={3}`) mit **Open** / **Collapse** und **Resize-Handle**. Konstanten `ROW_HEIGHT_COLLAPSED` (**260**), `ROW_HEIGHT_EXPANDED` (**1010**). **Open:** nur diese Zeile expandieren, dann Footer mit `scrollIntoView({ block: 'end', behavior: 'smooth' })` (nach Layout). **Collapse** pro Zeile: Höhe 260px, Zeilen-Sub-Tab **`config`** (wie **Collapse all**). **Collapse all** setzt **alle** Zeilen-Sub-Tabs auf **`config`**.  
  - **Anzeige:** `formatTtgChannelName` (`TG`+Ziffer → `TTG`+Ziffer); Tabellenkopf **TTG (Telegram Topic Group)**.  
  - **Backend:** `POST /api/channels/createSubAgent`, `POST /api/channels/deleteSubAgent` (inkl. Bereinigung `inactiveSubAgents`); siehe `backend/routes/channels.js`.  
  - **Agents-UI:** Modal „Sub-Agent anlegen“, Destroy-**X** pro Sub-Agent-Karte.  
  - **Dev UX:** React Query Retry/Backoff für `GET /api/channels`; `TelegramChat.jsx` — SSE-Reconnect-Backoff, gedrosselte `console.warn`-Häufigkeit.

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
  - Tool: `change_agent_mode(tars|marvin|case)` (**SONIC → case**, siehe `README_Studio_Framework.md` Unified Agent Identity). Temporär andere Engine zuweisen, wenn in der IDE ein anderer Fokus geboten ist.
- [x] **Sub-Task 7.4: Integration in AntiGravity (`.gemini/antigravity/` config)**
  - Registrierung des MCP Servers in der IDE-Umgebung ("mcp_servers" JSON).
- [x] **Sub-Task 7.5: Cursor & Remote-SSH (Stand 15.04.2026)**
  - **`C:\Users\<User>\.cursor\mcp.json` (Windows):** `openclaw-channel-manager` via `ssh -T laptop … run-mcp.sh`.
  - **`~/.cursor/mcp.json` (Laptop):** gleicher Server-ID mit direktem `/usr/bin/node …/MCP-ChannelManager.mjs` (kein `E:\`).
  - **Projekt**-`.cursor/mcp.json` mit identischer Server-ID entfernt (Doppel-Einträge vermieden).
- [x] **Sub-Task 7.6: Harness / IDE context in Cursor (Stand 15.04.2026, renamed 15.04.2026)**
  - **`~/.openclaw/workspace/.cursor/rules/openclaw-workspace-context.mdc`** (`alwaysApply: true`) — points agents to **`AGENTS.md`** + **`SOUL.md`** (triad; not CASE-only). Legacy: `case-cursor-identity.mdc`.
  - **`~/.cursor/rules/openclaw-harness-hint.mdc`** — global short reminder; canonical: workspace files. Legacy: `case-global-identity.mdc`.
  - **`AGENTS.md`:** Harness personas; IDE uses TARS by default; CASE_SOUL deprecated.
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

## 12. Nächste Schritte: Integration Backend ↔ OpenClaw ↔ IDE & TTG-Durchsetzung (17.04.2026)

**Kontext:** Channel-Manager-UI (Konfiguration, Chat, Summary, Bulk, Sub-Agente) ist **implementiert**; Fokus: **Laufzeit-Parity**, **Export/IDE-Pfade**, **durchsetzbare** TTG-Namensregeln.

| Priorität | Thema | Kurzbeschreibung |
|-----------|--------|------------------|
| **P1** | **Gateway / OpenClaw-Parity** | `channel_config.json` und tatsächliches Gateway-Verhalten abstimmen; keine stillen Abweichungen. |
| **P1** | **IDE-Exports & Verifikation** | `ideConfigBridge`, `/api/exports/*`, `/api/ide-project-summaries` in wiederholbare Workflows; **Sub-Task 8.3** (MCP Sovereign Test) abschließen. |
| **P2** | **Rosetta / Session** | Offene Punkte aus früheren Sub-Tasks (Memory-/Session-Parity), falls noch nicht erledigt. |
| **P2** | **TTG-Präfix `TTG000`** | **Backend-Validierung** (Zod) bei Create/Rename; ergänzend **Workspace-Skill** + **Cursor Rule** — **nicht** als einzige Absicherung. |

**Ausführung (Stand 17.04.2026):**

- [x] **§12 / P2 — TTG-Präfix (Backend):** `backend/utils/ttgChannelNameValidation.js` — bei **`CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES=1`** (`true`/`yes`) müssen alle **persistierten** Kanalnamen mit `TTG` + drei Ziffern beginnen; **Import/Config** und **POST `/api/channels/update`** (inkl. optionales Feld **`name`**, Default für neue Zeile **`TTG000 group <channelId>`** im Strict-Modus). **Standard:** Env unset → keine Namenspflicht (Legacy). Tests: `backend/test/ttg-channel-name-validation.test.js`.
- [ ] **§12 / P2 — Skill + Cursor Rule:** Workspace-Skill / `.mdc` als Ergänzung zur API-Validierung (noch offen).
- [ ] **§12 / P1 — MCP 8.3:** manuell: IDE neu laden, **Send Telegram Reply** über MCP → `/api/telegram/send` verifizieren.
- [ ] **§12 / P1 — Gateway-Parity:** Abgleich geschriebener Felder mit OpenClaw-Schema (z. B. bekannte Sync-Skips im Code prüfen); ggf. separates Audit-Issue.
- [x] **§12 / P1 — Chat-Spiegel vs. OpenClaw Web (Webchat-Metadaten):** Gateway-Bridge hat JSONL-Zeilen bisher nur zugeordnet, wenn User-Payload **`Conversation info` + `chat_id`** enthielt. **Webchat/OpenClaw-Control-UI** sendet oft nur **`Sender (untrusted metadata)`** ohne Telegram-ID — dann blieb der Puffer leer. **Fix:** `sessions.json` laden/beobachten (`sessionId` → Key `agent:main:telegram:group:<id>`), Zuordnung pro Session-Datei; Env **`OPENCLAW_SESSIONS_JSON_PATH`** optional. Implementierung: `backend/services/telegramService.js` (`hydrateOpenclawSessionIndex`).
- [ ] **§12 / P1 — Parity: CM „OpenClaw Chat“ = OpenClaw-UI-Stream:** **Spec:** [CHANNEL_MANAGER_SPECIFICATION.md §3.4](CHANNEL_MANAGER_SPECIFICATION.md) — **Option A** (Session-Stream, nicht nur Telegram-Filter). Folgearbeit: Backend-Buffer/SSE strikt an **dieselbe Session-JSONL** koppeln, die die UI nutzt; ggf. Restpuffer-Bereinigung, wenn noch „Telegram-only“-Pfad von Session-Realität abweicht.

**Referenz:** [CHANNEL_MANAGER_SPECIFICATION.md §3.6](CHANNEL_MANAGER_SPECIFICATION.md), [CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md).

---
*Status: Phasen 1–5 erweitert (5.3 Outbound), Phase 6–8 teilweise (6.10/6.12/6.13/**6.14**/**6.15** Sprint 16.–17.04.2026), Phase 7 inkl. Cursor/SSH, Phase 10/11 teilweise. Sub-Task 6.9 Medien = Roadmap. §12 = Integrations-Backlog.*
