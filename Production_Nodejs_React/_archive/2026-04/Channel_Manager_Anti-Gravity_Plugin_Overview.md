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
  git_repo: "OpenClaw_Control_Center"
  git_branch: "main"
  git_path: "Production_Nodejs_React/Channel_Manager_Anti-Gravity_Plugin_Overview.md"
tags: [plugins, ide_integration, agentclaw]
tags: [plugins, ide_integration, agentclaw, best_practices, stabilization]
---

# Channel Manager Anti-Gravity Plugin Overview

**Version**: 1.0.0 | **Date**: 12.04.2026 | **Time**: 03:07 | **GlobalID**: 20260412_0307_PLUGIN_OVERVIEW_v1

**Last Updated:** 13.04.2026 18:40  
**Framework:** Horizon Studio Framework  
**Status:** active (Installed & Verified)

**Git:** Repo: OpenClaw_Control_Center | Branch: main | Path: Production_Nodejs_React/Channel_Manager_Anti-Gravity_Plugin_Overview.md | Commit: 05dfe99

**Tag block:**
#plugins #ide_integration #agentclaw #best_practices #stabilization

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

### Status: Installation Abgeschlossen ✅
Das Plugin **AgentClaw** (V3.5.0) wurde erfolgreich aus der VSIX-Datei installiert und ist in der Anti-Gravity IDE aktiv. Die Auto-Accept Logik und der CDP-Zugriff (Port 9222) sind konfiguriert.

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

-----
AgentClaw — OpenClaw for Antigravity | Telegram Discord WhatsApp Slack Signal

Commands
ID	Title	Keyboard Shortcuts	Menu Contexts
antigravityPro.addWorkspace	AGPRO: Add Workspace Folder	commandPalette
antigravityPro.agents	CLAW: Multi-Agent Router	commandPalette
antigravityPro.agignore.reload	AGPRO: Reload .agignore	commandPalette
antigravityPro.analytics.export	AGPRO: Export Analytics	commandPalette
antigravityPro.api.info	CLAW: API Documentation & Key	commandPalette
antigravityPro.api.start	CLAW: Start REST API Server	commandPalette
antigravityPro.api.stop	CLAW: Stop REST API Server	commandPalette
antigravityPro.apitest	CLAW: API Tester (HTTP Client)	commandPalette
antigravityPro.archdiagram	CLAW: Architecture Diagram	commandPalette
antigravityPro.attachFiles	AGPRO: Attach Files to Chat	commandPalette
antigravityPro.audit	AGPRO: Dependency Audit	commandPalette
antigravityPro.auditTrail	AGPRO: View Audit Trail	commandPalette
antigravityPro.autocommit.start	CLAW: Start Auto-Commit	commandPalette
antigravityPro.autocommit.stop	CLAW: Stop Auto-Commit	commandPalette
antigravityPro.autoTest	AGPRO: Auto-Generate Tests	commandPalette
antigravityPro.backup	CLAW: Full Workspace Backup	commandPalette
antigravityPro.backup.full	AGPRO: Full Backup	commandPalette
antigravityPro.backup.incremental	AGPRO: Incremental Backup	commandPalette
antigravityPro.backup.restore	AGPRO: Restore Backup	commandPalette
antigravityPro.backup.search	AGPRO: Search Backups	commandPalette
antigravityPro.base64	CLAW: Base64 Encode/Decode	commandPalette
antigravityPro.batch	CLAW: Batch Process Files	commandPalette
antigravityPro.billing	AGPRO: Cost Estimate	commandPalette
antigravityPro.bisect	CLAW: Git Bisect Helper	commandPalette
antigravityPro.blocklist	AGPRO: Edit Command Blocklist	commandPalette
antigravityPro.branch	AGPRO: Branch Conversation	commandPalette
antigravityPro.branchclean	CLAW: Branch Cleanup	commandPalette
antigravityPro.briefing	CLAW: Send Daily Briefing Now	commandPalette
antigravityPro.calendar	CLAW: Calendar Scheduler	commandPalette
antigravityPro.changelog	CLAW: Changelog Generator	commandPalette
antigravityPro.changelog.view	AGPRO: View Agent Changelog	commandPalette
antigravityPro.changelogGen	AGPRO: Generate CHANGELOG.md	commandPalette
antigravityPro.clipboard	CLAW: Clipboard History	commandPalette
antigravityPro.codegen	CLAW: Code Generation Templates	commandPalette
antigravityPro.codeGenStats	AGPRO: Code Gen Statistics	commandPalette
antigravityPro.commitlint	CLAW: Commit Message Linter	commandPalette
antigravityPro.compact	AGPRO: Compact Context	commandPalette
antigravityPro.complexity	CLAW: Code Complexity Analyzer	commandPalette
antigravityPro.conflicts	CLAW: Merge Conflict Resolver	commandPalette
antigravityPro.context	CLAW: Context Window Optimizer	commandPalette
antigravityPro.context.inject	AGPRO: Smart Context Inject	Ctrl+Shift+Alt+I	commandPalette
antigravityPro.conv.forceReload	AGPRO: Force-Reload Conversations	Ctrl+Shift+Alt+C	commandPalette
antigravityPro.conv.list	AGPRO: List All Conversations	commandPalette
antigravityPro.conv.recover	AGPRO: Full Conversation Recovery	commandPalette
antigravityPro.costs	CLAW: Cost Tracker	commandPalette
antigravityPro.cron.add	AGPRO: Add Cron Job	Ctrl+Shift+Alt+J	commandPalette
antigravityPro.cron.clearHistory	AGPRO: Clear Cron History	commandPalette
antigravityPro.cron.dashboard	AGPRO: Cron Dashboard (OpenClaw Mode)	commandPalette
antigravityPro.cron.edit	AGPRO: Edit/Manage Cron Jobs	commandPalette
antigravityPro.cron.export	CLAW: Export Cron Jobs	commandPalette
antigravityPro.cron.import	AGPRO: Import Cron Jobs	commandPalette
antigravityPro.cron.natural	CLAW: Schedule with Natural Language	commandPalette
antigravityPro.cronexplain	CLAW: Explain Cron Expression	commandPalette
antigravityPro.csvjson	CLAW: CSV ↔ JSON Converter	commandPalette
antigravityPro.daemon	CLAW: Background Daemon	commandPalette
antigravityPro.dashboard	AGPRO: Open Dashboard	Ctrl+Shift+Alt+L	commandPalette
antigravityPro.deadcode	CLAW: Dead Code Finder	commandPalette
antigravityPro.delegate	CLAW: Agent Delegation	commandPalette
antigravityPro.depaudit	CLAW: Deep Dependency Audit	commandPalette
antigravityPro.depgraph	CLAW: Dependency Graph	commandPalette
antigravityPro.deploy	CLAW: Deployment Manager	commandPalette
antigravityPro.diff	CLAW: Git Diff Viewer	commandPalette
antigravityPro.diff.highlight	AGPRO: Highlight Recent Changes	commandPalette
antigravityPro.diff.summary	AGPRO: Workspace Diff Summary	commandPalette
antigravityPro.diffOutputs	AGPRO: Diff Agent Outputs	commandPalette
antigravityPro.digest	CLAW: Daily Digest	commandPalette
antigravityPro.dns	CLAW: DNS Lookup	commandPalette
antigravityPro.docker	CLAW: Docker Helper	commandPalette
antigravityPro.dupes	CLAW: Duplicate Code Finder	commandPalette
antigravityPro.email.configure	CLAW: Configure Email (SMTP)	commandPalette
antigravityPro.email.send	CLAW: Send Email	commandPalette
antigravityPro.env	CLAW: Environment Variables	commandPalette
antigravityPro.envdiff	CLAW: Env Diff	commandPalette
antigravityPro.evolve	CLAW: Capability Evolver	commandPalette
antigravityPro.explainError	AGPRO: Explain Errors	commandPalette
antigravityPro.export	AGPRO: Export Conversation	commandPalette
antigravityPro.export	CLAW: Export Session Report	commandPalette
antigravityPro.filesize	CLAW: File Size Analyzer	commandPalette
antigravityPro.flags	CLAW: Feature Flags	commandPalette
antigravityPro.focus	CLAW: Toggle Focus Mode	commandPalette
antigravityPro.focusGuard.toggle	AGPRO: Toggle Focus Guard	commandPalette
antigravityPro.format.toggle	AGPRO: Toggle Auto-Format	commandPalette
antigravityPro.git.checkpoint	AGPRO: Git Checkpoint	Ctrl+Shift+Alt+G	commandPalette
antigravityPro.git.rollback	AGPRO: Git Rollback	commandPalette
antigravityPro.gitanalytics	CLAW: Git Analytics	commandPalette
antigravityPro.github	CLAW: GitHub Integration	commandPalette
antigravityPro.gpuInfo	AGPRO: GPU Rendering Info	commandPalette
antigravityPro.handoff	CLAW: Agent Handoff	commandPalette
antigravityPro.hash	CLAW: Hash Generator (MD5/SHA)	commandPalette
antigravityPro.headers	CLAW: HTTP Header Inspector	commandPalette
antigravityPro.health	AGPRO: Workspace Health Check	commandPalette
antigravityPro.healthcheck	CLAW: Health Check Dashboard	commandPalette
antigravityPro.heatmap	AGPRO: Activity Heatmap	commandPalette
antigravityPro.inbox	CLAW: Inbox Zero Agent	commandPalette
antigravityPro.incident	CLAW: Incident Tracker	commandPalette
antigravityPro.inlineReview	AGPRO: Inline Code Review	commandPalette
antigravityPro.isolate	CLAW: Isolated Workspace	commandPalette
antigravityPro.json	CLAW: JSON Formatter	commandPalette
antigravityPro.kanban	CLAW: Kanban Board	commandPalette
antigravityPro.keepalive	CLAW: Toggle KeepAlive Heartbeat	commandPalette
antigravityPro.learn	CLAW: Learning Log	commandPalette
antigravityPro.loganalyzer	CLAW: Log Pattern Analyzer	commandPalette
antigravityPro.logs	CLAW: Live Log Viewer	commandPalette
antigravityPro.lorem	CLAW: Lorem Ipsum Generator	commandPalette
antigravityPro.macro.play	AGPRO: Play Macro	commandPalette
antigravityPro.macro.record	AGPRO: Toggle Macro Recording	commandPalette
antigravityPro.mdstats	CLAW: Markdown Stats	commandPalette
antigravityPro.memory.add	AGPRO: Add Agent Memory	commandPalette
antigravityPro.memory.clear	AGPRO: Clear Agent Memory	commandPalette
antigravityPro.memory.view	AGPRO: View Agent Memory	commandPalette
antigravityPro.metrics	CLAW: Code Metrics Dashboard	commandPalette
antigravityPro.mockdata	CLAW: Mock Data Generator	commandPalette
antigravityPro.mode.switch	AGPRO: Switch Mode (Ask/Code/Architect/Debug)	Ctrl+Shift+Alt+M	commandPalette
antigravityPro.modelInfo	AGPRO: Model Fallback Info	commandPalette
antigravityPro.monitor	CLAW: Add Proactive Monitor	commandPalette
antigravityPro.msg.broadcast	CLAW: Broadcast to All Channels	commandPalette
antigravityPro.msg.configure	CLAW: Configure Messaging (Telegram/Discord/Slack/WhatsApp/Signal)	commandPalette
antigravityPro.msg.discord.start	CLAW: Start Discord Bot	commandPalette
antigravityPro.msg.discord.stop	CLAW: Stop Discord Bot	commandPalette
antigravityPro.msg.signal.start	CLAW: Start Signal Bridge	commandPalette
antigravityPro.msg.signal.stop	CLAW: Stop Signal Bridge	commandPalette
antigravityPro.msg.slack.start	CLAW: Start Slack Bot	commandPalette
antigravityPro.msg.slack.stop	CLAW: Stop Slack Bot	commandPalette
antigravityPro.msg.status	CLAW: Messaging Status Dashboard	commandPalette
antigravityPro.msg.telegram.start	CLAW: Start Telegram Bot	commandPalette
antigravityPro.msg.telegram.stop	CLAW: Stop Telegram Bot	commandPalette
antigravityPro.msg.whatsapp.start	CLAW: Start WhatsApp Bridge	commandPalette
antigravityPro.msg.whatsapp.stop	CLAW: Stop WhatsApp Bridge	commandPalette
antigravityPro.n8n	CLAW: n8n Workflow Trigger	commandPalette
antigravityPro.network	CLAW: Network Info	commandPalette
antigravityPro.notes	CLAW: Quick Notes	commandPalette
antigravityPro.notifications	CLAW: Notification Center	commandPalette
antigravityPro.pair	CLAW: Pair Programming Mode	commandPalette
antigravityPro.pause	AGPRO: Pause/Resume Agent	Ctrl+Shift+Alt+P	commandPalette
antigravityPro.perf	CLAW: Performance Profiler	commandPalette
antigravityPro.persona	CLAW: Switch Agent Persona	commandPalette
antigravityPro.personality	AGPRO: Set Agent Personality	commandPalette
antigravityPro.pin	CLAW: Pin Context for Agent	commandPalette
antigravityPro.pin.inject	CLAW: Inject Pinned Context	commandPalette
antigravityPro.pipeline.create	CLAW: Create Agent Pipeline	commandPalette
antigravityPro.pipeline.run	CLAW: Run Agent Pipeline	commandPalette
antigravityPro.pomodoro.start	CLAW: Start Pomodoro Timer	commandPalette
antigravityPro.pomodoro.stop	CLAW: Stop Pomodoro Timer	commandPalette
antigravityPro.ports	CLAW: Port Scanner	commandPalette
antigravityPro.postmortem	CLAW: Post-Mortem Generator	commandPalette
antigravityPro.prdesc	CLAW: Auto PR Description	commandPalette
antigravityPro.prGen	AGPRO: Generate PR Description	commandPalette
antigravityPro.processes	CLAW: Process Manager	commandPalette
antigravityPro.prompts	CLAW: Prompt Library	commandPalette
antigravityPro.prompts.add	AGPRO: Add Prompt Template	commandPalette
antigravityPro.prompts.insert	AGPRO: Insert Prompt Template	commandPalette
antigravityPro.puppeteer.forceInject	AGPRO: Force-Inject browser_subagent Rule	commandPalette
antigravityPro.puppeteer.toggle	AGPRO: Toggle Puppeteer Blocker (Force browser_subagent)	Ctrl+Shift+Alt+B	commandPalette
antigravityPro.queue	CLAW: Message Queue	commandPalette
antigravityPro.quickActions	CLAW: ⚡ Quick Actions	commandPalette
antigravityPro.quota	AGPRO: Show Quota Usage	commandPalette
antigravityPro.ralphLoop.configure	AGPRO: Add Ralph Message	commandPalette
antigravityPro.ralphLoop.start	AGPRO: Start Ralph Loop	Ctrl+Shift+Alt+R	commandPalette
antigravityPro.ralphLoop.stop	AGPRO: Stop Ralph Loop	commandPalette
antigravityPro.refactor	CLAW: Refactor Suggestions	commandPalette
antigravityPro.regex	CLAW: Regex Tester	commandPalette
antigravityPro.releasenotes	CLAW: Auto Release Notes	commandPalette
antigravityPro.replay	AGPRO: Replay Session	commandPalette
antigravityPro.responselog	CLAW: Log Agent Response	commandPalette
antigravityPro.retro	CLAW: Retrospective Facilitator	commandPalette
antigravityPro.review	AGPRO: Code Review Mode	commandPalette
antigravityPro.rules.inject	AGPRO: Inject Coding Rules	commandPalette
antigravityPro.runbook	CLAW: Runbook Manager	commandPalette
antigravityPro.sandboxInfo	AGPRO: Sandbox Info	commandPalette
antigravityPro.scaffold	CLAW: Scaffold New Project	commandPalette
antigravityPro.schedule	AGPRO: Schedule Task	commandPalette
antigravityPro.scrape	CLAW: Web Scraping Agent	commandPalette
antigravityPro.search	CLAW: Smart Search Everything	commandPalette
antigravityPro.secaudit	CLAW: Security Audit	commandPalette
antigravityPro.selfHeal	AGPRO: Self-Heal Errors	Ctrl+Shift+Alt+H	commandPalette
antigravityPro.session.reset	AGPRO: Reset Session	commandPalette
antigravityPro.sessionCompare	AGPRO: Compare Sessions	commandPalette
antigravityPro.settings.export	AGPRO: Export Settings	commandPalette
antigravityPro.settings.import	AGPRO: Import Settings	commandPalette
antigravityPro.skills	AGPRO: Skill Marketplace	commandPalette
antigravityPro.skills	CLAW: Skills Marketplace	Ctrl+Shift+Alt+K	commandPalette
antigravityPro.snapshot.create	AGPRO: Create Snapshot	commandPalette
antigravityPro.snapshot.rollback	AGPRO: Rollback Snapshot	commandPalette
antigravityPro.snippets	CLAW: Snippet Manager	commandPalette
antigravityPro.sounds.toggle	AGPRO: Toggle Sounds	commandPalette
antigravityPro.ssl	CLAW: SSL Certificate Checker	commandPalette
antigravityPro.standup	CLAW: Standup Generator	commandPalette
antigravityPro.stash	CLAW: Git Stash Manager	commandPalette
antigravityPro.steer	AGPRO: Steer Agent (Real-time)	Ctrl+Shift+Alt+S	commandPalette
antigravityPro.sysmon	CLAW: System Resource Monitor	commandPalette
antigravityPro.taskQueue.add	AGPRO: Add to Task Queue	commandPalette
antigravityPro.taskQueue.clear	AGPRO: Clear Task Queue	commandPalette
antigravityPro.taskQueue.run	AGPRO: Run Task Queue	commandPalette
antigravityPro.teamShare	AGPRO: Share Macros to Team	commandPalette
antigravityPro.techdebt	CLAW: Tech Debt Tracker	commandPalette
antigravityPro.telemetry	AGPRO: Telemetry Info	commandPalette
antigravityPro.temporal.start	AGPRO: Start Temporal Snapshots	commandPalette
antigravityPro.temporal.stop	AGPRO: Stop Temporal Snapshots	commandPalette
antigravityPro.terminal	CLAW: Capture Terminal Output	commandPalette
antigravityPro.timestamp	CLAW: Timestamp Converter	commandPalette
antigravityPro.todo	AGPRO: Implement TODO Comment	commandPalette
antigravityPro.todos	CLAW: TODO Scanner	commandPalette
antigravityPro.toggle	CLAW: Toggle Auto-Accept	Ctrl+Shift+Alt+A	commandPalette
antigravityPro.tokens	CLAW: Token Counter	commandPalette
antigravityPro.tokens.show	AGPRO: Show Token Usage	commandPalette
antigravityPro.uptime	CLAW: Uptime Monitor	commandPalette
antigravityPro.uuid	CLAW: UUID Generator	commandPalette
antigravityPro.vault	CLAW: Credential Vault	commandPalette
antigravityPro.versionInfo	AGPRO: Version Info	commandPalette
antigravityPro.voice	AGPRO: Voice Command	commandPalette
antigravityPro.voice	CLAW: Voice Command	commandPalette
antigravityPro.watch	CLAW: Add File Watcher	commandPalette
antigravityPro.webhook.add	CLAW: Add Webhook Endpoint	commandPalette
antigravityPro.workspace.switch	CLAW: Switch Workspace	commandPalette
antigravityPro.zombies	AGPRO: Cleanup Zombie Processes	commandPalette
