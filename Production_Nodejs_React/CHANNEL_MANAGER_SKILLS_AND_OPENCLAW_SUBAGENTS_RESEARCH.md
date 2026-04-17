---
title: "Research: Skills (Dateien) vs. OpenClaw Sub-Agents — Lebenszyklus, Import, externe Quellen"
type: RESEARCH
status: active
last_modified: "2026-04-18"
git_path: "Production_Nodejs_React/CHANNEL_MANAGER_SKILLS_AND_OPENCLAW_SUBAGENTS_RESEARCH.md"
---

**Siehe auch:** [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) (§2.10 Workbench), [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.2c–e.

# Research: Skills vs. OpenClaw Sub-Agents

## Problem / Scope

Zwei Begriffe werden leicht vermischt:

1. **Workspace-Skills** — Ordner mit `SKILL.md` auf der Platte (Studio vs. OpenClaw-Workspace vs. gebündelt).
2. **OpenClaw-Runtime-Sub-Agents** — gespawnte Sessions (`sessions_spawn`), siehe offizielle Doku.

Ergänzend: was der **Channel Manager** unter **`subAgents`** in `channel_config.json` meint (UI-Konfiguration, nicht identisch mit OpenClaw-Session-Subagents).

---

## 1. Channel Manager: Was „Import“ heute tut

Der Button **Import** (Upload) im Channel Manager ruft **`POST /api/channels/import`** auf: typischerweise **`channel_config.json`** (Kanäle, Agenten, SubAgent-Einträge) — **nicht** den Import eines Skill-Ordners oder ZIPs.

**Skills als Ordner** (`…/skills/<skillId>/SKILL.md`): Workbench, manuelles Kopieren oder spätere eigene „Skill-Import“-Flows — siehe §2.

---

## 2. Skills: Orte und Stufen (Dev → Production)

### 2.1 Empfohlenes Schichtenmodell

| Stufe | Ort (typisch) | Rolle |
|--------|----------------|--------|
| **Entwicklung / Studio** | z. B. `Studio_Framework/015_AgentSkills_Dev/` | Experimente, Git-Review; keine Pflicht für OpenClaw-Laufzeit. |
| **Production (OpenClaw Workspace)** | `OPENCLAW_WORKSPACE/skills/<skillId>/` + `SKILL.md` | Sichtbar für Gateway/Scanner, `GET /api/channels` → `metadata.skills`, `src: workspace`. |
| **Gebündelt** | `~/.npm-global/…/openclaw/skills/<skillId>/` | Mitgelieferte Skills; Control Center/Workbench über Backend-Roots. |

**„80 % fertig → Production“** = Governance (Kopieren/Mergen, Checkliste), keine separate Engine-Stufe.

### 2.2 Frontmatter (`heritage`, Tags, RS-Header)

- YAML-Frontmatter in `SKILL.md` ist üblich; zusätzliche Schlüssel sollten die **vom Scanner/OpenClaw erwartete Pflichtstruktur** nicht brechen.
- Optional: `heritage:`, `stage: dev|prod`, `tags:` — im **eigenen** Registry-Scanner auswerten.
- Verletzung von „Skill-Regeln“: vor allem fehlende Pflichtfelder oder falsches Ordnerlayout (projektinterne Registry-Spec, falls vorhanden).

### 2.3 Redundanz

- Eine kanonische Production-Quelle pro `skillId` unter `workspace/skills/` reduziert Drift; Studio-Kopien = Entwürfe. **Promotion:** expliziter Merge/Copy + Git.

---

## 3. OpenClaw Sub-Agents (Laufzeit) — Kurzfassung aus den Quellen

### 3.1 Offizielle Dokumentation

Sub-Agents sind **Hintergrundläufe** mit eigener Session, Tool-Policies, Limits — nicht dasselbe wie eine Markdown-Datei im Studio. Hinweise zu **Kontext/Bootstrap** für Sub-Agent-Sessions stehen unter **Limitations** auf der Doku-Seite (welche Workspace-Dateien injiziert werden).

### 3.2 Issue #27038 — Dokumentation vs. implementiertes Verhalten

Es wurde diskutiert, ob die **Dokumentation** (welche Dateien Sub-Agent-Kontexte erhalten) und der **Code** (`MINIMAL_BOOTSTRAP_ALLOWLIST` u. a. mit `SOUL.md`) übereinstimmen. Das Issue ist **closed as not planned**. Operativ: Doku und installierte `openclaw`-Version **nicht** blind gleichsetzen; bei Bedarf im eigenen Workspace verifizieren.

### 3.3 Drittanbieter-Blog (Betriebspraxis)

Praxisbericht zu mehreren Agenten, `openclaw.json`, Telegram-Bindings, Persönlichkeitsdateien — **Topologie**, nicht identisch mit `subAgents[]` im Channel Manager.

---

## 4. Channel Manager: `subAgents` im JSON

Einträge unter **`subAgents`** sind eine **Konfigurationsschicht** fürs UI (Zuordnung zu Hauptagenten, zusätzliche Skills, Kanal-Toggles). Sie **ersetzen** nicht die OpenClaw-Engine-Definition eines **Sub-Agent als Session**.

**Soul-/MD-Editoren** pro Eintrag nur nötig, wenn ihr diese Konfiguration **explizit** an Dateipfade bindet (`soulPath` o. Ä.). Für **reine Skill-Themen** gilt §2.

**Hardening 17.04.2026 (operativ):** `channel_config.json` muss **`channels`**, **`agents`**, **`subAgents`** als **Arrays** führen (kein `{}` statt `[]`); Backend normalisiert defensiv. Leere Listen können beim **GET** aus **Metadaten** ergänzt werden, damit der Agents-Tab nicht leer bleibt — siehe [OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md](OPENCLAW_CHANNEL_MANAGER_RESTORATION_REPORT.md). Das ändert **nicht** die inhaltliche Trennung „CM-Config-Subagent“ vs. „OpenClaw-Runtime-Subagent“ (§3).

---

## 5. Kurzfassung

| Thema | Kurz |
|-------|------|
| **Skills** | Studio (Dev) ↔ Workspace `skills/` (Prod) + gebündelt; CM-**Import** = Kanal-Config. |
| **SKILL.md-Metadaten** | Möglich, wenn Scanner/Governance mitspielen. |
| **OpenClaw Sub-Agents** | Laufzeit; Doku/Code können divergieren — §3 und References. |
| **CM `subAgents`** | UI/Config; bewusst von OpenClaw-Sessions trennen. |

---

## Related (Repo-intern)

- [CHANNEL_MANAGER_SPECIFICATION.md](CHANNEL_MANAGER_SPECIFICATION.md) §3.2c–e  
- [CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md](CHANNEL_MANAGER_DOCUMENTATION_16-04-2026.md) §2.10  
- [CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md](CHANNEL_MANAGER_IDE_BRIDGE_DISCOVERY.md) (Vergleich: **Discovery** = projektinterne Brücke; dieses Dokument = **Research** mit externen Quellen)

---

## References (extern)

Vollständige URLs — Stand der Recherche, keine Garantie auf Änderungen durch Dritte.

1. OpenClaw — **Sub-Agents** (offizielle Doku):  
   https://docs.openclaw.ai/tools/subagents  

2. GitHub — **openclaw/openclaw** Issue **#27038** (*Incorrect documentation: Soul.md is injected in sub-agents*):  
   https://github.com/openclaw/openclaw/issues/27038  

3. CDNsun Blog — **Multi-agents in OpenClaw: sub-agents and Telegram**:  
   https://blog.cdnsun.com/multi-agents-in-openclaw-sub-agents-and-telegram/

---

*Ende Research-Notiz.*
