import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const labelMuted = { color: '#8892a6', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

/**
 * C1b.2e — Account-level Telegram gates (saved in channel_config.json; optional Apply slice).
 */
export default function TelegramAccountPolicyPanel({
    draft,
    setDraft,
    live,
    onSave,
    savePending
}) {
    const [expanded, setExpanded] = useState(false);

    const showGroupAllowWarning =
        draft.applyOnOpenClawApply &&
        draft.groupPolicy === 'allowlist' &&
        (!draft.groupAllowFrom || draft.groupAllowFrom.length === 0);

    const liveLine =
        live && (live.groupPolicy != null || live.dmPolicy != null)
            ? `Groups: ${String(live.groupPolicy ?? '—')} · DMs: ${String(live.dmPolicy ?? '—')}${
                  Array.isArray(live.groupAllowFrom) && live.groupAllowFrom.length > 0
                      ? ` · group allowlist: ${live.groupAllowFrom.length} IDs`
                      : ''
              }`
            : null;

    const groupIdsActive = draft.groupPolicy === 'allowlist';
    const dmIdsActive = draft.dmPolicy === 'allowlist';

    const groupIdsHint =
        draft.groupPolicy === 'allowlist'
            ? 'Required for “Listed group IDs only”: enter numeric group IDs (one per line or comma-separated). Empty means almost no group traffic.'
            : draft.groupPolicy === 'open'
              ? 'For “All groups (open)” no list is needed — field disabled. (Saved IDs stay in config and apply again if you switch to allowlist.)'
              : 'For “Groups disabled” this list has no effect — field disabled.';

    const dmIdsHint =
        draft.dmPolicy === 'allowlist'
            ? 'Required for “Listed sender IDs only”: enter Telegram user IDs. Empty may block all DMs.'
            : draft.dmPolicy === 'pairing'
              ? 'For “Pairing” no sender list is needed — OpenClaw pairing applies. Field disabled.'
              : draft.dmPolicy === 'open'
                ? 'For “All DMs (open)” no sender IDs needed — field disabled.'
                : 'For “DMs disabled” this list has no effect — field disabled.';

    const connectorStyle = {
        marginTop: 2,
        padding: '6px 0 0 10px',
        borderLeft: '2px solid rgba(143, 179, 255, 0.35)',
        fontSize: 10,
        color: '#6b7a94',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1.35
    };

    const selectStyle = {
        marginTop: 6,
        width: '100%',
        padding: '8px 10px',
        background: '#13141c',
        border: '1px solid var(--border-color, #333)',
        color: '#fff',
        borderRadius: 6,
        fontSize: 13
    };

    /** Same columns as the policy cards below — keeps the Apply-checkbox aligned with the DM column. */
    const policyGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 20,
        alignItems: 'stretch'
    };

    const collapsedSummary = [
        `Groups: ${draft.groupPolicy}`,
        `DMs: ${draft.dmPolicy}`,
        `Write to gateway on Apply: ${draft.applyOnOpenClawApply ? 'yes' : 'no'}`
    ].join(' · ');

    const toggleExpanded = () => setExpanded((x) => !x);

    return (
        <section
            className="telegram-account-policy-panel"
            style={{
                marginBottom: 16,
                padding: expanded ? '16px 18px' : '10px 14px',
                background: 'linear-gradient(180deg, #1a1c28 0%, #161722 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: '#c8c8d0',
                fontSize: 13,
                lineHeight: 1.5,
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflowX: 'hidden'
            }}
        >
            <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={toggleExpanded}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded();
                    }
                }}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    cursor: 'pointer',
                    userSelect: 'none',
                    marginBottom: expanded ? 0 : 0
                }}
            >
                <span style={{ flexShrink: 0, marginTop: 1, color: '#9aa0b4', display: 'flex' }}>
                    {expanded ? <ChevronDown size={20} strokeWidth={2} /> : <ChevronRight size={20} strokeWidth={2} />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e8eaed' }}>
                        Bot admission (Telegram){' '}
                        <span style={{ fontWeight: 600, color: '#7a8499' }}>| Global Config</span>
                    </h2>
                    {!expanded && (
                        <p style={{ margin: '6px 0 0', color: '#8892a6', fontSize: 11, lineHeight: 1.45 }}>
                            {collapsedSummary}
                            {liveLine ? (
                                <>
                                    <br />
                                    <span style={{ color: '#6b7a94' }}>Live: {liveLine}</span>
                                </>
                            ) : null}
                        </p>
                    )}
                </div>
            </div>

            {expanded && (
                <>
                    <div style={{ ...policyGridStyle, marginBottom: 12, marginTop: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ margin: '0 0 0', color: '#9aa0b4', fontSize: 12, lineHeight: 1.6 }}>
                                Think of every message to your Telegram bot passing through a <strong>gate</strong>: first
                                OpenClaw asks whether traffic from <strong>this group</strong> or <strong>this private
                                chat</strong> may reach the bot at all — that is what the controls here do (group policy,
                                DM policy, optional allowlists). Only <strong>after that</strong> does the stack use the{' '}
                                <strong>TTG rows below</strong> for model, skills, and synth agent (
                                <strong>bindings</strong>). If this gate is closed, nothing reaches the TTG settings — it
                                can look “correctly configured” while the gateway already dropped the message. This panel
                                is that <strong>first gate</strong>.
                            </p>
                        </div>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                minWidth: 0,
                                width: '100%',
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                padding: '12px 16px',
                                background: 'rgba(80, 227, 194, 0.06)',
                                border: '1px solid rgba(80, 227, 194, 0.2)',
                                borderRadius: 8,
                                cursor: 'pointer'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={draft.applyOnOpenClawApply}
                                onChange={(e) => setDraft((d) => ({ ...d, applyOnOpenClawApply: e.target.checked }))}
                                onClick={(e) => e.stopPropagation()}
                                style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                            />
                            <span style={{ color: '#e0e0e0', minWidth: 0, flex: '1 1 auto' }}>
                                <strong>On the next “Apply to OpenClaw…”</strong>, also write this admission policy into
                                the gateway file (
                                <code style={{ fontSize: 11, color: '#9ff0dc' }}>openclaw.json</code>).
                                <br />
                                <span style={{ fontSize: 11, color: '#8892a6' }}>
                                    Without the checkbox: values stay only in the Channel Manager file — the gateway is
                                    unchanged.
                                </span>
                                <span
                                    style={{
                                        display: 'block',
                                        marginTop: 10,
                                        fontSize: 11,
                                        color: '#6b7a8f',
                                        lineHeight: 1.5
                                    }}
                                >
                                    <strong style={{ color: '#9aa5b8' }}>Default is off:</strong> so Apply does not
                                    accidentally overwrite live Telegram account rules in the gateway — you enable
                                    writing to{' '}
                                    <code style={{ fontSize: 10, color: '#9ff0dc' }}>openclaw.json</code> deliberately
                                    when you want the same admission there. After “Save to Channel Manager config”, your
                                    last choice (on/off) stays in the config file.
                                </span>
                            </span>
                        </label>
                    </div>

                    {liveLine && (
                        <div
                            style={{
                                marginBottom: 14,
                                padding: '8px 12px',
                                background: 'rgba(143, 179, 255, 0.08)',
                                border: '1px solid rgba(143, 179, 255, 0.22)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#b8ccff'
                            }}
                        >
                            <span style={{ fontWeight: 600, color: '#8fb3ff' }}>Live on gateway:</span> {liveLine}
                        </div>
                    )}

                    {showGroupAllowWarning && (
                        <div
                            style={{
                                marginBottom: 14,
                                padding: '10px 12px',
                                background: 'rgba(255, 140, 80, 0.1)',
                                border: '1px solid rgba(255, 140, 80, 0.35)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#ffcca8'
                            }}
                        >
                            <strong>Note:</strong> “Listed groups only”, but the group list is empty — incoming group
                            messages may be dropped silently (known TTG001/TTG000 scenario).
                        </div>
                    )}

                    <div style={{ ...policyGridStyle, marginBottom: 16 }}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0,
                                minWidth: 0,
                                padding: '12px 14px 14px',
                                background: 'rgba(0,0,0,0.12)',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)'
                            }}
                        >
                            <div style={labelMuted}>Group chats</div>
                            <select
                                value={draft.groupPolicy}
                                onChange={(e) => setDraft((d) => ({ ...d, groupPolicy: e.target.value }))}
                                style={selectStyle}
                            >
                                <option value="open">
                                    All groups (open) | If the bot is in a supergroup, messages there may reach the
                                    gateway — typical for internal TTGs without a group allowlist.
                                </option>
                                <option value="allowlist">
                                    Listed group IDs only (allowlist) | Only groups whose Telegram ID is in the list;
                                    empty list ≈ no group traffic (use with care).
                                </option>
                                <option value="disabled">
                                    Groups disabled | Bot does not ingest groups; DMs only (if dmPolicy allows).
                                </option>
                            </select>
                            <div style={connectorStyle}>Tied to group policy above — group allowlist</div>
                            <div style={{ ...labelMuted, marginTop: 10 }}>Allowed groups (numeric IDs)</div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: groupIdsActive ? '#8b9aaf' : '#5c6578',
                                    marginTop: 4,
                                    marginBottom: 6,
                                    lineHeight: 1.45
                                }}
                            >
                                {groupIdsHint}
                            </div>
                            <textarea
                                rows={3}
                                disabled={!groupIdsActive}
                                title={groupIdsActive ? 'Group IDs for allowlist' : 'Editable only when group policy is allowlist'}
                                placeholder={
                                    groupIdsActive
                                        ? 'e.g. one ID per line:\n-1003752539559'
                                        : draft.groupPolicy === 'open'
                                          ? 'No entries needed — “open” allows groups without an ID list.'
                                          : draft.groupPolicy === 'disabled'
                                            ? 'Groups disabled — nothing to enter.'
                                            : ''
                                }
                                value={draft.groupAllowFrom.map(String).join('\n')}
                                onChange={(e) => {
                                    const parts = e.target.value
                                        .split(/[\n,;]+/)
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                    const arr = parts.map((x) => (/^-?\d+$/.test(x) ? Number(x) : x));
                                    setDraft((d) => ({ ...d, groupAllowFrom: arr }));
                                }}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: 10,
                                    background: groupIdsActive ? '#13141c' : '#0e0f14',
                                    border: `1px solid ${groupIdsActive ? 'var(--border-color, #333)' : 'rgba(255,255,255,0.06)'}`,
                                    color: groupIdsActive ? '#e0e0e0' : '#6b7280',
                                    borderRadius: 6,
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: 12,
                                    resize: 'vertical',
                                    opacity: groupIdsActive ? 1 : 0.85,
                                    cursor: groupIdsActive ? 'text' : 'not-allowed'
                                }}
                            />
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0,
                                minWidth: 0,
                                padding: '12px 14px 14px',
                                background: 'rgba(0,0,0,0.12)',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)'
                            }}
                        >
                            <div style={labelMuted}>Direct messages (DM)</div>
                            <select
                                value={draft.dmPolicy}
                                onChange={(e) => setDraft((d) => ({ ...d, dmPolicy: e.target.value }))}
                                style={selectStyle}
                            >
                                <option value="pairing">
                                    Pairing (recommended) | Only users who have paired / been approved — usual production
                                    mode, less spam risk than “open”.
                                </option>
                                <option value="allowlist">
                                    Listed sender IDs only (allowlist) | Only user IDs from “Allowed DM senders”; empty
                                    list may block all DMs — maintain the list.
                                </option>
                                <option value="open">
                                    All DMs (open) | Any Telegram user may message the bot — only if you intend that
                                    (public exposure, tests).
                                </option>
                                <option value="disabled">
                                    DMs disabled | No 1:1 messages; groups only (if groupPolicy allows).
                                </option>
                            </select>
                            <div style={connectorStyle}>Tied to DM policy above — sender allowlist</div>
                            <div style={{ ...labelMuted, marginTop: 10 }}>Allowed DM senders (IDs)</div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: dmIdsActive ? '#8b9aaf' : '#5c6578',
                                    marginTop: 4,
                                    marginBottom: 6,
                                    lineHeight: 1.45
                                }}
                            >
                                {dmIdsHint}
                            </div>
                            <textarea
                                rows={3}
                                disabled={!dmIdsActive}
                                title={dmIdsActive ? 'User IDs for DM allowlist' : 'Editable only when DM policy is allowlist'}
                                placeholder={
                                    dmIdsActive
                                        ? 'e.g. one user ID per line:\n123456789'
                                        : draft.dmPolicy === 'pairing'
                                          ? 'No entries needed — pairing controls who may write.'
                                          : draft.dmPolicy === 'open'
                                            ? 'No entries needed — “open” allows any sender.'
                                            : draft.dmPolicy === 'disabled'
                                              ? 'DMs disabled — nothing to enter.'
                                              : ''
                                }
                                value={draft.allowFrom.map(String).join('\n')}
                                onChange={(e) => {
                                    const parts = e.target.value
                                        .split(/[\n,;]+/)
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                    const arr = parts.map((x) => (/^-?\d+$/.test(x) ? Number(x) : x));
                                    setDraft((d) => ({ ...d, allowFrom: arr }));
                                }}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: 10,
                                    background: dmIdsActive ? '#13141c' : '#0e0f14',
                                    border: `1px solid ${dmIdsActive ? 'var(--border-color, #333)' : 'rgba(255,255,255,0.06)'}`,
                                    color: dmIdsActive ? '#e0e0e0' : '#6b7280',
                                    borderRadius: 6,
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: 12,
                                    resize: 'vertical',
                                    opacity: dmIdsActive ? 1 : 0.85,
                                    cursor: dmIdsActive ? 'text' : 'not-allowed'
                                }}
                            />
                        </div>
                    </div>
                    <p
                        style={{
                            margin: '0 0 16px',
                            fontSize: 11,
                            color: '#6b7280',
                            lineHeight: 1.4
                        }}
                    >
                        In the menus: <strong>Short label</strong>
                        <span style={{ opacity: 0.85 }}>{'  |  '}</span>
                        <strong>What it is for</strong> — the pipe separates the technical mode from typical usage.
                    </p>

                    <div style={{ ...policyGridStyle, marginTop: 4 }}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: 8,
                                minWidth: 0
                            }}
                        >
                            <button
                                type="button"
                                disabled={savePending}
                                onClick={() => onSave(draft)}
                                style={{
                                    display: 'inline-block',
                                    width: 'auto',
                                    maxWidth: '100%',
                                    flex: '0 0 auto',
                                    padding: '8px 16px',
                                    background: '#2d6a4f',
                                    border: 'none',
                                    color: '#fff',
                                    borderRadius: 8,
                                    cursor: savePending ? 'wait' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    lineHeight: 1.3,
                                    textAlign: 'center'
                                }}
                            >
                                {savePending ? 'Saving…' : 'Save to Channel Manager config'}
                            </button>
                            <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4, maxWidth: '100%' }}>
                                Writes <code>telegramAccountPolicy</code> to the JSON on disk.
                            </span>
                        </div>
                        <aside
                            style={{
                                minWidth: 0,
                                alignSelf: 'stretch',
                                padding: '12px 14px',
                                background: 'rgba(80, 227, 194, 0.06)',
                                border: '1px solid rgba(80, 227, 194, 0.28)',
                                borderRadius: 8,
                                boxSizing: 'border-box'
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: '#7dd3c0'
                                }}
                            >
                                Skills · UI vs Apply
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9aa0b4', lineHeight: 1.55 }}>
                                In the <strong style={{ color: '#c4cad4' }}>TTG</strong> table below, the same skill ID
                                can appear on <strong style={{ color: '#c4cad4' }}>multiple rows</strong> (channel,
                                Skill Role, main agent) — each row only toggles <strong style={{ color: '#c4cad4' }}>its
                                </strong> source via <code style={{ fontSize: 10, color: '#9ff0dc' }}>inactiveSkills
                                </code>, without deleting entries from Skill Roles.
                            </p>
                            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9aa0b4', lineHeight: 1.55 }}>
                                On <strong style={{ color: '#c4cad4' }}>Apply to OpenClaw</strong>, only{' '}
                                <strong style={{ color: '#c4cad4' }}>one</strong> skill allowlist per channel synth agent is
                                written to <code style={{ fontSize: 10, color: '#9ff0dc' }}>openclaw.json</code> — each ID
                                at most once (a concise projection for the gateway). That does{' '}
                                <strong style={{ color: '#c4cad4' }}>not</strong> contradict the multi-row model: the CM
                                config stays granular; the JSON aggregates the <strong style={{ color: '#c4cad4' }}>
                                    effectively allowed</strong> skills.
                            </p>
                        </aside>
                    </div>

                    <details
                        className="telegram-account-policy-techinfo"
                        style={{ marginTop: 16, fontSize: 12, color: '#9aa0b4', lineHeight: 1.55 }}
                    >
                        <summary
                            style={{
                                cursor: 'pointer',
                                color: '#b0b8c4',
                                fontWeight: 600,
                                fontSize: 12,
                                listStyle: 'none'
                            }}
                        >
                            Technical details — what is this block?
                        </summary>
                        <div
                            style={{
                                marginTop: 12,
                                padding: '12px 14px 4px',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)',
                                maxWidth: 'min(100%, 48rem)'
                            }}
                        >
                            <p style={{ margin: '0 0 12px', color: '#c4cad4' }}>
                                OpenClaw checks <strong>first</strong> whether your Telegram bot may accept an incoming
                                message at all (account level). Only <strong>then</strong> do per-group settings in the
                                TTG table apply — models, skills, bindings. Without this mental model, channels can look
                                “fully configured” yet stay dead because the gateway dropped traffic earlier. This panel
                                makes that first hurdle visible and editable.
                            </p>
                            <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#e0e4ea' }}>
                                Gateway flow (simplified)
                            </p>
                            <ol
                                style={{
                                    margin: '0 0 14px',
                                    paddingLeft: 20,
                                    color: '#9aa0b4'
                                }}
                            >
                                <li style={{ marginBottom: 6 }}>
                                    <strong>Telegram account:</strong> <code>groupPolicy</code> / <code>dmPolicy</code>{' '}
                                    and optional <code>groupAllowFrom</code> / <code>allowFrom</code> — “may this message
                                    reach the bot at all?”
                                </li>
                                <li style={{ marginBottom: 6 }}>
                                    <strong>Per group (TTG):</strong> e.g. <code>requireMention</code>, skills — only if
                                    step 1 allows the message.
                                </li>
                                <li>
                                    <strong>Routing:</strong> <code>bindings[]</code> and synth agent — which model
                                    answers.
                                </li>
                            </ol>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#e0e4ea' }}>
                                Why “bot account”?
                            </p>
                            <p style={{ margin: '0 0 14px', color: '#9aa0b4' }}>
                                In <code>openclaw.json</code> these four keys live under{' '}
                                <code>channels.telegram</code> — same level as e.g. <code>botToken</code> and{' '}
                                <code>groups</code>. They describe not a single TTG channel but the{' '}
                                <strong>Telegram attachment as a whole</strong>: “what may this one bot still see?” All
                                groups and users talking to that bot share these rules. Hence “account” / “bot account”: a
                                shared admission layer before per-group entries under{' '}
                                <code>channels.telegram.groups[&lt;id&gt;]</code>.
                            </p>
                            <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#e0e4ea' }}>
                                Meaning of the four keys (gateway)
                            </p>
                            <ul style={{ margin: '0 0 14px', paddingLeft: 20, color: '#9aa0b4' }}>
                                <li style={{ marginBottom: 10 }}>
                                    <code style={{ color: '#9ff0dc' }}>groupPolicy</code> — Controls{' '}
                                    <strong>incoming group messages</strong> (supergroups where the bot is a member).
                                    Typical values: <strong>open</strong> (such groups may pass unless excluded later),{' '}
                                    <strong>allowlist</strong> (only groups whose Telegram group ID is in{' '}
                                    <code>groupAllowFrom</code>), <strong>disabled</strong> (no group ingest on this bot
                                    attachment). This is <em>not</em> the same as “model for TTG007” — that comes from
                                    bindings.
                                </li>
                                <li style={{ marginBottom: 10 }}>
                                    <code style={{ color: '#9ff0dc' }}>dmPolicy</code> — Controls{' '}
                                    <strong>direct messages (1:1)</strong> to the bot. <strong>pairing</strong> = only
                                    paired / approved users (usual default). <strong>allowlist</strong> = only user IDs
                                    from <code>allowFrom</code>. <strong>open</strong> = anyone may DM (use deliberately).
                                    <strong>disabled</strong> = no DMs.
                                </li>
                                <li style={{ marginBottom: 10 }}>
                                    <code style={{ color: '#9ff0dc' }}>allowFrom</code> — List of allowed{' '}
                                    <strong>DM senders</strong> (Telegram user IDs, often numeric). Evaluated when{' '}
                                    <code>dmPolicy</code> requires sender selection (esp. <strong>allowlist</strong>).
                                    Empty under <code>allowlist</code> can mean: no one may DM — depends on OpenClaw
                                    version and the rest of config.
                                </li>
                                <li style={{ marginBottom: 10 }}>
                                    <code style={{ color: '#9ff0dc' }}>groupAllowFrom</code> — List of allowed{' '}
                                    <strong>groups</strong> (Telegram group IDs, usually negative, e.g.{' '}
                                    <code>-1003752539559</code>). Used when <code>groupPolicy</code> ={' '}
                                    <strong>allowlist</strong>. Empty list with allowlist: practically no group gets
                                    through — can look “muted” even if bindings and models would otherwise work.
                                </li>
                            </ul>
                            <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#e0e4ea' }}>
                                Apply checkbox (merge slice)
                            </p>
                            <p style={{ margin: '0 0 14px', color: '#9aa0b4' }}>
                                <strong>Apply to OpenClaw</strong> always transfers TTG fields, synth agents, and
                                bindings. Only these <strong>four bot-account keys</strong> are <strong>not</strong>{' '}
                                written to <code>openclaw.json</code> without the “On next Apply…” checkbox — they then
                                live only in the Channel Manager file (<code>channel_config.json</code>). With the
                                checkbox checked, Apply writes them under <code>channels.telegram</code> (gateway restart
                                as usual).
                            </p>
                            <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
                                CM storage: <code>telegramAccountPolicy</code> in <code>channel_config.json</code>.
                                Gateway target: <code>channels.telegram.groupPolicy</code>, <code>dmPolicy</code>,{' '}
                                <code>allowFrom</code>, <code>groupAllowFrom</code>. Finer points are in OpenClaw’s
                                Telegram channel docs; this is the <strong>operator view</strong> in Channel Manager.
                            </p>
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}
