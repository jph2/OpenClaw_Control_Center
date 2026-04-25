# SPEC - Open Brain Boundary Conditions

Date: 2026-04-25
Status: Architecture guardrail
Applies to: Studio Framework artifacts, Channel Manager §8b.5, OpenClaw memory
Related: `SPEC_8B5_IDE_MEMORY_BRIDGE.md`, `030_ROADMAP.md`

## 1. Intent

Open Brain (OB1) is the long-term semantic knowledge layer and MCP-accessible
memory substrate. Studio Framework remains the authoring and artifact system.
OpenClaw memory remains the operational agent-memory layer.

The integration boundary is artifact-centered:

```text
Producer surface (Codex / Cursor / OpenCode / Chat / Telegram)
  -> Studio Framework artifact + artifact metadata
  -> optional A070 summary / sidecar
  -> explicit promote to OpenClaw operational memory
  -> export/sync to Open Brain semantic memory
  -> Open Brain search / MCP read-back by any AI client
```

Producer tools may create or update artifacts. They must not become separate
truth stores.

## 2. Open Brain Facts To Preserve Locally

These facts are copied here as local guardrails so future work does not need to
reload the OB1 repository into the context window.

- OB1's core model is one database, one AI gateway, one chat/capture channel,
  and tool-agnostic persistent memory shared by AI clients.
- OB1 stores thoughts in a `thoughts` table with raw content, vector embedding,
  JSON metadata, timestamps, and content fingerprint support.
- OB1 exposes semantic search and capture through a remote MCP server deployed
  as a Supabase Edge Function.
- OB1 prefers remote MCP / connector URLs over local-only Node stdio bridges for
  extension/integration endpoints.
- OB1 contribution hygiene requires structured metadata, README-level
  instructions, no secrets, no binary blobs, and tested recipes.
- OB1 uses deduplication/fingerprints to prevent repeated captures from
  polluting memory.
- OB1 has schema-aware routing and import recipes; this matches our planned
  agent-assisted TTG classification, but classification must remain reviewable.

Source references:

- `https://github.com/NateBJones-Projects/OB1`
- `https://raw.githubusercontent.com/NateBJones-Projects/OB1/main/README.md`
- `https://raw.githubusercontent.com/NateBJones-Projects/OB1/main/docs/01-getting-started.md`
- `https://raw.githubusercontent.com/NateBJones-Projects/OB1/main/CONTRIBUTING.md`

## 3. Boundary Rules

### Rule 1 - Artifacts Are The Durable Truth

Studio Framework artifacts carry identity, type, TTG binding, project binding,
status, tags, timestamps, and provenance. Codex, Cursor, OpenCode, Telegram,
and chat logs are producer surfaces only.

### Rule 2 - OpenClaw Memory Is Operational

OpenClaw `memory/*.md` and `MEMORY.md` are for runtime agent continuity and
operational recall. They are not the canonical Studio Framework artifact store
and not the full semantic knowledge database.

### Rule 3 - Open Brain Is Semantic Index / Shared Brain

Open Brain receives curated artifact exports or sync records. It should be able
to search and recall Studio Framework knowledge across tools, but it should not
be the only place where artifact source truth lives.

### Rule 4 - No Secrets In Exportable Artifacts

Never place credentials, API keys, access keys, auth profiles, local tokens,
browser cookies, or `.env` values in:

- Studio artifacts
- A070 summaries
- sidecar metadata
- OpenClaw memory promote blocks
- Open Brain export payloads
- evidence artifacts

Secrets remain in configured local secret stores only.

### Rule 5 - Every Exportable Artifact Needs Metadata

Every Studio artifact that may enter Open Brain must have stable,
machine-readable metadata:

```yaml
id: "stable-artifact-id"
title: "Human title"
type: DISCOVERY|RESEARCH|SPEC|DECISION|QUICKDOCU|SUMMARY|...
status: active|draft|archived|deprecated
tags: []
created: "ISO timestamp"
last_modified: "ISO timestamp"

initial_ttg:
  id: "-100..."
  name: "TTG..."
  reason: ""

current_ttg:
  id: "-100..."
  name: "TTG..."
  reason: ""

project:
  id: ""
  repo_slug: ""
  root: ""

binding:
  status: confirmed|inferred|needs_review|ambiguous|unknown|blocked
  method: artifact_header|project_mapping|agent_classification|explicit|none
```

### Rule 6 - Fingerprints Are Required For Sync

Open Brain sync must include stable dedup identifiers:

- `artifact_id`
- `source_path`
- `content_hash`
- `schema_version`
- `updated_at`
- optional `promote_marker`
- optional `ob1_thought_id` once known

The content hash is normative:

- Hash algorithm: SHA-256.
- Hash input is canonical JSON with sorted keys.
- Hash input includes:
  - `schema_version`
  - `artifact.id`
  - `artifact.type`
  - `artifact.status`
  - normalized `tags`
  - `current_ttg.id`
  - `project.id`
  - logical `source_path`
  - normalized Markdown body
- Hash input excludes:
  - `created`
  - `last_modified`
  - sync timestamps
  - UI timestamps
  - absolute machine-local paths
  - audit timestamps
  - Open Brain returned ids
- Markdown body normalization:
  - normalize line endings to `\n`
  - trim trailing whitespace per line
  - collapse three or more blank lines to two
  - preserve headings, lists, code fences, and meaningful internal whitespace
- YAML/frontmatter normalization:
  - parse and serialize selected fields with sorted keys
  - ignore volatile fields listed above

This prevents unnecessary re-syncs while still detecting meaningful artifact
changes.

### Rule 7 - Classification Is Not Confirmation

If an agent assigns a TTG because the human did not, that result is
`inferred` or `needs_review`, not `confirmed`.

`confirmed` requires at least one of:

- explicit human selection
- durable artifact header
- project mapping
- previously reviewed Open Brain / Channel Manager mapping state

Human confirmation must materialize in a durable record:

1. preferred: artifact header (`binding.status = confirmed`,
   `binding.confirmed_by`, `binding.confirmed_at`)
2. fallback: governed sidecar metadata or mapping registry
3. never sufficient alone: ephemeral UI state, chat statement, or transient
   adapter metadata

### Rule 8 - Sync Is Auditable And Reversible

Open Brain sync should be explicit or policy-driven with audit:

- what artifact was synced
- what content hash was synced
- what metadata was sent
- what Open Brain thought id or upsert result returned
- whether the operation inserted, updated, or skipped as duplicate

Policy-driven sync is allowed only for pre-approved reviewed artifacts. It is
forbidden for `needs_review`, `ambiguous`, `unknown`, or `blocked` bindings.
Every policy-driven sync must record the policy id/source that authorized it.

### Rule 9 - Index Is The Shared Resolver Layer

Promote, export, sync, and review UI must resolve from the same artifact index /
resolver output. They must not each invent their own resolver.

The artifact index is the central computed view for:

- UI preview
- promote eligibility
- export eligibility
- sync payload source
- review status
- stale/drift detection
- secret gate result

### Rule 10 - Identity And Paths Are Separated

Identity must not depend on absolute local paths.

- artifact identity: `artifact.id`
- logical source location: repository-relative or Studio-root-relative
  `source_path`
- project identity: `project.id` and optional `repo_slug`
- machine-local provenance: optional and never dedup-leading

Absolute paths may be stored locally for operator debugging but must not be the
primary dedup/upsert identity and must not be required by Open Brain.

### Rule 11 - Secret Handling Gate

Secret handling has four phases:

1. detect token-like values and forbidden filenames/paths
2. classify severity
3. decide block vs redact
4. audit and show operator-visible reason

Default matrix:

| Finding | Draft/Index | Export/Sync | Action |
| --- | --- | --- | --- |
| `.env` value, API key, token, password | allowed only locally with warning | blocked | remove/redact source |
| link/path to local secret file | warning | blocked unless explicitly allowlisted as reference-only | review |
| fake/example key clearly marked | allowed | redact by default | optional allow |
| high-entropy unknown string | warning | blocked until reviewed | review |

When blocked, the artifact remains editable but export/sync eligibility becomes
`blocked` with an operator-visible reason.

### Rule 12 - Promote, Export, Sync Terms Are Fixed

- **Promote** means append into OpenClaw operational memory.
- **Export** means build an OB1-ready record/payload.
- **Sync** means audited upsert into Open Brain.

APIs, UI labels, audit records, and docs must not use these terms
interchangeably.

### Rule 13 - Drift Semantics

Artifact is the durable truth.

- OpenClaw memory promote blocks are historical operational snapshots.
- Open Brain sync is latest reviewed artifact state via upsert.
- If an artifact changes after promote, the promote status becomes
  `stale` when the current content hash differs from the promoted hash.
- If an artifact changes after Open Brain sync, the sync status becomes
  `outdated_sync` when the current content hash differs from the synced hash.
- A new promote/sync updates the corresponding marker/hash and audit record.

### Rule 14 - Classification Evidence Is Durable

Agent classification must carry evidence in a durable sidecar/header/audit
record:

```json
{
  "classifierVersion": "agent-ttg-classifier-v1",
  "reviewState": "inferred|needs_review|confirmed|rejected",
  "matchedCandidates": [
    {
      "ttgId": "-100...",
      "ttgName": "TTG010_General_Discovery_Plus_Research",
      "confidence": 0.74,
      "signals": ["type:DISCOVERY", "tag:research"]
    }
  ],
  "selectedTtgId": "-100...",
  "confirmedBy": "",
  "confirmedAt": null,
  "rejectedReason": ""
}
```

Without evidence, a classification result may not be promoted to durable
confirmation.

### Rule 15 - Producer Envelope Is Shared

Every producer adapter returns the same minimal envelope:

```json
{
  "surface": "codex|cursor|opencode|telegram|chat|manual|unknown",
  "artifactRefs": [],
  "projectHints": {
    "projectId": "",
    "repoSlug": "",
    "sourcePath": ""
  },
  "source": {
    "sessionId": "",
    "operator": "",
    "model": "",
    "agent": "",
    "createdAt": ""
  },
  "bindingHints": {
    "explicitTtgId": "",
    "channelName": "",
    "pathHints": []
  },
  "evidence": {
    "surface": "explicit|derived|missing",
    "project": "explicit|derived|missing",
    "session": "explicit|derived|missing",
    "model": "explicit|derived|missing"
  }
}
```

Adapters expose provenance; they do not decide final memory truth.

## 4. Required Export Shape

The minimum Studio -> Open Brain export record:

```json
{
  "schema": "studio-framework.open-brain-export.v1",
  "artifact": {
    "id": "20260424-discovery-produktsprache-anzeichen-symbol",
    "title": "Theorie der Produktsprache, Anzeichen und Symbol - Discovery",
    "type": "DISCOVERY",
    "status": "active",
    "schemaVersion": "1.2",
    "sourcePath": "050_Artifacts/A010_discovery-research/110_produktsprache-anzeichen-symbol__DISCOVERY.md",
    "contentHash": "sha256:..."
  },
  "binding": {
    "status": "confirmed",
    "method": "artifact_header",
    "initialTtg": {
      "id": "-100732566515",
      "name": "TTG001_Idea_Capture"
    },
    "currentTtg": {
      "id": "-100390983368",
      "name": "TTG010_General_Discovery_Plus_Research"
    }
  },
  "project": {
    "id": "",
    "repoSlug": ""
  },
  "classificationEvidence": null,
  "provenance": {
    "producerSurface": "manual|codex|cursor|opencode|telegram|chat|unknown",
    "sourceSessionId": "",
    "operator": "",
    "createdAt": "",
    "updatedAt": ""
  },
  "openBrain": {
    "target": "thoughts",
    "operation": "upsert",
    "thoughtId": null,
    "syncedAt": null,
    "syncStatus": "not_synced|synced|outdated_sync|failed"
  }
}
```

## 5. Roadmap Implications

Producer adapters are now second-order convenience features. The core sequence
is:

1. `ARTIFACT_HEADER_BINDING_V1`
2. `ARTIFACT_INDEX_RESOLVER_V1`
3. `OPEN_BRAIN_EXPORT_CONTRACT_V1`
4. `AGENT_TTG_CLASSIFICATION_V1`
5. `ARTIFACT_TO_OPENCLAW_MEMORY_PROMOTE_V1`
6. `ARTIFACT_TO_OPEN_BRAIN_SYNC_V1`
7. producer adapters: Codex, Cursor, OpenCode, Telegram/Chat exports

The system is healthy when any producer can create or update a valid artifact
and the same artifact can be promoted into OpenClaw memory or synced into Open
Brain without tool-specific truth paths.
