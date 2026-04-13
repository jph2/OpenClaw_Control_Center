---
arys_schema_version: "1.3"
id: "a14352f8-8bb3-41a3-8fc7-829d5b5a8e23"
title: "Channel Manager Anti-Gravity Plugin Overview"
type: REFERENCE
status: active
trust_level: 2
agent_index:
  context: "Overview of IDE plugins relevant for Phase 5 Telegram IDE Integration."
  maturation: 1
  routing:
    agentclaw: "#3-agentclaw"
created: "2026-04-12T01:07:00Z"
last_modified: "2026-04-12T01:07:00Z"
author: "TARS"
provenance:
  git_repo: "Openclaw-OpenUSDGoodtstart-Extension"
  git_branch: "main"
  git_path: "Prodution_Nodejs_React/Channel_Manager_Anti-Gravity_Plugin_Overview.md"
tags: [plugins, ide_integration, agentclaw]
---

# Channel Manager Anti-Gravity Plugin Overview

**Version**: 1.0.0 | **Date**: 12.04.2026 | **Time**: 03:07 | **GlobalID**: 20260412_0307_PLUGIN_OVERVIEW_v1

**Last Updated:** 12.04.2026 03:07  
**Framework:** Horizon Studio Framework  
**Status:** active

**Git:** Repo: Openclaw-OpenUSDGoodtstart-Extension | Branch: main | Path: Prodution_Nodejs_React/Channel_Manager_Anti-Gravity_Plugin_Overview.md | Commit: pending

**Tag block:**
#plugins #ide_integration #agentclaw

---

Dieses Dokument dient als zentrale Wissensbasis für die Evaluierung von Anti-Gravity IDE-Erweiterungen (Plugins), die für **Phase 5** (Native IDE Telegram Integration) unseres Implementierungsplans relevant sind. Alle hier gelisteten Plugins operieren lokal und bieten Lösungsansätze, um Telegram und Chat-Protokolle direkt in die IDE zu integrieren.

---

## 1. Antigravity Storage Manager
**Identifier:** `unchase.antigravity-storage-manager`  
**Downloads:** ~20.000  

### Übersicht
Unified AI Gateway mit visuellem Dashboard, sicherem Google Drive Sync, **Telegram Bot Benachrichtigungen**, Multi-Account Profilen, Echtzeit-Quota-Überwachung, Proxy-Unterstützung, MCP Server und erweiterten Backup-Tools. 

### Relevante Konfigurationen (Settings)
- `antigravity-storage-manager.telegram.botToken`: Telegram Bot Token für Benachrichtigungen
- `antigravity-storage-manager.telegram.userIds` / `.usernames`: Zugriffssteuerung
- `antigravity-storage-manager.telegram.statsIntervalCron`: Intervall für Stats
- `antigravity-storage-manager.sync.localPath`: Lokaler Speicherpfad (`~/.antigravity-pro`)
- `antigravity-storage-manager.backup.path`: Backup Verzeichnis
- `antigravity-storage-manager.profilesDirectory`: Profil-Management

### Wichtige Befehle (Commands)
- `antigravity.command.export` / `.import`: Ex- und Import von Daten
- `antigravity.command.syncNow` / `.forceSync`: Trigger für Synchronisation
- `antigravity.command.backupAll` / `.triggerBackup`: Backup Funktionen
- `antigravity.command.openCurrentConversation`: Aktiven Chat-Verlauf öffnen
- `antigravity.command.proxy.start` / `.stop`: Proxy-Steuerung

---

## 2. Antigravity Telegram Control
**Identifier:** `acmatvjrus.antigravity-telegram-control`  

### Übersicht
Ermöglicht die Fernsteuerung und Überwachung des Antigravity IDE Agents über Telegram. 
Nutzt **CDP (Chrome DevTools Protocol)** über Port 9222 (Start via `code --remote-debugging-port=9222`), um tief in die Webviews der IDE einzudringen, das Shadow DOM auszulesen und Eingaben (`/ask`) oder Screenshots zu tätigen. Beinhaltet integrierte Editoren für `agents.md` und `gemini.md`.

### Telegram Slash-Commands (Fernsteuerung)
- `/ask <text>`: Sendet eine Anfrage an den Agent in der IDE.
- `/screenshot`: Macht einen präzisen Screenshot der Agent-Session im VS Code.
- `/alarm`: Benachrichtigung, sobald der Agent fertig ist (Auto-Finish Detection).
- `/stop`: Bricht die laufende Agenten-Generierung ab.
- `/cmd <cmd>`: Führt Shell-Commands im aktiven VS Code Terminal aus.
- `/check`: Prüft den Status.

### Relevante Konfigurationen (Settings)
- `antigravityTelegramControl.botToken`: Telegram Bot Token
- `antigravityTelegramControl.allowedChatId`: Sicherheit - nur autorisierter Chat erlaubt
- `antigravityTelegramControl.debuggingPort`: Standard `9222` (zwingend für CDP-Zugriff)
- `antigravityTelegramControl.agentsMsPath` / `.geminiMdPath`: Pfade zur Agenten-Konfiguration

### Wichtige Befehle (Commands)
- `antigravity-telegram-control.openSettings`: Settings UI öffnen
- `antigravity-telegram-control.registerCommands`: Slash Commands bei BotFather registrieren
- `antigravity-telegram-control.startBot` / `.stopBot`: Bot Listener aktivieren

---

## 3. AgentClaw — OpenClaw for Antigravity
**Identifier:** `TureAutoAcceptAntiGravity.agentclaw`  
**Open VSX Store:** [https://open-vsx.org/extension/TureAutoAcceptAntiGravity/agentclaw](https://open-vsx.org/extension/TureAutoAcceptAntiGravity/agentclaw)
*(Hinweis: Bislang konnte kein öffentliches GitHub-Repository ("Gittert") für dieses Plugin ausfindig gemacht werden. Der Quellcode ist daher vorerst nur über das .vsix-Release aus dem Store extrahierbar).*

### Übersicht
*"The Ultimate OpenClaw Alternative for Antigravity IDE"*. Bringt über 215 Features direkt in die IDE. Darunter Auto-Accept, Multi-Agent Routing, Skills Marketplace, Cron Jobs sowie vollständige **Telegram / Discord / Slack / WhatsApp / Signal Bot Integrationen**. 
**Alle Daten werden strikt lokal unter `~/.antiggravity-pro/` gespeichert (Zero Telemetry, Zero Cloud).**

> [!NOTE]
> **Zwei-Bot-Relay (Update):** Um Bot-zu-Bot Blockaden in Telegram zu umgehen, nutzt AgentClaw ab Phase 5 die **TARS/CASE Architektur**: TARS empfängt und antwortet, während die IDE Nachrichten via **CASE (Relay Bot)** einsteuert.

### Kernfunktionen & Features (Auszug)
- **Core Controls:** Auto-Accept (CDP Engine auto-clicks), Ralph Loops (Auto-continue), Operation Modes (Ask/Code/Architect/Debug).
- **Messaging Channels:** Dedizierte Bots für Telegram, Discord, Slack. Broadcast an alle Channel.
- **Agent Intelligence:** Multi-Agent Router, Pair Programming TDD Modes, Context Optimizer, Smart Context Injection.
- **Projekt & Automatisierung:** Cron Jobs, Agent Pipelines, Kanban Board, Incident Tracker.
- **Mechaniken:** Nutzt `.agignore` (Excludes) und `.agpro-rules` (Project Rules).

### Relevante Konfigurationen (Settings)
- `antigravityPro.enabled`: Aktiviert die Auto-Accept Engine (Default: `true`)
- `antigravityPro.pollIntervalMs`: CDP Poll Interval (Default: `1000`)
- `antigravityPro.ralphLoop.intervalMs`: Ralph Loop Timer (Default: `15000`)
- `antigravityPro.ralphLoop.messages`: vordefinierte Prompts wie "Keep going.", "Continue."
- `antigravityPro.tokenBudget`: Token Budget Limit (Default: `0` = unlimited)
- `antigravityPro.puppeteerBlocker.enabled`: Forciert `browser_subagent` anstelle von Puppeteer (Default: `false`)

### Bekannte Keyboard-Shortcuts (Auszug)
| Action | Command ID | Shortcut |
|--------|------------|----------|
| Toggle Auto-Accept | `antigravityPro.toggle` | `Ctrl+Alt+Shift+A` |
| Start/Stop Ralph Loop | `antigravityPro.ralphLoop.start` | `Ctrl+Alt+Shift+R` |
| Switch Mode | `antigravityPro.mode.switch` | `Ctrl+Alt+Shift+M` |
| Steer Agent | `antigravityPro.steer` | `Ctrl+Alt+Shift+S` |
| Pause/Resume Agent | `antigravityPro.pause` | `Ctrl+Alt+Shift+P` |
| Skill Marketplace | `antigravityPro.skills` | `Ctrl+Alt+Shift+K` |
| Git Checkpoint | `antigravityPro.git.checkpoint` | `Ctrl+Alt+Shift+G` |
| Self-Heal Errors | `antigravityPro.selfHeal` | `Ctrl+Alt+Shift+H` |

---

### Schritt 1: 
Das Plugin in Anti-Gravity installieren
Öffne deine Anti-Gravity IDE.
Drücke Strg + Shift + P (Command Palette).
Tippe „VSIX“ ein und wähle die Option: Extensions: Install from VSIX... (Erweiterungen: Aus VSIX installieren...).
Navigiere in dem sich öffnenden Fenster in deinen Downloads-Ordner zu exakt diesem Pfad: C:\Users\jan\Downloads\TureAutoAcceptAntiGravity.agentclaw-3.5.0.vsix
Klicke auf "Installieren". Meistens fordert dich die IDE danach auf, das Fenster neu zu laden ("Reload required"). Tu das.

### Schritt 2: 
Die Auto-Accept Logik aktivieren
Gehe in die Settings (Einstellungen) von Anti-Gravity (Strg + ,).
Suche nach antigravityPro.enabled und stelle sicher, dass dort ein Häkchen gesetzt ist / auf true steht.
Stell sicher, dass du Anti-Gravity im Debug-Modus gestartet hast (das geht in VS Code basierten IDEs meist über ein Startskript oder indem du --remote-debugging-port=9222 angehängt hast), damit AgentClaw das Shadow DOM lesen kann. Oft macht die IDE oder das Plugin das aber auch intern von selbst, wenn CDP aktiviert ist.

### Schritt 3: 
CASE (Den Relay-Bot) verbinden
Nachdem das Plugin installiert ist, müssen wir nun dem Plugin mitteilen, auf welchen Bot es als "Sprachrohr" hören soll:
<!--  -->
Drücke wieder Strg + Shift + P.
Tippe den Start-Befehl für Telegram ein. Aus unserer Übersichts-Tabelle ist das der Command: > AgentClaw: Start Telegram Bot (im Hintergrund entspricht das antigravityPro.msg.telegram.start).
Die Extension wird dich nun sehr wahrscheinlich in einem Prompt nach dem Telegram Bot Token fragen.
Füge hier den Token von CASE (deinem Relay-Bot) ein: 8263821319:AAEhCKcjFZZgEAbG-M7_10DibvOu7RfNyhQ (Dein Token aus den Logs).
Bestätige ggf. noch die Chat-ID, in der der Bot funken darf (z.B. die ID vom General Chat oder Idea Capture).
Das war's! Ab jetzt lauscht das Plugin auf Telegram und spiegelt die Konversation live über den CDP zwischen deiner IDE und deiner Telegram-Gruppe!

Gib Bescheid, sobald du die VSIX-Datei installiert hast oder falls du den Telegram-Start-Command nicht direkt in der Palette findest.


<details>
<summary>📂 Gesamte Liste der AgentClaw Commands (130+) einblenden</summary>

*Zur Veranschaulichung der Komplexität ist hier die vollständige Liste der Commands aufgeführt:*

- **Messaging & Bots:** `antigravityPro.msg.telegram.start`, `.msg.discord.start`, `.msg.slack.start`, `.msg.whatsapp.start`, `.msg.broadcast`
- **Automation & Cron:** `antigravityPro.cron.add`, `.cron.dashboard`, `.cron.natural`, `.daemon`, `.n8n`
- **Analytics & Code Metrics:** `antigravityPro.complexity`, `.depgraph`, `.metrics`, `.mdstats`, `.secaudit`
- **Git & Diff:** `antigravityPro.bisect`, `.branchclean`, `.changelogGen`, `.diff.summary`, `.prGen`
- **Agent Memory & Context:** `antigravityPro.memory.add`, `.context.inject`, `.compact`, `.pin.inject`
- **IDE & System Tools:** `antigravityPro.docker`, `.processes`, `.network`, `.ports`, `.zombies`, `.ssl`
- **Web & API:** `antigravityPro.api.start`, `.apitest`, `.scrape`, `.webhook.add`
- **Dev Tools:** `antigravityPro.base64`, `.json`, `.hash`, `.regex`, `.uuid`, `.timestamp`
- **Project Board:** `antigravityPro.kanban`, `.incident`, `.standup`, `.retro`, `.techdebt`



</details>
