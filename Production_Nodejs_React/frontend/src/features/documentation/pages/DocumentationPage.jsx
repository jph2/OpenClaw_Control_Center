import React, { useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import MermaidBlock from '../components/MermaidBlock.jsx';
import IdeCaptureLinuxMountDocSection from './IdeCaptureLinuxMountDocSection.jsx';

const p = {
    color: 'var(--text-secondary)',
    lineHeight: 1.65,
    margin: '0 0 0.75rem',
    fontSize: '0.95rem'
};

const ul = {
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    margin: '0 0 0.75rem',
    paddingLeft: '1.25rem',
    fontSize: '0.95rem'
};

const tableWrap = {
    overflowX: 'auto',
    margin: '1rem 0',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    background: 'var(--bg-elevated)'
};

const table = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.88rem',
    minWidth: '480px'
};

const th = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    background: 'var(--bg-surface)'
};

const td = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    verticalAlign: 'top'
};

function DocDetails({ title, children, defaultOpen = false, nested = false }) {
    return (
        <details
            className={`doc-details${nested ? ' doc-details--nested' : ''}`}
            open={defaultOpen}
            style={{
                marginBottom: nested ? '10px' : '12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                ...(!nested ? { background: 'var(--bg-surface)' } : {})
            }}
        >
            <summary
                style={{
                    cursor: 'pointer',
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontSize: nested ? '0.9rem' : '0.95rem',
                    listStyle: 'none',
                    userSelect: 'none'
                }}
            >
                {title}
            </summary>
            <div
                style={{
                    padding: '4px 16px 16px',
                    borderTop: '1px solid var(--border-color)'
                }}
            >
                {children}
            </div>
        </details>
    );
}

function DocMegaSection({ icon, title, subtitle, children, id }) {
    return (
        <section className="doc-mega-section" id={id || undefined} style={id ? { scrollMarginTop: '72px' } : undefined}>
            <h2 className="doc-mega-section__title">
                {icon ? <span aria-hidden>{icon}</span> : null}
                {title}
            </h2>
            {subtitle ? <div className="doc-mega-section__subtitle">{subtitle}</div> : null}
            {children}
        </section>
    );
}

const MERMAID_BUNDLE = `flowchart TB
  subgraph bundle["Control Center — one UI bundle"]
    CM["Channel Manager<br/>channels policy apply chat IDE column"]
    WB["Workbench<br/>host tree editor diff"]
  end
  CM <-->|deep link store edit| WB
  CM -->|apply| GW[OpenClaw Gateway<br/>openclaw.json]
  WB -->|REST| API["/api/workbench/*"]
  CM -->|REST SSE| CH["/api/channels …<br/>/api/channels/events"]`;

const MERMAID_CM_ROW = `flowchart LR
  subgraph row["One TTG row in Channel Manager"]
    A[Configuration]
    B[OpenClaw Chat]
    C["TARS in IDE · IDE project summary"]
  end
  A --- B --- C`;

const MERMAID_IDE_PANEL = `flowchart TB
  subgraph ide["IDE column — three inner tabs"]
    P1[Studio A070_ide_cursor_summaries]
    P2["Studio artifacts · TTG review"]
    P3["OpenClaw memory read-only"]
  end
  P1 --> P2
  P2 --> P3`;

const MERMAID_MEMORY_LAYER = `flowchart TB
  subgraph ext["Outside core OpenClaw UI"]
    IDEs["IDEs and tools e.g. Cursor Antigravity OpenCode Cloud Code"]
  end
  subgraph studio["Studio Framework long-running workspace"]
    A["artifacts code docs"] --> B["categorize and tag"]
    B --> C["index export Open Brain"]
  end
  subgraph oc["OpenClaw"]
    MEM["memory and agent network"]
  end
  IDEs --> A
  C --> MEM
  PANEL["IDE column in Channel Manager"] --> C
  PANEL --> MEM`;

function useScrollToHashOnDocs() {
    const { pathname, hash } = useLocation();
    useLayoutEffect(() => {
        if (!hash || pathname !== '/docs') return;
        const id = decodeURIComponent(hash.replace(/^#/, ''));
        if (!id) return;
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [pathname, hash]);
}

export default function DocumentationPage() {
    useScrollToHashOnDocs();
    return (
        <div
            style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
            }}
        >
            <header
                style={{
                    flexShrink: 0,
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.5rem' }} aria-hidden>
                        📖
                    </span>
                    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Documentation</h1>
                </div>
                <nav style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                    <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        ← Home
                    </Link>
                    <Link to="/workbench" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                        Workbench
                    </Link>
                    <Link to="/channels" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                        Channel Manager
                    </Link>
                </nav>
            </header>

            <main
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    paddingBottom: '48px'
                }}
            >
                <div
                    style={{
                        maxWidth: '860px',
                        margin: '0 auto',
                        padding: '28px 24px 32px'
                    }}
                >
                    <p style={{ ...p, fontSize: '1.05rem', marginBottom: '0.75rem' }}>
                        This guide describes <strong style={{ color: '#fff' }}>OpenClaw UI Extensions</strong> as a single{' '}
                        <strong style={{ color: '#fff' }}>coherent bundle</strong>: the{' '}
                        <strong style={{ color: '#fff' }}>Channel Manager</strong> drives channels, gateway policy, and per–Telegram-group
                        features; the <strong style={{ color: '#fff' }}>Workbench</strong> is the shared file and editor layer on the host —
                        including hand-offs from the manager’s IDE column.
                    </p>

                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: '1.25rem 0 0.5rem' }}>
                        Page outline
                    </h2>
                    <ul className="doc-list-outline" style={{ marginBottom: '1.25rem' }}>
                        <li>
                            <strong>Bundle at a glance</strong> — table of parts plus Mermaid diagrams
                            <ul className="doc-list-outline-sub">
                                <li>How Channel Manager, Workbench, and Studio Framework connect</li>
                                <li>Memory layer: external IDEs → Studio → OpenClaw memory</li>
                            </ul>
                        </li>
                        <li>
                            <strong>Channel Manager</strong> — global tabs, per-TTG row sub-tabs, IDE column (collapsible detail)
                            <ul className="doc-list-outline-sub">
                                <li>Configuration, OpenClaw Chat, TARS in IDE / project summary (inner tabs)</li>
                            </ul>
                        </li>
                        <li>
                            <strong>Workbench MVP</strong> — host file tree and editor (collapsible detail)
                        </li>
                        <li>
                            <strong>IDE chat capture — Linux SMB mount</strong> — one-time API host setup (
                            <a href="#ide-capture-linux-mount" style={{ color: 'var(--accent)' }}>
                                jump
                            </a>
                            )
                        </li>
                        <li>
                            <strong>Reference &amp; environment</strong> — env vars and repo docs
                        </li>
                    </ul>

                    <div className="doc-bundle-banner">
                        <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Workbench and Channel Manager are not two unrelated
                        apps — they are <strong style={{ color: 'var(--text-primary)' }}>one operator-facing surface</strong>. The{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>IDE column</strong> also has a strategic role: it is the operational
                        bridge that pulls work done outside the classic OpenClaw UI — in IDEs and coding tools — into OpenClaw’s{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>memory and artifact ecosystem</strong> and the{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>Studio Framework</strong> (see Channel Manager · IDE column below).
                    </div>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: '1.25rem 0 0.5rem' }}>
                        Bigger picture
                    </h2>
                    <ul className="doc-list-outline" style={{ marginBottom: '1.25rem' }}>
                        <li>
                            <strong>Where work happens:</strong> Much artifact and code work is not in core OpenClaw chat, but in{' '}
                            <strong>IDEs</strong> (e.g. <strong>Cursor</strong>, <strong>Antigravity</strong>) or tools such as{' '}
                            <strong>OpenCode</strong> and <strong>Cloud Code</strong>.
                        </li>
                        <li>
                            <strong>Studio Framework (host):</strong> long-running workspace — outputs land there, then get
                            <ul className="doc-list-outline-sub">
                                <li>
                                    <strong>Categorized and tagged</strong>
                                </li>
                                <li>
                                    <strong>Indexed</strong> and exportable (e.g. toward Open Brain)
                                </li>
                            </ul>
                        </li>
                        <li>
                            <strong>Layer around OpenClaw:</strong> agent network and memory sit inside a <strong>larger work and recall
                            system</strong> — the <strong>IDE column</strong> in Control Center is where you operate, verify, and tie that
                            bridge to gateway memory per channel.
                        </li>
                    </ul>

                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', margin: '0 0 0.75rem' }}>
                        Bundle at a glance
                    </h2>
                    <div style={tableWrap}>
                        <table style={table}>
                            <thead>
                                <tr>
                                    <th style={th}>Part</th>
                                    <th style={th}>Role in the bundle</th>
                                    <th style={th}>How it connects</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={td}>
                                        <strong style={{ color: 'var(--text-primary)' }}>Channel Manager</strong>
                                    </td>
                                    <td style={td}>
                                        Per-TTG policy (model, skills, Skill Roles), global agent/skill catalogs, Apply to{' '}
                                        <code style={{ color: 'var(--accent)' }}>openclaw.json</code>, embedded chat and IDE column per row
                                    </td>
                                    <td style={td}>
                                        Opens paths in Workbench; Apply talks to the gateway — independent of Workbench but the same
                                        OpenClaw install
                                    </td>
                                </tr>
                                <tr>
                                    <td style={td}>
                                        <strong style={{ color: 'var(--text-primary)' }}>Workbench</strong>
                                    </td>
                                    <td style={td}>
                                        Tree, filters, editor, diff — all via <code style={{ color: 'var(--accent)' }}>/api/workbench</code>{' '}
                                        on allowed host paths
                                    </td>
                                    <td style={td}>
                                        Receives deep links / store updates from the manager (e.g. skill folders, artifact paths) without
                                        channel logic of its own
                                    </td>
                                </tr>
                                <tr>
                                    <td style={td}>
                                        <strong style={{ color: 'var(--text-primary)' }}>Studio Framework</strong> (host)
                                    </td>
                                    <td style={td}>
                                        Long-running workspace for artifacts created outside the OpenClaw core (IDEs, OpenCode, Cloud Code,
                                        …): structure, tags, classification, index, export
                                    </td>
                                    <td style={td}>
                                        Wired through the IDE column and Workbench; OpenClaw memory and gateway remain the agent runtime —
                                        Studio provides the durable artifact plane
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <MermaidBlock chart={MERMAID_BUNDLE} caption="How the bundle fits together; separate backend paths" />
                    <MermaidBlock
                        chart={MERMAID_MEMORY_LAYER}
                        caption="Memory extension: external IDEs and Studio → index/export → OpenClaw memory; IDE column as bridge"
                    />
                    <MermaidBlock chart={MERMAID_CM_ROW} caption="Inside one TTG row: three peer sub-features" />
                    <MermaidBlock
                        chart={MERMAID_IDE_PANEL}
                        caption="IDE column: three inner tabs (do not confuse with global Channel Manager tabs)"
                    />

                    <DocMegaSection
                        icon="📺"
                        title="Channel Manager"
                        subtitle={
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Global header</strong> and top-level tabs:{' '}
                                    <strong>Manage Channels</strong>, <strong>Agents</strong>, <strong>Skills</strong>
                                </li>
                                <li>
                                    <strong>Per TTG row</strong> — three sub-tabs:
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            <strong>Configuration</strong> — model, skills, Skill Roles, relay skills, require-mention
                                        </li>
                                        <li>
                                            <strong>OpenClaw Chat</strong> — embedded chat for this Telegram group
                                        </li>
                                        <li>
                                            <strong>IDE column</strong> — UI label “TARS in IDE · IDE project summary”; inner tabs: Studio
                                            A070_ide_cursor_summaries, Studio artifacts, OpenClaw memory (read-only)
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>IDE column role:</strong> extends <strong>OpenClaw memory</strong> across{' '}
                                    <strong>external IDE/tool work</strong> and the <strong>Studio Framework</strong>
                                </li>
                                <li>
                                    Sections below are <strong>collapsible</strong> for detail
                                </li>
                            </ul>
                        }
                    >
                        <DocDetails title="Global tabs: Manage Channels · Agents · Skills" defaultOpen>
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Manage Channels:</strong> main work surface — one expandable row per TTG
                                    <ul className="doc-list-outline-sub">
                                        <li>Row sub-tabs: Configuration, Chat, IDE column (see per-row sections)</li>
                                        <li>
                                            Header bulk actions: collapse/configure all rows, open all chats (mind browser SSE/WebSocket
                                            limits)
                                        </li>
                                        <li>
                                            Export / Import / Reload; <strong>Apply to OpenClaw…</strong>
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Agents:</strong> master data for main agents (engines) and Skill Roles
                                    <ul className="doc-list-outline-sub">
                                        <li>Create, parent engine, extra skills, enable/disable</li>
                                        <li>Feeds skill and Skill Role assignment in channel rows</li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Skills:</strong> catalog with filters (category, origin, default flag, sort) — which skills
                                    exist system-wide, independent of one TTG
                                </li>
                            </ul>
                        </DocDetails>

                        <DocDetails title="Per TTG row — sub-tab: Configuration">
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Scope:</strong> configure <strong>this</strong> Telegram group — model, channel skills, active
                                    Skill Roles, CASE/IDE relay skills, require-mention, and other canonical config fields
                                </li>
                                <li>
                                    <strong>Persistence:</strong> changes usually save to the backend immediately (auto-save)
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            <strong>Apply to OpenClaw</strong> is the extra step that merges selected fields into{' '}
                                            <code style={{ color: 'var(--accent)' }}>openclaw.json</code> / gateway
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Layout:</strong> row height is adjustable; when expanded, the “TARS in IDE” block shows IDE
                                    relay skills (CASE catalog defaults) in the same row
                                </li>
                            </ul>
                        </DocDetails>

                        <DocDetails title="Per TTG row — sub-tab: OpenClaw Chat">
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Scope:</strong> embedded chat for <strong>this TTG only</strong>
                                </li>
                                <li>
                                    <strong>Behavior:</strong>
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            Uses <code style={{ color: 'var(--accent)' }}>useChatSession</code> with model and visibility
                                            from the row config
                                        </li>
                                        <li>Messages: Markdown rendering</li>
                                        <li>Tool calls: collapsible chips under assistant replies (not duplicated inline)</li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Limits:</strong> many chat sub-tabs across TTGs can exhaust browser SSE/WebSocket capacity —
                                    bulk action may open only the first TTG’s chat when forcing all rows to Chat
                                </li>
                                <li>
                                    <strong>Composer:</strong> send text; media/attachments per roadmap — a{' '}
                                    <strong>Channel Manager sub-feature</strong>, not a full replacement for the native OpenClaw client
                                </li>
                            </ul>
                        </DocDetails>

                        <DocDetails title="Per TTG row — sub-tab: TARS in IDE · IDE project summary" defaultOpen>
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>What it is:</strong> the <strong>IDE column</strong> (UI: “TARS in IDE · IDE project summary”) —
                                    a panel with <strong>three inner tabs</strong>, still inside Channel Manager but aimed at extending{' '}
                                    <strong>OpenClaw’s memory system</strong> beyond core OpenClaw UI alone
                                </li>
                                <li>
                                    <strong>Why it exists:</strong>
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            Artifacts and docs mostly originate <strong>outside</strong> the OpenClaw core —{' '}
                                            <strong>IDEs</strong> (Cursor, Antigravity), <strong>OpenCode</strong>,{' '}
                                            <strong>Cloud Code</strong>, similar tools
                                        </li>
                                        <li>
                                            That work must be <strong>captured, organized, and retrievable</strong>
                                        </li>
                                        <li>
                                            <strong>Studio Framework:</strong> long-running host workspace — categorize, tag,{' '}
                                            <strong>index</strong> (artifact index, export, optional Open Brain sync)
                                        </li>
                                        <li>
                                            <strong>IDE column</strong> = operator surface in Control Center for that chain per channel:
                                            A070_ide_cursor_summaries/mappings, Studio artifact review, read-only memory view, jumps to Workbench
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Big picture:</strong> a <strong>layer around OpenClaw</strong> grows{' '}
                                    <strong>agent network + memory</strong> into a <strong>larger work and recall system</strong> — OpenClaw
                                    stays the gateway; Studio + IDE column provide the <strong>durable, indexed artifact/knowledge side</strong>{' '}
                                    (including output from external IDEs/tools)
                                </li>
                            </ul>

                            <DocDetails title="Inner tab: Studio A070_ide_cursor_summaries — summaries, drafts, project mappings" nested defaultOpen>
                                <p style={p}>
                                    <strong style={{ color: 'var(--text-primary)' }}>Purpose:</strong> Manage Markdown summaries under Studio
                                    path A070_ide_cursor_summaries, create new drafts, and maintain <strong style={{ color: 'var(--text-primary)' }}>project
                                    mappings</strong> (operator-maintained mapping of <code style={{ color: 'var(--accent)' }}>projectId</code>{' '}
                                    / <code style={{ color: 'var(--accent)' }}>repoSlug</code> / mapping key to TTG ids).
                                </p>
                                <div style={tableWrap}>
                                    <table style={table}>
                                        <thead>
                                            <tr>
                                                <th style={th}>UI control</th>
                                                <th style={th}>What you use it for</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={td}>“New summary” path field</td>
                                                <td style={td}>
                                                    Relative path for the new Markdown file under A070_ide_cursor_summaries (suggested pattern: date, TTG,
                                                    project slug). Saved with <code style={{ color: 'var(--accent)' }}>createIfAbsent</code>.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Draft textarea</td>
                                                <td style={td}>
                                                    Summary body; after save the file appears in the left list (relative paths, status badge
                                                    from bridge metadata).
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Adapter selector</td>
                                                <td style={td}>
                                                    Records which surface produced the content (Manual, Codex, Cursor, Unknown) — analogous
                                                    to other IDEs/tools (e.g. Antigravity, OpenCode, Cloud Code) working outside the
                                                    OpenClaw core; used for provenance in summaries and the artifact pipeline.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Project root / Project id</td>
                                                <td style={td}>
                                                    Optional host root path; project id is derived from the path if empty — drives slugs in
                                                    filenames and metadata.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Explicit TTG id</td>
                                                <td style={td}>
                                                    Overrides the row TTG when you need a different binding in the draft (e.g. tests or
                                                    migration).
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>“Save new file”</td>
                                                <td style={td}>
                                                    Persists draft + metadata via the IDE summary API; errors show under the button.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Project mappings — rows</td>
                                                <td style={td}>
                                                    Table: <code style={{ color: 'var(--accent)' }}>projectId</code>,{' '}
                                                    <code style={{ color: 'var(--accent)' }}>repoSlug</code>, mapping key,{' '}
                                                    <code style={{ color: 'var(--accent)' }}>ttgId</code> (numeric Telegram id), label. “Add
                                                    mapping” / “Save mappings” writes the resolver source that pins later searches (artifacts,
                                                    paths) to TTGs.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p style={p}>
                                    <strong style={{ color: 'var(--text-primary)' }}>Left list:</strong> existing summaries; click loads
                                    preview on the right (Markdown). Status colors (draft, promoted, stale, …) come from bridge fields in the
                                    file — see <code style={{ color: 'var(--accent)' }}>SPEC_8B5_IDE_MEMORY_BRIDGE.md</code>.
                                </p>
                            </DocDetails>

                            <DocDetails title="Inner tab: Studio artifacts · TTG review" nested>
                                <p style={p}>
                                    <strong style={{ color: 'var(--text-primary)' }}>Purpose:</strong> Index of Studio artifacts with
                                    machine-readable headers: inspect classification/binding, confirm TTG assignment (writes YAML header),
                                    Open Brain export preview, optional HTTP sync when{' '}
                                    <code style={{ color: 'var(--accent)' }}>OPEN_BRAIN_SYNC_URL</code> is set.
                                </p>
                                <div style={tableWrap}>
                                    <table style={table}>
                                        <thead>
                                            <tr>
                                                <th style={th}>Control</th>
                                                <th style={th}>Explanation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={td}>Checkbox “Only show artifacts with TTG signal for this row”</td>
                                                <td style={td}>
                                                    Keeps artifacts relevant to <em>this</em> TTG row (confirmed binding,{' '}
                                                    <code style={{ color: 'var(--accent)' }}>current_ttg</code>, classifier candidate).
                                                    Unchecked = full “bridge queue” including generic review cases.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Left list</td>
                                                <td style={td}>
                                                    One entry per <code style={{ color: 'var(--accent)' }}>sourcePath</code>; badge for
                                                    binding status and method (e.g. agent_classification). Click selects the record.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>Right pane (after selection)</td>
                                                <td style={td}>
                                                    Artifact preview, header fields, actions: confirm TTG (modal: id / name / reason), Open
                                                    Brain export preview, stub sync when provider is active. Secret gates can block rows —
                                                    then no promote/sync.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={td}>EDIT in Workbench</td>
                                                <td style={td}>
                                                    Jumps to Workbench with the same host path (store/query) so you edit source Markdown
                                                    directly.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </DocDetails>

                            <DocDetails title="Inner tab: OpenClaw memory (read-only)" nested>
                                <p style={p}>
                                    Reads the memory index for the current TTG (or empty if nothing matches).{' '}
                                    <strong style={{ color: 'var(--text-primary)' }}>Read-only</strong> — reconcile what the gateway sees for
                                    this group without leaving chat. No writes from this tab.
                                </p>
                            </DocDetails>
                        </DocDetails>

                        <DocDetails title="Cross-cutting: Apply, Export/Import, live updates (SSE)">
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Apply to OpenClaw…</strong>
                                    <ul className="doc-list-outline-sub">
                                        <li>Merge workflow: preview, backup, write to gateway config</li>
                                        <li>
                                            Telegram bot admission merged only when “On next Apply…” is enabled — see button tooltip
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Export / Import</strong>
                                    <ul className="doc-list-outline-sub">
                                        <li>JSON backup of Channel Manager config</li>
                                        <li>Import restores a snapshot (use care in production)</li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>SSE</strong> (<code style={{ color: 'var(--accent)' }}>/api/channels/events</code>)
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            On <code style={{ color: 'var(--accent)' }}>CONFIG_UPDATED</code>, React Query channel cache
                                            invalidates — multiple tabs stay aligned
                                        </li>
                                    </ul>
                                </li>
                            </ul>
                        </DocDetails>
                    </DocMegaSection>

                    <DocMegaSection
                        icon="📂"
                        title="Workbench MVP"
                        subtitle={
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Role:</strong> file and editor layer of the same bundle as Channel Manager
                                </li>
                                <li>
                                    <strong>Entry points:</strong> usable standalone; often opened from the Channel Manager IDE column (deep
                                    link / store)
                                </li>
                            </ul>
                        }
                    >
                        <DocDetails title="Usage: sidebar, tree, filters, editor" defaultOpen>
                            <ul className="doc-list-outline">
                                <li>
                                    <strong>Layout:</strong> split view
                                    <ul className="doc-list-outline-sub">
                                        <li>
                                            <strong>Left:</strong> workspaces (quick paths, custom path, saved roots), tree (depth limit),
                                            live filters (name, age, size, type, sort)
                                        </li>
                                        <li>
                                            <strong>Right:</strong> editor + line numbers; Markdown: preview, outline, optional scroll sync
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Save:</strong> manual save and autosave via{' '}
                                    <code style={{ color: 'var(--accent)' }}>/api/workbench/save</code>
                                </li>
                                <li>
                                    <strong>Tools:</strong> diff view; create/delete files and folders (delete confirms)
                                </li>
                                <li>
                                    <strong>Paths:</strong> backend allowlist only; full FS from root requires{' '}
                                    <code style={{ color: 'var(--accent)' }}>WORKBENCH_ALLOW_FS_ROOT</code>
                                </li>
                            </ul>
                        </DocDetails>

                        <DocDetails title="Workbench — REST endpoints (quick reference)">
                            <div style={tableWrap}>
                                <table style={table}>
                                    <thead>
                                        <tr>
                                            <th style={th}>Path</th>
                                            <th style={th}>Role</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={td}>
                                                <code style={{ color: 'var(--accent)' }}>/api/workbench/tree</code>
                                            </td>
                                            <td style={td}>Directory tree</td>
                                        </tr>
                                        <tr>
                                            <td style={td}>
                                                <code style={{ color: 'var(--accent)' }}>/api/workbench/file</code>
                                            </td>
                                            <td style={td}>Read file</td>
                                        </tr>
                                        <tr>
                                            <td style={td}>
                                                <code style={{ color: 'var(--accent)' }}>/api/workbench/save</code>
                                            </td>
                                            <td style={td}>Write file</td>
                                        </tr>
                                        <tr>
                                            <td style={td}>
                                                <code style={{ color: 'var(--accent)' }}>/api/workbench/delete</code> /{' '}
                                                <code style={{ color: 'var(--accent)' }}>mkdir</code> /{' '}
                                                <code style={{ color: 'var(--accent)' }}>touch</code>
                                            </td>
                                            <td style={td}>Change structure</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </DocDetails>
                    </DocMegaSection>

                    <IdeCaptureLinuxMountDocSection />

                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', margin: '2rem 0 0.75rem' }}>
                        Reference &amp; environment
                    </h2>

                    <DocDetails title="Environment variables (selection)" defaultOpen={false}>
                        <ul className="doc-list-outline" style={{ marginBottom: '0.75rem' }}>
                            <li>
                                Quick reference — see backend <code style={{ color: 'var(--accent)' }}>.env</code> examples for full list
                            </li>
                        </ul>
                        <div style={tableWrap}>
                            <table style={table}>
                                <thead>
                                    <tr>
                                        <th style={th}>Variable</th>
                                        <th style={th}>Summary</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={td}>
                                            <code style={{ color: 'var(--accent)' }}>WORKBENCH_ALLOW_FS_ROOT</code>
                                        </td>
                                        <td style={td}>Allow Workbench from filesystem root (enable only deliberately)</td>
                                    </tr>
                                    <tr>
                                        <td style={td}>
                                            <code style={{ color: 'var(--accent)' }}>OPEN_BRAIN_SYNC_URL</code>
                                        </td>
                                        <td style={td}>HTTP base URL for artifact sync / stub</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </DocDetails>

                    <DocDetails title="Docs in the repo" defaultOpen={false}>
                        <ul className="doc-list-outline">
                            <li>
                                <code style={{ color: 'var(--accent)' }}>020_ARCHITECTURE.md</code> — system architecture
                            </li>
                            <li>
                                <code style={{ color: 'var(--accent)' }}>030_ROADMAP.md</code> — roadmap and gates
                            </li>
                            <li>
                                <code style={{ color: 'var(--accent)' }}>SPEC_8B5_IDE_MEMORY_BRIDGE.md</code> — IDE / memory bridge spec
                            </li>
                            <li>
                                <code style={{ color: 'var(--accent)' }}>QA_8B5_IDE_MEMORY_BRIDGE.md</code> — QA checklist and maturity
                            </li>
                        </ul>
                    </DocDetails>
                </div>
            </main>
        </div>
    );
}
