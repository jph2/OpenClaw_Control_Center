import React, { useEffect, useState, useCallback } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { apiUrl } from '../utils/apiUrl';

const diffStyles = {
    variables: {
        dark: {
            diffViewerBackground: '#13141c',
            diffViewerColor: '#e0e0e0',
            addedBackground: '#1a2f1a',
            addedColor: '#c8e6c9',
            removedBackground: '#3f1a1a',
            removedColor: '#ffcdd2',
            wordAddedBackground: '#255525',
            wordRemovedBackground: '#752020',
            addedGutterBackground: '#1e3d1e',
            removedGutterBackground: '#4d2020',
            gutterBackground: '#1a1b26',
            gutterBackgroundDark: '#0f1018',
            highlightBackground: '#2a2b36',
            highlightGutterBackground: '#2a2b36'
        }
    },
    // Tighter than library default (1.6em) — pairs with .diff-viewer-embed pre reset in theme.css
    diffContainer: {
        pre: {
            margin: 0,
            padding: 0,
            lineHeight: 1.35,
            background: 'transparent',
            border: 'none',
            borderRadius: 0
        }
    },
    line: { verticalAlign: 'top' },
    gutter: {
        verticalAlign: 'top',
        padding: '0 6px',
        pre: { margin: 0, padding: 0, lineHeight: 1.35 }
    },
    marker: {
        verticalAlign: 'top',
        pre: { margin: 0, padding: 0, lineHeight: 1.35 }
    },
    contentText: { lineHeight: 1.35 }
};

/**
 * @param {object} props
 * @param {() => Promise<void>} [props.onBeforeApply] — e.g. refetch channels so Apply reads the same state as the UI (disk is already written per edit).
 */
export default function OpenClawApplyModal({ open, onClose, onBeforeApply }) {
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [status, setStatus] = useState(null);

    const loadStatus = useCallback(async () => {
        try {
            const r = await fetch(apiUrl('/api/exports/openclaw/apply-status'));
            if (r.ok) setStatus(await r.json());
        } catch {
            /* ignore */
        }
    }, []);

    const loadPreview = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (typeof onBeforeApply === 'function') {
                await onBeforeApply();
            }
            const r = await fetch(apiUrl('/api/exports/openclaw/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: true })
            });
            const data = await r.json();
            if (!r.ok) {
                setError(data.message || data.error || `HTTP ${r.status}`);
                setPreview(null);
                return;
            }
            setPreview(data);
        } catch (e) {
            setError(e.message);
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, [onBeforeApply]);

    useEffect(() => {
        if (open) {
            loadStatus();
            loadPreview();
        }
    }, [open, loadPreview, loadStatus]);

    const handleConfirmApply = async () => {
        if (!preview || preview.unchanged) return;
        setApplying(true);
        setError(null);
        try {
            if (typeof onBeforeApply === 'function') {
                await onBeforeApply();
            }
            const r = await fetch(apiUrl('/api/exports/openclaw/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: false, confirm: true })
            });
            const data = await r.json();
            if (!r.ok) {
                setError(data.message || JSON.stringify(data.schemaErrors || data));
                return;
            }
            await loadStatus();
            onClose();
            const gr = data.gatewayRestart;
            let extra = '';
            if (gr?.ok) {
                extra = '\n\nopenclaw-gateway.service wurde neu gestartet, damit das Gateway die neue openclaw.json lädt.';
            } else if (gr?.skipped) {
                extra =
                    '\n\nHinweis: Gateway-Neustart übersprungen (CHANNEL_MANAGER_SKIP_GATEWAY_RESTART). Bitte manuell: systemctl --user restart openclaw-gateway.service';
            } else if (gr?.error) {
                extra = `\n\nGateway-Neustart fehlgeschlagen: ${gr.error}\nBitte manuell neu starten.`;
            }
            window.alert(
                'OpenClaw config updated. A timestamped .bak backup was created beside openclaw.json.' + extra
            );
        } catch (e) {
            setError(e.message);
        } finally {
            setApplying(false);
        }
    };

    const handleUndo = async () => {
        if (!status?.canUndo) return;
        if (!window.confirm('Restore openclaw.json from the most recent backup?')) return;
        setApplying(true);
        setError(null);
        try {
            const r = await fetch(apiUrl('/api/exports/openclaw/undo'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true })
            });
            const data = await r.json();
            if (!r.ok) {
                setError(data.message || 'Undo failed');
                return;
            }
            await loadStatus();
            await loadPreview();
            const gr = data.gatewayRestart;
            let grMsg = '';
            if (gr?.ok) grMsg = '\n\nGateway wurde neu gestartet.';
            else if (gr?.skipped) grMsg = '\n\nGateway-Neustart übersprungen — ggf. manuell neu starten.';
            else if (gr?.error) grMsg = `\n\nGateway-Neustart fehlgeschlagen: ${gr.error}`;
            window.alert(`Restored from:\n${data.restoredFrom}${grMsg}`);
        } catch (e) {
            setError(e.message);
        } finally {
            setApplying(false);
        }
    };

    if (!open) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.72)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
            }}
        >
            <div
                style={{
                    background: '#1a1b26',
                    border: '1px solid var(--border-color, #333)',
                    borderRadius: '12px',
                    maxWidth: 'min(1200px, 96vw)',
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%'
                }}
            >
                <div
                    style={{
                        padding: '14px 44px 14px 20px',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                        gap: '12px 20px',
                        position: 'relative'
                    }}
                >
                    <h2
                        style={{
                            margin: 0,
                            fontSize: '1.1rem',
                            lineHeight: 1.3,
                            flex: '0 0 auto',
                            paddingTop: 2
                        }}
                    >
                        Apply to OpenClaw
                    </h2>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '12px',
                            color: '#888',
                            lineHeight: 1.45,
                            flex: '1 1 280px',
                            minWidth: 0
                        }}
                    >
                        <strong style={{ color: '#9fd89f' }}>Speichern:</strong> Änderungen im Channel Manager werden bei
                        jeder Aktion sofort in <code style={{ color: '#9ff0dc' }}>channel_config.json</code> geschrieben.
                        Dieses Dialogfenster liest genau diese Datei und überträgt nach OpenClaw — ein separates „Save“
                        vor dem Apply ist dafür <strong style={{ color: '#c8c8d0' }}>nicht nötig</strong>. „Save“ in der
                        Kopfzeile aktualisiert nur die Anzeige (wie Reload).
                        <br />
                        <br />
                        <strong style={{ color: '#c8c8d0' }}>Merge slice (C1 + C1b.1 + C1b.2a):</strong> per channel,{' '}
                        <code style={{ color: '#9ff0dc' }}>requireMention</code> and{' '}
                        <code style={{ color: '#9ff0dc' }}>skills</code> are written into{' '}
                        <code style={{ color: '#9ff0dc' }}>channels.telegram.groups</code>; the per-channel{' '}
                        <strong style={{ color: '#c8c8d0' }}>model</strong> + main-agent skills land as synthesized{' '}
                        <code style={{ color: '#9ff0dc' }}>agents.list[]</code> entries (id{' '}
                        <code style={{ color: '#9ff0dc' }}>{'<assignedAgent>-<groupIdSlug>'}</code>) with matching{' '}
                        <code style={{ color: '#9ff0dc' }}>bindings[]</code> routes. Ownership is marked as{' '}
                        <code style={{ color: '#9ff0dc' }}>params._cm.managedBy = "channel-manager"</code> on agents
                        (schema-legal) and <code style={{ color: '#9ff0dc' }}>comment</code> on bindings.{' '}
                        <strong style={{ color: '#50e3c2' }}>Operator-authored entries are never modified</strong>;{' '}
                        <code style={{ color: '#9ff0dc' }}>agents.defaults.*</code> stays operator-owned in this bundle
                        (opt-in later as C1b.2c). C1b.2a is{' '}
                        <strong style={{ color: '#c8c8d0' }}>additive only</strong> — stale CM-marked entries are cleaned
                        up in C1b.2b. Secrets are redacted in the preview.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                        style={{
                            position: 'absolute',
                            top: 10,
                            right: 12,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: '#9aa0b4',
                            borderRadius: 6,
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: '22px',
                            lineHeight: 1,
                            flexShrink: 0
                        }}
                    >
                        ×
                    </button>
                </div>
                <div style={{ padding: '12px 20px', overflow: 'auto', flex: 1, minHeight: 0 }}>
                    {preview?.destinationPath && (
                        <div style={{ fontSize: '11px', color: '#8fb3ff', marginBottom: '10px', wordBreak: 'break-all' }}>
                            Destination: {preview.destinationPath}
                        </div>
                    )}
                    {loading && <div style={{ color: '#888' }}>Loading preview…</div>}
                    {error && <div style={{ color: '#ff8f8f', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{error}</div>}

                    {preview?.collisions && preview.collisions.length > 0 && (
                        <div
                            style={{
                                background: 'rgba(255,140,80,0.10)',
                                border: '1px solid rgba(255,140,80,0.45)',
                                borderRadius: 8,
                                padding: '10px 12px',
                                marginBottom: 12,
                                color: '#ffb890',
                                fontSize: 12,
                                lineHeight: 1.5
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                {preview.collisions.length} operator-owned collision
                                {preview.collisions.length === 1 ? '' : 's'} — write will be refused
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {preview.collisions.slice(0, 12).map((c, i) => (
                                    <li key={i} style={{ marginBottom: 2 }}>
                                        <strong>{c.kind}</strong> · {c.reason} ·{' '}
                                        <code>{JSON.stringify(c.detail)}</code>
                                    </li>
                                ))}
                            </ul>
                            <div style={{ marginTop: 6 }}>
                                Remove or rename the conflicting entries in <code>openclaw.json</code> and refresh, or
                                let CM claim them. For <strong>agents</strong>, add{' '}
                                <code>
                                    "params": {'{'}"_cm": {'{'}"managedBy": "channel-manager", "source":
                                    "&lt;groupId&gt;"{'}}'}
                                </code>
                                . For <strong>bindings</strong>, add{' '}
                                <code>"comment": "managed-by: channel-manager; source: &lt;groupId&gt;"</code>.
                            </div>
                        </div>
                    )}

                    {preview?.agentsBindingsSummary && (
                        <div
                            style={{
                                background: '#1f2030',
                                border: '1px solid #2d2f42',
                                borderRadius: 8,
                                padding: '10px 12px',
                                marginBottom: 12,
                                fontSize: 12,
                                color: '#c8c8d0'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: 6, color: '#9ff0dc' }}>
                                C1b.2a · agents.list + bindings
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <span style={{ color: '#50e3c2' }}>
                                    +{preview.agentsBindingsSummary.agentsAdded} agents
                                </span>
                                {' · '}
                                <span style={{ color: '#8fb3ff' }}>
                                    ~{preview.agentsBindingsSummary.agentsUpdated} updated
                                </span>
                                {' · '}
                                <span style={{ color: '#50e3c2' }}>
                                    +{preview.agentsBindingsSummary.bindingsAdded} bindings
                                </span>
                                {' · '}
                                <span style={{ color: '#8fb3ff' }}>
                                    ~{preview.agentsBindingsSummary.bindingsUpdated} updated
                                </span>
                            </div>
                            {preview?.perChannel && preview.perChannel.length > 0 && (
                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    <table
                                        style={{
                                            width: '100%',
                                            fontSize: 11,
                                            borderCollapse: 'collapse',
                                            fontFamily:
                                                'ui-monospace, SFMono-Regular, Menlo, monospace'
                                        }}
                                    >
                                        <thead>
                                            <tr style={{ color: '#8892a6', textAlign: 'left' }}>
                                                <th style={{ padding: '4px 8px' }}>Group</th>
                                                <th style={{ padding: '4px 8px' }}>Synth agent id</th>
                                                <th style={{ padding: '4px 8px' }}>Model</th>
                                                <th style={{ padding: '4px 8px' }}>Skills</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.perChannel.map((row) => (
                                                <tr
                                                    key={row.synthAgentId}
                                                    style={{ borderTop: '1px solid #2d2f42' }}
                                                >
                                                    <td style={{ padding: '4px 8px' }}>
                                                        <div style={{ color: '#e0e0e0' }}>
                                                            {row.channelName}
                                                        </div>
                                                        <div style={{ color: '#7a8396' }}>{row.groupId}</div>
                                                    </td>
                                                    <td style={{ padding: '4px 8px', color: '#9ff0dc' }}>
                                                        {row.synthAgentId}
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {row.effectiveModel || (
                                                            <span style={{ color: '#7a8396' }}>
                                                                (defaults)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {row.effectiveSkills && row.effectiveSkills.length > 0 ? (
                                                            row.effectiveSkills.join(', ')
                                                        ) : (
                                                            <span style={{ color: '#7a8396' }}>
                                                                (defaults)
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {preview?.beforePretty && preview?.afterPretty && (
                        <div className="diff-viewer-embed" style={{ fontSize: '12px' }}>
                            <ReactDiffViewer
                                oldValue={preview.beforePretty}
                                newValue={preview.afterPretty}
                                splitView
                                useDarkTheme
                                styles={diffStyles}
                            />
                        </div>
                    )}
                    {preview?.unchanged && !loading && (
                        <div style={{ color: '#50e3c2', lineHeight: 1.5 }}>
                            No changes — <code>openclaw.json</code> already matches Channel Manager for the
                            C1 + C1b.1 + C1b.2a merge slice (<code>channels.telegram.groups</code>,{' '}
                            <code>agents.list[]</code> CM entries, <code>bindings[]</code> CM routes).
                        </div>
                    )}
                </div>
                <div
                    style={{
                        padding: '14px 20px',
                        borderTop: '1px solid #333',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        justifyContent: 'flex-end'
                    }}
                >
                    {status?.canUndo && (
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={applying}
                            style={{
                                marginRight: 'auto',
                                background: 'rgba(255,160,80,0.15)',
                                border: '1px solid rgba(255,160,80,0.4)',
                                color: '#ffb080',
                                borderRadius: 6,
                                padding: '8px 14px',
                                cursor: applying ? 'wait' : 'pointer'
                            }}
                        >
                            Undo last apply
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={loadPreview}
                        disabled={loading || applying}
                        style={{
                            background: '#2a2b36',
                            border: '1px solid #555',
                            color: '#fff',
                            borderRadius: 6,
                            padding: '8px 14px',
                            cursor: 'pointer'
                        }}
                    >
                        Refresh preview
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmApply}
                        disabled={
                            loading ||
                            applying ||
                            !preview ||
                            preview.unchanged ||
                            (preview.collisions && preview.collisions.length > 0)
                        }
                        style={{
                            background:
                                preview?.unchanged || (preview?.collisions?.length ?? 0) > 0
                                    ? '#444'
                                    : '#50e3c2',
                            border: 'none',
                            color:
                                preview?.unchanged || (preview?.collisions?.length ?? 0) > 0
                                    ? '#888'
                                    : '#000',
                            borderRadius: 6,
                            padding: '8px 18px',
                            fontWeight: 600,
                            cursor:
                                preview?.unchanged || (preview?.collisions?.length ?? 0) > 0
                                    ? 'not-allowed'
                                    : 'pointer'
                        }}
                    >
                        {applying ? 'Applying…' : 'Confirm apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
