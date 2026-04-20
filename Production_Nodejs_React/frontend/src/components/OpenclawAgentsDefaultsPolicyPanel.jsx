import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const labelMuted = { color: '#8892a6', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

/**
 * C1b.2c — Opt-in `agents.defaults.model.primary` on Apply (ADR-018: never silent).
 */
export default function OpenclawAgentsDefaultsPolicyPanel({
    draft,
    setDraft,
    liveModelPrimary,
    modelOptions,
    onSave,
    savePending
}) {
    const [expanded, setExpanded] = useState(false);

    const liveLine =
        liveModelPrimary != null && String(liveModelPrimary).trim() !== ''
            ? String(liveModelPrimary).trim()
            : null;

    const modelLabel = draft.modelPrimary?.trim() ? draft.modelPrimary.trim() : '—';
    const collapsedSummary = [
        `Default model: ${modelLabel}`,
        `Write on Apply: ${draft.applyModelOnOpenClawApply ? 'yes' : 'no'}`
    ].join(' · ');

    const toggleExpanded = () => setExpanded((x) => !x);

    return (
        <section
            className="openclaw-agents-defaults-policy-panel"
            style={{
                marginBottom: 16,
                padding: expanded ? '16px 18px' : '10px 14px',
                background: 'linear-gradient(180deg, #1c1a28 0%, #171622 100%)',
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
                    userSelect: 'none'
                }}
            >
                <span style={{ flexShrink: 0, marginTop: 1, color: '#9aa0b4', display: 'flex' }}>
                    {expanded ? <ChevronDown size={20} strokeWidth={2} /> : <ChevronRight size={20} strokeWidth={2} />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e8eaed' }}>
                        Workspace default model (OpenClaw){' '}
                        <span style={{ fontWeight: 600, color: '#7a8499' }}>| Global Config</span>
                    </h2>
                    {!expanded && (
                        <p style={{ margin: '6px 0 0', color: '#8892a6', fontSize: 11, lineHeight: 1.45 }}>
                            {collapsedSummary}
                            {liveLine ? (
                                <>
                                    <br />
                                    <span style={{ color: '#6b7a94' }}>
                                        Live: <code style={{ color: '#9ff0dc', fontSize: 10 }}>{liveLine}</code>
                                    </span>
                                </>
                            ) : null}
                        </p>
                    )}
                </div>
            </div>

            {expanded && (
                <>
                    <p style={{ margin: '12px 0 14px', maxWidth: '52rem', color: '#9aa0b4', fontSize: 12, lineHeight: 1.6 }}>
                        OpenClaw <strong>web chat</strong> and anything that falls back to{' '}
                        <code style={{ fontSize: 11, color: '#9ff0dc' }}>agents.defaults.model</code> uses this model.{' '}
                        <strong>Telegram</strong> per TTG still uses synth agents +{' '}
                        <code style={{ fontSize: 11, color: '#9ff0dc' }}>bindings[]</code> — unchanged. Here you may{' '}
                        <strong>optionally</strong> set the gateway default if you want web chat and CM aligned —{' '}
                        <strong>only</strong> with the checkbox on the next Apply (never silent).
                    </p>

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
                            <span style={{ fontWeight: 600, color: '#8fb3ff' }}>Live in openclaw.json:</span>{' '}
                            <code style={{ color: '#9ff0dc' }}>{liveLine}</code>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={labelMuted}>Model (primary)</div>
                            <select
                                value={draft.modelPrimary || ''}
                                onChange={(e) => setDraft((d) => ({ ...d, modelPrimary: e.target.value }))}
                                style={{
                                    marginTop: 6,
                                    width: '100%',
                                    padding: '8px 10px',
                                    background: '#13141c',
                                    border: '1px solid var(--border-color, #333)',
                                    color: '#fff',
                                    borderRadius: 6,
                                    fontSize: 13
                                }}
                            >
                                <option value="">— Select model —</option>
                                {(modelOptions || []).map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name || m.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                minWidth: 0,
                                padding: '12px 14px',
                                background: 'rgba(80, 227, 194, 0.06)',
                                border: '1px solid rgba(80, 227, 194, 0.2)',
                                borderRadius: 8,
                                cursor: 'pointer',
                                boxSizing: 'border-box',
                                alignSelf: 'start'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={draft.applyModelOnOpenClawApply}
                                onChange={(e) =>
                                    setDraft((d) => ({ ...d, applyModelOnOpenClawApply: e.target.checked }))
                                }
                                onClick={(e) => e.stopPropagation()}
                                style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                            />
                            <span style={{ color: '#e0e0e0', minWidth: 0, fontSize: 12, lineHeight: 1.5 }}>
                                <strong>On the next “Apply to OpenClaw…”</strong>, set{' '}
                                <code style={{ fontSize: 11, color: '#9ff0dc' }}>agents.defaults.model.primary</code>{' '}
                                (existing <code style={{ fontSize: 11, color: '#9ff0dc' }}>fallbacks</code> on the object
                                are kept).
                                <span
                                    style={{
                                        display: 'block',
                                        marginTop: 8,
                                        fontSize: 11,
                                        color: '#6b7a8f'
                                    }}
                                >
                                    <strong style={{ color: '#9aa5b8' }}>Default is off:</strong> without the checkbox this
                                    model choice is only stored in the Channel Manager file — gateway defaults do not
                                    change on Apply.
                                </span>
                            </span>
                        </label>
                    </div>

                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                        <button
                            type="button"
                            disabled={savePending}
                            onClick={() => onSave(draft)}
                            style={{
                                display: 'inline-block',
                                width: 'auto',
                                padding: '8px 16px',
                                background: '#2d6a4f',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 8,
                                cursor: savePending ? 'wait' : 'pointer',
                                fontWeight: 600,
                                fontSize: 13
                            }}
                        >
                            {savePending ? 'Saving…' : 'Save to Channel Manager config'}
                        </button>
                        <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                            Writes <code>openclawAgentsDefaultsPolicy</code> to <code>channel_config.json</code>.
                        </span>
                    </div>
                </>
            )}
        </section>
    );
}
