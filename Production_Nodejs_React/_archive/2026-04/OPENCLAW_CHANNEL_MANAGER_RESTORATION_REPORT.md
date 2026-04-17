# Channel Manager / OpenClaw Control Center — Restaurations- und Fix-Report

**Datum:** 2026-04-17  
**Zweck:** Den Ist-Zustand, Diagnosen, erfolgreiche und fehlgeschlagene Ansätze sowie **konkrete Code-/Config-Änderungen** dokumentieren — für Abstimmung mit dem OpenClaw-Team, ohne parallele oder widersprüchliche Annahmen im Feld.

**Siehe auch (Architektur vs. Betrieb):** Produkt- und Parity-„Ground Truth“ — [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.4 und §3.4a–§3.4e; konsolidiert in [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) §2.13 (Architektur) vs. §2.14 (dieser Report).

---

## 1. Ausgangslage (was vorgefunden wurde)

### 1.1 Repository / Dateisystem

- Im Arbeitsbaum von **`OpenClaw_Control_Center`** fehlten **viele getrackte Dateien** (Status „deleted“ gegenüber `origin/main`), u. a.:
  - **Frontend:** `index.html`, `vite.config.js`, zentrale React-Komponenten und Seiten (`ChannelManager.jsx`, `TelegramChat.jsx`, …).
  - **Backend:** `index.js`, komplette **`routes/`** und **`services/`** (u. a. `telegramService.js`, `channels.js`).
- **`occ-ctl.mjs`** (früher genutzt zum Starten mehrerer Dienste) war im aktuellen Repo-Root **nicht vorhanden** — Neustart musste **manuell** über `npm` erfolgen.

### 1.2 Laufzeit-Symptome (Browser / Konsole)

| Symptom | Typische Ursache (Diagnose) |
|--------|-----------------------------|
| **`http://localhost:5173/` → 404** | Vite lief, aber **ohne `index.html`** im Frontend-Root → kein SPA-Einstieg. |
| **`GET /api/channels/events` → 404** | Anfrage landete **nicht** beim Express-Backend (fehlender/inkonsistenter Proxy, z. B. `vite preview` ohne Proxy), oder falscher Server auf Port 5173. |
| **`GET /api/channels` → 500** | Fehler: `(localState.channels \|\| []).map is not a function` — in **`channel_config.json`** stand **`"channels": {}`** (Objekt) statt **Array**; `.map` schlug fehl. |
| **Doppelte „You“-Nachrichten** im Chat | Backend sendete Echo per SSE (`You (Web-UI)`, `senderId: user`), Frontend hing **zusätzlich** eine zweite Bubble ein (`You (Frontend)`, `senderId: me`). |
| **Tool-Kästen „nicht klickbar“** | Copy-Button (absolut positioniert, höherer z-index) überlagerte die klickbare Tool-Zeile. |
| **Agents-Tab leer** | API lieferte **`agents: []`** / **`subAgents: []`** aus der Config — UI mappt nur über diese Arrays, Metadaten allein reichen nicht. |

### 1.3 Konfigurationsdatei `channel_config.json`

- Inhalt war u. a. **`"channels": {}`** (leeres Objekt).
- **`ensureConfigExists`** legte bei **fehlender** Datei fälschlich **`{ "channels": {} }`** an — reproduzierbarer Bug für spätere 500er.

---

## 2. Was versucht wurde (Ansätze)

| Ansatz | Ziel |
|--------|------|
| **Wiederherstellung aus Git** | `git checkout HEAD -- Production_Nodejs_React/frontend/` und analog **Backend** — fehlende Einträge zurückholen. |
| **Vite-Proxy** für `/api` | Dev und **Preview** gleich konfigurieren; Timeouts für lange SSE-Verbindungen. |
| **Direkte API-URL** (`VITE_API_BASE_URL`) | Umgehung von Proxy-Problemen bei **EventSource** im Browser. |
| **Backend: Normalisierung** von `channels`/`agents`/`subAgents` | Objekt vs. Array robust behandeln; Defaults beim **GET** wenn Listen leer. |
| **Chat: ein Echo-Pfad** | Kein doppeltes Einfügen im Frontend nach POST; Backend-Label/`senderId` für Ausrichtung. |
| **Chat: z-index / Padding** | Tool-Zeilen über Copy-Layer; Send-Button nicht von Textarea verdeckt. |
| **`channel_config.json` befüllen** | Standard-Hauptagenten und Sub-Agents persistieren, Agents-Tab und POST-Routen konsistent. |

---

## 3. Was geklappt hat / was nicht

### 3.1 Geklappt

- **Frontend und Backend** wieder lauffähig nach **`git checkout`** der gelöschten Pfade.
- **Vite** liefert wieder **`/`** mit **200**, sobald `index.html` und Einstieg vorhanden.
- **`GET /api/channels`** stabil nach:
  - **`normalizeToArray`** / **`normalizeParsedChannelConfig`**,
  - Korrektur von **`ensureConfigExists`** (Default mit **Arrays**),
  - optionaler **Datei-Korrektur** von `channels: []` auf Datenträger.
- **SSE `/api/channels/events`:** Proxy-Verbesserung + optional **`VITE_API_BASE_URL`** + **Neustart von Vite** (Env wird nur beim Start geladen).
- **Chat:** Doppel-Echo entfernt; Backend-Echo mit **`senderId: 'me'`** und Label **„You (Channel Manager)“**; Tool- und Copy-Layer angepasst.
- **Agents-Tab:** API-**Fallback** aus Metadaten, wenn `agents`/`subAgents` leer; **`channel_config.json`** mit Standard-Trios + Sub-Agents ergänzt.

### 3.2 Nicht „OpenClaw-Web-UI“-seitig gelöst (Erwartung klären)

- **Nachricht aus Channel Manager erscheint nicht im separaten OpenClaw/TARS-Panel:**  
  Outbound nutzt **`openclaw agent --channel telegram --to … --deliver`**. Das ist der **Telegram-Kanal** dieser Session. Ein **anderes** OpenClaw-Fenster (z. B. anderes Session-File / Webchat) zeigt **nicht automatisch** dieselbe Zeile — **kein Implementierungsfehler im CM allein**, sondern **unterschiedliche Sessions/Oberflächen**.

### 3.3 Bekannte Einschränkungen / Betrieb

- **`occ-ctl.mjs`** fehlt im Repo-Stand — Startskripte sind **`npm run dev`** (Frontend) und **`npm start`** (Backend).
- **Node-Version:** Vite warnt, wenn Node **< 20.19** (lokal ggf. 20.18.x) — Dev-Server lief trotzdem, Upgrade empfohlen.
- **`.env.development` mit `VITE_API_BASE_URL`:** bewusster **Cross-Origin**-Zugriff Browser → `:3000`; Backend nutzt **`cors()`**. Bei Zugriff über **LAN-IP** statt `localhost` ggf. Env anpassen oder Env-Zeile entfernen und nur Proxy nutzen.

---

## 4. Konkrete Änderungen (Dateien und Inhalt)

### 4.1 Git-Wiederherstellung (ohne neue Logik)

- **`Production_Nodejs_React/frontend/`** — wiederhergestellt: u. a. `index.html`, `vite.config.js`, `src/**`.
- **`Production_Nodejs_React/backend/`** — wiederhergestellt: u. a. `index.js`, `routes/**`, `services/**`, `utils/**`.

### 4.2 Frontend

| Datei | Änderung |
|-------|----------|
| `frontend/vite.config.js` | Gemeinsamer **`apiProxy`** für **`server`** und **`preview`**; **`timeout: 0`**, **`proxyTimeout: 0`** für lange Verbindungen. |
| `frontend/.env.development` | **`VITE_API_BASE_URL=http://localhost:3000`** (optional; direkter Zugriff auf Backend — **Vite neu starten** nach Änderung). |
| `frontend/src/utils/apiUrl.js` | **Neu:** baut URLs aus `VITE_API_BASE_URL` oder relative `/api/...`. |
| `frontend/src/pages/ChannelManager.jsx` | **`apiUrl`** für **`fetch`**, **`EventSource`**, Export-URL — konsistent mit Env. |
| `frontend/src/components/TelegramChat.jsx` | (in dieser Session) u. a. **`MessageBody`**, Tool-Folds, Copy vs. Tool-**z-index**/Padding, **`apiUrl`** für `fetch`/SSE, kein doppeltes Echo nach Senden, **`isMe`**-Logik. |

### 4.3 Backend

| Datei | Änderung |
|-------|----------|
| `backend/routes/channels.js` | **`normalizeToArray`**, **`normalizeParsedChannelConfig`**, **`buildDefaultMainAgentsFromMetadata`**, **`buildDefaultSubAgentsFromMetadata`**; **`GET /`**: leere Agent/Sub-Agent-Listen aus Metadaten füllen; **`ensureConfigExists`**: Default **`channels: []`**, **`agents: []`**, **`subAgents: []`**; alle **POST**-Pfade nach **`JSON.parse`**: **`normalizeParsedChannelConfig`**; **`DELETE` Sub-Agent**: Map über Channels ohne `Array.isArray`-Guard (nach Normalisierung immer Array). |
| `backend/services/telegramService.js` | Echo-Nachricht nach Senden: **`senderId: 'me'`**, Label **„You (Channel Manager)“** (statt Web-UI/`user`). |

### 4.4 Daten / Config außerhalb des Bundles

| Pfad | Änderung |
|------|----------|
| `Prototyp/channel_CHAT-manager/channel_config.json` | **`channels`** als **Array**; **`agents`**: TARS, MARVIN, CASE mit Skills/Farben/Text; **`subAgents`**: researcher, coder, reviewer, documenter, tester gemäß Metadaten-Struktur. |

### 4.5 Weitere Referenz-Dokumente

| Datei | Inhalt |
|-------|--------|
| `CHANNEL_MANAGER_SEND_SSE_CODEX_HANDOFF.md` | Send-Pfad, Buffer vs. JSONL, Doppel-Echo (älterer Stand). |

**Hinweis:** Der frühere Report **`REPORT_API_CHANNELS_EVENTS_404.md`** ist **inhaltlich in Anhang A** dieses Dokuments aufgegangen und wurde entfernt, um Duplikate zu vermeiden.

---

## 5. Empfehlung für das OpenClaw-Team

1. **Repo-Sanity:** prüfen, ob das **Löschen vieler Pfade** beabsichtigt war; falls nein, **`main`** mit dem wiederhergestellten Stand **abgleichen** oder Änderungen **committen**.  
2. **Ein Startkommando** (Makefile, `package.json` im Root oder wieder **`occ-ctl`**) dokumentieren — reduziert „5173 ohne Backend“ / „Backend ohne Frontend“.  
3. **Eine kanonische `channel_config.json`-Form:** **`channels` immer Array**; keine leeren Objekte `{}` — der Code ist jetzt defensiv, aber die **Datei** sollte das Schema nicht brechen.  
4. **Klartext zur UX:** CM-Telegram-Pfad vs. **anderes** OpenClaw-UI-Fenster — in eurer Doku einen Satz, damit keine falsche Erwartung an „jede Zeile überall sichtbar“ entsteht.

---

## Anhang A — `GET /api/channels/events` und Browser-404 (vormals `REPORT_API_CHANNELS_EVENTS_404.md`)

### A.1 Was dieser Endpoint sein soll

| Eigenschaft | Wert |
|-------------|------|
| **URL lokal (typisch)** | `http://localhost:5173/api/channels/events` (über **Vite-Dev-Proxy**) → `http://127.0.0.1:3000/api/channels/events` — oder direkt **`http://localhost:3000/...`** wenn **`VITE_API_BASE_URL`** gesetzt ist |
| **Direkt am Backend** | `http://127.0.0.1:3000/api/channels/events` |
| **Typ** | **Server-Sent Events (SSE)** — `Content-Type: text/event-stream`, periodische `:ping`, Events bei Config-Änderung (`type: CONFIG_UPDATED`) |
| **Zweck** | Hot-Reload für React, wenn sich **`channel_config.json`** oder Workspace-Skills ändern |

**Frontend:** `frontend/src/pages/ChannelManager.jsx` — `new EventSource(apiUrl('/api/channels/events'))` (mit optionalem API-Basis-URL-Prefix).

**Backend:** `backend/routes/channels.js` — `router.get('/events', …)`; Mount in `backend/index.js`: `app.use('/api/channels', channelRoutes)` → **`GET /api/channels/events`**.

### A.2 Warum ein 404 im Browser oft *nicht* „Route fehlt“ bedeutet

Der Endpoint existiert im **Express-Backend**. Ein **404** heißt meist: die Antwort kommt **nicht** von diesem Server, sondern von einem Dienst, der **`/api/...` nicht an `:3000` weiterreicht**.

Häufige Ursachen:

1. Vite **`npm run dev`** läuft nicht oder der Tab zeigt eine **andere Origin/Port**.
2. **`vite preview`** oder **statischer** `dist`-Host **ohne** dieselbe **`/api`-Proxy-Konfiguration** wie im Dev-Server.
3. **Backend auf :3000** nicht gestartet — je nach Setup **502/504** oder Fallback → **404**.
4. **Anderer Prozess auf 5173** (nicht Vite mit Proxy), z. B. `serve -s dist`.
5. **Andere Base-URL** / falsche relative URL (im Repo ist der Pfad **absolut** `/api/...` bzw. **`apiUrl`**).

### A.3 Schnelltests (Support)

```bash
# 1) Backend direkt — SSE bleibt offen; Status sollte 200 sein
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 3 http://127.0.0.1:3000/api/channels/events

# 2) Über Vite (Proxy) — 200, wenn Dev + Backend laufen
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 3 http://127.0.0.1:5173/api/channels/events
```

- **200** und hängende Verbindung: Endpoint ok.  
- **404** bei (2) bei laufendem Backend: Proxy fehlt oder falscher Dienst auf 5173.  
- **404** bei (1): Backend/Port/Route.

### A.4 Repo-Anpassungen (Kurz)

- **`frontend/vite.config.js`:** `apiProxy` für **`server`** und **`preview`**; Timeouts für lange Verbindungen.  
- Optional **`frontend/.env.development`:** `VITE_API_BASE_URL=http://localhost:3000` — **Vite nach Änderung neu starten**.  
- **Integratoren:** Reverse-Proxy-Regel **`/api` → Backend**, falls kein Vite davor.

### A.5 Kurzfassung für Ticket-Text

> Der SSE-Endpunkt **`GET /api/channels/events`** ist im Channel-Manager-Backend implementiert (`channels.js`, Mount unter `/api/channels`). Ein Browser-**404** bedeutet praktisch: die Anfrage erreicht **nicht** Express (fehlender Proxy bei Preview/static, falscher Port, Backend aus). Fix: Backend auf **:3000** und **`/api`** zum Backend proxien (Vite `server` + `preview`, oder Reverse-Proxy). Zusätzlich optional direkte Backend-URL im Frontend über **`VITE_API_BASE_URL`**.

---

*Ende Report.*
