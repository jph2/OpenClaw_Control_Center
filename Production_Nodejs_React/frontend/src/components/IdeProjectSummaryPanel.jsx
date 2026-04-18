import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MemoryPromoteModal from './MemoryPromoteModal.jsx';

const plugins = [remarkGfm];

function todaySlug() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Third workspace tab: IDE project summaries (Studio A070) + optional OpenClaw memory (read-only). Tool-agnostic. */
export default function IdeProjectSummaryPanel({ channelId, channelName }) {
    const queryClient = useQueryClient();
    const [selectedRel, setSelectedRel] = useState(null);
    const [panel, setPanel] = useState('a070'); // 'a070' | 'memory'
    const [draftPath, setDraftPath] = useState(
        () => `drafts/${todaySlug()}__${channelId ? channelId.replace(/[^0-9-]/g, '') : 'all'}__summary.md`
    );
    const [draftText, setDraftText] = useState(
        `# Summary\n\n- Channel: ${channelName || channelId || 'n/a'}\n- Date: ${todaySlug()}\n\n`
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

    const saveMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/ide-project-summaries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    relativePath: draftPath,
                    text: draftText,
                    createOnly: true
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

    const files = data?.files || [];
    const memFiles = memData?.files || [];

    const list = useMemo(() => (panel === 'memory' ? memFiles : files), [panel, memFiles, files]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-primary)' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>TARS in IDE · IDE project summary</strong>
                    <span>—</span>
                    <span>{channelName || channelId || 'all'}</span>
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
                    <button
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
                            <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {new Date(f.mtimeMs).toLocaleString()} · {f.size} B
                            </div>
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
                                <div style={{ marginBottom: 12 }}>
                                    <button
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
                onPromoted={() => setPromoteOpen(false)}
            />
        </div>
    );
}
