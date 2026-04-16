---
arys_schema_version: "1.3"
id: "6a2f3b9c-d1e8-4b72-9c1a-0f3d4e5a6b7c"
title: "OpenClaw Channel Manager: Master Documentation & Evolution"
type: DOCUMENTATION
status: active
trust_level: 3
agent_index:
  context: "Consolidated Master Documentation (10.04. - 14.04.2026) covering Architecture, Stabilization, und Private Ecosystem Governance."
  maturation: 4
  routing:
    history: "#1-architektur-evolution--refactoring-history"
    stabilization: "#2-stabilisierungs-meilensteine-14042026"
    anti_patterns: "#anti-patterns--architektonische-fallstricke"
created: "2026-04-13T20:45:00Z"
last_modified: "2026-04-17T18:00:00Z"
author: "AntiGravity"
provenance:
  git_repo: "OpenClaw_Control_Center"
  git_branch: "main"
  git_path: "Production_Nodejs_React/CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md"
tags: [master-docs, architecture, zod, telegram-hub, private-ecosystem, anti-patterns, mcp]
---





# OpenClaw Channel Manager: Master Documentation

**Version**: 2.7.0 | **Date**: 17.04.2026 | **Time**: 18:00 | **GlobalID**: 20260417_1800_MASTER_DOC_v2.7

**Status:** active | **Source Registry:** Consolidated from Docs 10.04., 14.04., **15.04.** & **16.–17.04.2026** (IDE bridge, TARS-only Kanal-UI, IDE-Projekt-Summary-API, **Workbench multi-root**, **Skill-Herkunft-Labels**, **TTG bulk actions**, **Sub-Agent create/delete**, **Dev-Resilienz**, **Integrations-Roadmap §3.6 / §2.12**).

---

## 1. Architektur-Evolution & Refactoring History

Diese Sektion dokumentiert den Weg von einer instabilen Iframe-Lösung hin zu einem souveränen React-Hub.

### 1.1 Der "Fehlstart" (Anfang April 2026)
In der frühen Phase lag der Fokus zu stark auf dem Backend, während das Frontend als generischer "Placeholder" vernachlässigt wurde. Dies führte zum Verlust von Kern-Logik (Agent-Zuweisungen, Modell-Spezifikationen).
- **Lösung:** Rapid-Recovery Iteration mit Fokus auf das **Manage Channels Dashboard** und die **Skills Library**.

### 1.2 Der "Sovereign Configuration Hub" Meilenstein
Evakuierung aller Konfigurationen aus dem Frontend in ein gehärtetes Express-Backend (`/api/channels`). 
- **Pattern:** Headless Metadata Aggregation. Das UI ist nun konfigurations-agnostisch und reagiert dynamisch auf das Backend.

### 1.3 Private Ecosystem & Unified Brain (Aktueller Stand)
Der finale Durchbruch: Die Erkenntnis, dass TARS (Web/Chat) und CASE (IDE) keine isolierten Entitäten sind, sondern innerhalb deines **privaten Ökosystems** agieren.
- **Unified Brain Policy:** TARS und CASE teilen sich denselben Workspace (`MEMORY.md`), um volle Wissens-Kontinuität zwischen Chat und Code sicherzustellen.

---

## 2. Stabilisierungs-Meilensteine (13.04.2026)

### 2.1 Zod 4 Runtime Härtung
Aufgrund von Inkompatibilitäten der Version `zod@4.3.6` mit `undefined`-Werten wurde eine **Normalisierungs-Schicht** im Backend implementiert. 
- **Zustand:** Alle Arrays (`agents`, `subAgents`, `skills`) werden vor der Validierung zwingend initialisiert.

### 2.2 Local Gateway Injection (Bypassing Telegram Bot Filters)
Zuvor wurde versucht, UI-Eingaben über einen dedizierten Relay-Bot (CASE) an Telegram zu senden. 
- **Problem:** TARS (selbst ein Bot) ignoriert architektur-bedingt alle eingehenden Telegram-Nachrichten von anderen Bots. Das Interface war somit "stumm".
- **Lösung:** Das Backend umgeht Telegram vollständig und injiziert UI-Eingaben nun direkt via lokaler CLI (`openclaw agent --to <chat_id> --message <text>`) in die laufende TARS-Session. TARS betrachtet diese Eingaben nativ als "Human in the loop".

### 2.2b OpenClaw Schema Protection (JSON Recovery)
Beim Speichern von UI-Configs hat das Backend unerlaubte Eigenschaften (`model`) in die `openclaw.json` geschrieben. Das führte zu einem Fatal Crash der Engine (`must NOT have additional properties`). 
- **Fix:** Die Synchronisierung in die kritische Engine-JSON wurde ausgebaut (siehe `routes/channels.js`). Das System nutzt nun strikt die eigene `channel_config.json` für UI-Einstellungen, um OpenClaw nicht zu korrumpieren.

### 2.3 Gateway-First Architektur (Der finale Shift)
Um die HTTP 409 Fehler endgültig zu eliminieren, wurde das Polling im lokalen Backend komplett deaktiviert.
- **Source of Truth:** Das physische Transkript im OpenClaw Workspace.
- **Mechanismus:** Ein FS-Scanner (Chokidar) überwacht die Session-Files und streamt diese per SSE direkt an das React-Frontend. Das System agiert als reiner **Mirror** des Gateways.

### 2.4 UI Parity & CASE Visual Alignment (14.04.2026)
Um CASE als First-Class-Citizen abzubilden, wurde das Channel Manager UI refactored:
- **Horizontal Alignment:** Die Tabellen-Struktur von `ChannelManager.jsx` wurde über Flexbox-Modifikatoren so konfiguriert (`marginTop: 'auto'`), dass die dynamischen Telegram-Bots (links) immer exakt horizontal mit den "CASE SKILLS" Konfigurationsblöcken (rechts) korrelieren.
- **Workbench Access:** Die Skill-Buttons wurden entsperrt, sodass auch `bundled` Skills (wie Clawflow und Skill-Creator) per UI für die Editierung in einer Workbench getriggered werden können.

### 2.5 Model Context Protocol (MCP) Integration Decision (14.04.2026)
Es wurde final beschlossen, den Channel Manager um einen **Sovereign MCP Server** zu erweitern, anstatt auf ACP (Agent Communication Protocol) zu setzen.
- **Begründung:** MCP ist präzise darauf ausgelegt, IDEs (wie AntiGravity) direkten Kontext und freigegebene Tools zur Verfügung zu stellen. 
- **Nutzen:** AntiGravity (als Frontend-Model) kann den MCP Server kontaktieren, liest über ihn das Memory-Transcript aus `/workspace/memory/` sowie die erlaubten Channel-Skills, und hydratisiert so den System-Prompt von CASE komplett autonom.

### 2.6 Gateway-Zustellung & MCP-Betrieb (15.04.2026)

**Outbound (Channel Manager → OpenClaw → Telegram):**  
`sendMessageToChat` nutzt `openclaw agent --channel telegram --to "<id>" --message "…" --deliver`. Ohne **`--deliver`** liefert die CLI zwar oft Exit 0, die **Antwort** wird aber nicht zuverlässig an den Kanal zurückgespielt (Default in der OpenClaw-CLI: `deliver false`). Zusätzlich: Message-Buffer im Backend wird für den Kanal-Key angelegt, damit SSE nicht „stumm“ bleibt.

**MCP `Backend_MCP/`:**  
- `package.json` + `@modelcontextprotocol/sdk`, **`run-mcp.sh`** für stdio-Stable-Start unter SSH.  
- Tool **`send_telegram_reply`** → **`POST /api/telegram/send`** (Felder `chatId`, `text`).

**Cursor: Windows vs. Remote-SSH:**  
- **Windows-User:** `C:\Users\<User>\.cursor\mcp.json` — `openclaw-channel-manager` z. B. `ssh -T laptop … run-mcp.sh`.  
- **Laptop (SSH):** `~/.cursor/mcp.json` — derselbe Server mit **Linux-Pfaden** (`/usr/bin/node`, `/media/.../MCP-ChannelManager.mjs`). **Nicht** die Windows-`mcp.json` 1:1 kopieren (`E:\`, `cmd` funktionieren auf dem Remote nicht).  
- **Doppel-Einträge:** Projekt-`.cursor/mcp.json` im Repo mit gleicher Server-ID wie User-Datei entfernt (nur eine Quelle pro ID).

**Repo:** Verzeichnis **`Production_Nodejs_React/`** (Schreibweise korrigiert; früher `Prodution_*`).

### 2.7 Harness / IDE-Kontext in Cursor (15.04.2026, Regelnamen 15.04. aktualisiert)

- **`AGENTS.md`** / **`SOUL.md`** im OpenClaw-Workspace: Triade **TARS · MARVIN · CASE** (SONIC → CASE); IDE primär **TARS**, Personas wechselbar. **`CASE_SOUL.md`** deprecated (Pointer).
- **Cursor Rule (workspace, immer aktiv):** `~/.openclaw/workspace/.cursor/rules/openclaw-workspace-context.mdc` (`alwaysApply: true`) — Verweis auf die Kanon-Dateien oben. (Alt: `case-cursor-identity.mdc`.)
- **Cursor Rule (global):** `~/.cursor/rules/openclaw-harness-hint.mdc` — kurzer Hinweis; Kanon bleibt `AGENTS.md`/`SOUL.md`. (Alt: `case-global-identity.mdc`.)
- **Studio_Framework:** `Studio_Framework/.cursor/rules/openclaw-channel-gems-context.mdc` — bei Edits in **`A075_Channel_Gems/**` Alignment mit Control-Center-Specs und Harness-Kontext.

### 2.8 Native Chat: Bilder & Medien — Roadmap (15.04.2026)

**Status:** *Upcoming* — bewusst **nicht** implementiert im aktuellen Release.

| Referenz | Inhalt |
|----------|--------|
| **Spec §6.3** | `CHANNEL_MANAGER_SPECIFICATION.md` — Ist-Zustand (nur Text-Outbound), Zielbild (multipart/`sendPhoto` o. ä.), UI-Paste/Drop. |
| **Plan Sub-Task 6.9** | `CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md` — Backend-/Frontend-Arbeiten als Checkbox offen. |
| **Bis zur Umsetzung** | Channel Manager bleibt **textorientiert**; Fotos primär in **Telegram nativ**; UI zeigt bei Bild-Paste nur einen Hinweis. |

### 2.9 IDE-Bridge, IDE-Projekt-Summary & Kanal-UI (16.04.2026)

**IDE Bridge (Discovery & Code):**  
Die Datei **[CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md)** beschreibt die **Projektion** von `channel_config.json` auf OpenClaw- vs. IDE-Artefakte. Im Backend existieren `ideConfigBridge.js`, Read-Only **`GET /api/exports/canonical`**, **`/openclaw`**, **`/ide`** (primär, `kind: ide_workbench_bundle`) sowie **`/cursor`** (Legacy-Alias, `kind: cursor_bundle`). Das Export-Skript `scripts/export-cursor-bundle.mjs` zieht **`/api/exports/ide`** mit Fallback auf **`/cursor`** und materialisiert Dateien unter einem **explizit angegebenen** Zielpfad.

**IDE-Projekt-Summary (tool-agnostisch):**  
Statt nur „Cursor“ im Namen: **`GET/POST /api/ide-project-summaries`** (Router identisch mit **`/api/summaries`**) — Studio-Pfad **`A070_ide_cursor_summaries`**, optional OpenClaw-**`memory/`** read-only. Dritter Zeilen-Tab: **„TARS in IDE · IDE project summary“** (`IdeProjectSummaryPanel`).

**TARS-only auf Kanal-Ebene (MVP-UI):**  
Das Dropdown **TARS / MARVIN / CASE** pro Kanal wurde **entfernt**. Die Harness-Triade bleibt in **SOUL / Konversation / zukünftigen Prompt-Injections**; im Channel Manager gilt **TARS als einzige sichtbare Engine-Zeile** für die Kanal-Konfiguration. **Future Feature (Spezifikation):** z. B. drei Gewichtungen (TARS / MARVIN / CASE) auf 100 %, die in Prompts injiziert werden — **nicht** im aktuellen UI.

**Labels & Layout:**  
- **„ACTIVE MEMBERS“** → **„Sub-agents“** (Checkboxen für Subagenten unter TARS).  
- **„TARS in IDE“** (Relay-Skills, Datenfelder `caseSkills` / `inactiveCaseSkills` in `channel_config.json`): **„CASE-Engine“** im UI-Sinne = **nicht** die Auswahl eines anderen Kanal-Engines, sondern **technischer** Verweis auf die **Relay-Skill-Liste**, die historisch aus der **CASE**-Skill-Defaults-Kette gespeist wird; **MARVIN/CASE** als **Personas** sind **nicht** Kanal-Dropdowns.  
- Linker **„TARS in IDE“**-Block: zusätzlich **Sub-agents**-Zeile (gleiche Toggles wie oben), damit die IDE-Spur dieselben Subagenten sieht.  
- **Skill-Namen:** fett (**`.skill-name`**, `font-weight: 700`); **Dropdowns** nur **Skill-ID** mit **`title`** = Beschreibung (Tooltip).  
- **Available Skills:** Filterzeile **ohne** erzwogene horizontale Scrollbar (`flex-wrap`, `max-width: 100%`).

**Bots:** Platzhaltertext „No autonomous…“ entfernt; **getrennte** horizontale Linie links/rechts synchron (Trennung Hauptbereich / TARS-in-IDE-Block) mit `ResizeObserver`.

### 2.10 Workbench (Dateizugriff) & Skill-Deep-Links (16.04.2026)

**Problem (behoben):** Die Workbench-API nutzte nur `WORKSPACE_ROOT`; **absolute** Pfade (z. B. gebündelte OpenClaw-Skills unter `~/.npm-global/.../openclaw/skills/...`) liefen auf **403**. Zusätzlich überschrieb **Zustand persist** (`workbench-storage`) nach dem Laden die Query-Parameter **`?path=`** / **`?file=`** — **„EDIT in Workbench ➔“** im neuen Tab öffnete den Skill-Pfad nicht zuverlässig.

**Backend (`backend/utils/security.js`, `routes/workbench.js`):**
- **`getWorkbenchAllowedRoots()`** / **`resolveWorkbenchPath()`** — erlaubte Wurzeln: `WORKSPACE_ROOT`, optional **`WORKBENCH_EXTRA_ROOTS`** (kommasepariert), automatisch **`~/.npm-global/lib/node_modules/openclaw/skills`** wenn vorhanden (abschaltbar: `WORKBENCH_DISABLE_BUNDLED_SKILLS_ROOT`), **`homedir()`** für User-Home (abschaltbar: `WORKBENCH_DISABLE_HOME_ROOT`), optional **`/`** mit **`WORKBENCH_ALLOW_FS_ROOT=1`**.
- Alle Workbench-Routen (tree, file, save, …) nutzen **`resolveWorkbenchPath`** statt nur `resolveSafe(WORKSPACE_ROOT, …)`.

**Frontend (`Workbench.jsx`):**
- **`normalizeWorkbenchDir`:** **`/`** bleibt Root (kein stilles Mapping auf Default-Workspace).
- **`applyWorkbenchSearchParams`** — URL nach **`persist.onFinishHydration`** und bei SPA-Navigation; Root **`/`** setzt kein fiktives **`/SKILL.md`**.
- Quick-Buttons: **Home (user)** (`USER_HOME_FALLBACK`), **Drive: data**, **Filesystem root (/)** (mit Hinweis auf Backend-Env).

**Channel Manager — Skills-Liste (Konfiguration):**
- Zusammenführung der Skills im Konfigurationstab: **Kanal** (ein Eintrag pro ID), dann **jede (Sub-Agent × Skill)-Paarung**, dann **jeder Hauptagent-Default** — **mehrere Zeilen** mit derselben Skill-ID möglich, jeweils mit Badge/Toggle für die konkrete Quelle (Spec §3.2c).
- Badge-Text für Sub-Agent-Skills: **Inherited from {Sub-Agent-Name} · sub-agent** (Name aus `backendSubAgents`, nicht nur „INHERITED BY AGENT“).

**Siehe:** `backend/.env.example`; Tests `backend/test/security.test.js` (Workbench-Pfadregeln).

**Skills vs. OpenClaw-Subagents (Begriffe):** [CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md](CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md) — Research-Notiz: Lebenszyklus Studio ↔ Workspace, Import-Button (= Kanal-Config), externe Quellen (Doku, Issue #27038, Blog).

### 2.11 TTG-Bulk-Aktionen, Sub-Agent-CRUD, Anzeige-Namen & Dev-UX (17.04.2026)

**Verbindlich:** [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) **§3.5**; Umsetzung: [CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md](CHANNEL_MANAGER_IMPLEMENTATION_PLAN.md) **Sub-Task 6.15**.

**Header — vier Convenience-Buttons (Mitte):**  
Im **sticky Header** ist die Mitte eine **Grid-Spalte** zwischen Navigation (links) und Export/Import/Reload/Save (rechts). Vier Buttons — **Collapse all**, **Configure all**, **Open Claw Chat all**, **TARS in IDE, all** — nutzen dieselbe **header-actions**-Stilistik wie die rechten Aktionen und bleiben **in einer Zeile** (`flex-wrap: nowrap` im Mittelblock; bei Bedarf **horizontal scroll** statt vertikalem Stack).

**Header-Mitte (nur Tab „Manage Channels“):**  
Die vier **Convenience**-Buttons — **Collapse all**, **Configure all**, **Open Claw Chat all**, **TARS in IDE, all** — liegen im **sticky Header** in der mittleren Grid-Spalte. Sie werden **nur gerendert**, wenn `activeTab === 'channels'`; auf **Agents** und **Skills** entfällt die Mittelspalte (Grid schrumpft auf zwei Spalten), sodass kein Leerraum entsteht.

**Toolbar oberhalb der Tabelle (ebenfalls nur „Manage Channels“):**  
**Select All** (mit Zähler), Bulk-**Model** (Dropdown + Apply) und Bulk-**Skill** (Dropdown + Add) sitzen in der **unteren Leiste** innerhalb von `renderManageChannels()` — sie erscheinen nicht auf den anderen Haupt-Tabs, weil dort diese View gar nicht gemountet ist.

**Zeilen-Markup (zwei `<tr>` pro Kanal):**  
`ChannelManagerChannelRow` rendert ein **`React.Fragment`** mit (1) Hauptzeile: Checkbox, TTG-Spalte, Workspace-Spalte; (2) **Footer-Zeile** mit `colSpan={3}`: zentrierte **Open** / **Collapse**, darunter das **Resize-Handle**. So bleiben die drei Spalten in Zeile (1) gleich hoch; Steuerung liegt **vollbreit** unter dem Segment.

**Zeilenhöhen:**  
- **Collapse all:** ca. **260px** pro Kanalzeile; **alle** Zeilen-Sub-Tabs werden auf **Configuration** gesetzt (verhindert Überlappungs-Artefakte der linken Spalte, wenn vorher **OpenClaw Chat** oder **IDE project summary** aktiv war).  
- **Die drei „expand all“-Varianten:** gemeinsame Zielhöhe (**aktuell 1010px**, Konstante `ROW_HEIGHT_EXPANDED` in `ChannelManager.jsx`; iterativ von 1760 → 1460 → 1160 → 1010 reduziert für nutzbaren Platz auf dem Bildschirm) plus jeweils Sub-Tab **Configuration** / **OpenClaw Chat** / **summary** (TARS in IDE).  
- **Pro-Segment Open:** nach Expand scrollt die Ansicht so, dass die **Footer-Zeile** (Open/Collapse) mit `scrollIntoView({ block: 'end', behavior: 'smooth' })` am unteren Rand des sichtbaren Bereichs ausgerichtet wird (nach Layout-Update). **Pro-Segment Collapse:** Höhe **260px**, Zeilen-Sub-Tab **Configuration** (analog **Collapse all** nur für diese Zeile).  
- Persistenz der Höhen: **`localStorage`**-Key **`ag-channel-row-heights`**.

**TTG-Anzeige:**  
Spaltenkopf **„TTG (Telegram Topic Group)“**. Anzeigenamen mit veraltetem Präfix **`TG`+Ziffer** werden in der UI als **`TTG`+Ziffer** dargestellt (`formatTtgChannelName.js`); **kein** automatischer Rewrite der JSON-`name`-Felder.

**Sub-Agente (Config-Schicht):**  
- **Create:** `POST /api/channels/createSubAgent`  
- **Delete:** `POST /api/channels/deleteSubAgent` (inkl. Entfernen der ID aus **`channels[].inactiveSubAgents`**)  
- **UI:** Tab **Agents** — „Sub-Agent anlegen“ (Modal), Destroy-**X** auf der Sub-Agent-Karte.

**Dev / Betrieb:**  
- **`GET /api/channels`:** React Query mit **Retries und Backoff** bei temporärem **502** (Vite-Proxy, wenn die API neu startet).  
- **`TelegramChat` / SSE:** Reconnect mit **Backoff**, **gedrosseltes** Logging bei `EventSource`-Fehlern (Reconnect ist erwartbar).

### 2.12 Nächste Schritte: Backend ↔ OpenClaw ↔ IDE & TTG-Namenskonvention (17.04.2026)

**Stand:** Die Channel-Manager-**UI** für Konfiguration, Chat-Spiegel, IDE-Summary, Bulk, Sub-Agent-CRUD und TTG-Anzeige ist **umgesetzt**. Als Nächstes zählen **Laufzeit-Verdrahtung** und **prüfbare** Regeln — siehe Spec **§3.6** und Plan **§12**.

**Priorisierte Integrationslinien:**  
1. **OpenClaw / Gateway:** Parity zwischen persistierter Kanal-Config und **tatsächlichem** Gateway-Verhalten (kein stiller Drift).  
2. **IDE / Cursor:** Export-Bundles (`/api/exports/ide`), `ideConfigBridge`, `/api/ide-project-summaries` in wiederholbare Checks einbinden; **MCP Sub-Task 8.3** (Sovereign-Verifikation) abschließen.  
3. **Rosetta / Session:** ggf. offene Memory-/Session-Punkte aus früheren Phasen nachziehen.

**TTG-Kürzel (`TTG000`, …):** Einheitliche Zuordnung IDE ↔ Telegram-Topic-Group erfordert ein **stabiles Schema**. **Nur** „User/Agent soll es so schreiben“ ist **unzureichend**. Empfohlen: **Backend-Validierung** (Zod) bei Create/Rename, optional Normalisierung/Warnung; ergänzend **Workspace-Skill** und **Cursor Rule** für IDE-Agenten — die technische Schranke bleibt die **API/Config**, nicht die bloße Erinnerung.

**Referenz:** [CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md).

---

## Anti-Patterns & Architektonische Fallstricke

Hier sind die gesammelten "Invisible Mines", die während des Aufbaus entschärft wurden:

### AP-01: Zod "Optional" Serialization (null vs undefined)
Sende niemals `null` an ein Zod-Feld, das als `.optional()` markiert ist. Zod 3/4 erlaubt hier nur `undefined`. Ein `null` führt zum `500 Internal Server Error`.

### AP-02: Root Path Binding (`WORKSPACE_ROOT = /`)
Verwende niemals `/` als Workspace-Root in Linux-Umgebungen, da `path.join` sonst versucht, System-Verzeichnisse (`/etc`, `/bin`) zu beschreiben. Pfade müssen immer relativ zum Projekt oder absolut zum Workspace definiert sein.

### AP-03: Zod Schema Object Stripping
Verschachtelte Objekte im Zod-Schema löschen lautlos Daten, die nicht explizit definiert wurden. Nutze `.passthrough()` oder definiere jedes Feld akribisch, um Datenverlust beim File-Write zu vermeiden.

### AP-04: The "Zombie Proxy" 502 (Bad Gateway)
`nodemon` lässt manchmal Child-Prozesse auf Ports (z.B. 4000) hängen. Prüfe bei 502-Fehlern immer die Port-Belegung (`lsof -i :4000`) vor dem Code-Debugging.

### AP-05: WebSocket-Overhead für Unidirektionalität
Nutze für Hot-Reloading und einfache Status-Updates **SSE (Server-Sent Events)** statt schwerer WebSockets. Es spart Abhängigkeiten und ist nativ stabiler.

### AP-06: Bot Identity Loop Trap
Bots antworten in Telegram standardmäßig nicht auf andere Bots. Ein Web-Interface, das mit dem Haupt-Token (`TARS_2`) sendet, wird von der Engine ignoriert. Lösung: **CASE Relay-Bot**.

### AP-06B: The 409 Deadlock (getUpdates Conflict)
Zwei konkurrierende Bot-Instanzen (z.B. TARS-Cloud und lokales Web-Backend) dürfen nicht rigoros dasselbe Token für `getUpdates` nutzen, sonst kappt Telegram die Verbindung gnadenlos mit `409 Conflict: terminated by other getUpdates request`. **Lösung:** Entweder strikte Token-Trennung per Architektur (TARS vs. CASE) oder direkter Wechsel auf MTProto.

### AP-07: Flexbox Container Collapse
Tief verschachtelte Flexboxen ohne `min-width: 0` können bei Text-Ellipsis auf 0 Pixel kollabieren. Lösung: Rigoroses **CSS Grid** (`1fr`) für Content-Bereiche nutzen.

### AP-08: Mimetype-Ignoranz (`.env`)
Dateien ohne Endung wie `.env` werden von vielen Standard-Scannern als Binärdatei fehlinterpretiert. Im File-Viewer explizit über `path.basename()` whitelisten.

### AP-09: Strict Validation vs. State Extension
Zod `.strict()` lehnt Frontend-Objekte ab, wenn diese zusätzliche UI-Metadaten (Status, Icons) mitschicken. Nutze `.passthrough()` oder gezieltes `.strip()`.

### AP-10: Backend Error Masking
Standard-Express-Logik maskiert oft präzise SDK-Fehler (z.B. Telegram 400) als generisches `500 Internal Server Error`. Mapper implementieren, um Fehler am Frontend dechiffrierbar zu machen.

### AP-11: Root Path Binding
`path.join('/', 'subdir')` bricht aus dem Projektverzeichnis aus und zielt auf das Linux-System-Root. Pfade immer defensiv gegen den Workspace-Vektor prüfen.

### AP-12: Wizard-Blind-Glaube (Automatisierungs-Falle)
Das blinde Vertrauen auf CLI-Automatisierung für "Sovereign"-Setups. Wizards (`openclaw onboard`) überschreiben oft gehärtete JSON-Dateien mit restriktiven Defaults, die den Remote-Zugriff kappen.

### AP-13: Geheimnis-Verteilung
Das Hardcoden von API-Keys direkt in der `models.json`. Keys gehören ausschließlich in die `auth-profiles.json`.

### AP-14: Ewige Wildcards
Das dauerhafte Belassen von `allowedOrigins: ["*"]` nach der Initial-Phase. Ziel sollte der Wechsel auf spezifische Tailscale-IPs sein.

### AP-15: ID-Mismatch (Auth Drift)
Die Verwendung von inkonsistenten IDs zwischen `models.json` (Provider) und `openclaw.json` (Profiles), was dazu führt, dass Modelle als "no auth" gelistet werden, obwohl sie eingeloggt sind.

### AP-16: Ignoring Live Session Keys
Das Erfinden neuer Session-Keys für bestehende Kanäle zerstört den Zugriff auf historische Memory-Logs. Nutze IMMER die `agent:main:telegram:group:<ID>` Parity, um den "Rosetta-Sync" zu erhalten.

### AP-17: MCP-Konfiguration OS-übergreifend kopieren
Die Windows-`mcp.json` (`E:\`, `cmd /c`, `.exe`) in **Remote-SSH** nach `~/.cursor/mcp.json` zu kopieren, führt zu rotem Status: Pfade und Shell existieren auf Linux nicht. **Remote:** eigene JSON mit Linux-Pfaden und ggf. **venv**-Python (`python3 -m venv`, `pip install httpx` o. ä.).

---

## Best Practices für Sovereign Engineering

1. **SSE-Driven Query Invalidation:** Nutze SSE, um die React-UI bei Dateisystem-Änderungen (via Chokidar) sofort zu invalidieren.
2. **Domain-Driven File Ownership:** Trenne Schreibrechte zwischen Config-Tools (Manager) und Laufzeit-Engines (OpenClaw), um File-Locks zu verhindern.
3. **Context Continuity First:** Im privaten Setup ist ein "Memory Bleed" zwischen Sessions ein Feature, das den nahtlosen Wechsel zwischen Oberflächen erst ermöglicht.
4. **Token-Choice vor API-Key:** Für hochpreisige Modelle (Codex/GPT-5.4) immer das **OAuth/Token-Verfahren** bevorzugen, um Betriebskosten zu minimieren.
5. **Hierarchisches Fallback-Management:** In der `models.json` eine klare Provider-Kette (`Primary -> Fallback`) definieren.
7. **Cross-Surface Continuity (Rosetta-Sync):** Verifiziere IMMER das Mapping zwischen Session-Key (`agent:main:...`) und physikalischem Memory-Log. Ein Kanal ohne korrekten Link zum TARS-Hub ist ein "blinder" Kanal.
8. **Multi-Surface Capability (IDE Agnosticism):** Baue Komponenten immer FS-zentriert. Da über Open VSX (`TureAutoAcceptAntiGravity`) sowohl Anti-Gravity als auch Cursor unterstützt werden, muss das Backend IDE-agnostisch bleiben.

---

## Summary (Stand 16.04.2026) — für Management / Onboarding

| Thema | Kurz |
|-------|------|
| **Gateway-First** | Inbound: Chokidar → Session-JSONL → SSE zum React-Chat. Kein `getUpdates`-Polling im Node-Backend. |
| **Outbound CM** | `openclaw agent --channel telegram --to … --message … --deliver` (Zustellung explizit). |
| **MCP Channel Manager** | `Backend_MCP/` mit stdio; Windows: SSH zum Laptop; Remote-SSH: `node` + Pfad auf dem Laptop. |
| **IDE** | Cursor und AntiGravity parallel denkbar; MCP-Config ist **pro Host** (Windows vs. Linux) zu pflegen. |
| **Harness in Cursor** | `~/.openclaw/workspace/.cursor/rules/openclaw-workspace-context.mdc` + `AGENTS.md` / `SOUL.md` (Alt: `case-cursor-identity.mdc`). |
| **Repo-Pfad** | `Production_Nodejs_React/` unter `OpenClaw_Control_Center`. |
| **Medien (Bilder) im CM** | Roadmap: Spec §6.3, Plan 6.9 — **nicht** umgesetzt; nur Text-API. |
| **IDE Bridge** | [CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md); API: `/api/exports/ide`, `/api/ide-project-summaries`. |
| **Kanal-UI** | TARS-only (kein Engine-Dropdown); Sub-agents; Tab „TARS in IDE · IDE project summary“. |
| **Workbench** | Multi-Root (`resolveWorkbenchPath`); gebündelte Skills + User-Home; URL nach persist-Hydration; `.env.example` (`WORKBENCH_*`). |
| **Skill-Badges** | Sub-Agent vor Hauptagent bei Duplikat-IDs; Label **Inherited from {Name} · sub-agent**. |
| **TTG bulk / Sub-Agent CRUD** | §3.5 Spec; Header-Buttons, 260px / 1010px expand, zwei `<tr>` pro Zeile, Bulk nur Tab „Manage Channels“, `createSubAgent` / `deleteSubAgent`; §2.11 Master-Doku. |
| **Integration / TTG-Regel** | Spec §3.6, Plan §12, Master §2.12 — OpenClaw-Parity, IDE-Exports, MCP 8.3; TTG-Präfix **durch Validierung**, nicht nur Skill/Text. |

---

**Ende der konsolidierten Master-Dokumentation.**
*Zusammengeführt 14.04.2026 (AntiGravity); Abschnitte 2.6–2.8, AP-17 und Summary 15.04.2026 ergänzt; **Abschnitt 2.9 und Summary 16.04.2026** (IDE-Bridge, TARS-only, Sub-agents, IDE-Summary-API); **Abschnitt 2.10 16.04.2026** (Workbench multi-root, Skill-Herkunft); **Abschnitt 2.11 17.04.2026** (TTG bulk, Sub-Agent create/delete, TTG-Anzeige, Dev-Resilienz, zwei-Zeilen-Layout, Bulk-Sichtbarkeit); **Abschnitt 2.12 17.04.2026** (Integration Backlog, TTG-Durchsetzung).*
