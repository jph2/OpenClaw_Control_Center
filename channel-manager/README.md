# Channel Manager

Web-UI zur Verwaltung von OpenClaw Telegram-Kanälen mit persistenten Modell- und Skill-Zuordnungen.

## Features

| Feature | Status |
|---------|--------|
| Kanal-Liste | ✅ |
| Modell pro Kanal (persistent) | ✅ |
| Skills pro Kanal | ✅ |
| Dropdown-Auswahl | ✅ |
| Hinzufügen/Entfernen | ✅ |
| Skill Tree Visualisierung | ✅ |

## Schnellstart

```bash
# Server starten
./channel-manager.sh start

# UI öffnen
./channel-manager.sh open
# → http://127.0.0.1:3401
```

## Architektur

```
channel-manager/
├── index.html              # UI (HTML+JS, kein Build)
├── server.js               # Node.js HTTP Server
├── channel_config.json     # Kanal-Konfiguration
├── channel-manager.sh      # CLI-Tool
└── channel-manager.service # Systemd Service
```

## Konfiguration

### Format (channel_config.json)

```json
{
  "channels": [
    {
      "id": "-5207805052",
      "name": "TL000 General Chat",
      "model": "local-pc/google/gemma-4-26b-a4b",
      "skills": ["weather", "web_search"],
      "require_mention": false
    }
  ]
}
```

### Verfügbare Models

- `local-pc/google/gemma-4-26b-a4b` (Gemma 4)
- `moonshot/kimi-k2.5` (Kimi)
- `kimi/kimi-code` (Kimi Code)
- `openai-codex/gpt-5.4` (Codex)

## CLI Commands

```bash
./channel-manager.sh start      # Server starten
./channel-manager.sh stop       # Server stoppen
./channel-manager.sh restart    # Server neustarten
./channel-manager.sh status     # Status checken
./channel-manager.sh open       # Browser öffnen
./channel-manager.sh list       # Kanäle auflisten
./channel-manager.sh validate   # Config validieren
./channel-manager.sh config     # Config editieren
```

## API Endpoints

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/config` | GET/POST | Kanal-Konfiguration |
| `/api/skills` | GET | Verfügbare Skills |
| `/api/skill-tree` | GET | Skill Tree Daten |
| `/api/skills/:name` | GET | Skill Details |

## Skill Tree

Interaktive Visualisierung:
- **Kanäle** als Bot-Nodes (farbig)
- **Skills** als verknüpfte Nodes
- **Physik-Engine** (Force-Directed)
- **Drag & Drop**
- **Detail-Panel** bei Klick

## Systemd Service

```bash
sudo cp channel-manager.service /etc/systemd/system/
sudo systemctl enable channel-manager
sudo systemctl start channel-manager
```

## Port

Standard: `3401`

Umgebungsvariable: `CHANNEL_MANAGER_PORT`

## Integration mit OpenClaw

Der Channel Manager liest:
- `~/.openclaw/openclaw.json` (Agent-Liste)
- `~/.openclaw/skills/` (Skills)
- `/usr/lib/node_modules/openclaw/skills/` (Bundled Skills)

## Zweck

Kostenkontrolle durch deterministische Modell-Zuordnung statt Session-Overrides.
