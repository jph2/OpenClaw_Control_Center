import React, { useEffect, useState } from 'react';

function todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Bundle C2 — preview + confirm append of A070 summary into OpenClaw memory. */
export default function MemoryPromoteModal({ open, sourceRelativePath, onClose, onPromoted, queryClient, channelId }) {
    const [destination, setDestination] = useState('daily');
    const [dateSlug, setDateSlug] = useState(todayIsoDate);
    const [memoryMdAck, setMemoryMdAck] = useState(false);
    const [check, setCheck] = useState(null);
    const [checkLoading, setCheckLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (open) {
            setDateSlug(todayIsoDate());
            setDestination('daily');
            setMemoryMdAck(false);
            setCheck(null);
            setError(null);
        }
    }, [open, sourceRelativePath]);

    async function runCheck() {
        setError(null);
        setCheckLoading(true);
        try {
            const res = await fetch('/api/ide-project-summaries/promote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dryRun: true,
                    confirm: false,
                    sourceRelativePath,
                    destination,
                    date: destination === 'daily' ? dateSlug : undefined,
                    memoryMdAck: false
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || res.statusText);
            setCheck(j);
        } catch (e) {
            setError(String(e.message || e));
            setCheck(null);
        } finally {
            setCheckLoading(false);
        }
    }

    async function runApply() {
        setError(null);
        setApplyLoading(true);
        try {
            const res = await fetch('/api/ide-project-summaries/promote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dryRun: false,
                    confirm: true,
                    sourceRelativePath,
                    destination,
                    date: destination === 'daily' ? dateSlug : undefined,
                    memoryMdAck: destination === 'MEMORY_MD' ? memoryMdAck : false
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || res.statusText);
            if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ['ide-project-summaries-memory', channelId] });
            }
            onPromoted?.(j);
            onClose();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setApplyLoading(false);
        }
    }

    if (!open || !sourceRelativePath) return null;

    const duplicate = check?.duplicate === true;
    const canConfirm = check && !duplicate && !checkLoading;

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
                padding: 24
            }}
        >
            <div
                style={{
                    background: '#1a1b26',
                    border: '1px solid var(--border-color, #333)',
                    borderRadius: 12,
                    maxWidth: 720,
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #333' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Promote to OpenClaw memory</h2>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#888', lineHeight: 1.45 }}>
                        Appends this A070 summary to your OpenClaw workspace memory file (never replaces the whole file).
                        Source: <code style={{ color: '#9ff0dc' }}>{sourceRelativePath}</code>
                    </p>
                </div>
                <div style={{ padding: 16, overflow: 'auto', flex: 1, fontSize: 12 }}>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Destination</div>
                        <label style={{ display: 'block', marginBottom: 6, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="dest"
                                checked={destination === 'daily'}
                                onChange={() => setDestination('daily')}
                            />{' '}
                            Daily note under <code>memory/</code> —{' '}
                            <input
                                type="date"
                                value={dateSlug}
                                onChange={(e) => setDateSlug(e.target.value)}
                                disabled={destination !== 'daily'}
                                style={{ marginLeft: 6, background: '#13141c', color: '#fff', border: '1px solid #444' }}
                            />{' '}
                            <span style={{ color: '#888' }}>(.md)</span>
                        </label>
                        <label style={{ display: 'block', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="dest"
                                checked={destination === 'MEMORY_MD'}
                                onChange={() => setDestination('MEMORY_MD')}
                            />{' '}
                            <code>MEMORY.md</code> at workspace root{' '}
                            <span style={{ color: '#e0a030' }}>(opt-in)</span>
                        </label>
                        {destination === 'MEMORY_MD' && (
                            <label style={{ display: 'block', marginTop: 8, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={memoryMdAck}
                                    onChange={(e) => setMemoryMdAck(e.target.checked)}
                                />{' '}
                                I want to append to <code>MEMORY.md</code> (curated long-term memory).
                            </label>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <button
                            type="button"
                            onClick={runCheck}
                            disabled={checkLoading}
                            style={{
                                padding: '8px 14px',
                                fontSize: 12,
                                background: '#2a2b36',
                                border: '1px solid #555',
                                color: '#fff',
                                borderRadius: 6,
                                cursor: 'pointer'
                            }}
                        >
                            {checkLoading ? 'Checking…' : 'Check destination'}
                        </button>
                        <span style={{ color: '#888', alignSelf: 'center' }}>Dry run — no write. Confirm requires MEMORY.md acknowledgement.</span>
                    </div>
                    {duplicate && (
                        <div style={{ color: '#e3c450', marginBottom: 12, padding: 10, background: 'rgba(227,196,80,0.08)' }}>
                            This block was already promoted (same content fingerprint). Nothing to append.
                        </div>
                    )}
                    {check && !duplicate && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ color: '#8fb3ff', wordBreak: 'break-all', marginBottom: 6 }}>
                                Target: {check.destinationPath}
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Append preview</div>
                            <pre
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: 220,
                                    overflow: 'auto',
                                    background: '#13141c',
                                    padding: 10,
                                    borderRadius: 6,
                                    fontSize: 11,
                                    border: '1px solid #333'
                                }}
                            >
                                {check.previewAppend || ''}
                            </pre>
                        </div>
                    )}
                    {error && <div style={{ color: '#ff8f8f', whiteSpace: 'pre-wrap' }}>{error}</div>}
                </div>
                <div
                    style={{
                        padding: '14px 20px',
                        borderTop: '1px solid #333',
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap'
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            marginRight: 'auto',
                            padding: '8px 14px',
                            background: 'transparent',
                            border: '1px solid #555',
                            color: '#fff',
                            borderRadius: 6,
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canConfirm || applyLoading || (destination === 'MEMORY_MD' && !memoryMdAck)}
                        onClick={runApply}
                        style={{
                            padding: '8px 18px',
                            fontWeight: 600,
                            background: canConfirm && !applyLoading ? '#50e3c2' : '#444',
                            color: canConfirm && !applyLoading ? '#000' : '#888',
                            border: 'none',
                            borderRadius: 6,
                            cursor: canConfirm && !applyLoading ? 'pointer' : 'not-allowed'
                        }}
                    >
                        {applyLoading ? 'Writing…' : 'Confirm promote'}
                    </button>
                </div>
            </div>
        </div>
    );
}
