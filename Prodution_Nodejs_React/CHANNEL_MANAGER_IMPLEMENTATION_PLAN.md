---
arys_schema_version: "1.3"
id: "8c35d9a2-9b16-43e4-84fa-9f8d6de412a1"
title: "Implementierungsplan: Centralized Channel Manager"
type: PRACTICAL
status: active
trust_level: 2
agent_index:
  context: "Phased implementation plan for refactoring the Channel Manager to a Telegram Hub."
  maturation: 2
  routing:
    phase1: "#1-phase-daten-integritat"
    phase3: "#3-phase-direct-telegram-conversation-stream"
created: "2026-04-12T01:07:00Z"
last_modified: "2026-04-12T01:07:00Z"
author: "TARS"
provenance:
  git_repo: "Openclaw-OpenUSDGoodtstart-Extension"
  git_branch: "main"
  git_path: "Prodution_Nodejs_React/CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md"
tags: [implementation, channel_manager, execution]
---

# Implementierungsplan: Centralized Channel Manager (Phase 4)

**Version**: 1.0.0 | **Date**: 12.04.2026 | **Time**: 03:07 | **GlobalID**: 20260412_0307_IMPLEMENTATION_v1

**Last Updated:** 12.04.2026 03:07  
**Framework:** Horizon Studio Framework  
**Status:** active

**Git:** Repo: Openclaw-OpenUSDGoodtstart-Extension | Branch: main | Path: Prodution_Nodejs_React/CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md | Commit: pending

**Tag block:**
#implementation #channel_manager #execution

---

Dieser Plan beschreibt die technischen Schritte zur Umsetzung der [Spezifikation](file:///media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension/Prodution_Nodejs_React/CHANNEL_MANAGER_SPECIFICATION.md).

## 1. Phase: Daten-Integrität & Backend-Fokus (Medium)
Ziel: Alle statischen Listen im Frontend durch dynamische Daten aus dem Backend/Repository ersetzen.

- [x] **Sub-Task 1.1**: Refactoring `ChannelManager.jsx`. Entfernen der hardcoded `AVAILABLE_MODELS`, `SKILL_METADATA` und `MAIN_AGENTS`.
- [x] **Sub-Task 1.2**: Erweitern des Backend-Endpoints `/api/channels`. Das Backend muss diese Metadaten aus der `openclaw.json` und dem Skill-Verzeichnis aggregieren und liefern.
- [x] **Sub-Task 1.3**: Validierung der Zod-Schemas im Backend für die neuen Metadaten-Felder.
- [x] **Sub-Task 1.4**: *(Marvin's Audit Mitigation)* Implementierung eines `chokidar` File-Watchers im Node.js Backend, um Änderungen der JSON-Config sofort als Hot-Reload-Signal an die UIs zu pushen (verhindert JSON-Desync).
- [x] **Sub-Task 1.5**: *(Marvin's Audit Mitigation)* Durchsetzung der "Domain-Driven File Ownership" im Express-Backend: Konfigurations-Endpunkte erhalten uneingeschränkte POST-Rechte für JSONs (`openclaw.json`), während Endpunkte für Laufzeit/Speicher-Daten (`*.memory.md`) konsequent auf GET (Read-Only) limitiert werden. File-Locks entfallen.

## 2. Phase: Skill-Synchronisation ("Marvin"-Sync) (Medium)
Ziel: Das "Forge ↔ Runtime" Protokoll stabilisieren.

- [x] **Sub-Task 2.1**: Fix der `sync_skills.py` (Typo `md5`, Pfad-Checks).
- [x] **Sub-Task 2.2**: Implementierung des bi-direktionalen "Hegel-Syncs":
    - Pull von Runtime-Verbesserungen in die Forge.
    - Push von Architektur-Härtungen in die Runtime.
- [x] **Sub-Task 2.3**: Initialer Full-Sync Audit-Report erstellen.

## 3. Phase: Direct Telegram Conversation Stream (Hard)
Ziel: Eliminierung des Iframes im Channel Manager. Der Channel Manager loggt sich direkt in Telegram ein, um Nachrichten zu empfangen.

- [x] **Sub-Task 3.1**: Telegram-Backend-Service via Telegraf (Setup & Webhook/Polling Bypass).
- [x] **Sub-Task 3.2**: SSE-Stream (Server-Sent Events) Architektur im Node-Backend bereitstellen.
- [x] **Sub-Task 3.3**: Bau der nativen React-Chat-Komponente `TelegramChat.jsx` inkl. SSE Consume.

## 4. Phase: Native Multi-Bot Identity Flow (Recommended)
Ziel: Das Web-Interface nutzt einen dedizierten, zweiten Bot-Token (`Shedly_BTF`), um als eigenständiger Akteur in der Telegram-Gruppe aufzutreten. Dies trennt die Identitäten von Nutzer-Eingaben und KI-Antworten (TARS) auf robuste, rein API-basierte Weise.

- [x] **Sub-Task 4.1**: `.env` Update. Hinzufügen von `SHEDLY_BOT_TOKEN` (bzw. `RELAY_BOT_TOKEN`) neben dem etablierten TARS-Token.
- [x] **Sub-Task 4.2**: Refactoring `telegramService.js`: Sende-Ausgang (`sendMessageToChat`) so umschreiben, dass er eine separate Telegraf-Instanz nutzt (authentifiziert mit dem Relay-Token), während der Empfänger-Stream auf dem TARS-Token bleibt.
- [x] **Sub-Task 4.3**: Erstellung des "CASE" Bots (Shedly Architecture) über `@BotFather` und Hinzufügen des Bots als Admin in die Zielgruppen.
- [x] **Sub-Task 4.4**: Verifizierung der OpenClaw Engine Antwort-Logik auf Relay-Nachrichten.

## 5. Phase: UI-Polishing & Persistence (Easy)
Ziel: Bedienkomfort verbessern und Architektur-Lecks schließen.

- [ ] **Sub-Task 5.1**: LocalStorage Integration für `rowHeights`, sodass Resizing über Sessions hinweg erhalten bleibt.
- [ ] **Sub-Task 5.2**: Einbindung echter Agenten- und Model-Listen anstelle von Fallbacks für den Bulk-Edit Dialog.
- [ ] **Sub-Task 4.3**: **Header-Actions Integration**: Implementierung der Logik für Export, Import, Reload und Save Buttons (Frontend/Backend).
- [ ] **Sub-Task 4.4**: **Backend-Härtung (Audit Fix)**: Refactoring der Zod-Schemas zur Vermeidung des `null` vs `undefined` Crashes (Anti-Pattern 1).
- [x] **Sub-Task 4.5**: **Agent Quick-Navigation**: Klickbare Agenten- und Subagenten-Links im Manage Channels Tab, die direkt in den Agents-Tab zum jeweiligen Agenten springen (Scroll-Into-View).
- [x] **Sub-Task 4.6**: **IDE Override Toggle**: Prominenter Schalter in der Channel-Konfiguration, der definiert, ob die Anti-Gravity IDE das Channel-Modell überschreiben darf. Dies muss im Backend-Zod-Schema (`ideOverride`) verankert werden.

---

## 6. Phase: Native IDE Telegram Integration (Anti-Gravity) (Future Scope)
Ziel: Vollständige Integration des Telegram-Nachrichtenflusses direkt in die IDE, um den "rechten Pfeil" der dezentralen Architektur abzubilden.

- [ ] **Sub-Task 5.1**: Evaluierung der bestehenden Open VSX Extensions (`AgentClaw`, `Antigravity Storage Manager`, `antigravity-telegram-control`) als technische Eintrittspunkte. Insbesondere die Nutzung von CDP (Chrome DevTools Protocol über Port 9222) aus `telegram-control` bietet die perfekte Blaupause zur Fernsteuerung des Agent-Webviews.
- [ ] **Sub-Task 5.2**: Integration des `botToken` und der Channel-Configs in die IDE-Umgebung (Speicherung lokal in `~/.antigravity-pro/` / `.gemini`).
- [ ] **Sub-Task 5.3**: Aufbau des Chat-Panels und Status-Bar Indikatoren in der Workbench, die sich nahtlos mit den generierten Konfigurationen des Channel Managers synchronisieren.

---
*Status: Phasen 1-4 abgeschlossen. Aktueller Fokus: Phase 5 (UI-Polishing & Persistence).*
