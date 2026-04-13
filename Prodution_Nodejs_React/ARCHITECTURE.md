---
arys_schema_version: "1.3"
id: "b450cd98-1e42-4b2e-a573-0498b2cd7f2b"
title: "OpenClaw UI Extensions - Production Architecture"
type: TECHNICAL
status: active
trust_level: 3
agent_index:
  context: "Production architecture for OpenClaw UI extensions including the decentralized Telegram hub."
  maturation: 2
  routing:
    system: "#system-overview"
    hub: "#decentralized-telegram-hub"
created: "2026-04-12T01:07:00Z"
last_modified: "2026-04-12T01:07:00Z"
author: "TARS"
provenance:
  git_repo: "Openclaw-OpenUSDGoodtstart-Extension"
  git_branch: "main"
  git_path: "Prodution_Nodejs_React/ARCHITECTURE.md"
tags: [architecture, openclaw, telegram_hub]
---

# OpenClaw UI Extensions - Production Architecture

**Version**: 1.0.0 | **Date**: 12.04.2026 | **Time**: 03:07 | **GlobalID**: 20260412_0307_ARCHITECTURE_v1

**Last Updated:** 12.04.2026 03:07  
**Framework:** Horizon Studio Framework  
**Status:** active

**Git:** Repo: Openclaw-OpenUSDGoodtstart-Extension | Branch: main | Path: Prodution_Nodejs_React/ARCHITECTURE.md | Commit: pending

**Tag block:**
#architecture #openclaw #telegram_hub

---

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Browser"]
        subgraph "React SPA (Vite)"
            Router["React Router"]
            subgraph "Routes"
                Landing["/ - Landing Page"]
                WorkbenchRoute["/workbench - Workbench"]
                ChannelsRoute["/channels - Channel Manager"]
            end
            subgraph "State Management"
                Zustand["Zustand (UI State)"]
                ReactQuery["React Query (Server State)"]
            end
            subgraph "UI Components"
                Theme["theme.css (Design Tokens)"]
                Shared["Shared Components"]
            end
        end
    end

    subgraph "API Layer (Express)"
        Express["Express Server"]
        subgraph "Routers"
            WorkbenchAPI["/api/workbench/*"]
            ChannelsAPI["/api/channels/*"]
            HealthAPI["/api/health"]
        end
        subgraph "Middleware"
            Cors["CORS"]
            ErrorHandler["Error Handler"]
            SafePath["resolveSafe Middleware"]
        end
    end

    subgraph "Services"
        FileService["FileSystem Service"]
        ChannelService["Channel Config Service"]
        subgraph "Telegram Relay Hub"
            TARS_Read["TARS Service (Inbound/SSE)"]
            Relay_Write["Relay Service (Outbound/Writing)"]
        end
    end

    subgraph "Data Layer"
        FS[(File System)]
        ConfigJSON["openclaw.json / channel_config.json"]
        Workspaces["Workspace Directories"]
    end

    Browser --> Router
    Router --> Landing & WorkbenchRoute & ChannelsRoute
    Landing & WorkbenchRoute & ChannelsRoute --> Zustand & ReactQuery
    Zustand --> Shared
    ReactQuery --> Express
    Express --> Cors --> SafePath --> WorkbenchAPI & ChannelsAPI & HealthAPI
    
    %% Config & FS Flow
    WorkbenchAPI --> FileService --> FS
    ChannelsAPI --> ChannelService --> ConfigJSON
    FS --> Workspaces
    
    %% Chat Data Flow
    TelegramNetwork["Telegram Network"] <--> TARS_Read
    TelegramNetwork <--- Relay_Write
    TARS_Read & Relay_Write <--> ChannelsAPI
    FS --> Workspaces
```

## Decentralized Telegram Hub (Data Flow)

```mermaid
graph TD
    %% 1. Der zentrale Kommunikations-Hub
    TG["Telegram"]

    %% 2. Die unabhängigen Clients
    OC_Chat["OpenClaw Chat"]
    CCM["Channel Chat Manager"]
    IDE["IDE (Anti-Gravity)"]

    %% 3. Der Konfigurations-Hub (Filesystem)
    subgraph ConfigLayer ["Harness / JSON Layer"]
        Config["Soul / Identity / Agent / Skills / Memory"]
    end
    
    %% Datenfluss: Getrennte Bot-Kanäle
    subgraph Telegram ["Telegram Hub"]
        direction TB
        TARS["TARS Bot (Inbound)"]
        CASE["CASE Bot (Outbound)"]
    end

    %% Inbound path (TARS -> Clients)
    TARS -- "Broadcasting" --> OC_Chat
    TARS -- "Broadcasting" --> CCM
    TARS -- "Broadcasting" --> IDE

    %% Outbound path (Clients -> CASE)
    OC_Chat -- "Writes" --> CASE
    CCM -- "Writes" --> CASE
    IDE -- "Writes" --> CASE
    
    %% Datenfluss: Konfiguration
    OC_Chat <-->|"liest & nutzt"| Config
    CCM -->|"generiert & kontrolliert"| Config
    IDE <-->|"liest & nutzt"| Config

    classDef tg fill:#2ca5e0,stroke:#1c8ec7,stroke-width:2px,color:#fff;
    class TG tg;
    
    classDef client fill:#333,stroke:#666,stroke-width:2px,color:#fff;
    class OC_Chat,CCM,IDE client;

    classDef config fill:#805d21,stroke:#a67c33,stroke-width:2px,color:#fff;
    class Config config;
```

### Der Datenfluss:

1. **Kommunikation (Zwei-Bot-Relay):** Wir nutzen eine **Asymmetrische Bot-Architektur**, um die 409-Kollision (Polling) und das Bot-zu-Bot Blocking zu umgehen. 
   - **TARS (Inbound):** Fungiert als Receiver. Er liest den Input und liefert den KI-Output an Telegram.
   - **Relay Bot / CASE (Outbound):** Das UI und die IDE nutzen **nicht** den TARS-Token zum Senden, sondern einen dedizierten Relay-Bot.
   - **Vorteil:** Nachrichten des Nutzers erscheinen in Telegram als `CASE` (oder Shedly), wodurch TARS sie als "Eingabe von Außen" erkennt und darauf antworten kann.

2. **Konfiguration (Das Gehirn):**
   - Der **Channel Chat Manager** ist das Werkzeug, mit dem die Rahmenbedingungen (Harness, Soul, Identity, Agenten-Zuweisung, Skills) konfiguriert werden. Er generiert die JSON-Files (in `openclaw.json` / Workspace).
   - **OpenClaw** liest diese JSON-Files aus, wenn es bootet / Anfragen empfängt, um einen konsistenten Agenten darzustellen.
   - Die **IDE** greift ebenfalls auf diese JSONs zurück, um zu wissen, wer der Agent ist und welche Skills er hat.

Das bedeutet für unseren Channel Manager: Wir hängen uns **nicht** an den Rockzipfel von OpenClaw, sondern binden in unserem Node.js Backend direkt die Telegram API (bzw. eine unabhängige Brücke zu TG) an!

### ⚠️ Architektur-Risiken & Edge Cases (Marvin's Audit)
Dieses radikal dezentrale Setup bringt operative Herausforderungen (Edge Cases) mit sich, für die unsere Architektur zwingend Mitigation-Patterns implementieren muss:
1. **Das Live-Streaming-Problem (Telegram Rate Limits):** LLMs generieren Token in sehr hoher Frequenz. Telegram sanktioniert extrem schnelle Message-Edits (HTTP 429). Die Echtzeit-Darstellung (Tipp-Indikator, Token-Streaming) wird daher über den Side-Channel (lokale WebSockets/SSE) des Backends an das native React-UI übertragen.
2. **Bot Polling Token-Kollision (HTTP 409) & Loop Protection:** (GELÖST via Zwei-Bot-Architektur). Durch die Trennung von TARS_READ (Polling/Streaming) und RELAY_SEND (CASE/Shedly API Calls) gibt es keine Token-Kollisionen mehr und keine Bot-zu-Bot Blockaden.
3. **Hot-Reloading der Datei-Konfiguration (JSON-Desync):** Da die Konfiguration dezentrierter File-System-Zustand ist, müssen File-Watcher (`chokidar`) in allen Runtimes implementiert werden, um Laufzeitänderungen ohne manuellen Neustart zu registrieren.
4. **Domain-Driven File Ownership (Race Condition Setup):** Ohne zentrale Datenbank drohen beim dezentralen Zugriff Schreibkollisionen auf dem Dateisystem. Zur Mitigation gilt strikte asymmetrische Datenhoheit (Bounded Contexts an der Dateigrenze): Der *Channel Manager* besitzt exklusives Schreibrecht (Write) für globale Konfigurationen (z.B. `openclaw.json`, `channel_config.json`), während AgentClaw/OpenClaw diese nur lesen (Read-Only). Umgekehrt haben die Agenten exklusives Schreibrecht auf Laufzeit- und Speicherdateien (`*.memory.md`, `runtime.stats.json`), welche der Channel Manager wiederum nur lesen darf. Dieses Setup eliminiert File-Locks.
## Directory Structure

```mermaid
graph LR
    subgraph "Root"
        Root["Openclaw-OpenUSDGoodstart-Extension/"]
        Prod["Prodution_Nodejs_React/"]
    end

    subgraph "Backend (/backend)"
        BE["backend/"]
        BERoutes["src/routes/"]
        BEServices["src/services/"]
        BEMiddleware["src/middleware/"]
        BEUtils["src/utils/"]
        BEServer["server.js"]
    end

    subgraph "Frontend (/frontend)"
        FE["frontend/"]
        FESrc["src/"]
        FEPages["pages/"]
        FEComponents["components/"]
        FEStores["stores/"]
        FEHooks["hooks/"]
        FEStyles["styles/"]
        FEMain["main.jsx"]
        FEApp["App.jsx"]
    end

    Root --> Prod
    Prod --> BE & FE
    BE --> BEServer --> BERoutes & BEServices & BEMiddleware & BEUtils
    FE --> FEMain --> FEApp --> FESrc
    FESrc --> FEPages & FEComponents & FEStores & FEHooks & FEStyles
```

## Data Flow

```mermaid
sequenceDiagram
    participant User as User
    participant React as React Component
    participant Zustand as Zustand Store
    participant RQ as React Query
    participant API as Express API
    participant Service as Service Layer
    participant FS as File System

    User->>React: Interaction
    React->>Zustand: Update UI State
    React->>RQ: Fetch/Mutate Data
    RQ->>API: HTTP Request
    API->>Service: Business Logic
    Service->>FS: File Operation
    FS-->>Service: Result
    Service-->>API: Response
    API-->>RQ: JSON Response
    RQ-->>React: Cached Data
    React-->>User: UI Update
```

## Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **State Management** | Zustand + React Query | Zustand for UI state (fast), React Query for server state (caching) |
| **Styling** | CSS Variables + CSS Modules | Global theme tokens + scoped components |
| **Diff Viewer** | `react-diff-viewer` | Lightweight alternative to Monaco |
| **Tree Virtualization** | `react-window` | Performance for large directories |
| **Chat Hub Architecture** | Native React Component | Replacement of the legacy Iframe with a sovereign, TG-connected client |
| **Safety** | `resolveSafe` middleware | Absolute path traversal protection |

## API Endpoints

### Workbench API
```
GET    /api/workbench/tree?path=/workspace
GET    /api/workbench/file?path=/workspace/file.md
POST   /api/workbench/file (body: {path, content})
GET    /api/workbench/search?q=query
GET    /api/workbench/preview?path=/workspace/file.md
```

### Channels API
```
GET    /api/channels/config
POST   /api/channels/config (body: config)
GET    /api/channels/groups
POST   /api/channels/:id/skills
DELETE /api/channels/:id/skills/:skill
POST   /api/channels/:id/model
```

## Security Boundaries

```mermaid
graph LR
    subgraph "Unsafe Zone"
        Client["Client Input"]
    end

    subgraph "Validation Layer"
        SafePath["resolveSafe()"]
        Schema["Joi/Zod Validation"]
    end

    subgraph "Safe Zone"
        FS["FileSystem Operations"]
        Config["Config Updates"]
    end

    Client --> SafePath
    SafePath --> Schema
    Schema --> FS & Config
```

## Build & Deploy

```mermaid
graph LR
    subgraph "Development"
        DevFE["Vite Dev Server :5173"]
        DevBE["Express :3001"]
        DevFE -->|Proxy /api/*| DevBE
    end

    subgraph "Production"
        Build["npm run build"]
        Dist["/frontend/dist"]
        ProdBE["Express :3000"]
        Static["app.use(express.static('dist'))"]
        ProdBE --> Static --> Dist
    end

    DevFE --> Build
    DevBE --> ProdBE
```

## Recommended Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | React 18 + Vite |
| Routing | react-router-dom |
| State (UI) | Zustand |
| State (Server) | React Query (@tanstack/react-query) |
| Styling | CSS Variables + CSS Modules |
| Icons | Lucide React |
| Diff Viewer | react-diff-viewer |
| Tree Virtualization | react-window |
| Backend | Express.js |
| Validation | Zod |
| File Watching | chokidar (optional) |
