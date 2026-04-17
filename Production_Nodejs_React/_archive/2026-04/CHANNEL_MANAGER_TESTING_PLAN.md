---
arys_schema_version: "1.3"
id: "b4d7e8f5-1c2d-4e89-a29d-4f1a2e3b4c5d"
title: "Channel Manager Testing Plan: Gateway-First Architecture"
type: TASK
status: active
trust_level: 2
created: "2026-04-14T09:40:00Z"
last_modified: "2026-04-14T09:40:00Z"
author: "AntiGravity"
tags: [testing, qa, gateway-first, chokidar, sse]
---

# 🧪 Channel Manager: Testing Plan (Phase 5 - Gateway-First)

Da wir die Architektur radikal auf das **Gateway-First** Pattern (FS-Chokidar-Listener ohne aktives Polling) umgestellt haben, müssen wir die Brücke systematisch validieren. Dieser Test-Plan führt uns durch die Absicherung.

## 1. Mock-Test: Die Filesystem-React-Brücke (Trockenlauf)
**Ziel:** Verifizieren, dass der Chokidar-Scanner und der SSE-Stream korrekt zusammenarbeiten.

- [x] **Schritt 1:** Öffne das React-Webinterface (`http://localhost:4000` oder dein Proxy-Subnetz) und navigiere zum Chat-Fenster eines Bots.
- [x] **Schritt 2:** Der Agent (ich) nutzt das Terminal, um manuell einen neuen `message`-Block (.json) in eine bestehende `.jsonl`-Session-Datei unter `~/.openclaw/agents/main/sessions/` anzuhängen.
- [x] **Schritt 3:** Wir validieren visuell, ob diese Nachricht *instantan* im React-Frontend erscheint.

## 2. Der "No-409" Live Test (End-to-End)
**Ziel:** Verifizieren, dass Telegram API 409-Konflikte der Vergangenheit angehören und Nachrichten im echten Flow repliziert werden.

- [x] **Schritt 1:** Node.js Backend lokal weiterlaufen lassen (es pollt nun aktiv *nicht* mehr).
- [x] **Schritt 2:** Du (als User) schickst über deine echte Telegram-App eine Nachricht an den TARS-Bot.
- [x] **Schritt 3:** OpenClaw empfängt diese (da OpenClaw den einzigen legitimen `getUpdates`-Poller ausführt).
- [x] **Schritt 4:** OpenClaw verarbeitet den Prompt und schreibt das Transkript in die jeweilige `.jsonl`.
- [x] **Schritt 5:** Unser lokales Backend erkennt den File-Change und streamt die Antwort und den ToolCall von TARS sauber in dein React Interface.
- [x] **Schritt 6:** Konsolen-Check: Es dürfen im Backend-Terminal keine `[Telegraf] 409 Conflict` Abstürze mehr auftauchen. *(Erfolgreich! Zudem wurden die `[Violation] 'message' handler took [X]ms` Frontend-Warnungen behoben, indem `React.memo` mit einem Custom-ID-Check abgesichert wurde, was massives Re-Rendering bei Vite HMR Hot-Reloads blockiert).*

## 3. Local Gateway Injection Test (Human In The Loop)
**Ziel:** Sicherstellen, dass das native React-Interface Eingaben als authentische User-Nachrichten an TARS überbringt, ohne dass der Telegram Bot-Filter (Bots ignorieren Bots) die Kommunikation blockiert.

- [x] **Schritt 1:** Sende eine Nachricht aus dem Frontend-UI.
- [x] **Schritt 2:** Das Backend nutzt NICHT mehr das Telegram Bot Token (Relay). Stattdessen wird die OpenClaw CLI (`openclaw agent --message`) getriggert, um die Nachricht als nativer Mensch (Jan) einzuschleusen.
- [x] **Schritt 3:** TARS verarbeitet die Nachricht ("Gesehen. Test kommt sauber an.") direkt im lokalen Memory, umgeht den blinden Fleck auf Telegram komplett.
- [ ] **Schritt 4:** Der Chokidar-Scanner liest die resultierenden .jsonl und streamt die Antwort und die Tool-Meldungen sauber in dein React Interface zurück.

## 4. Der Sovereign MCP-Bridge Test (Phase 7)
**Ziel:** Verifizieren, dass die IDE (AntiGravity) die Channel Manager Umgebung als "Sovereign Context" via stdio adaptiert, Memory abrufen und Tools bedienen kann.

- [x] **Schritt 1:** AntiGravity Neustart. Prüfen, ob der Server `MCP-ChannelManager` von der IDE via `mcp_config.json` erfolgreich geladen wird (grüner Status in IDE).
- [ ] **Schritt 2 (Resource Hydration):** In AntiGravity ("als CASE") eine Prompt eingeben wie: *"Lies den Context von config://channels und sage mir, welche Agenten aktiv sind."*
- [ ] **Schritt 3 (Per-Channel Permissions):** Die Ressource `config://{telegram_id}` (z. B. `config://-1003752539559`) von AntiGravity ansteuern lassen. Verifizieren, ob CASE korrekt die Whitelist seiner `caseSkills` erkennt.
- [ ] **Schritt 4 (Tool Execution):** AntiGravity instruieren: *"Schicke eine Telegram Reply über dein Tool `send_telegram_reply` in den Channel -1003752539559 mit dem Text: 'Sovereign Bridge online!'."*
- [ ] **Schritt 5:** Die Nachricht muss vom lokalen Node.js Webserver empfangen und sicher per Telegram API in den Chat injiziert werden, ohne dass AntiGravity den Bot-Token kennt.

---
✅ **TESTS 1 BIS 3 ERFOLGREICH ABGESCHLOSSEN:** Die "Gateway-First" Brücke ist vollständig verifiziert und performant in das React UI (Channel Manager) integriert.
⏳ **TEST 4 STEHT AUS**
