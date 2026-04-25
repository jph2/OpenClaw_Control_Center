import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Save, RotateCcw, Link, Search, ChevronLeft, ChevronRight, ArrowUp, Code, SplitSquareHorizontal 
} from 'lucide-react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
    applyWorkbenchSearchParams,
    USER_HOME_FALLBACK,
    useWorkbenchStore
} from '../state/useWorkbenchStore.js';

// --- Global Resize Handle Styles ---
const setupStyles = () => {
    if (document.getElementById('resize-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'resize-styles';
    styles.innerHTML = `
        .resize-handle-horizontal:hover, .resize-handle-horizontal:active { background: var(--accent) !important; }
        .resize-handle-horizontal:hover .handle-bar, .resize-handle-horizontal:active .handle-bar { background: #000 !important; }
        .resize-handle-vertical:hover, .resize-handle-vertical:active { background: var(--accent) !important; }
        .resize-handle-vertical:hover .handle-bar, .resize-handle-vertical:active .handle-bar { background: #000 !important; }
    `;
    document.head.appendChild(styles);
};
setupStyles();

// --- Reusable Resize Handle Component ---
const ResizeHandle = ({ direction }) => (
    <PanelResizeHandle
        className={direction === 'horizontal' ? 'resize-handle-horizontal' : 'resize-handle-vertical'}
        style={{
            width: direction === 'horizontal' ? '2px' : '100%',
            height: direction === 'horizontal' ? '100%' : '2px',
            minWidth: direction === 'horizontal' ? '2px' : '100%',
            minHeight: direction === 'horizontal' ? '100%' : '2px',
            background: 'var(--border-color)',
            cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            zIndex: 10,
        }}
    >
        <div 
            className="handle-bar"
            style={{
                position: 'absolute',
                width: direction === 'horizontal' ? '4px' : '30px',
                height: direction === 'horizontal' ? '30px' : '4px',
                background: 'var(--text-secondary)',
                borderRadius: '2px',
                transition: 'background 0.2s',
            }} 
        />
    </PanelResizeHandle>
);

const PaneHeader = ({ title }) => (
    <div style={{
        padding: '8px 16px',
        background: '#1a1b23',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--text-primary)',
        minHeight: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    }}>
        <span>{title}</span>
    </div>
);

// --- Proportional Scroll Hook ---
function useProportionalScroll(sourceRef, targetRef, enabled, contentDep) {
    useEffect(() => {
        const source = sourceRef.current;
        const target = targetRef.current;
        if (!source || !target) return;

        // Force a proactive sync if enabled toggle switched
        if (enabled) {
            setTimeout(() => {
                if (source.scrollHeight > source.clientHeight) {
                    target.scrollTop = (source.scrollTop / (source.scrollHeight - source.clientHeight)) * (target.scrollHeight - target.clientHeight);
                }
            }, 100);
        }

        if (!enabled) return;

        let isSyncingLeft = false;
        let isSyncingRight = false;

        const handleSourceScroll = () => {
            if (!isSyncingLeft) {
                isSyncingRight = true;
                const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
                target.scrollTop = percentage * (target.scrollHeight - target.clientHeight);
            }
            isSyncingLeft = false;
        };

        const handleTargetScroll = () => {
            if (!isSyncingRight) {
                isSyncingLeft = true;
                const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
                source.scrollTop = percentage * (source.scrollHeight - source.clientHeight);
            }
            isSyncingRight = false;
        };

        source.addEventListener('scroll', handleSourceScroll, { passive: true });
        target.addEventListener('scroll', handleTargetScroll, { passive: true });

        return () => {
            if (source) source.removeEventListener('scroll', handleSourceScroll);
            if (target) target.removeEventListener('scroll', handleTargetScroll);
        };
    }, [sourceRef, targetRef, enabled, contentDep]);
}

// --- Mock Markdown Generator ---
const renderSimpleMarkdown = (text) => {
    if (!text) return "Select a file to preview.";
    return text.split('\n').map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} style={{marginBottom:'16px'}}>{line.substring(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} style={{marginTop:'24px', marginBottom:'16px'}}>{line.substring(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} style={{marginTop:'16px', marginBottom:'8px'}}>{line.substring(4)}</h3>;
        if (line.startsWith('- ')) return <li key={i} style={{marginLeft:'20px', marginBottom:'4px'}}>{line.substring(2)}</li>;
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} style={{marginBottom:'12px', lineHeight: 1.6}}>{line}</p>;
    });
};

// --- Mock Outline Extractor ---
const extractOutline = (text) => {
    if (!text) return [];
    return text.split('\n')
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => line.startsWith('#'))
        .map(({ line, idx }) => {
            const level = line.match(/^#+/)[0].length;
            const content = line.replace(/^#+\s/, '');
            return { level, content, idx };
        });
};


// --- File Editor Component ---
function EditorWorkspace({ path, mainKey }) {
    const { viewMode, localContent, setLocalContent, scrollSync, outlineMode } = useWorkbenchStore();
    const rawScrollRef = useRef(null);
    const previewScrollRef = useRef(null);
    const lineNumbersRef = useRef(null);
    
    useProportionalScroll(rawScrollRef, previewScrollRef, scrollSync, localContent);

    const { data, isLoading } = useQuery({
        queryKey: ['workbench-file', path],
        queryFn: async () => {
            const res = await fetch(`/api/workbench/file?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error('File fetch failed');
            return res.json();
        },
        enabled: !!path
    });

    useEffect(() => {
        if (data?.raw !== undefined) {
            setLocalContent(data.raw);
        }
    }, [data, setLocalContent]);

    if (!path) {
        return <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)'}}>Select a file from the sidebar to open the workspace.</div>;
    }

    if (isLoading) return <div style={{padding:'20px'}}>Loading file data...</div>;

    const originalContent = data?.raw || '';
    const lineCount = localContent.split('\n').length;
    
    const handleOutlineClick = (idx) => {
        if (!rawScrollRef.current) return;
        const ratio = idx / (lineCount > 0 ? lineCount : 1);
        rawScrollRef.current.scrollTop = ratio * (rawScrollRef.current.scrollHeight - rawScrollRef.current.clientHeight);
    };

    const handleMinimapClick = (e) => {
        if (!rawScrollRef.current) return;
        const ratio = e.nativeEvent.offsetY / e.currentTarget.scrollHeight;
        rawScrollRef.current.scrollTop = ratio * (rawScrollRef.current.scrollHeight - rawScrollRef.current.clientHeight);
    };

    return (
        <>
            {viewMode === 'code' ? (
                <PanelGroup key={mainKey} orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
                    
                    {/* Pane 1: Raw Editor */}
                    <Panel minSize={10} defaultSize={40} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="pane-title" style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                            Raw Editor
                        </div>
                        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', background: 'var(--bg-primary)' }}>
                            <div 
                                ref={lineNumbersRef}
                                style={{
                                    width: '40px', padding: '16px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'monospace', lineHeight: '1.6', overflow: 'hidden', userSelect: 'none', background: 'var(--bg-elevated)', flexShrink: 0
                                }}
                            >
                                {Array.from({ length: lineCount }).map((_, i) => <div key={i}>{i + 1}</div>)}
                            </div>
                            <textarea
                                ref={rawScrollRef}
                                value={localContent}
                                onChange={(e) => setLocalContent(e.target.value)}
                                onScroll={(e) => {
                                    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.target.scrollTop;
                                }}
                                style={{
                                    flex: 1, padding: '16px', background: 'transparent',
                                    color: 'var(--text-primary)', border: 'none', resize: 'none',
                                    fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', outline: 'none',
                                    overflowX: 'auto', whiteSpace: 'pre'
                                }}
                                spellCheck={false}
                                wrap="off"
                            />
                        </div>
                    </Panel>

                    <ResizeHandle direction="horizontal" />

                    {/* Pane 2: Preview */}
                    <Panel minSize={10} defaultSize={40} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
                        <div className="pane-title" style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                            Markdown Preview
                        </div>
                        <div ref={previewScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                            {renderSimpleMarkdown(localContent)}
                        </div>
                    </Panel>

                    <ResizeHandle direction="horizontal" />

                    {/* Pane 3: Outline */}
                    <Panel minSize={10} defaultSize={20} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)' }}>
                        <div className="pane-title" style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                            Outline
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: outlineMode === 'minimap' ? '0' : '16px', position: 'relative', overflowX: 'hidden' }}>
                            {outlineMode === 'minimap' ? (
                                <div onClick={handleMinimapClick} style={{ cursor: 'pointer', transform: 'scale(0.3)', transformOrigin: 'top left', width: '333%', padding: '16px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                                    {localContent}
                                </div>
                            ) : (
                                extractOutline(localContent).map(h => (
                                    <div key={h.idx} onClick={() => handleOutlineClick(h.idx)} style={{ paddingLeft: `${(h.level - 1) * 12}px`, fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <span style={{opacity: 0.5}}>{h.idx + 1}: </span> {h.content}
                                    </div>
                                ))
                            )}
                        </div>
                    </Panel>

                </PanelGroup>
            ) : (
                <div
                    className="diff-viewer-embed"
                    style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#1e1e1e' }}
                >
                    <ReactDiffViewer
                        oldValue={originalContent}
                        newValue={localContent}
                        splitView={true}
                        useDarkTheme={true}
                    />
                </div>
            )}
        </>
    );
}

// --- File Tree Node Component ---
function TreeNode({ node, level = 0, forceOpen, selectedNode, setSelectedNode }) {
    const { activeFile, setActiveFile, addRecentDir } = useWorkbenchStore();
    const [isOpen, setIsOpen] = useState(false);
    
    const actuallyOpen = forceOpen || isOpen;
    const isSelected = selectedNode && selectedNode.path === (node.path || node.name);
    
    const formatDate = (ms) => {
        if (!ms) return '--';
        const d = new Date(ms);
        return d.toISOString().split('T')[0];
    };
    
    const formatSize = (bytes) => {
        if (bytes === undefined || bytes === null || node.type === 'dir') return '--';
        return (bytes / 1024).toFixed(1) + ' KB';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div 
                onClick={() => {
                    setSelectedNode({ path: node.path || node.name, type: node.type });
                    if (node.type === 'file') {
                        setActiveFile(node.path || node.name);
                    } else if (node.type === 'dir') {
                        setIsOpen(!isOpen);
                        addRecentDir(node.path || node.name);
                    }
                }}
                style={{ 
                    padding: `4px 8px 4px ${8 + (level * 12)}px`, 
                    fontSize: '13px', 
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    background: isSelected ? 'rgba(80, 227, 194, 0.1)' : 'transparent',
                    borderRadius: '4px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto', minWidth: '40px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {node.type === 'dir' ? (
                        <span style={{ color: '#e3c450', cursor: 'pointer', flexShrink: 0 }}>{actuallyOpen ? '📂' : '📁'}</span>
                    ) : (
                        <span style={{ color: '#888', flexShrink: 0 }}>📄</span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
                </div>
                <div style={{ flex: '0 1 60px', color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'clip' }}>
                    {formatSize(node.size)}
                </div>
                <div style={{ flex: '0 1 80px', color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'right', paddingLeft: '8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'clip' }}>
                    {formatDate(node.updatedAt)}
                </div>
            </div>
            
            {actuallyOpen && node.type === 'dir' && node.children && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map((child, idx) => (
                        <TreeNode key={`${child.name}-${idx}`} node={child} level={level + 1} forceOpen={forceOpen} selectedNode={selectedNode} setSelectedNode={setSelectedNode} />
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Main Application Component ---
export default function Workbench() {
    const { 
        viewMode, setViewMode, activeFile, setActiveFile, autosave, setAutosave, 
        localContent, setLocalContent, scrollSync, setScrollSync, outlineMode, setOutlineMode, 
        recentDocs, recentDirs, addRecentDir, currentRoot, setCurrentRoot, workspaces, addWorkspace, removeWorkspace 
    } = useWorkbenchStore();
    
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();

    const applyFromUrl = useCallback(() => {
        applyWorkbenchSearchParams(searchParams);
    }, [searchParams]);

    useEffect(() => {
        const run = () => applyWorkbenchSearchParams(new URLSearchParams(window.location.search));
        const unsub = useWorkbenchStore.persist.onFinishHydration(run);
        if (useWorkbenchStore.persist.hasHydrated()) {
            run();
        }
        return unsub;
    }, []);

    useEffect(() => {
        if (!useWorkbenchStore.persist.hasHydrated()) return;
        applyFromUrl();
    }, [searchParams, applyFromUrl]);

    const [sidebarKey, setSidebarKey] = useState(0);
    const [mainKey, setMainKey] = useState(0);

    const resetSidebar = () => setSidebarKey(k => k + 1);
    const resetMainArea = () => setMainKey(k => k + 1);

    const [currentRootText, setCurrentRootText] = useState(currentRoot);
    useEffect(() => {
        setCurrentRootText(currentRoot);
    }, [currentRoot]);

    // Filters
    const [filterName, setFilterName] = useState('');
    const [filterAgeFrom, setFilterAgeFrom] = useState('');
    const [filterAgeTo, setFilterAgeTo] = useState('');
    const [filterSizeFrom, setFilterSizeFrom] = useState('');
    const [filterSizeTo, setFilterSizeTo] = useState('');
    const [filterKind, setFilterKind] = useState('all kinds');
    const [filterSort, setFilterSort] = useState('sort: name');

    // Delete Modal
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Active Node Selection for actions
    const [selectedNode, setSelectedNode] = useState(null);

    // Address Bar State
    const [addressBarValue, setAddressBarValue] = useState(currentRoot);
    useEffect(() => {
        if (selectedNode) {
            setAddressBarValue(selectedNode.path);
        } else {
            setAddressBarValue(currentRoot);
        }
    }, [selectedNode, currentRoot]);

    const handleNavAction = async (action) => {
        const invokeAPI = async (endpoint, payload) => {
            const res = await fetch(`/api/workbench/${endpoint}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) alert(`Error: ${(await res.json()).message || 'Failed'}`);
            queryClient.invalidateQueries({ queryKey: ['workbench-tree'] });
        };

        let baseDir = currentRoot;
        if (selectedNode) {
            if (selectedNode.type === 'dir') {
                baseDir = selectedNode.path;
            } else {
                baseDir = selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || currentRoot;
            }
        }

        if (action === 'folder') {
            const name = prompt(`Creating folder in: ${baseDir}\nName:`, 'NewFolder');
            if (name) await invokeAPI('mkdir', { path: `${baseDir}/${name}` });
        }
        if (action === 'file') {
            const name = prompt(`Creating file in: ${baseDir}\nName:`, 'newfile.txt');
            if (name) await invokeAPI('touch', { path: `${baseDir}/${name}` });
        }
        if (action === 'delete') {
            const target = selectedNode ? selectedNode.path : currentRoot;
            setDeleteTarget(target);
        }
        if (action === 'duplicate') {
            const src = selectedNode ? selectedNode.path : null;
            if (!src) return alert('Select a file or folder to duplicate first.');
            
            const dest = prompt(`Absolute path of destination for ${src}:`, src + '_copy');
            if (dest) await invokeAPI('duplicate', { path: src, dest });
        }
        if (action === 'upload') {
            document.getElementById('hidden-upload')?.click();
        }
    };

    // Fetch live recursive tree
    const { data: treeData, isLoading: treeLoading } = useQuery({
        queryKey: ['workbench-tree', currentRoot],
        queryFn: async () => {
            try {
                const res = await fetch(`/api/workbench/tree?path=${encodeURIComponent(currentRoot==='workspace'?'':currentRoot)}`);
                if (res.status === 403) {
                    console.warn("Hit workspace boundary or forbidden path:", currentRoot);
                    setCurrentRoot('workspace');
                    return { tree: [] };
                }
                if (!res.ok) throw new Error('Tree fetch failed');
                return res.json();
            } catch (err) {
                console.error(err);
                if (currentRoot !== 'workspace') {
                    setCurrentRoot('workspace');
                }
                return { tree: [] };
            }
        }
    });

    // Apply recursive filter and sort strategy
    const filteredTree = useMemo(() => {
        if (!treeData?.tree) return [];
        
        const passesFilters = (item) => {
            if (filterKind !== 'all kinds' && filterKind !== 'folder') {
                if (item.type === 'dir' || item.kind !== filterKind) return false;
            } else if (filterKind === 'folder') {
                if (item.type !== 'dir') return false;
            }

            if (filterName && !item.name.toLowerCase().includes(filterName.toLowerCase())) return false;
            
            if (item.type === 'file') {
                const ageDays = (Date.now() - item.updatedAt) / (1000 * 60 * 60 * 24);
                const sizeKb = item.size / 1024;
                
                if (filterAgeFrom && ageDays < parseFloat(filterAgeFrom)) return false;
                if (filterAgeTo && ageDays > parseFloat(filterAgeTo)) return false;
                if (filterSizeFrom && sizeKb < parseFloat(filterSizeFrom)) return false;
                if (filterSizeTo && sizeKb > parseFloat(filterSizeTo)) return false;
            }
            return true;
        };

        const processTree = (nodes) => {
            return nodes.map(node => {
                if (node.type === 'dir' && node.children) {
                    const filteredChildren = processTree(node.children);
                    if (!passesFilters(node) && filteredChildren.length === 0) return null;
                    return { ...node, children: filteredChildren };
                }
                return passesFilters(node) ? node : null;
            }).filter(Boolean);
        };
        
        const sortFn = (a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            if (filterSort === 'sort: name') return a.name.localeCompare(b.name);
            if (filterSort === 'sort: newest') return b.updatedAt - a.updatedAt;
            if (filterSort === 'sort: oldest') return a.updatedAt - b.updatedAt;
            if (filterSort === 'sort: largest') return b.size - a.size;
            if (filterSort === 'sort: smallest') return a.size - b.size;
            return 0;
        };

        const sortTreeRecursive = (nodes) => {
            return [...nodes].sort(sortFn).map(n => {
                if (n.children) return { ...n, children: sortTreeRecursive(n.children) };
                return n;
            });
        };

        return sortTreeRecursive(processTree(treeData.tree));
    }, [treeData, filterName, filterAgeFrom, filterAgeTo, filterSizeFrom, filterSizeTo, filterKind, filterSort]);


    const activeFileData = queryClient.getQueryData(['workbench-file', activeFile]);
    const originalContent = activeFileData?.raw || '';
    
    const saveMutation = useMutation({
        mutationFn: async (content) => {
            const res = await fetch('/api/workbench/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: activeFile, content })
            });
            if (!res.ok) throw new Error('Failed to save');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workbench-file', activeFile] })
    });

    const triggerSave = () => {
        saveMutation.mutate(localContent);
    };

    // Autosave implementation
    useEffect(() => {
        if (!autosave || !activeFile) return;
        if (localContent === originalContent) return;

        const handler = setTimeout(() => {
            saveMutation.mutate(localContent);
        }, 1500);

        return () => clearTimeout(handler);
    }, [localContent, autosave, activeFile, originalContent]);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            {/* DANGER Modal */}
            {deleteTarget && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#1a1b23', padding: '24px', borderRadius: '8px', border: '1px solid #ff4444', maxWidth: '450px' }}>
                        <h3 style={{ color: '#ff4444', marginTop: 0 }}>⚠️ DANGER: Recursive Delete</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>You are about to permanently delete:</p>
                        <p style={{ fontFamily: 'monospace', padding: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', wordBreak: 'break-all' }}>{deleteTarget}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>If this is a directory, <strong>everything inside it</strong> will be deleted without recovery. Are you absolutely sure?</p>
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" id="delCheck" checked={deleteConfirm} onChange={e => setDeleteConfirm(e.target.checked)} />
                            <label htmlFor="delCheck" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>I understand, PERMANENTLY delete this resource.</label>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
                            <button style={{ flex: 1, padding: '8px', background: 'var(--bg-surface)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { setDeleteTarget(null); setDeleteConfirm(false); }}>Cancel</button>
                            <button 
                                style={{ flex: 1, padding: '8px', background: deleteConfirm ? '#ff4444' : 'rgba(255,68,68,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: deleteConfirm ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
                                disabled={!deleteConfirm}
                                onClick={async () => {
                                    await fetch('/api/workbench/delete', {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ path: deleteTarget })
                                    });
                                    queryClient.invalidateQueries({ queryKey: ['workbench-tree'] });
                                    setDeleteTarget(null);
                                    setDeleteConfirm(false);
                                }}
                            >
                                CONFIRM DELETION
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <PanelGroup id="workbench-main-split" orientation="horizontal">
                
                {/* SIDEBAR PANEL */}
                <Panel defaultSize={20} minSize={15} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '16px', margin: 0 }}>OpenClaw workbench</h1>
                            <button onClick={resetSidebar} style={{ fontSize: '10px', padding: '2px 6px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '4px', cursor: 'pointer' }}>Default</button>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Accessing files on host.</p>
                    </div>

                    {/* KEY triggers remount setting to defaultSizes */}
                    <PanelGroup key={`sidebar-${sidebarKey}`} id="workbench-sidebar-split" orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
                        
                        {/* Workspaces */}
                        <Panel defaultSize={20} minSize={15} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PaneHeader title="Workspaces" />
                            <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto', minHeight: '60px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ background: 'rgba(80, 227, 194, 0.1)', border: '1px solid rgba(80, 227, 194, 0.3)', padding: '6px 10px', borderRadius: '4px', fontSize: '10px', color: 'var(--accent)', lineHeight: 1.4, marginBottom: '4px' }}>
                                    <strong>INFO:</strong> The file tree crawls up to <strong>8 folders deep</strong> for performance. To access buried files, enter a deeper absolute folder path into the <em>Custom Path</em> field below and load it!
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => setCurrentRoot(USER_HOME_FALLBACK)} style={{ flex: '1 1 45%', padding: '4px 6px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }} title="User home (needs backend homedir allowlist)">Home (user)</button>
                                    <button type="button" onClick={() => setCurrentRoot('/media/claw-agentbox/data')} style={{ flex: '1 1 45%', padding: '4px 6px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Drive: data</button>
                                    <button type="button" onClick={() => setCurrentRoot('/')} style={{ flex: '1 1 100%', padding: '4px 6px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }} title="Set WORKBENCH_ALLOW_FS_ROOT=1 in backend .env">Filesystem root (/)</button>
                                </div>
                                <select
                                    value={currentRoot}
                                    onChange={(e) => setCurrentRoot(e.target.value)}
                                    style={{ width: '100%', padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', outline: 'none', fontSize: '11px' }}
                                >
                                    {[...new Set([...workspaces, currentRoot])]
                                        .filter(Boolean)
                                        .map((w) => (
                                            <option key={w} value={w}>
                                                {w}
                                            </option>
                                        ))}
                                </select>
                                <input value={currentRootText} onChange={e => setCurrentRootText(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', outline: 'none', fontSize: '11px', fontFamily: 'monospace' }} placeholder="Custom Absolute Path..." />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setCurrentRoot(currentRootText.trim())} style={{ flex: 1, padding: '4px 6px', background: 'var(--accent)', color: 'black', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Open Custom</button>
                                    <button onClick={() => { if(currentRootText.trim()) addWorkspace(currentRootText.trim()); }} style={{ padding: '4px 6px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Save</button>
                                </div>
                            </div>
                        </Panel>
                        <ResizeHandle direction="vertical" />
                        
                        {/* Tree Filter */}
                        <Panel defaultSize={28} minSize={20} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1b23', borderBottom: '1px solid var(--border-color)' }}>
                                <PaneHeader title="Tree filter | Filename search" />
                                <span style={{color: 'var(--text-muted)', fontSize: '11px', paddingRight: '16px'}}>live filter + sort</span>
                            </div>
                            <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
                                <div style={{ marginBottom: '8px' }}>
                                    <input type="text" value={filterName} onChange={e => setFilterName(e.target.value)} placeholder="Type a filename; filters apply live" style={{width: '100%', padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', fontSize: '11px', outline: 'none'}} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <input type="number" min="0" value={filterAgeFrom} onChange={e => setFilterAgeFrom(e.target.value)} placeholder="age from" style={{ flex: 1, minWidth: 0, padding: '6px', background: 'transparent', border: 'none', color: 'white', fontSize: '11px', outline: 'none' }} />
                                        <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid var(--border-color)' }}>days</div>
                                    </div>
                                    <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <input type="number" min="0" value={filterAgeTo} onChange={e => setFilterAgeTo(e.target.value)} placeholder="age to" style={{ flex: 1, minWidth: 0, padding: '6px', background: 'transparent', border: 'none', color: 'white', fontSize: '11px', outline: 'none' }} />
                                        <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid var(--border-color)' }}>days</div>
                                    </div>
                                    <select value={filterKind} onChange={e => setFilterKind(e.target.value)} style={{padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', fontSize: '11px', outline: 'none'}}>
                                        <option value="all kinds">all kinds</option>
                                        <option value="text">text</option>
                                        <option value="image">image</option>
                                        <option value="pdf">pdf</option>
                                        <option value="folder">folder</option>
                                    </select>
                                    <select value={filterSort} onChange={e => setFilterSort(e.target.value)} style={{padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', fontSize: '11px', outline: 'none'}}>
                                        <option value="sort: name">sort: name</option>
                                        <option value="sort: newest">sort: newest</option>
                                        <option value="sort: oldest">sort: oldest</option>
                                        <option value="sort: largest">sort: largest</option>
                                        <option value="sort: smallest">sort: smallest</option>
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)', gap: '8px', marginBottom: '12px', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <input type="number" min="0" value={filterSizeFrom} onChange={e => setFilterSizeFrom(e.target.value)} placeholder="size from" style={{ flex: 1, minWidth: 0, padding: '6px', background: 'transparent', border: 'none', color: 'white', fontSize: '11px', outline: 'none' }} />
                                        <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid var(--border-color)' }}>KB</div>
                                    </div>
                                    <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <input type="number" min="0" value={filterSizeTo} onChange={e => setFilterSizeTo(e.target.value)} placeholder="size to" style={{ flex: 1, minWidth: 0, padding: '6px', background: 'transparent', border: 'none', color: 'white', fontSize: '11px', outline: 'none' }} />
                                        <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid var(--border-color)' }}>KB</div>
                                    </div>
                                    <button 
                                        onClick={() => { setFilterName(''); setFilterAgeFrom(''); setFilterAgeTo(''); setFilterSizeFrom(''); setFilterSizeTo(''); setFilterKind('all kinds'); setFilterSort('sort: name'); }}
                                        style={{ padding: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer' }}
                                    >Clear filters</button>
                                </div>
                                <div style={{ background: 'var(--bg-elevated)', borderRadius: '4px', border: '1px solid var(--border-color)', overflow: 'hidden', flexShrink: 0, marginTop: 'auto' }}>
                                    <div style={{ padding: '4px 8px', fontSize: '10px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Tree filter status</div>
                                    <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-primary)' }}>
                                        {filterName || filterAgeFrom || filterAgeTo || filterSizeFrom || filterSizeTo || filterKind !== 'all kinds' ? (
                                            <span style={{color: 'var(--accent)'}}>Active filters applied. Showing {filteredTree.length} matched root nodes.</span>
                                        ) : (
                                            <span>No active tree filter. {filterSort}.</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Panel>
                        <ResizeHandle direction="vertical" />

                        {/* Tree Navigation */}
                        <Panel defaultSize={15} minSize={10} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PaneHeader title="Tree Navigation" />
                            <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto', minHeight: '80px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: '6px', marginBottom: '8px' }}>
                                    <button onClick={() => handleNavAction('folder')} style={{ padding: '4px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>+ Folder</button>
                                    <button onClick={() => handleNavAction('file')} style={{ padding: '4px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>+ File</button>
                                    <button onClick={() => handleNavAction('upload')} style={{ padding: '4px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Upload</button>
                                    <button onClick={() => handleNavAction('duplicate')} style={{ padding: '4px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Dupl.</button>
                                    <button onClick={() => handleNavAction('delete')} style={{ padding: '4px 6px', background: 'rgba(255, 50, 50, 0.1)', border: '1px solid rgba(255, 50, 50, 0.3)', borderRadius: '4px', fontSize: '11px', color: '#ff6b6b', cursor: 'pointer' }}>Delete</button>
                                </div>
                                <input type="file" id="hidden-upload" style={{display:'none'}} multiple onChange={async e => {
                                    const files = Array.from(e.target.files);
                                    
                                    let baseDir = currentRoot;
                                    if (selectedNode) {
                                        baseDir = selectedNode.type === 'dir' ? selectedNode.path : (selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || currentRoot);
                                    }

                                    for(let f of files) {
                                        const fd = new FormData();
                                        fd.append('file', f);
                                        fd.append('path', `${baseDir}/${f.name}`);
                                        await fetch('/api/workbench/upload', { method: 'POST', body: fd });
                                    }
                                    queryClient.invalidateQueries({ queryKey: ['workbench-tree'] });
                                }} />
                                <div 
                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                                    onDrop={async e => { 
                                        e.preventDefault(); 
                                        const files = Array.from(e.dataTransfer.files);
                                        
                                        let baseDir = currentRoot;
                                        if (selectedNode) {
                                            baseDir = selectedNode.type === 'dir' ? selectedNode.path : (selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || currentRoot);
                                        }

                                        for(let f of files) {
                                            const fd = new FormData();
                                            fd.append('file', f);
                                            fd.append('path', `${baseDir}/${f.name}`);
                                            await fetch('/api/workbench/upload', { method: 'POST', body: fd });
                                        }
                                        queryClient.invalidateQueries({ queryKey: ['workbench-tree'] });
                                    }}
                                    style={{ 
                                        padding: '16px', border: '1px dashed var(--border-color)', borderRadius: '4px', flexShrink: 0,
                                        textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' 
                                }}>
                                    Drag & Drop File Here
                                </div>
                            </div>
                        </Panel>
                        <ResizeHandle direction="vertical" />

                        {/* File Tree Render */}
                        <Panel defaultSize={35} minSize={15} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#1a1b23', borderBottom: '1px solid var(--border-color)', padding: '6px 16px', gap: '8px', minHeight: '32px', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    File Directory
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', gap: '8px', margin: '0 8px' }}>
                                    <input 
                                        value={addressBarValue || currentRoot || ''}
                                        onChange={e => setAddressBarValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && addressBarValue) setCurrentRoot(addressBarValue);
                                        }}
                                        placeholder="Absolute path..."
                                        spellCheck={false}
                                        style={{
                                            flex: 1, minWidth: 0, width: '100%',
                                            fontSize: '11px', color: '#ffffff', background: 'transparent',
                                            border: 'none', outline: 'none', fontFamily: 'monospace'
                                        }}
                                    />
                                    <button onClick={() => navigator.clipboard.writeText(addressBarValue || currentRoot)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }} title="Copy Path">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                </div>
                                <button 
                                    onClick={() => {
                                        if (!currentRoot || currentRoot === 'workspace' || currentRoot === '/') return;
                                        const parentDir = currentRoot.substring(0, currentRoot.lastIndexOf('/')) || '/';
                                        if (parentDir !== currentRoot) setCurrentRoot(parentDir);
                                    }} 
                                    style={{ padding: '4px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                    title="Go Up One Level"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                </button>
                            </div>
                            <div style={{ display: 'flex', padding: '4px 8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-elevated)' }}>
                                <div style={{ flex: '1 1 auto', minWidth: '40px', paddingLeft: '8px', overflow: 'hidden' }}>Name</div>
                                <div style={{ flex: '0 1 60px', textAlign: 'right', overflow: 'hidden' }}>Size</div>
                                <div style={{ flex: '0 1 80px', textAlign: 'right', paddingLeft: '8px', overflow: 'hidden' }}>Date</div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', minHeight: '100px' }}>
                                {treeLoading ? (
                                    <div style={{fontSize: '12px', color: 'var(--text-secondary)'}}>Loading filesystem...</div>
                                ) : (
                                    filteredTree?.map((node, idx) => (
                                        <TreeNode 
                                            key={`${node.name}-${idx}`} 
                                            node={node} 
                                            forceOpen={filterName || filterAgeFrom || filterAgeTo || filterSizeFrom || filterSizeTo || filterKind !== 'all kinds'} 
                                            selectedNode={selectedNode} 
                                            setSelectedNode={setSelectedNode} 
                                        />
                                    ))
                                )}
                            </div>
                        </Panel>
                        <ResizeHandle direction="vertical" />

                        {/* Latest Index */}
                        <Panel defaultSize={15} minSize={10} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PaneHeader title="Local History" />
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: 'var(--bg-surface)', minHeight: '60px', display: 'flex', gap: '16px' }}>
                                {/* Docs Column */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px', flexShrink: 0 }}>Latest Docs</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {recentDocs.length > 0 ? recentDocs.map(doc => (
                                            <div key={doc} onClick={() => setActiveFile(doc)} title={doc} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                <span style={{ color: 'var(--text-primary)' }}>📄 {doc.split('/').pop()}</span>
                                                <span style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '10px', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {doc.substring(0, doc.lastIndexOf('/')) || '/'}
                                                </span>
                                            </div>
                                        )) : <div style={{color:'var(--text-muted)', fontSize:'11px'}}>No recent docs</div>}
                                    </div>
                                </div>
                                {/* Folders Column */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px', flexShrink: 0 }}>Latest Folders</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {recentDirs.length > 0 ? recentDirs.map(dir => (
                                            <div key={dir} onClick={() => setCurrentRoot(dir)} title={dir} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                <span style={{ color: 'var(--text-primary)' }}>📁 {dir.split('/').pop()}</span>
                                                <span style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '10px', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {dir.substring(0, dir.lastIndexOf('/')) || '/'}
                                                </span>
                                            </div>
                                        )) : <div style={{color:'var(--text-muted)', fontSize:'11px'}}>No recent folders</div>}
                                    </div>
                                </div>
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>

                <ResizeHandle direction="horizontal" />

                {/* MAIN WORKSPACE */}
                <Panel minSize={30} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
                    
                    {/* Unified Condensed Global Header */}
                    <div style={{ padding: '6px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <span style={{ color: 'var(--accent)' }}>{currentRoot}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>/</span>
                                {activeFile ? (
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {activeFile.split('/').map((part, i, arr) => (
                                            <React.Fragment key={i}>
                                                <span style={{ color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                    {part}
                                                </span>
                                                {i < arr.length - 1 && <span style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>/</span>}
                                            </React.Fragment>
                                        ))}
                                        <button onClick={() => navigator.clipboard.writeText(activeFile)} style={{ marginLeft: '12px', padding: '2px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                                            <Link size={10} /> Copy path
                                        </button>
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>None selected</span>
                                )}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                <button onClick={resetMainArea} style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--accent)', borderRadius: '4px', cursor: 'pointer' }}>
                                    default split
                                </button>
                                <button onClick={() => setScrollSync(!scrollSync)} style={{ padding: '2px 8px', fontSize: '11px', background: scrollSync ? 'rgba(80, 227, 194, 0.1)' : 'transparent', border: `1px solid ${scrollSync ? 'var(--accent)' : 'var(--border-color)'}`, color: scrollSync ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer' }}>
                                    scroll sync
                                </button>
                                <button onClick={() => setOutlineMode(outlineMode === 'list' ? 'minimap' : 'list')} style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer' }}>
                                    {outlineMode === 'list' ? 'Mini-Map' : 'Outline'}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                                    <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} /> Autosave
                                </label>
                                {activeFile && (
                                    <>
                                        <button onClick={triggerSave} style={{ display:'flex', alignItems:'center', gap:'4px', padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>
                                            <Save size={12} /> Save
                                        </button>
                                        <button onClick={() => setLocalContent(originalContent)} style={{ display:'flex', alignItems:'center', gap:'4px', padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>
                                            <RotateCcw size={12} /> Revert
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* View Modes */}
                            <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <button 
                                    onClick={() => setViewMode('code')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', border: 'none', background: viewMode === 'code' ? 'var(--accent)' : 'transparent', color: viewMode === 'code' ? '#000' : 'var(--text-secondary)', borderRadius: '2px', cursor: 'pointer', fontSize: '11px' }}
                                >
                                    <Code size={12} /> Code / Preview
                                </button>
                                <button 
                                    onClick={() => setViewMode('diff')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', border: 'none', background: viewMode === 'diff' ? 'var(--accent)' : 'transparent', color: viewMode === 'diff' ? '#000' : 'var(--text-secondary)', borderRadius: '2px', cursor: 'pointer', fontSize: '11px' }}
                                >
                                    <SplitSquareHorizontal size={12} /> Diff
                                </button>
                            </div>
                        </div>

                    </div>

                    <EditorWorkspace path={activeFile} mainKey={`main-${mainKey}`} />
                </Panel>
            </PanelGroup>
        </div>
    );
}
