import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MemoryPromoteModal from './MemoryPromoteModal.jsx';

const plugins = [remarkGfm];

function todaySlug() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_LABELS = {
    no_summary: 'No summary',
    draft_saved: 'Draft saved',
    meta_invalid: 'Meta invalid',
    ambiguous_binding: 'Ambiguous binding',
    not_promoted: 'Not promoted',
    promoted: 'Promoted',
    readback_confirmed: 'Read-back confirmed',
    stale: 'Stale',
    promotion_failed: 'Promotion failed',
    unknown: 'Unknown'
};

const STATUS_COLORS = {
    no_summary: '#888',
    draft_saved: '#8fb3ff',
    meta_invalid: '#ff8f8f',
    ambiguous_binding: '#e3c450',
    not_promoted: '#e3c450',
    promoted: '#8fb3ff',
    readback_confirmed: '#50e3c2',
    stale: '#e0a030',
    promotion_failed: '#ff8f8f',
    unknown: '#aaa'
};

function projectSlugFromPath(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    return (parts[parts.length - 1] || 'openclaw-control-center')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'openclaw-control-center';
}

function emptyMapping() {
    return {
        projectId: '',
        repoSlug: '',
        projectMappingKey: '',
        ttgId: '',
        label: '',
        note: ''
    };
}

/** Third workspace tab: IDE project summaries (Studio A070) + optional OpenClaw memory (read-only). Tool-agnostic. */
export default function IdeProjectSummaryPanel({ channelId, channelName }) {
    const queryClient = useQueryClient();
    const [selectedRel, setSelectedRel] = useState(null);
    const [panel, setPanel] = useState('a070'); // 'a070' | 'memory'
    const [adapterSurface, setAdapterSurface] = useState('manual');
    const [projectRoot, setProjectRoot] = useState('');
    const [projectIdInput, setProjectIdInput] = useState('');
    const [explicitTtgId, setExplicitTtgId] = useState(channelId || '');
    const [mappingRows, setMappingRows] = useState([]);
    const projectId = projectIdInput || projectSlugFromPath(projectRoot);
    const [draftPath, setDraftPath] = useState(
        () => `drafts/${todaySlug()}__${channelId || 'all'}__${projectId}__summary.md`
    );
    const [draftText, setDraftText] = useState(
        `# Summary\n\n- Channel: ${channelName || channelId || 'n/a'}\n- Date: ${todaySlug()}\n- Project: ${projectId}\n\n`
    );
    const [promoteOpen, setPromoteOpen] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ['ide-project-summaries', channelId],
        queryFn: async () => {
            const q = channelId ? `?telegramId=${encodeURIComponent(channelId)}` : '';
            const res = await fetch(`/api/ide-project-summaries${q}`);
            if (!res.ok) throw new Error('Failed to load summaries');
            return res.json();
        }
    });

    const { data: memData, isLoading: memLoading } = useQuery({
        queryKey: ['ide-project-summaries-memory', channelId],
        queryFn: async () => {
            const q = channelId ? `?telegramId=${encodeURIComponent(channelId)}` : '';
            const res = await fetch(`/api/ide-project-summaries/memory${q}`);
            if (!res.ok) throw new Error('Failed to load memory index');
            return res.json();
        },
        enabled: panel === 'memory'
    });

    const { data: fileData } = useQuery({
        queryKey: ['ideSummaryFile', selectedRel, panel],
        enabled: Boolean(selectedRel),
        queryFn: async () => {
            const base = panel === 'memory' ? '/api/ide-project-summaries/memory/file' : '/api/ide-project-summaries/file';
            const res = await fetch(`${base}?relative=${encodeURIComponent(selectedRel)}`);
            if (!res.ok) throw new Error('Failed to load file');
            return res.json();
        }
    });

    const { data: mappingData } = useQuery({
        queryKey: ['ide-project-mappings'],
        queryFn: async () => {
            const res = await fetch('/api/ide-project-summaries/project-mappings');
            if (!res.ok) throw new Error('Failed to load project mappings');
            return res.json();
        }
    });

    useEffect(() => {
        if (Array.isArray(mappingData?.projectMappings)) {
            setMappingRows(mappingData.projectMappings.map((row) => ({ ...emptyMapping(), ...row })));
        }
    }, [mappingData]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/ide-project-summaries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    relativePath: draftPath,
                    text: draftText,
                    createOnly: true,
                    meta: {
                        explicitTtgId,
                        ttgId: explicitTtgId,
                        channelName: channelName || '',
                        surface: adapterSurface,
                        projectRoot,
                        projectId,
                        repoSlug: projectId,
                        agent: adapterSurface === 'manual' ? 'manual' : adapterSurface,
                        pathHints: [draftPath, draftText]
                    }
                })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || res.statusText);
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ide-project-summaries', channelId] });
            setSelectedRel(draftPath);
        }
    });

    const saveMappingsMutation = useMutation({
        mutationFn: async () => {
            const projectMappings = mappingRows
                .map((row) => ({
                    projectId: row.projectId.trim(),
                    repoSlug: row.repoSlug.trim(),
                    projectMappingKey: row.projectMappingKey.trim(),
                    ttgId: row.ttgId.trim(),
                    label: row.label.trim(),
                    note: row.note.trim()
                }))
                .filter((row) => row.ttgId && (row.projectId || row.repoSlug || row.projectMappingKey));
            const res = await fetch('/api/ide-project-summaries/project-mappings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectMappings })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || res.statusText);
            }
            return res.json();
        },
        onSuccess: (result) => {
            setMappingRows((result.projectMappings || []).map((row) => ({ ...emptyMapping(), ...row })));
            queryClient.invalidateQueries({ queryKey: ['ide-project-mappings'] });
        }
    });

    const updateMappingRow = (index, patch) => {
        setMappingRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const files = data?.files || [];
    const memFiles = memData?.files || [];

    const list = useMemo(() => (panel === 'memory' ? memFiles : files), [panel, memFiles, files]);
    const selectedFile = useMemo(() => list.find((f) => f.relativePath === selectedRel) || null, [list, selectedRel]);
    const selectedMeta = fileData?.meta || selectedFile?.meta || null;
    const selectedStatus = fileData?.bridgeStatus || selectedFile?.bridgeStatus || null;
    const statusColor = STATUS_COLORS[selectedStatus] || STATUS_COLORS.unknown;

    return (
        <div
            data-testid={`ide-summary-panel-${channelId || 'all'}`}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-primary)' }}
        >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>TARS in IDE · IDE project summary</strong>
                    <span>—</span>
                    <span>{channelName || channelId || 'all'}</span>
                    {panel === 'a070' && (
                        <span
                            style={{
                                color: statusColor,
                                border: `1px solid ${statusColor}`,
                                borderRadius: 4,
                                padding: '2px 7px',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            {STATUS_LABELS[selectedStatus] || (files.length ? 'Select summary' : 'No summary')}
                        </span>
                    )}
                    <button
                        type="button"
                        className={panel === 'a070' ? 'tab active' : 'tab'}
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: panel === 'a070' ? 'rgba(80,227,194,0.15)' : 'transparent'
                        }}
                        onClick={() => {
                            setPanel('a070');
                            setSelectedRel(null);
                        }}
                    >
                        Studio A070
                    </button>
                    <button
                        type="button"
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: panel === 'memory' ? 'rgba(80,227,194,0.15)' : 'transparent'
                        }}
                        onClick={() => {
                            setPanel('memory');
                            setSelectedRel(null);
                        }}
                    >
                        OpenClaw memory (read-only)
                    </button>
                </div>
                {data?.note && panel === 'a070' && <span style={{ display: 'block', marginTop: '6px' }}>{data.note}</span>}
                {data?.truncated && panel === 'a070' && (
                    <span style={{ display: 'block', marginTop: '4px', color: '#e3c450' }}>
                        List truncated ({data.matched} matches); refine filter.
                    </span>
                )}
                {memData?.note && panel === 'memory' && <span style={{ display: 'block', marginTop: '6px' }}>{memData.note}</span>}
            </div>

            {panel === 'a070' && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '11px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>New summary (writes under A070)</div>
                    <input
                        data-testid="ide-summary-draft-path"
                        value={draftPath}
                        onChange={(e) => setDraftPath(e.target.value)}
                        placeholder="relative path, e.g. drafts/2026-04-16__-1003752539559__summary.md"
                        style={{
                            width: '100%',
                            marginBottom: '6px',
                            padding: '6px',
                            background: '#13141c',
                            border: '1px solid var(--border-color)',
                            color: '#fff',
                            fontSize: '11px'
                        }}
                    />
                    <textarea
                        data-testid="ide-summary-draft-text"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={5}
                        style={{
                            width: '100%',
                            marginBottom: '6px',
                            padding: '6px',
                            background: '#13141c',
                            border: '1px solid var(--border-color)',
                            color: '#fff',
                            fontSize: '11px',
                            fontFamily: 'inherit'
                        }}
                    />
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '120px minmax(160px, 1fr) minmax(160px, 1fr) minmax(150px, 1fr)',
                            gap: 6,
                            marginBottom: 6
                        }}
                    >
                        <select
                            data-testid="ide-summary-adapter"
                            value={adapterSurface}
                            onChange={(e) => setAdapterSurface(e.target.value)}
                            style={{
                                padding: '6px',
                                background: '#13141c',
                                border: '1px solid var(--border-color)',
                                color: '#fff',
                                fontSize: '11px'
                            }}
                        >
                            <option value="manual">Manual</option>
                            <option value="codex">Codex</option>
                            <option value="cursor">Cursor</option>
                            <option value="unknown">Unknown</option>
                        </select>
                        <input
                            data-testid="ide-summary-project-root"
                            value={projectRoot}
                            onChange={(e) => setProjectRoot(e.target.value)}
                            placeholder="Project root (optional)"
                            style={{
                                padding: '6px',
                                background: '#13141c',
                                border: '1px solid var(--border-color)',
                                color: '#fff',
                                fontSize: '11px'
                            }}
                        />
                        <input
                            data-testid="ide-summary-project-id"
                            value={projectIdInput}
                            onChange={(e) => setProjectIdInput(e.target.value)}
                            placeholder={`Project id (${projectId})`}
                            style={{
                                padding: '6px',
                                background: '#13141c',
                                border: '1px solid var(--border-color)',
                                color: '#fff',
                                fontSize: '11px'
                            }}
                        />
                        <input
                            data-testid="ide-summary-explicit-ttg"
                            value={explicitTtgId}
                            onChange={(e) => setExplicitTtgId(e.target.value)}
                            placeholder="Explicit TTG id"
                            style={{
                                padding: '6px',
                                background: '#13141c',
                                border: '1px solid var(--border-color)',
                                color: '#fff',
                                fontSize: '11px'
                            }}
                        />
                    </div>
                    <button
                        data-testid="ide-summary-save"
                        type="button"
                        disabled={saveMutation.isPending}
                        onClick={() => saveMutation.mutate()}
                        style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#50e3c2',
                            color: '#000',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        {saveMutation.isPending ? 'Saving…' : 'Save new file (createIfAbsent)'}
                    </button>
                    {saveMutation.isError && (
                        <div style={{ color: '#e35050', marginTop: '6px' }}>{String(saveMutation.error.message)}</div>
                    )}
                    <div
                        style={{
                            marginTop: 10,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            paddingTop: 8
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <strong>Project mappings</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>operator-managed resolver source</span>
                            <button
                                type="button"
                                onClick={() => setMappingRows((rows) => [...rows, emptyMapping()])}
                                style={{
                                    marginLeft: 'auto',
                                    padding: '4px 8px',
                                    fontSize: 11,
                                    background: '#1d2532',
                                    border: '1px solid var(--border-color)',
                                    color: '#fff',
                                    borderRadius: 4
                                }}
                            >
                                Add mapping
                            </button>
                            <button
                                type="button"
                                disabled={saveMappingsMutation.isPending}
                                onClick={() => saveMappingsMutation.mutate()}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: 11,
                                    background: '#50e3c2',
                                    border: 'none',
                                    color: '#000',
                                    borderRadius: 4
                                }}
                            >
                                {saveMappingsMutation.isPending ? 'Saving…' : 'Save mappings'}
                            </button>
                        </div>
                        {mappingRows.map((row, index) => (
                            <div
                                key={`${index}-${row.updatedAt || ''}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr 1fr 145px 1fr 28px',
                                    gap: 6,
                                    marginBottom: 5
                                }}
                            >
                                <input value={row.projectId} onChange={(e) => updateMappingRow(index, { projectId: e.target.value })} placeholder="projectId" style={{ padding: 5, background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: 11 }} />
                                <input value={row.repoSlug} onChange={(e) => updateMappingRow(index, { repoSlug: e.target.value })} placeholder="repoSlug" style={{ padding: 5, background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: 11 }} />
                                <input value={row.projectMappingKey} onChange={(e) => updateMappingRow(index, { projectMappingKey: e.target.value })} placeholder="mapping key" style={{ padding: 5, background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: 11 }} />
                                <input value={row.ttgId} onChange={(e) => updateMappingRow(index, { ttgId: e.target.value })} placeholder="-100..." style={{ padding: 5, background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: 11 }} />
                                <input value={row.label} onChange={(e) => updateMappingRow(index, { label: e.target.value })} placeholder="label" style={{ padding: 5, background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: 11 }} />
                                <button type="button" onClick={() => setMappingRows((rows) => rows.filter((_, i) => i !== index))} style={{ background: '#241a20', border: '1px solid var(--border-color)', color: '#ff8f8f', borderRadius: 4 }}>×</button>
                            </div>
                        ))}
                        {!mappingRows.length && (
                            <div style={{ color: 'var(--text-secondary)' }}>No project mappings yet.</div>
                        )}
                        {saveMappingsMutation.isError && (
                            <div style={{ color: '#e35050', marginTop: 6 }}>{String(saveMappingsMutation.error.message)}</div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                <div
                    style={{
                        width: '38%',
                        borderRight: '1px solid var(--border-color)',
                        overflowY: 'auto',
                        fontSize: '11px'
                    }}
                >
                    {(isLoading || (panel === 'memory' && memLoading)) && <div style={{ padding: '12px' }}>Loading…</div>}
                    {error && (
                        <div style={{ padding: '12px', color: '#e35050' }}>
                            {String(error.message)}
                        </div>
                    )}
                    {!isLoading && !list.length && panel === 'a070' && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            No Markdown summaries under A070 yet, or none match this channel id in the path.
                        </div>
                    )}
                    {!memLoading && !list.length && panel === 'memory' && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            No memory files matched, or memory dir is empty.
                        </div>
                    )}
                    {list.map((f) => (
                        <button
                            data-testid={`ide-summary-file-${f.relativePath}`}
                            key={f.relativePath}
                            type="button"
                            onClick={() => setSelectedRel(f.relativePath)}
                            style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 10px',
                                border: 'none',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                background: selectedRel === f.relativePath ? 'rgba(80,227,194,0.12)' : 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                        >
                            {f.relativePath}
                            {panel === 'a070' && (
                                <span
                                    style={{
                                        float: 'right',
                                        marginLeft: 8,
                                        color: STATUS_COLORS[f.bridgeStatus] || STATUS_COLORS.unknown,
                                        fontSize: 10
                                    }}
                                >
                                    {STATUS_LABELS[f.bridgeStatus] || 'Draft'}
                                </span>
                            )}
                            <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {new Date(f.mtimeMs).toLocaleString()} · {f.size} B
                            </div>
                            {panel === 'a070' && f.meta?.promotion?.target && (
                                <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                                    target: {f.meta.promotion.target}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontSize: '13px' }}>
                    {!selectedRel && (
                        <div style={{ color: 'var(--text-secondary)' }}>Select a file to preview full Markdown.</div>
                    )}
                    {selectedRel && fileData?.text && (
                        <>
                            {panel === 'a070' && (
                                <div
                                    style={{
                                        marginBottom: 12,
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(180px, 1fr) auto',
                                        gap: 10,
                                        alignItems: 'start'
                                    }}
                                >
                                    <div
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: 6,
                                            padding: 10,
                                            fontSize: 11,
                                            color: 'var(--text-secondary)'
                                        }}
                                    >
                                        <div style={{ color: statusColor, fontWeight: 700, marginBottom: 6 }}>
                                            {STATUS_LABELS[selectedStatus] || 'Draft saved'}
                                        </div>
                                        <div>TTG: <code>{selectedMeta?.ttgId || channelId || 'unknown'}</code></div>
                                        <div>Project: <code>{selectedMeta?.projectId || 'unknown'}</code></div>
                                        <div>Surface: <code>{selectedMeta?.surface || 'unknown'}</code></div>
                                        <div>Binding: <code>{selectedMeta?.binding?.status || 'unknown'}</code></div>
                                        <div>Method: <code>{selectedMeta?.binding?.method || 'none'}</code></div>
                                        {selectedMeta?.binding?.reason && (
                                            <div>Reason: <code>{selectedMeta.binding.reason}</code></div>
                                        )}
                                        {selectedMeta?.binding?.candidates?.length > 0 && (
                                            <div>Candidates: <code>{selectedMeta.binding.candidates.join(', ')}</code></div>
                                        )}
                                        <div>Target: <code>{selectedMeta?.promotion?.target || 'not promoted'}</code></div>
                                        {selectedMeta?.promotion?.lastPromotedAt && (
                                            <div>Last promoted: {new Date(selectedMeta.promotion.lastPromotedAt).toLocaleString()}</div>
                                        )}
                                    </div>
                                    <button
                                        data-testid="ide-summary-promote"
                                        type="button"
                                        onClick={() => setPromoteOpen(true)}
                                        style={{
                                            padding: '8px 14px',
                                            fontSize: 12,
                                            background: 'rgba(80,227,194,0.2)',
                                            border: '1px solid rgba(80,227,194,0.45)',
                                            color: '#50e3c2',
                                            borderRadius: 6,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Promote to OpenClaw memory…
                                    </button>
                                </div>
                            )}
                            <div className="markdown-preview">
                                <ReactMarkdown remarkPlugins={plugins}>{fileData.text}</ReactMarkdown>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <MemoryPromoteModal
                open={promoteOpen}
                sourceRelativePath={selectedRel || ''}
                channelId={channelId}
                queryClient={queryClient}
                onClose={() => setPromoteOpen(false)}
                onPromoted={() => {
                    setPromoteOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['ide-project-summaries', channelId] });
                    queryClient.invalidateQueries({ queryKey: ['ideSummaryFile', selectedRel, panel] });
                }}
            />
        </div>
    );
}
