---
arys_schema_version: "1.3"
id: "c87a53f1-285b-4c12-8e3d-d4a97f2b2c9d"
title: "Spezifikation & Kernanforderungen: Centralized Channel Management"
type: TECHNICAL
status: active
trust_level: 3
agent_index:
  context: "Finalized specification for the Sovereign Telegram Hub with focus on context continuity, Zod-hardening, and system-wide data flow."
  maturation: 3
  routing:
    hub: "#3-zielbild-der-architektur-private-hub-and-spoke"
    logic: "#6-datenfluss--design-entscheidungen"
    risks: "#8-architektur-risiken--audit-härtung"
created: "2026-04-12T01:07:00Z"
last_modified: "2026-04-13T20:55:00Z"
author: "AntiGravity"
provenance:
  git_repo: "Openclaw-OpenUSDGoodtstart-Extension"
  git_branch: "main"
  git_path: "Prodution_Nodejs_React/CHANNEL_MANAGER_SPECIFICATION.md"
tags: [specification, channel_manager, requirements, private-ecosystem, zod-hardening]
---

# Spezifikation & Kernanforderungen: Sovereign Channel Management (V1.5)

**Version**: 1.6.0 | **Date**: 13.04.2026 | **Status**: Hardened | **Context**: Rosetta Stone / TARS Hub Continuity
20260413_2055_SPECIFICATION_v1.5

**Status:** active | **Master Source:** Horizon Studio Framework

---

## 1. Einleitung & Vision: Das Private Ökosystem

Die Architektur wird konsequent als **geschlossenes, privates Ökosystem** definiert. Ziel ist die maximale Wissens-Kontinuität für den Nutzer (Jan).

*   **Unified Brain Policy:** TARS (Chat-Interface) und CASE (IDE-Interface) nutzen zwingend denselben Agent-Workspace und dieselbe `MEMORY.md`. 
*   **Wissen ohne Grenzen:** Informationen bluten gewollt zwischen den Sessions, um einen nahtlosen Wechsel zwischen Code-Entwicklung und Chat-Reflektion zu ermöglichen.

---

## 2. Kommunikations-Protokoll (Asymmetric Relay)

Zur Umgehung von Telegram-API-Kollisionen (HTTP 409) wird eine asymmetrische Topologie eingesetzt:
*   **TARS (Listener):** Fungiert als passives "Ohr". Empfängt alle Nachrichten via Polling/Webhooks.
*   **CASE (Relay):** Fungiert als aktive "Hand". Sendet alle Nutzer-Eingaben aus der UI/IDE an die Telegram-Gruppen.
*   **Souveräner Status:** Beide Identitäten sind Teil derselben privaten Gruppen. Der Split ist rein technisch motiviert, nicht isolationistisch.

---

## 3. Zielbild der Architektur (Private Hub-and-Spoke)

```mermaid
graph TD
    %% 1. Der zentrale Kommunikations-Hub
    TG["Telegram Hub (Private Groups)"]

    %% 2. Die unabhängigen Clients
    UI["Channel Manager UI"]
    IDE["IDE (Anti-Gravity)"]

    %% 3. Das Unified Brain
    subgraph Brain ["Unified Agent Brain"]
        WORKSPACE["Workspace / Filesystem"]
        MEMORY["Unified MEMORY.md"]
    end
    
    %% Datenfluss: Getrennte Bot-Kanäle
    subgraph Relay ["Asymmetric Relay"]
        direction TB
        TARS_L["TARS (Listener)"]
        CASE_R["CASE (Relay)"]
    end

    %% Inbound path
    TARS_L -- "Reads Context" --> UI & IDE
    
    %% Outbound path
    UI & IDE -- "Sends via" --> CASE_R --> TG
    
    %% Unified Memory Integration
    WORKSPACE <--> MEMORY
    UI & IDE & TARS_L & CASE_R <--> WORKSPACE
```

---

## 4. Kernanforderungen (Requirements)

### R1: Deterministische Konfiguration
Eine im Channel Manager gesetzte Konfiguration ist die systemweit verbindliche Laufzeitquelle. Änderungen werden via SSE sofort an alle Clients (IDE/UI) gestreamt.

### R2: Wissens-Kontinuität & History
Das System muss sicherstellen, dass Aktionen aller Relay-Teilnehmer (Jan via CASE, TARS) im `MEMORY.md` persistent dokumentiert werden. Die History-Hydration im UI erfolgt primär über dieses lokale Gedächtnis.

### R3: Zod Integrity Protocol
Alle Konfigurations-Änderungen müssen vor dem Schreiben durch eine **Normalisierungs-Schicht** und ein gehärtetes Zod-Schema validiert werden.

#### R4: Technische Verzeichnisstruktur

```mermaid
graph LR
    subgraph "Root"
        Root["Openclaw...Extension/"]
        Prod["Prodution_Nodejs_React/"]
    end

    subgraph "Backend (/backend)"
        BE["backend/"]
        BERoutes["routes/"]
        BEServices["services/"]
        BEServer["index.js"]
    end

    subgraph "Frontend (/frontend)"
        FE["frontend/"]
        FESrc["src/"]
        FEComponents["components/"]
        FEApp["App.jsx"]
    end

    Root --> Prod
    Prod --> BE & FE
    BE --> BEServer --> BERoutes & BEServices
    FE --> FESrc --> FEComponents & FEApp
```

---

## 5. Datenfluss & Design Entscheidungen

### 5.1 Technischer Datenfluss (Sequence)

### 5.4 Rosetta Stone: Session Mapping Logic
To ensure **Context Continuity** between the Channel Manager, Anti-Gravity IDE, and the Telegram surface, the system MUST enforce **Session Key Parity**:

1. **Mapping Pattern**: `agent:main:telegram:group:<ID>`
2. **Physical Storage**: Matches the `Session ID` metadata in `/workspace/memory/*.md`.
3. **Deep Links**: Direct navigation to `http://<HOST>:18789/chat?session=<KEY>`.

Any channel configuration change in `openclaw.json` must preserve these keys to prevent "Context Amnesia".

---

## 6. Sequence Diagrams
```mermaid
sequenceDiagram
    participant User as User
    participant React as React Component
    participant RQ as React Query
    participant API as Express API
    participant JS as Business Logic
    participant FS as File System (openclaw.json)

    User->>React: Interaction
    React->>RQ: Mutate Config
    RQ->>API: POST /api/channels/config
    API->>JS: Validate via Zod (Normalizer)
    JS->>FS: Atomic Write (Domain Ownership)
    FS-->>JS: Success
    JS-->>API: Response
    API-->>RQ: JSON Response
    RQ-->>React: Invalidate Cache
    React-->>User: UI Update
```

### 5.2 Key Design Decisions

| Aspekt | Entscheidung | Begründung |
|--------|----------|-----------|
| **State Management** | Zustand + React Query | Trennung von UI-Zustand und Server-Cache. |
| **Validation** | Zod (Hardened) | Laufzeit-Schutz gegen unvollständige JSONs. |
| **Communication** | SSE (Server-Sent Events) | Unidirektionales Hot-Reloading ohne Polling-Overhead. |
| **Persistence** | Domain-Driven Ownership | Vermeidung von File-Locks durch exklusive Zuständigkeiten. |

---

## 6. Architektur-Risiken & Audit-Härtung

1.  **D-01: Zod-Mine (Internal Crash):** Zod 4 stürzt bei `undefined` ab. **Vorgabe:** Programmatische Initialisierung aller Array-Felder.
2.  **D-02: Persistence Gaps:** Ohne atomaren Write-Handover im Backend droht Datenverlust. **Vorgabe:** Einsatz von validiertem Flush zur `openclaw.json`.
3.  **D-03: Bot Polling Conflict:** HTTP 409 Kollisionen vermeiden durch asymmetrische Trennung (TARS vs CASE).

---
*Status: V1.5 Finalisiert. Alle technischen Skelette wurden aus ARCHITECTURE.md übernommen.*
