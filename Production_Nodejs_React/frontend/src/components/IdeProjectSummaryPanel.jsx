import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MemoryPromoteModal from './MemoryPromoteModal.jsx';

const plugins = [remarkGfm];

/** Avoid useless mutation messages like literal "true" when the API body omits `error`. */
function formatApiFailureMessage(status, j, fallbackDetail) {
    const err = j?.error;
    let part =
        typeof err === 'string'
            ? err
            : err != null && typeof err === 'object'
              ? JSON.stringify(err)
              : err === true || err === false
                ? ''
                : err != null
                  ? String(err)
                  : '';
    if (part === 'true' || part === 'false' || part === '') {
        part = `HTTP ${status}`;
    }
    const det = j?.details != null ? ` — ${JSON.stringify(j.details)}` : '';
    const extra = fallbackDetail ? ` — ${fallbackDetail}` : '';
    return part + det + extra;
}

/** Steps 1–2 after Step 0 (terminal) in the capture UI. */
const IDE_CAPTURE_WORKFLOW_STEPS = [
    {
        n: 1,
        title: 'Save path (required)',
        text: 'Required after Step 0: paste the workspaceStorage path and click Save path. Mount/mkdir in Step 0 only prepares the disk — the backend does not pick up that path until it is saved here (unless the server already sets CURSOR_WORKSPACE_STORAGE_ROOT — see More info).'
    },
    {
        n: 2,
        title: 'Optional',
        text: 'UI “Create folders” runs mkdir -p for the path you saved — same as the terminal one-liner in Step 0. Empty dirs are not Cursor data until you copy/rsync contents from the PC.'
    }
];

const captureStepSectionStyle = {
    marginBottom: '12px',
    padding: '10px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    background: 'rgba(19, 20, 28, 0.55)'
};

const captureStepHeadingStyle = {
    fontWeight: 700,
    marginBottom: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px'
};

const captureDetailsSummaryStyle = {
    cursor: 'pointer',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontSize: '13px',
    marginBottom: '6px'
};

/** Blue step boxes — clean-slate terminal sequence (Step 0). */
const ideCaptureCleanSlateStepBox = {
    margin: '0 0 8px 0',
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(110, 165, 255, 0.55)',
    background: 'rgba(65, 125, 235, 0.16)',
    fontSize: '11px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)'
};

const ideCaptureCleanSlateStepTitle = {
    fontWeight: 700,
    color: 'var(--accent)',
    marginBottom: '6px',
    fontSize: '11px'
};

const ideCaptureCleanSlatePre = {
    margin: 0,
    padding: '8px',
    background: '#13141c',
    borderRadius: '4px',
    fontSize: '10px',
    overflowX: 'auto',
    color: '#e8e8e8',
    border: '1px solid var(--border-color)',
    lineHeight: 1.4
};

const LS_IDE_CAPTURE_CONNECT_PANEL = 'cm.ide_capture.connect_panel_open.v1';

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

/** Resolver may return string ids or classifier candidate objects. */
function candidateTtgId(candidate) {
    if (typeof candidate === 'string') return candidate;
    if (!candidate || typeof candidate !== 'object') return '';
    return candidate.ttgId || candidate.id || candidate.channelId || '';
}

function candidateTtgName(candidate) {
    if (!candidate || typeof candidate === 'string') return '';
    return candidate.ttgName || candidate.name || candidate.code || '';
}

function formatBindingCandidates(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return '';
    return candidates
        .map((c) => candidateTtgId(c) || candidateTtgName(c))
        .filter(Boolean)
        .join(', ');
}

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

/** Higher = more relevant when filtering/sorting for the active TTG tab. */
function channelRelevance(record, channelId) {
    if (!channelId) return 0;
    const b = record.binding || {};
    if (b.ttgId === channelId) return 4;
    if (record.ttg?.current?.id === channelId) return 4;
    if (record.routingSuggestion?.ttgId === channelId) return 3;
    if ((b.candidates || []).some((c) => candidateTtgId(c) === channelId)) return 3;
    if ((record.classificationEvidence?.distribution || []).some((c) => candidateTtgId(c) === channelId)) return 3;
    if (String(record.sourcePath || '').includes(channelId)) return 2;
    return 0;
}

function recordNeedsTtgConfirmation(record) {
    if (!record || record.secretGate?.status === 'blocked') return false;
    if (record.binding?.status === 'confirmed') return false;
    return true;
}

/** TTG review rows plus export-ready artifacts awaiting stub/live Open Brain sync. */
function recordInArtifactsBridgePanel(record) {
    if (!record || record.secretGate?.status === 'blocked') return false;
    if (recordNeedsTtgConfirmation(record)) return true;
    if (record.exportEligibility?.status === 'ready') {
        const s = record.openBrain?.syncStatus;
        if (s !== 'synced') return true;
    }
    return false;
}

/** POSIX path to workspaceStorage from a mount point plus path under the mounted tree. */
function posixFromSmbForm(mountPoint, afterRelativePath) {
    const mp = String(mountPoint || '').trim().replace(/\/+$/, '');
    const rel = String(afterRelativePath || '').trim().replace(/^\/+/, '');
    if (!mp.startsWith('/') || !rel) return '';
    return `${mp}/${rel}`;
}

const DEFAULT_WINDOWS_WORKSPACE_STORAGE = 'C:\\Users\\YOUR_USERNAME\\AppData\\Roaming\\Cursor\\User\\workspaceStorage';

/** Parse standard Cursor workspaceStorage path on Windows → profile folder name + SMB relative path. */
function parseWindowsWorkspaceStoragePath(input) {
    const norm = String(input || '')
        .trim()
        .replace(/\//g, '\\');
    const re =
        /^[a-zA-Z]:\\Users\\([^\\]+)\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\?$/i;
    const m = re.exec(norm);
    if (!m) return { ok: false, winUser: '', afterRelativePath: '' };
    const winUser = m[1];
    return {
        ok: true,
        winUser,
        afterRelativePath: `${winUser}/AppData/Roaming/Cursor/User/workspaceStorage`
    };
}

/** ISO timestamp from ide_capture_settings.json for human-readable “last saved” in the UI. */
function formatIdeCaptureSavedAt(iso) {
    if (!iso || typeof iso !== 'string') return null;
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return null;
    }
}

function confirmDraftFromRecord(record) {
    if (!record) {
        return { ttgId: '', ttgName: '', reason: 'operator confirmed TTG binding' };
    }
    const b = record.binding || {};
    const cur = record.ttg?.current;
    const suggestion = record.routingSuggestion || {};
    const firstCandidate = Array.isArray(b.candidates) ? b.candidates[0] : null;
    const id = b.ttgId || cur?.id || suggestion.ttgId || candidateTtgId(firstCandidate) || '';
    const name = cur?.name || suggestion.ttgName || candidateTtgName(firstCandidate) || '';
    return {
        ttgId: id ? String(id) : '',
        ttgName: name ? String(name) : '',
        reason: suggestion.ttgId ? 'operator accepted routing suggestion' : 'operator confirmed TTG binding'
    };
}

/** Third workspace tab: IDE project summaries (Studio A070_ide_cursor_summaries) + optional OpenClaw memory (read-only). Tool-agnostic. */
export default function IdeProjectSummaryPanel({ channelId, channelName }) {
    const queryClient = useQueryClient();
    const [selectedRel, setSelectedRel] = useState(null);
    const [selectedArtifactSourcePath, setSelectedArtifactSourcePath] = useState(null);
    const [panel, setPanel] = useState('a070'); // 'a070' | 'artifacts' | 'memory'
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
    const [confirmTtgId, setConfirmTtgId] = useState('');
    const [confirmTtgName, setConfirmTtgName] = useState('');
    const [confirmReason, setConfirmReason] = useState('operator confirmed TTG binding');
    const [obExportPreview, setObExportPreview] = useState(null);
    const [obExportPreviewLoading, setObExportPreviewLoading] = useState(false);
    /** When true, artifact list keeps rows with classifier/header signal for this TTG (relevance ≥ 3). */
    const [artifactsScopeThisTtg, setArtifactsScopeThisTtg] = useState(false);
    /** Saved workspaceStorage path (written to ide_capture_settings.json when env is unset). */
    const [capturePathDraft, setCapturePathDraft] = useState('');
    /** Last stdout/stderr from POST capture/mount (optional operator hook). */
    const [mountOutput, setMountOutput] = useState(null);
    /** Editable suggested POSIX path when the saved value is still a Windows path (Linux host). */
    const [posixPathHintDraft, setPosixPathHintDraft] = useState('');
    const [ideCaptureConnectOpen, setIdeCaptureConnectOpen] = useState(() => {
        try {
            const v = localStorage.getItem(LS_IDE_CAPTURE_CONNECT_PANEL);
            if (v === null) return false;
            return v === '1';
        } catch {
            return false;
        }
    });
    const [ideCaptureDiagnosticsOpen, setIdeCaptureDiagnosticsOpen] = useState(false);
    const ideCaptureDiagPrevExistsRef = useRef(undefined);

    const { data: captureStatus, refetch: refetchCaptureStatus } = useQuery({
        queryKey: ['ide-capture-status'],
        queryFn: async () => {
            const r = await fetch('/api/ide-project-summaries/capture/status');
            return r.json();
        },
        staleTime: 30_000
    });

    useEffect(() => {
        if (captureStatus && typeof captureStatus.savedWorkspaceStorageRoot === 'string') {
            setCapturePathDraft(captureStatus.savedWorkspaceStorageRoot);
        } else if (captureStatus && captureStatus.savedWorkspaceStorageRoot == null) {
            setCapturePathDraft((prev) => (String(prev).trim() === '' ? DEFAULT_WINDOWS_WORKSPACE_STORAGE : prev));
        }
    }, [captureStatus?.savedWorkspaceStorageRoot, captureStatus?.settingsUpdatedAt]);

    useEffect(() => {
        const ok = captureStatus?.workspaceRootExists;
        const prev = ideCaptureDiagPrevExistsRef.current;
        if (prev !== ok && ok === false) {
            setIdeCaptureDiagnosticsOpen(true);
        }
        ideCaptureDiagPrevExistsRef.current = ok;
    }, [captureStatus?.workspaceRootExists]);

    const captureSettingsMutation = useMutation({
        mutationFn: async (workspaceStorageRoot) => {
            const r = await fetch('/api/ide-project-summaries/capture/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceStorageRoot: workspaceStorageRoot === '' ? null : workspaceStorageRoot
                })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                const det = j.details != null ? ` — ${JSON.stringify(j.details)}` : '';
                throw new Error((j.error || `HTTP ${r.status}`) + det);
            }
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ide-capture-status'] });
            refetchCaptureStatus();
        }
    });

    const captureEnsurePathMutation = useMutation({
        mutationFn: async () => {
            const p = capturePathDraft.trim();
            const r = await fetch('/api/ide-project-summaries/capture/ensure-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p ? { path: p } : {})
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                throw new Error(formatApiFailureMessage(r.status, j));
            }
            if (j.ok === false) {
                throw new Error(formatApiFailureMessage(r.status || 500, j));
            }
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ide-capture-status'] });
            refetchCaptureStatus();
        }
    });

    const captureRunMutation = useMutation({
        mutationFn: async (force) => {
            const r = await fetch('/api/ide-project-summaries/capture/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: Boolean(force) })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `${r.status} ${r.statusText}`);
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ide-capture-status'] });
            refetchCaptureStatus();
        }
    });

    const captureMountMutation = useMutation({
        mutationFn: async (action) => {
            const r = await fetch('/api/ide-project-summaries/capture/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `${r.status}`);
            return j;
        },
        onSuccess: (data) => {
            const parts = [];
            if (data.stdout) parts.push(`stdout:\n${data.stdout}`);
            if (data.stderr) parts.push(`stderr:\n${data.stderr}`);
            parts.push(`exit: ${data.exitCode}`);
            setMountOutput(parts.join('\n\n'));
            queryClient.invalidateQueries({ queryKey: ['ide-capture-status'] });
            refetchCaptureStatus();
        },
        onError: (e) => setMountOutput(String(e.message || e))
    });

    /** Typical SMB mount point from Step 0; used to suggest a POSIX path when settings still store a Windows path. */
    const defaultSmbMountPoint = '/media/cursor-workspace';

    const suggestedLinuxPathFromDraft = useMemo(() => {
        const p = parseWindowsWorkspaceStoragePath(capturePathDraft);
        if (!p.ok) return '';
        return posixFromSmbForm(defaultSmbMountPoint, p.afterRelativePath);
    }, [capturePathDraft]);

    const showPosixPathSaveHint = useMemo(() => {
        if (!captureStatus?.pathMappingApplied || !suggestedLinuxPathFromDraft) return false;
        if (captureStatus?.captureBackend?.platform !== 'linux') return false;
        if (captureStatus?.envOverrideActive) return false;
        const wr = String(captureStatus?.workspaceRoot || '');
        if (captureStatus?.workspaceRootExists && !wr.startsWith('/mnt/')) return false;
        if (wr === suggestedLinuxPathFromDraft) return false;
        return true;
    }, [captureStatus, suggestedLinuxPathFromDraft]);

    /** Draft vs persisted settings file (not vs env override — see env note in UI). */
    const capturePathSaveStatus = useMemo(() => {
        if (!captureStatus) return null;
        const draft = String(capturePathDraft ?? '').trim();
        const raw = captureStatus.savedWorkspaceStorageRoot;
        const saved = raw == null || String(raw).trim() === '' ? '' : String(raw).trim();
        return {
            draft,
            saved,
            dirty: draft !== saved,
            pending: captureSettingsMutation.isPending,
            envOn: Boolean(captureStatus.envOverrideActive),
            updatedAt: captureStatus.settingsUpdatedAt || null
        };
    }, [
        captureStatus,
        capturePathDraft,
        captureSettingsMutation.isPending
    ]);

    useEffect(() => {
        setPosixPathHintDraft(suggestedLinuxPathFromDraft);
    }, [suggestedLinuxPathFromDraft]);

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

    const {
        data: artifactIndexData,
        isLoading: artifactIndexLoading,
        error: artifactIndexError
    } = useQuery({
        queryKey: ['studio-artifact-index'],
        queryFn: async () => {
            const res = await fetch('/api/ide-project-summaries/artifact-index');
            if (!res.ok) throw new Error('Failed to load Studio artifact index');
            return res.json();
        },
        enabled: panel === 'artifacts'
    });

    const reviewRecords = useMemo(() => {
        const raw = artifactIndexData?.records || [];
        return raw
            .filter(recordInArtifactsBridgePanel)
            .sort((a, b) => {
                const relDiff = channelRelevance(b, channelId) - channelRelevance(a, channelId);
                if (relDiff !== 0) return relDiff;
                const pri = (x) => (x.binding?.method === 'agent_classification' ? 0 : 1);
                const p = pri(a) - pri(b);
                if (p !== 0) return p;
                return String(a.sourcePath || '').localeCompare(String(b.sourcePath || ''));
            });
    }, [artifactIndexData, channelId]);

    const visibleArtifactRecords = useMemo(() => {
        if (!artifactsScopeThisTtg || !channelId) return reviewRecords;
        return reviewRecords.filter((r) => channelRelevance(r, channelId) >= 3);
    }, [reviewRecords, artifactsScopeThisTtg, channelId]);

    const selectedArtifactRecord = useMemo(
        () => visibleArtifactRecords.find((r) => r.sourcePath === selectedArtifactSourcePath) || null,
        [visibleArtifactRecords, selectedArtifactSourcePath]
    );

    const { data: studioArtifactFileData, isLoading: studioArtifactFileLoading } = useQuery({
        queryKey: ['studio-artifact-file', selectedArtifactSourcePath],
        enabled: Boolean(panel === 'artifacts' && selectedArtifactSourcePath),
        queryFn: async () => {
            const qs = new URLSearchParams({ sourcePath: selectedArtifactSourcePath });
            const res = await fetch(`/api/ide-project-summaries/studio-artifact-file?${qs}`);
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || res.statusText);
            }
            return res.json();
        }
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

    const confirmBindingMutation = useMutation({
        mutationFn: async () => {
            const sourcePath = selectedArtifactSourcePath;
            if (!sourcePath || !confirmTtgId.trim()) {
                throw new Error('Select an artifact and enter a TTG id.');
            }
            const res = await fetch('/api/ide-project-summaries/artifact-binding/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourcePath,
                    ttgId: confirmTtgId.trim(),
                    ttgName: confirmTtgName.trim(),
                    reason: confirmReason.trim() || 'operator confirmed TTG binding'
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || res.statusText);
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['studio-artifact-index'] });
            setSelectedArtifactSourcePath(null);
            setObExportPreview(null);
        }
    });

    const confirmSummaryRoutingMutation = useMutation({
        mutationFn: async () => {
            const suggestion = selectedMeta?.routingSuggestion;
            if (!selectedRel || !suggestion?.ttgId) {
                throw new Error('Select a summary with a routing suggestion first.');
            }
            const res = await fetch('/api/ide-project-summaries/routing/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceRelativePath: selectedRel,
                    ttgId: String(suggestion.ttgId),
                    ttgName: suggestion.ttgName || '',
                    reason: 'operator accepted routing suggestion'
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || res.statusText);
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ide-project-summaries', channelId] });
            queryClient.invalidateQueries({ queryKey: ['ideSummaryFile', selectedRel, panel] });
        }
    });

    const stubOpenBrainSyncMutation = useMutation({
        mutationFn: async () => {
            const sourcePath = selectedArtifactRecord?.sourcePath;
            if (!sourcePath) throw new Error('Select an artifact first.');
            const res = await fetch('/api/ide-project-summaries/open-brain-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourcePath,
                    dryRun: false,
                    confirm: true,
                    surface: adapterSurface || 'manual'
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || res.statusText);
            return j;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['studio-artifact-index'] });
        }
    });

    useEffect(() => {
        if (!selectedArtifactSourcePath) return;
        if (!visibleArtifactRecords.some((r) => r.sourcePath === selectedArtifactSourcePath)) {
            setSelectedArtifactSourcePath(null);
            setObExportPreview(null);
            stubOpenBrainSyncMutation.reset();
        }
    }, [visibleArtifactRecords, selectedArtifactSourcePath, stubOpenBrainSyncMutation]);

    async function loadOpenBrainExportPreview() {
        if (!selectedArtifactRecord?.sourcePath) return;
        setObExportPreviewLoading(true);
        setObExportPreview(null);
        try {
            const qs = new URLSearchParams({
                sourcePath: selectedArtifactRecord.sourcePath,
                surface: adapterSurface || 'manual'
            });
            const res = await fetch(`/api/ide-project-summaries/open-brain-export?${qs}`);
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setObExportPreview({
                    error: j.error || `${res.status} ${res.statusText}`,
                    details: j.details
                });
            } else {
                setObExportPreview({ export: j.export });
            }
        } catch (e) {
            setObExportPreview({ error: e?.message || String(e) });
        } finally {
            setObExportPreviewLoading(false);
        }
    }

    const updateMappingRow = (index, patch) => {
        setMappingRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const files = data?.files || [];
    const memFiles = memData?.files || [];

    const list = useMemo(() => {
        if (panel === 'memory') return memFiles;
        if (panel === 'artifacts') return [];
        return files;
    }, [panel, memFiles, files]);
    const selectedFile = useMemo(() => list.find((f) => f.relativePath === selectedRel) || null, [list, selectedRel]);
    const selectedMeta = fileData?.meta || selectedFile?.meta || null;
    const selectedStatus = fileData?.bridgeStatus || selectedFile?.bridgeStatus || null;
    const statusColor = STATUS_COLORS[selectedStatus] || STATUS_COLORS.unknown;
    const canStubOpenBrainSync = selectedArtifactRecord?.exportEligibility?.status === 'ready';
    const obSync = artifactIndexData?.openBrainSync;
    const obSyncDisabledByConfig =
        obSync?.provider === 'http' && obSync?.httpConfigured === false;
    const openBrainSyncButtonLabel = (() => {
        if (obSyncDisabledByConfig) return 'Open Brain HTTP sync not configured (set OPEN_BRAIN_SYNC_URL)';
        if (obSync?.provider === 'http') return 'Sync to Open Brain (HTTP)';
        return 'Record stub sync (local audit)';
    })();

    const switchIdePanel = (next) => {
        setPanel(next);
        setSelectedRel(null);
        setSelectedArtifactSourcePath(null);
        setObExportPreview(null);
        stubOpenBrainSyncMutation.reset();
    };

    return (
        <div
            data-testid={`ide-summary-panel-${channelId || 'all'}`}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-primary)' }}
        >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                    <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>TARS in IDE · IDE project summary</strong>
                    <span style={{ flexShrink: 0 }}>—</span>
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {channelName || channelId || 'all'}
                    </span>
                    {panel === 'a070' && (
                        <span
                            style={{
                                marginLeft: 'auto',
                                flexShrink: 0,
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
                </div>
                <div
                    role="tablist"
                    aria-label="IDE project workflow"
                    style={{ marginTop: '6px', display: 'flex', gap: '4px', width: '100%' }}
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={panel === 'a070'}
                        title="Studio A070_ide_cursor_summaries — IDE summaries (artifact root)"
                        className={panel === 'a070' ? 'tab active' : 'tab'}
                        style={{ flex: 1, minWidth: 0, fontSize: '13px' }}
                        onClick={() => switchIdePanel('a070')}
                    >
                        Summaries
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={panel === 'artifacts'}
                        title="Studio artifacts · TTG review"
                        data-testid="ide-summary-tab-artifacts"
                        className={panel === 'artifacts' ? 'tab active' : 'tab'}
                        style={{ flex: 1, minWidth: 0, fontSize: '13px' }}
                        onClick={() => switchIdePanel('artifacts')}
                    >
                        Artifacts
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={panel === 'memory'}
                        title="OpenClaw memory (read-only)"
                        className={panel === 'memory' ? 'tab active' : 'tab'}
                        style={{ flex: 1, minWidth: 0, fontSize: '13px' }}
                        onClick={() => switchIdePanel('memory')}
                    >
                        Memory
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
                <div
                    style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '13px',
                        color: 'var(--text-secondary)'
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                        IDE chat capture (Cursor → A070/capture/)
                    </div>
                    {!captureStatus?.enabled && (
                        <span style={{ color: '#e3c450' }}>Disabled (IDE_CAPTURE_ENABLED=false on server).</span>
                    )}
                    {captureStatus?.enabled && (
                        <details
                            open={ideCaptureConnectOpen}
                            onToggle={(e) => {
                                const next = e.currentTarget.open;
                                setIdeCaptureConnectOpen(next);
                                try {
                                    localStorage.setItem(LS_IDE_CAPTURE_CONNECT_PANEL, next ? '1' : '0');
                                } catch {
                                    /* ignore */
                                }
                            }}
                            style={{
                                marginBottom: '12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                background: 'rgba(19, 20, 28, 0.35)'
                            }}
                        >
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    padding: '10px 12px',
                                    listStyle: 'none',
                                    userSelect: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{
                                        display: 'inline-block',
                                        flexShrink: 0,
                                        width: '1em',
                                        textAlign: 'center',
                                        color: 'var(--text-secondary)',
                                        transform: ideCaptureConnectOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.15s ease'
                                    }}
                                >
                                    ▶
                                </span>
                                <span>Connect IDE Chat Capture</span>
                                <span
                                    style={{
                                        fontWeight: 500,
                                        fontSize: '12px',
                                        color: 'var(--text-tertiary)'
                                    }}
                                >
                                    (click to expand)
                                </span>
                            </summary>
                            <div style={{ padding: '0 12px 12px 12px' }}>
                                <ol
                                style={{
                                    margin: '0 0 14px 0',
                                    paddingLeft: '22px',
                                    color: 'var(--text-secondary)',
                                    lineHeight: 1.55,
                                    fontSize: '12px',
                                    listStyleType: 'decimal'
                                }}
                            >
                                {IDE_CAPTURE_WORKFLOW_STEPS.map((s) => (
                                    <li key={s.n} style={{ marginBottom: '8px' }}>
                                        <strong style={{ color: 'var(--text-primary)' }}>
                                            {s.n}. {s.title}
                                        </strong>{' '}
                                        — {s.text}
                                    </li>
                                ))}
                            </ol>

                            {captureStatus?.captureBackend?.platform === 'linux' && (
                                <div
                                    style={{
                                        marginBottom: '14px',
                                        padding: '10px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(80, 227, 194, 0.45)',
                                        background: 'rgba(80, 227, 194, 0.1)',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        color: 'var(--text-secondary)'
                                    }}
                                >
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                                        Step 0 — terminal on this Linux server
                                    </div>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                        <strong>Default:</strong> <strong>A</strong> — Cursor on Windows, backend here, network works → mount <code style={{ fontSize: '11px' }}>Users</code>.{' '}
                                        <strong>B</strong> only if data is already on this Linux host (rsync/WSL path) and you will not SMB-mount that folder.
                                    </p>
                                    <div
                                        style={{
                                            margin: '0 0 8px 0',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(255, 143, 143, 0.5)',
                                            background: 'rgba(255, 143, 143, 0.08)',
                                            fontSize: '11px',
                                            lineHeight: 1.5,
                                            color: 'var(--text-secondary)'
                                        }}
                                    >
                                        <strong style={{ color: '#ff8f8f' }}>CAUTION!!!</strong> File browsers often cannot delete this tree (root mount,
                                        permissions). Use SSH. <code style={{ fontSize: '10px' }}>rm -rf</code> cannot be undone — only target{' '}
                                        <code style={{ fontSize: '10px' }}>/media/cursor-workspace</code>, <strong>never</strong>{' '}
                                        <code style={{ fontSize: '10px' }}>/media</code> alone.
                                    </div>
                                    <div style={ideCaptureCleanSlateStepBox}>
                                        <div style={ideCaptureCleanSlateStepTitle}>1 — Unmount (only if something is mounted here)</div>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                            If nothing is mounted, <code style={{ fontSize: '10px' }}>findmnt</code> fails and <code style={{ fontSize: '10px' }}>umount</code> is skipped — that is OK.
                                        </p>
                                        <pre style={ideCaptureCleanSlatePre}>
                                            {`findmnt /media/cursor-workspace && sudo umount /media/cursor-workspace`}
                                        </pre>
                                    </div>
                                    <div style={ideCaptureCleanSlateStepBox}>
                                        <div style={ideCaptureCleanSlateStepTitle}>2 — Delete the folder (irreversible)</div>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                            <strong style={{ color: '#ff8f8f' }}>CAUTION!!!</strong> Only <code style={{ fontSize: '10px' }}>/media/cursor-workspace</code> — never{' '}
                                            <code style={{ fontSize: '10px' }}>/media</code>.
                                        </p>
                                        <pre style={ideCaptureCleanSlatePre}>{`sudo rm -rf /media/cursor-workspace`}</pre>
                                    </div>
                                    <div style={ideCaptureCleanSlateStepBox}>
                                        <div style={ideCaptureCleanSlateStepTitle}>3 — Recreate an empty mount point</div>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                            Ready for path A (mount) or B (local mkdir) again.
                                        </p>
                                        <pre style={ideCaptureCleanSlatePre}>{`sudo mkdir -p /media/cursor-workspace`}</pre>
                                    </div>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                        Then A <em>or</em> B — not both on the same path.
                                    </p>
                                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        A) SMB — empty dir, then sudo mount
                                    </p>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: '#e3c450', lineHeight: 1.45 }}>
                                        Do not run mount without <code style={{ fontSize: '10px' }}>-o …</code> — bare mounts often report “read-only” errors. Use credentials + <code style={{ fontSize: '10px' }}>vers=3.0</code> + <code style={{ fontSize: '10px' }}>uid</code>/<code style={{ fontSize: '10px' }}>gid</code> as below.
                                    </p>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
                                        Edit the four assignments at the top (Windows host/IP, SMB login, SMB password, Linux user that runs Node). The{' '}
                                        <code style={{ fontSize: '10px' }}>sudo mount</code> line fills in automatically. Quote the{' '}
                                        <code style={{ fontSize: '10px' }}>-o</code> string so commas in the password do not break the shell.
                                    </p>
                                    <pre
                                        style={{
                                            margin: '0 0 8px 0',
                                            padding: '8px',
                                            background: '#13141c',
                                            borderRadius: '4px',
                                            fontSize: '10px',
                                            overflowX: 'auto',
                                            color: '#e8e8e8',
                                            border: '1px solid var(--border-color)',
                                            lineHeight: 1.4
                                        }}
                                    >
                                        {`WINDOWS_HOST="WINDOWS_HOST_OR_IP"  # computer name or IP address
SMB_USER="YOUR_SMB_USER"           # email for Microsoft account
SMB_PASS="YOUR_SMB_PASS"           # Microsoft account password (may differ from PIN / everyday login)
APIUSER="LINUX_USER_RUNNING_NODE"  # Linux login name (user that runs Node)

sudo mount -t cifs "//\${WINDOWS_HOST}/Users" /media/cursor-workspace \\
  -o "username=\${SMB_USER},password=\${SMB_PASS},uid=$(id -u "$APIUSER"),gid=$(id -g "$APIUSER"),iocharset=utf8,file_mode=0640,dir_mode=0750,vers=3.0,noserverino"`}
                                    </pre>
                                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        B) No SMB — local tree only
                                    </p>
                                    <pre
                                        style={{
                                            margin: '0 0 8px 0',
                                            padding: '8px',
                                            background: '#13141c',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            overflowX: 'auto',
                                            color: '#e8e8e8',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        {`APIUSER="LINUX_USER_RUNNING_NODE"  # Linux login name (user that runs Node)
sudo mkdir -p /media/cursor-workspace/YOUR_USERNAME/AppData/Roaming/Cursor/User/workspaceStorage
sudo chown -R "$APIUSER:$APIUSER" /media/cursor-workspace`}
                                    </pre>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                        <strong style={{ color: 'var(--text-primary)' }}>You must still do Step 1:</strong> Step 0 only prepares the filesystem
                                        (mount or folders). The capture backend does <strong>not</strong> read your terminal — it needs the path saved
                                        in Step 1 (<strong>Save path</strong>), unless ops set{' '}
                                        <code style={{ fontSize: '10px' }}>CURSOR_WORKSPACE_STORAGE_ROOT</code> on the server instead.
                                    </p>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                        In Step 1, save exactly:
                                    </p>
                                    <pre
                                        style={{
                                            margin: '0 0 8px 0',
                                            padding: '8px',
                                            background: '#13141c',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            overflowX: 'auto',
                                            color: '#e8e8e8',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        /media/cursor-workspace/YOUR_USERNAME/AppData/Roaming/Cursor/User/workspaceStorage
                                    </pre>
                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                        Empty dirs are not chats — copy/rsync real <code style={{ fontSize: '11px' }}>workspaceStorage</code> data, or rely
                                        on the SMB mount. Mount only via the commands here (or your own script) — not from this UI. Full detail:{' '}
                                        <Link to="/docs#ide-capture-linux-mount" style={{ color: 'var(--accent)' }}>
                                            docs → Linux path (Step 0)
                                        </Link>
                                        .
                                    </p>
                                </div>
                            )}

                            {/* Step 1 — path (after Step 0 terminal mount on Linux) */}
                            <div style={captureStepSectionStyle}>
                                <div style={captureStepHeadingStyle}>Step 1 — Path the server uses (required)</div>
                                <div
                                    style={{
                                        margin: '0 0 12px 0',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(80, 227, 194, 0.45)',
                                        background: 'rgba(80, 227, 194, 0.08)',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        color: 'var(--text-secondary)'
                                    }}
                                >
                                    <strong style={{ color: 'var(--text-primary)' }}>Save path is mandatory</strong> for normal setups: enter the
                                    correct <code style={{ fontSize: '11px' }}>workspaceStorage</code> path and click <strong>Save path</strong>. Step 0
                                    does not write server settings — without this save (or a pre-set{' '}
                                    <code style={{ fontSize: '11px' }}>CURSOR_WORKSPACE_STORAGE_ROOT</code>, see <strong>More info</strong>), the
                                    backend does not know where to read Cursor data.
                                </div>
                                {captureStatus?.captureBackend?.platform !== 'linux' && (
                                    <p
                                        style={{
                                            margin: '0 0 10px 0',
                                            fontSize: '12px',
                                            color: 'var(--text-tertiary)',
                                            lineHeight: 1.45
                                        }}
                                    >
                                        This capture backend is not Linux — set a Windows or POSIX path below that the server can read.
                                    </p>
                                )}
                                <p
                                    style={{
                                        margin: '0 0 10px 0',
                                        fontSize: '13px',
                                        lineHeight: 1.5,
                                        color: 'var(--text-secondary)'
                                    }}
                                >
                                    On Linux, use the <strong>POSIX path</strong> under your mount (typical:{' '}
                                    <code style={{ fontSize: '12px' }}>/media/cursor-workspace/&lt;profile&gt;/AppData/Roaming/Cursor/User/workspaceStorage</code>{' '}
                                    after Step 0). WSL-style <code style={{ fontSize: '12px' }}>/mnt/c/…</code> works if that tree exists on the API host.
                                </p>
                                {!captureStatus.workspaceRootExists && (
                                    <div
                                        style={{
                                            marginBottom: '10px',
                                            fontSize: '12px',
                                            color: '#e3c450',
                                            lineHeight: 1.45
                                        }}
                                    >
                                        The backend still cannot access that folder. Fix the path, run <strong>Step 0</strong> (mkdir /{' '}
                                        <code style={{ fontSize: '12px' }}>sudo mount</code>), then save again — open <strong>More info</strong> for details.
                                    </div>
                                )}
                                <details style={{ marginBottom: '10px' }}>
                                    <summary style={captureDetailsSummaryStyle}>
                                        More info — what the server resolves, saved settings, overrides
                                    </summary>
                                    <div
                                        style={{
                                            marginTop: '8px',
                                            fontSize: '12px',
                                            color: 'var(--text-tertiary)',
                                            lineHeight: 1.45
                                        }}
                                    >
                                        <div style={{ marginBottom: '10px' }}>
                                            <strong style={{ color: 'var(--text-secondary)' }}>Effective path</strong> (
                                            {captureStatus.workspaceRootSource || '—'}):{' '}
                                            <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                                                {captureStatus.workspaceRoot || '—'}
                                            </code>
                                            {captureStatus.workspaceRootExists ? (
                                                <span style={{ color: '#7dcea0', marginLeft: '8px' }}>reachable</span>
                                            ) : (
                                                <span style={{ color: '#e3c450', marginLeft: '8px' }}>not found</span>
                                            )}
                                        </div>
                                        {captureStatus.pathMappingApplied && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <strong style={{ color: 'var(--text-secondary)' }}>Windows path mapping:</strong> the saved value
                                                is a Windows path; on this Linux host it is mapped to WSL-style{' '}
                                                <code style={{ fontSize: '12px' }}>/mnt/&lt;drive&gt;/…</code>. Override with{' '}
                                                <code style={{ fontSize: '12px' }}>IDE_CAPTURE_WIN_DRIVE_C_MNT</code> or paste a POSIX path (e.g.
                                                SMB mount under <code style={{ fontSize: '12px' }}>/media/…</code>).
                                            </div>
                                        )}
                                        {captureStatus.envOverrideActive && (
                                            <div style={{ color: '#e3c450', marginBottom: '10px' }}>
                                                <code style={{ fontSize: '12px' }}>CURSOR_WORKSPACE_STORAGE_ROOT</code> overrides the saved path in
                                                the field below.
                                            </div>
                                        )}
                                        <div>
                                            <strong style={{ color: 'var(--text-secondary)' }}>Persistence:</strong> the value you save is written
                                            to <code style={{ fontSize: '12px' }}>ide_capture_settings.json</code> on the server (unless an env var
                                            overrides it). The capture job reads that location on the API host — not in your browser.
                                        </div>
                                    </div>
                                </details>
                                {showPosixPathSaveHint && (
                                    <div
                                        style={{
                                            marginBottom: '10px',
                                            padding: '8px',
                                            border: '1px solid rgba(80, 227, 194, 0.45)',
                                            borderRadius: '4px',
                                            background: 'rgba(80, 227, 194, 0.08)',
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.45
                                        }}
                                    >
                                        <strong style={{ color: 'var(--text-primary)' }}>Still using a Windows path on the server:</strong> it
                                        resolves to <code style={{ fontSize: '12px' }}>{captureStatus.workspaceRoot}</code>. Save the Linux path to
                                        the same folder (default mount <code style={{ fontSize: '12px' }}>{defaultSmbMountPoint}</code> — adjust if
                                        yours differs):
                                        <input
                                            type="text"
                                            data-testid="ide-capture-posix-hint-draft"
                                            value={posixPathHintDraft}
                                            onChange={(e) => setPosixPathHintDraft(e.target.value)}
                                            style={{
                                                width: '100%',
                                                margin: '6px 0',
                                                padding: '6px',
                                                background: '#13141c',
                                                border: '1px solid var(--border-color)',
                                                color: '#fff',
                                                fontSize: '13px'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="tab"
                                            data-testid="ide-capture-apply-posix-hint"
                                            disabled={captureSettingsMutation.isPending || !posixPathHintDraft.trim()}
                                            style={{ fontSize: '13px' }}
                                            onClick={() => {
                                                const v = posixPathHintDraft.trim();
                                                setCapturePathDraft(v);
                                                captureSettingsMutation.mutate(v);
                                            }}
                                        >
                                            {captureSettingsMutation.isPending ? 'Saving…' : 'Save this Linux path'}
                                        </button>
                                    </div>
                                )}
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px', lineHeight: 1.45 }}>
                                    <strong>workspaceStorage path</strong> (edit and save to the server)
                                </div>
                                <input
                                    type="text"
                                    data-testid="ide-capture-path-input"
                                    value={capturePathDraft}
                                    onChange={(e) => setCapturePathDraft(e.target.value)}
                                    style={{
                                        width: '100%',
                                        marginBottom: '6px',
                                        padding: '6px',
                                        background: '#13141c',
                                        border: '1px solid var(--border-color)',
                                        color: '#fff',
                                        fontSize: '13px'
                                    }}
                                />
                                {capturePathSaveStatus && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        data-testid="ide-capture-path-save-status"
                                        style={{
                                            marginBottom: '10px',
                                            padding: '8px 10px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            lineHeight: 1.5,
                                            border: `1px solid ${
                                                capturePathSaveStatus.pending
                                                    ? 'rgba(80, 227, 194, 0.55)'
                                                    : capturePathSaveStatus.dirty
                                                      ? 'rgba(227, 196, 80, 0.5)'
                                                      : capturePathSaveStatus.saved === ''
                                                        ? 'var(--border-color)'
                                                        : 'rgba(125, 206, 160, 0.45)'
                                            }`,
                                            background: capturePathSaveStatus.pending
                                                ? 'rgba(80, 227, 194, 0.1)'
                                                : capturePathSaveStatus.dirty
                                                  ? 'rgba(227, 196, 80, 0.1)'
                                                  : capturePathSaveStatus.saved === ''
                                                    ? 'rgba(19, 20, 28, 0.35)'
                                                    : 'rgba(125, 206, 160, 0.12)',
                                            color: 'var(--text-secondary)'
                                        }}
                                    >
                                        {capturePathSaveStatus.envOn && (
                                            <div
                                                style={{
                                                    marginBottom: '8px',
                                                    paddingBottom: '8px',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    color: '#e3c450',
                                                    fontSize: '11px',
                                                    lineHeight: 1.45
                                                }}
                                            >
                                                <strong>Env override:</strong> live capture uses{' '}
                                                <code style={{ fontSize: '10px' }}>CURSOR_WORKSPACE_STORAGE_ROOT</code>. Saving here still updates{' '}
                                                <code style={{ fontSize: '10px' }}>ide_capture_settings.json</code> for when that variable is unset.
                                            </div>
                                        )}
                                        {capturePathSaveStatus.pending ? (
                                            <span>
                                                <strong style={{ color: 'var(--text-primary)' }}>Saving…</strong> writing to the server.
                                            </span>
                                        ) : capturePathSaveStatus.dirty ? (
                                            <span>
                                                <strong style={{ color: '#e3c450' }}>Not saved</strong> — this field differs from{' '}
                                                <code style={{ fontSize: '11px' }}>ide_capture_settings.json</code>. Click <strong>Save path</strong>{' '}
                                                to persist.
                                            </span>
                                        ) : capturePathSaveStatus.saved === '' ? (
                                            <span>
                                                <strong style={{ color: 'var(--text-tertiary)' }}>No path in settings file</strong> — nothing
                                                persisted yet (backend may use its default until you save).
                                            </span>
                                        ) : (
                                            <span>
                                                <strong style={{ color: '#7dcea0' }}>Saved</strong> — matches the server settings file
                                                {formatIdeCaptureSavedAt(capturePathSaveStatus.updatedAt) ? (
                                                    <>
                                                        .{' '}
                                                        <span style={{ color: 'var(--text-tertiary)' }}>
                                                            Last written: {formatIdeCaptureSavedAt(capturePathSaveStatus.updatedAt)}
                                                        </span>
                                                    </>
                                                ) : (
                                                    '.'
                                                )}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className="tab"
                                        data-testid="ide-capture-save-path"
                                        disabled={captureSettingsMutation.isPending}
                                        style={{ fontSize: '13px' }}
                                        onClick={() => captureSettingsMutation.mutate(capturePathDraft.trim() || null)}
                                    >
                                        {captureSettingsMutation.isPending ? 'Saving…' : 'Save path'}
                                    </button>
                                    <button
                                        type="button"
                                        className="tab"
                                        data-testid="ide-capture-clear-path"
                                        disabled={captureSettingsMutation.isPending}
                                        style={{ fontSize: '13px' }}
                                        onClick={() => {
                                            setCapturePathDraft(DEFAULT_WINDOWS_WORKSPACE_STORAGE);
                                            captureSettingsMutation.mutate(null);
                                        }}
                                    >
                                        Reset form & clear saved path
                                    </button>
                                    {captureSettingsMutation.isError && (
                                        <span style={{ color: '#ff8f8f' }}>{captureSettingsMutation.error?.message}</span>
                                    )}
                                </div>
                            </div>

                            {/* Step 2 — optional mkdir on Linux */}
                            {captureStatus.captureBackend?.platform === 'linux' && (
                                <div style={{ ...captureStepSectionStyle, marginBottom: '12px' }}>
                                    <div style={captureStepHeadingStyle}>Step 2 — Optional: create folders on server (mkdir -p)</div>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', lineHeight: 1.45, color: 'var(--text-tertiary)' }}>
                                        Same as running <code style={{ fontSize: '12px' }}>mkdir -p</code> in SSH for the Step 1 path. Prefer the
                                        commands in the green box above; use this button if you like the UI. This never copies chat files — only
                                        directories.
                                    </p>
                                    {!captureStatus.ensurePathEnabled && (
                                        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#e3c450', lineHeight: 1.45 }}>
                                            This action is turned off on the server (
                                            <code style={{ fontSize: '12px' }}>IDE_CAPTURE_ENSURE_PATH=false</code>). Set the variable to enable
                                            (non-false) and restart the backend if you need UI-driven <code style={{ fontSize: '12px' }}>mkdir -p</code>.
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            className="tab"
                                            data-testid="ide-capture-ensure-path"
                                            disabled={
                                                !captureStatus.ensurePathEnabled || captureEnsurePathMutation.isPending
                                            }
                                            style={{ fontSize: '13px' }}
                                            title={
                                                !captureStatus.ensurePathEnabled
                                                    ? 'Enable IDE_CAPTURE_ENSURE_PATH on the server'
                                                    : undefined
                                            }
                                            onClick={() => captureEnsurePathMutation.mutate()}
                                        >
                                            {captureEnsurePathMutation.isPending ? '…' : 'Create folders (mkdir -p)'}
                                        </button>
                                        {captureEnsurePathMutation.isError && (
                                            <span style={{ color: '#ff8f8f' }}>{captureEnsurePathMutation.error?.message}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <details style={{ marginBottom: '12px' }}>
                                <summary style={captureDetailsSummaryStyle}>Advanced — script, sshfs, API hook</summary>
                                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                    <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                                        Remote workspaceStorage (terminal / hook)
                                    </div>
                                    <ol style={{ margin: '0 0 8px 0', paddingLeft: '18px' }}>
                                        <li style={{ marginBottom: '4px' }}>
                                            On the <strong>Linux host that runs the Node backend</strong>, you can mount via SMB/CIFS or sshfs
                                            outside this UI.
                                        </li>
                                        <li style={{ marginBottom: '4px' }}>
                                            Then set the POSIX path in Step 1 — or <code style={{ fontSize: '12px' }}>C:\…</code> only if{' '}
                                            <code style={{ fontSize: '12px' }}>/mnt/c/…</code> exists (WSL).
                                        </li>
                                    </ol>
                                    <div style={{ marginBottom: '8px' }}>
                                        <strong>Repo script:</strong>{' '}
                                        <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                                            Production_Nodejs_React/scripts/ide-capture-remote-mount.sh
                                        </code>
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        Set <code style={{ fontSize: '12px' }}>IDE_CAPTURE_REMOTE_MOUNT_SCRIPT</code> for API-driven mount/umount/status
                                        (same as terminal). <code style={{ fontSize: '12px' }}>IDE_CAPTURE_WORKSPACE_MOUNT_POINT</code> for status in
                                        this panel.
                                    </div>
                                    {!captureStatus?.remoteMount?.scriptConfigured && (
                                        <div
                                            style={{
                                                marginBottom: '8px',
                                                padding: '6px',
                                                background: 'rgba(227, 196, 80, 0.12)',
                                                border: '1px solid rgba(227, 196, 80, 0.35)',
                                                borderRadius: '4px',
                                                color: '#e3c450'
                                            }}
                                        >
                                            No <code style={{ fontSize: '12px' }}>IDE_CAPTURE_REMOTE_MOUNT_SCRIPT</code> — no script buttons here.
                                        </div>
                                    )}
                                    {captureStatus?.remoteMount?.mountPointEnv && (
                                        <div style={{ marginBottom: '6px' }}>
                                            <code style={{ fontSize: '12px' }}>IDE_CAPTURE_WORKSPACE_MOUNT_POINT</code>:{' '}
                                            <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                                                {captureStatus.remoteMount.mountPointEnv}
                                            </code>
                                            {captureStatus.remoteMount.mountPointIsActive === true && (
                                                <span style={{ color: '#7dcea0', marginLeft: '6px' }}>mounted</span>
                                            )}
                                            {captureStatus.remoteMount.mountPointIsActive === false && (
                                                <span style={{ color: '#e3c450', marginLeft: '6px' }}>not mounted</span>
                                            )}
                                        </div>
                                    )}
                                    {captureStatus?.remoteMount?.scriptConfigured && (
                                        <div style={{ marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="tab"
                                                    data-testid="ide-capture-mount"
                                                    disabled={captureMountMutation.isPending}
                                                    style={{ fontSize: '13px' }}
                                                    onClick={() => captureMountMutation.mutate('mount')}
                                                >
                                                    {captureMountMutation.isPending ? '…' : 'Mount'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="tab"
                                                    data-testid="ide-capture-umount"
                                                    disabled={captureMountMutation.isPending}
                                                    style={{ fontSize: '13px' }}
                                                    onClick={() => captureMountMutation.mutate('umount')}
                                                >
                                                    Umount
                                                </button>
                                                <button
                                                    type="button"
                                                    className="tab"
                                                    data-testid="ide-capture-mount-status"
                                                    disabled={captureMountMutation.isPending}
                                                    style={{ fontSize: '13px' }}
                                                    onClick={() => captureMountMutation.mutate('status')}
                                                >
                                                    Mount status
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {mountOutput && (
                                        <pre
                                            style={{
                                                marginTop: '6px',
                                                padding: '6px',
                                                background: '#13141c',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-secondary)',
                                                fontSize: '12px',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                maxHeight: '120px',
                                                overflow: 'auto'
                                            }}
                                        >
                                            {mountOutput}
                                        </pre>
                                    )}
                                </div>
                            </details>

                            <details
                                style={{ marginBottom: '8px' }}
                                open={ideCaptureDiagnosticsOpen}
                                onToggle={(e) => {
                                    e.stopPropagation();
                                    setIdeCaptureDiagnosticsOpen(e.currentTarget.open);
                                }}
                            >
                                <summary style={captureDetailsSummaryStyle}>Problems & diagnostics</summary>
                                <div
                                    style={{
                                        marginTop: '10px',
                                        fontSize: '12px',
                                        color: captureStatus?.workspaceRootExists
                                            ? 'var(--text-secondary)'
                                            : '#e3c450'
                                    }}
                                >
                                    <div style={{ marginBottom: '8px' }}>
                                        workspaceStorage:{' '}
                                        <code style={{ fontSize: '12px' }}>{captureStatus?.workspaceRoot || '—'}</code>
                                        {captureStatus?.workspaceRootExists ? (
                                            <span style={{ marginLeft: '6px', color: '#7dcea0' }}>(reachable on API host)</span>
                                        ) : (
                                            <span style={{ marginLeft: '6px' }}>(not found on API host)</span>
                                        )}
                                        {captureStatus?.workspaceRootSource && (
                                            <span style={{ marginLeft: '6px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                                                — source: <code style={{ fontSize: '10px' }}>{captureStatus.workspaceRootSource}</code>
                                            </span>
                                        )}
                                    </div>
                                    {captureStatus?.workspaceRootExists && (
                                        <div
                                            style={{
                                                marginBottom: '10px',
                                                padding: '6px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(125, 206, 160, 0.4)',
                                                background: 'rgba(125, 206, 160, 0.08)',
                                                color: 'var(--text-secondary)',
                                                lineHeight: 1.45
                                            }}
                                        >
                                            <strong style={{ color: '#7dcea0' }}>Path OK.</strong> The API host can access this folder. If capture
                                            still fails, check permissions, disk, or the last run summary above — not a missing-path issue.
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            marginBottom: '8px',
                                            lineHeight: 1.45,
                                            color: '#b8e8df',
                                            borderLeft: '3px solid rgba(80, 227, 194, 0.55)',
                                            paddingLeft: '8px'
                                        }}
                                    >
                                        <strong>Linux login vs. SMB:</strong> API host user and Windows/SMB user are unrelated — SMB credentials
                                        must match the share only.
                                    </div>
                                    {captureStatus.workspacePathDiagnostics && (
                                        <div
                                            style={{
                                                marginBottom: '10px',
                                                lineHeight: 1.45,
                                                color: '#d4f0ea',
                                                borderLeft: '3px solid rgba(80, 227, 194, 0.75)',
                                                paddingLeft: '8px'
                                            }}
                                        >
                                            <strong>Path diagnosis:</strong>{' '}
                                            {captureStatus.workspacePathDiagnostics.mediaMountPoint != null && (
                                                <>
                                                    <code style={{ fontSize: '12px' }}>
                                                        {captureStatus.workspacePathDiagnostics.mediaMountPoint}
                                                    </code>
                                                    {captureStatus.workspacePathDiagnostics.mediaMountActive === false && (
                                                        <span>
                                                            {' '}
                                                            → not mounted. Run <strong>Step 0</strong> (<code style={{ fontSize: '12px' }}>sudo mount</code>) or{' '}
                                                            <code style={{ fontSize: '12px' }}>
                                                                findmnt {captureStatus.workspacePathDiagnostics.mediaMountPoint}
                                                            </code>
                                                            .
                                                        </span>
                                                    )}
                                                    {captureStatus.workspacePathDiagnostics.mediaMountActive === true &&
                                                        captureStatus.workspacePathDiagnostics.firstMissingSuffix && (
                                                            <span>
                                                                {' '}
                                                                → mounted; missing under mount (from{' '}
                                                                <code style={{ fontSize: '12px' }}>
                                                                    {captureStatus.workspacePathDiagnostics.deepestExistingDir || '—'}
                                                                </code>
                                                                ):{' '}
                                                                <code style={{ fontSize: '12px' }}>
                                                                    {captureStatus.workspacePathDiagnostics.firstMissingSuffix}
                                                                </code>
                                                            </span>
                                                        )}
                                                    {captureStatus.workspacePathDiagnostics.mediaMountActive === true &&
                                                        !captureStatus.workspacePathDiagnostics.firstMissingSuffix && (
                                                            <span> → mounted; check permissions.</span>
                                                        )}
                                                </>
                                            )}
                                            {captureStatus.workspacePathDiagnostics.mediaMountPoint == null &&
                                                captureStatus.workspacePathDiagnostics.firstMissingSuffix && (
                                                    <span>
                                                        Exists up to{' '}
                                                        <code style={{ fontSize: '12px' }}>
                                                            {captureStatus.workspacePathDiagnostics.deepestExistingDir || '—'}
                                                        </code>
                                                        , then missing{' '}
                                                        <code style={{ fontSize: '12px' }}>
                                                            {captureStatus.workspacePathDiagnostics.firstMissingSuffix}
                                                        </code>
                                                        .
                                                    </span>
                                                )}
                                        </div>
                                    )}
                                    {captureStatus.pathMappingApplied && !captureStatus?.workspaceRootExists && (
                                        <div style={{ marginBottom: '8px', lineHeight: 1.45 }}>
                                            Windows path resolves to <code style={{ fontSize: '12px' }}>/mnt/c/…</code> — works only if that mount
                                            exists (WSL). On plain Linux use SMB and a POSIX path in Step 1, or{' '}
                                            <code style={{ fontSize: '12px' }}>IDE_CAPTURE_WIN_DRIVE_C_MNT</code>.
                                        </div>
                                    )}
                                    <div style={{ marginBottom: '6px' }}>
                                        <strong>Capture backend:</strong>{' '}
                                        <code style={{ fontSize: '12px' }}>
                                            {captureStatus?.captureBackend?.platform}:{captureStatus?.captureBackend?.hostname}
                                        </code>{' '}
                                        — browser URL may tunnel; <code style={{ fontSize: '12px' }}>/api</code> hits the backend host.
                                    </div>
                                    {!captureStatus?.workspaceRootExists ? (
                                        <div style={{ color: '#e3c450', lineHeight: 1.45 }}>
                                            <strong>Fix (path missing):</strong> run the backend where Cursor data is reachable, complete{' '}
                                            <strong>Step 0</strong> (mount) and <strong>Step 1</strong> (Save path), set{' '}
                                            <code style={{ fontSize: '12px' }}>CURSOR_WORKSPACE_STORAGE_ROOT</code>, or sync{' '}
                                            <code style={{ fontSize: '12px' }}>capture/</code> — see{' '}
                                            <code style={{ fontSize: '12px' }}>020_IDE_chat_capture_A070.md</code>.
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-tertiary)', lineHeight: 1.45, fontSize: '11px' }}>
                                            Reference: <code style={{ fontSize: '11px' }}>020_IDE_chat_capture_A070.md</code> (capture overview and
                                            sync options).
                                        </div>
                                    )}
                                </div>
                            </details>
                            </div>
                        </details>
                    )}

                    {captureStatus?.enabled && captureStatus?.captureBackend && (
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                            Capture backend: {captureStatus.captureBackend.platform}:{captureStatus.captureBackend.hostname}
                        </div>
                    )}
                    {captureStatus?.enabled && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span>
                                Last:{' '}
                                {captureStatus?.summary?.updatedAt
                                    ? `${captureStatus.summary.lastOutcome} · ${captureStatus.summary.updatedAt}`
                                    : 'no run yet'}
                            </span>
                            {captureStatus?.summary?.lastPayloadPath && (
                                <span style={{ color: 'var(--text-tertiary)' }} title="Latest snapshot path">
                                    {captureStatus.summary.lastPayloadPath}
                                </span>
                            )}
                            <button
                                type="button"
                                className="tab"
                                data-testid="ide-capture-run"
                                disabled={captureRunMutation.isPending}
                                style={{ fontSize: '13px', marginLeft: 'auto' }}
                                title="Run capture now (same as scheduled job). Use force to re-write unchanged chats."
                                onClick={() => captureRunMutation.mutate(false)}
                            >
                                {captureRunMutation.isPending ? 'Capturing…' : 'Capture now'}
                            </button>
                            <button
                                type="button"
                                className="tab"
                                data-testid="ide-capture-force"
                                disabled={captureRunMutation.isPending}
                                style={{ fontSize: '13px' }}
                                title="Force new snapshot files even if content hash unchanged"
                                onClick={() => captureRunMutation.mutate(true)}
                            >
                                Force capture
                            </button>
                        </div>
                    )}
                    {captureRunMutation.isError && (
                        <div style={{ marginTop: '6px', color: '#ff8f8f' }}>{captureRunMutation.error?.message || 'Capture failed'}</div>
                    )}
                    {captureRunMutation.isSuccess && captureRunMutation.data?.ok && (
                        <div style={{ marginTop: '6px', color: 'var(--text-tertiary)' }}>
                            Done: {captureRunMutation.data.lastOutcome} (
                            {(captureRunMutation.data.results || []).filter((r) => r.outcome === 'ok').length} ok,{' '}
                            {(captureRunMutation.data.results || []).filter((r) => r.outcome === 'skipped_no_change').length}{' '}
                            skipped)
                        </div>
                    )}
                </div>
            )}

            {panel === 'a070' && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>New summary (writes under A070_ide_cursor_summaries)</div>
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
                            fontSize: '13px'
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
                            fontSize: '13px',
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
                                fontSize: '13px'
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
                                fontSize: '13px'
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
                                fontSize: '13px'
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
                                fontSize: '13px'
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
                            fontSize: '13px',
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
                        fontSize: '13px'
                    }}
                >
                    {(isLoading || (panel === 'memory' && memLoading) || (panel === 'artifacts' && artifactIndexLoading)) && (
                        <div style={{ padding: '12px' }}>Loading…</div>
                    )}
                    {error && panel !== 'artifacts' && (
                        <div style={{ padding: '12px', color: '#e35050' }}>
                            {String(error.message)}
                        </div>
                    )}
                    {panel === 'artifacts' && artifactIndexError && (
                        <div style={{ padding: '12px', color: '#e35050' }}>
                            {String(artifactIndexError.message)}
                        </div>
                    )}
                    {panel === 'artifacts' && channelId && !artifactIndexLoading && !artifactIndexError && (
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '8px 12px',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                cursor: 'pointer',
                                fontSize: 11,
                                color: 'var(--text-secondary)'
                            }}
                        >
                            <input
                                type="checkbox"
                                data-testid="ide-artifact-scope-this-ttg"
                                checked={artifactsScopeThisTtg}
                                onChange={(e) => setArtifactsScopeThisTtg(e.target.checked)}
                                style={{ marginTop: 2 }}
                            />
                            <span>
                                Only show artifacts with a <strong>TTG signal for this row</strong> (confirmed
                                binding, <code>current_ttg</code>, or classifier candidate for this channel).
                            </span>
                        </label>
                    )}
                    {!isLoading && !list.length && panel === 'a070' && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            No Markdown summaries under A070_ide_cursor_summaries yet, or none match this channel id in the path.
                        </div>
                    )}
                    {!memLoading && !list.length && panel === 'memory' && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            No memory files matched, or memory dir is empty.
                        </div>
                    )}
                    {!artifactIndexLoading &&
                        panel === 'artifacts' &&
                        !artifactIndexError &&
                        !reviewRecords.length && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            No Studio artifacts in the bridge queue (TTG review, or export-ready pending stub sync), or index is empty.
                        </div>
                    )}
                    {!artifactIndexLoading &&
                        panel === 'artifacts' &&
                        !artifactIndexError &&
                        reviewRecords.length > 0 &&
                        !visibleArtifactRecords.length && (
                        <div style={{ padding: '12px', color: '#e3c450' }}>
                            No rows match &quot;this TTG&quot; filter. Clear the checkbox to see the full bridge queue for this channel tab.
                        </div>
                    )}
                    {panel === 'artifacts'
                        && visibleArtifactRecords.map((r) => (
                            <button
                                data-testid={`ide-artifact-${String(r.sourcePath || '').replace(/\//g, '__')}`}
                                key={r.sourcePath}
                                type="button"
                                onClick={() => {
                                    setSelectedArtifactSourcePath(r.sourcePath);
                                    setObExportPreview(null);
                                    stubOpenBrainSyncMutation.reset();
                                    const d = confirmDraftFromRecord(r);
                                    setConfirmTtgId(d.ttgId);
                                    setConfirmTtgName(d.ttgName);
                                    setConfirmReason(d.reason);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    border: 'none',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background:
                                        selectedArtifactSourcePath === r.sourcePath
                                            ? 'rgba(80,227,194,0.12)'
                                            : 'transparent',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                <span style={{ color: '#e3c450' }}>{r.binding?.status || '?'}</span>
                                <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
                                    {r.binding?.method || 'none'}
                                </span>
                                <div style={{ marginTop: 4 }}>{r.sourcePath}</div>
                                <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                                    {r.artifact?.id || '—'} · {r.artifact?.title || '—'}
                                </div>
                            </button>
                        ))}
                    {panel !== 'artifacts' && list.map((f) => (
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
                                fontSize: '13px'
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
                    {panel === 'artifacts' && !selectedArtifactSourcePath && (
                        <div style={{ color: 'var(--text-secondary)' }}>
                            Select an artifact to review classifier output and confirm TTG (writes YAML header on disk).
                        </div>
                    )}
                    {panel === 'artifacts' && selectedArtifactRecord && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>{selectedArtifactRecord.sourcePath}</div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 6,
                                    padding: 10,
                                    marginBottom: 12,
                                    background: 'rgba(255,255,255,0.03)'
                                }}
                            >
                                <div>
                                    Export: <code>{selectedArtifactRecord.exportEligibility?.status || '?'}</code>
                                    {selectedArtifactRecord.exportEligibility?.reason
                                        ? ` — ${selectedArtifactRecord.exportEligibility.reason}`
                                        : ''}
                                </div>
                                <div>
                                    Header: <code>{selectedArtifactRecord.header?.status || '?'}</code>
                                    {selectedArtifactRecord.header?.reason
                                        ? ` — ${selectedArtifactRecord.header.reason}`
                                        : ''}
                                </div>
                                <div>
                                    Binding: <code>{selectedArtifactRecord.binding?.status || '?'}</code> /{' '}
                                    <code>{selectedArtifactRecord.binding?.method || 'none'}</code>
                                </div>
                                {selectedArtifactRecord.binding?.reason && (
                                    <div>Binding note: {selectedArtifactRecord.binding.reason}</div>
                                )}
                                {selectedArtifactRecord.routingSuggestion?.ttgId && (
                                    <div>
                                        Routing suggestion:{' '}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setConfirmTtgId(String(selectedArtifactRecord.routingSuggestion.ttgId));
                                                setConfirmTtgName(selectedArtifactRecord.routingSuggestion.ttgName || '');
                                                setConfirmReason('operator accepted routing suggestion');
                                            }}
                                            style={{
                                                padding: '2px 6px',
                                                fontSize: 10,
                                                background: '#1d2532',
                                                border: '1px solid var(--border-color)',
                                                color: '#50e3c2',
                                                borderRadius: 4,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {selectedArtifactRecord.routingSuggestion.ttgName
                                                || selectedArtifactRecord.routingSuggestion.ttgId}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {(selectedArtifactRecord.classificationEvidence?.distribution || []).length > 0 && (
                                <div style={{ marginBottom: 12, fontSize: 11 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>TTG match (content/tags)</div>
                                    {selectedArtifactRecord.classificationEvidence.distribution.map((row) => (
                                        <div key={`${row.code}-${row.ttgId}`} style={{ marginBottom: 6 }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: 10,
                                                    gap: 8
                                                }}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {row.ttgName || row.code || row.ttgId}
                                                </span>
                                                <span style={{ flexShrink: 0 }}>{row.percent}%</span>
                                            </div>
                                            <div
                                                style={{
                                                    height: 6,
                                                    background: '#222',
                                                    borderRadius: 3,
                                                    overflow: 'hidden',
                                                    marginTop: 2
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${Math.min(100, row.percent)}%`,
                                                        height: '100%',
                                                        background: 'rgba(80,227,194,0.45)'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(selectedArtifactRecord.binding?.candidates || []).length > 0 && (
                                <div style={{ marginBottom: 10, fontSize: 11 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Candidates</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {selectedArtifactRecord.binding.candidates.map((c) => (
                                            <button
                                                key={`${c.ttgId}-${c.code}`}
                                                type="button"
                                                onClick={() => {
                                                    setConfirmTtgId(c.ttgId ? String(c.ttgId) : '');
                                                    setConfirmTtgName(c.ttgName ? String(c.ttgName) : '');
                                                }}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: 10,
                                                    background: '#1d2532',
                                                    border: '1px solid var(--border-color)',
                                                    color: '#50e3c2',
                                                    borderRadius: 4,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {c.ttgName || c.code || c.ttgId}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr',
                                    gap: 8,
                                    maxWidth: 480,
                                    fontSize: 11
                                }}
                            >
                                <label>
                                    TTG id (Telegram topic group id)
                                    <input
                                        data-testid="ide-artifact-confirm-ttg-id"
                                        value={confirmTtgId}
                                        onChange={(e) => setConfirmTtgId(e.target.value)}
                                        placeholder="-100…"
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            marginTop: 4,
                                            padding: 6,
                                            background: '#13141c',
                                            border: '1px solid var(--border-color)',
                                            color: '#fff',
                                            fontSize: 11
                                        }}
                                    />
                                </label>
                                <label>
                                    TTG display name (optional)
                                    <input
                                        data-testid="ide-artifact-confirm-ttg-name"
                                        value={confirmTtgName}
                                        onChange={(e) => setConfirmTtgName(e.target.value)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            marginTop: 4,
                                            padding: 6,
                                            background: '#13141c',
                                            border: '1px solid var(--border-color)',
                                            color: '#fff',
                                            fontSize: 11
                                        }}
                                    />
                                </label>
                                <label>
                                    Reason (stored in header)
                                    <input
                                        value={confirmReason}
                                        onChange={(e) => setConfirmReason(e.target.value)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            marginTop: 4,
                                            padding: 6,
                                            background: '#13141c',
                                            border: '1px solid var(--border-color)',
                                            color: '#fff',
                                            fontSize: 11
                                        }}
                                    />
                                </label>
                                <button
                                    data-testid="ide-artifact-confirm-submit"
                                    type="button"
                                    disabled={confirmBindingMutation.isPending || !confirmTtgId.trim()}
                                    onClick={() => confirmBindingMutation.mutate()}
                                    style={{
                                        padding: '8px 14px',
                                        fontSize: 12,
                                        background: 'rgba(80,227,194,0.25)',
                                        border: '1px solid rgba(80,227,194,0.5)',
                                        color: '#50e3c2',
                                        borderRadius: 6,
                                        cursor: confirmTtgId.trim() ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    {confirmBindingMutation.isPending ? 'Writing header…' : 'Confirm TTG (write artifact header)'}
                                </button>
                            </div>
                            {confirmBindingMutation.isError && (
                                <div style={{ color: '#e35050', marginTop: 10 }}>
                                    {String(confirmBindingMutation.error.message)}
                                </div>
                            )}
                            <div
                                style={{
                                    marginTop: 14,
                                    paddingTop: 12,
                                    borderTop: '1px solid rgba(255,255,255,0.08)'
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>
                                    Artifact Markdown (read-only)
                                </div>
                                {studioArtifactFileLoading && (
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Loading…</div>
                                )}
                                {!studioArtifactFileLoading && studioArtifactFileData?.text && (
                                    <div
                                        className="markdown-preview"
                                        style={{
                                            maxHeight: 320,
                                            overflow: 'auto',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 6,
                                            padding: 10,
                                            marginBottom: 12,
                                            background: 'rgba(255,255,255,0.02)',
                                            fontSize: 12
                                        }}
                                    >
                                        <ReactMarkdown remarkPlugins={plugins}>
                                            {studioArtifactFileData.text}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                            <div
                                style={{
                                    marginTop: 14,
                                    paddingTop: 12,
                                    borderTop: '1px solid rgba(255,255,255,0.08)'
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>
                                    Open Brain export (read-only preview)
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                    Calls the existing contract builder; does not sync to Open Brain. After confirming TTG,
                                    try again if eligibility was &quot;needs_review&quot; for binding.
                                </div>
                                <button
                                    data-testid="ide-artifact-ob-export-preview"
                                    type="button"
                                    disabled={obExportPreviewLoading}
                                    onClick={() => loadOpenBrainExportPreview()}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: 11,
                                        background: '#1d2532',
                                        border: '1px solid var(--border-color)',
                                        color: '#fff',
                                        borderRadius: 6,
                                        cursor: obExportPreviewLoading ? 'wait' : 'pointer'
                                    }}
                                >
                                    {obExportPreviewLoading ? 'Loading…' : 'Load export payload'}
                                </button>
                                {obExportPreview?.error && (
                                    <div style={{ color: '#e35050', marginTop: 10, fontSize: 11 }}>
                                        {obExportPreview.error}
                                        {obExportPreview.details ? (
                                            <pre
                                                style={{
                                                    marginTop: 6,
                                                    fontSize: 10,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word'
                                                }}
                                            >
                                                {JSON.stringify(obExportPreview.details, null, 2)}
                                            </pre>
                                        ) : null}
                                    </div>
                                )}
                                {obExportPreview?.export && (
                                    <pre
                                        style={{
                                            marginTop: 10,
                                            fontSize: 10,
                                            overflow: 'auto',
                                            maxHeight: 280,
                                            background: '#0e0f14',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 6,
                                            padding: 8
                                        }}
                                    >
                                        {JSON.stringify(obExportPreview.export, null, 2)}
                                    </pre>
                                )}
                                <button
                                    data-testid="ide-artifact-ob-stub-sync"
                                    type="button"
                                    disabled={
                                        !canStubOpenBrainSync ||
                                        stubOpenBrainSyncMutation.isPending ||
                                        obSyncDisabledByConfig
                                    }
                                    onClick={() => stubOpenBrainSyncMutation.mutate()}
                                    style={{
                                        marginTop: 10,
                                        padding: '6px 12px',
                                        fontSize: 11,
                                        background:
                                            canStubOpenBrainSync && !obSyncDisabledByConfig
                                                ? '#2a2030'
                                                : '#1a1a1a',
                                        border: '1px solid var(--border-color)',
                                        color:
                                            canStubOpenBrainSync && !obSyncDisabledByConfig
                                                ? '#e3c450'
                                                : '#666',
                                        borderRadius: 6,
                                        cursor:
                                            canStubOpenBrainSync && !obSyncDisabledByConfig
                                                ? 'pointer'
                                                : 'not-allowed'
                                    }}
                                    title={
                                        obSync?.provider === 'http'
                                            ? 'POSTs export payload to OPEN_BRAIN_SYNC_URL when configured.'
                                            : 'Writes local audit only; does not call OB1. Requires export eligibility ready.'
                                    }
                                >
                                    {stubOpenBrainSyncMutation.isPending
                                        ? 'Syncing…'
                                        : openBrainSyncButtonLabel}
                                </button>
                                {stubOpenBrainSyncMutation.isError && (
                                    <div style={{ color: '#e35050', marginTop: 8, fontSize: 11 }}>
                                        {String(stubOpenBrainSyncMutation.error.message)}
                                    </div>
                                )}
                                {stubOpenBrainSyncMutation.isSuccess && (
                                    <div style={{ color: '#e3c450', marginTop: 8, fontSize: 11 }}>
                                        Sync recorded (
                                        <code>{String(stubOpenBrainSyncMutation.data?.provider || '')}</code>
                                        ) — thought{' '}
                                        <code>{String(stubOpenBrainSyncMutation.data?.thoughtId || '')}</code>
                                    </div>
                                )}
                            </div>
                            {selectedArtifactRecord.classificationEvidence && (
                                <pre
                                    style={{
                                        marginTop: 14,
                                        fontSize: 10,
                                        overflow: 'auto',
                                        maxHeight: 220,
                                        background: '#0e0f14',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 6,
                                        padding: 8
                                    }}
                                >
                                    {JSON.stringify(selectedArtifactRecord.classificationEvidence, null, 2)}
                                </pre>
                            )}
                        </div>
                    )}
                    {panel !== 'artifacts' && !selectedRel && (
                        <div style={{ color: 'var(--text-secondary)' }}>Select a file to preview full Markdown.</div>
                    )}
                    {panel !== 'artifacts' && selectedRel && fileData?.text && (
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
                                        <div>Confirmed TTG: <code>{selectedMeta?.ttgId || 'unconfirmed'}</code></div>
                                        <div>Project: <code>{selectedMeta?.projectId || 'unknown'}</code></div>
                                        <div>Surface: <code>{selectedMeta?.surface || 'unknown'}</code></div>
                                        <div>Binding: <code>{selectedMeta?.binding?.status || 'unknown'}</code></div>
                                        <div>Method: <code>{selectedMeta?.binding?.method || 'none'}</code></div>
                                        {selectedMeta?.binding?.reason && (
                                            <div>Reason: <code>{selectedMeta.binding.reason}</code></div>
                                        )}
                                        {selectedMeta?.binding?.candidates?.length > 0 && (
                                            <div>
                                                Candidates: <code>{formatBindingCandidates(selectedMeta.binding.candidates)}</code>
                                            </div>
                                        )}
                                        {selectedMeta?.routingSuggestion?.ttgId && (
                                            <div
                                                style={{
                                                    marginTop: 8,
                                                    padding: 8,
                                                    border: '1px solid rgba(80,227,194,0.35)',
                                                    borderRadius: 6,
                                                    background: 'rgba(80,227,194,0.08)'
                                                }}
                                            >
                                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    Suggested TTG:{' '}
                                                    <code>
                                                        {selectedMeta.routingSuggestion.ttgName
                                                            || selectedMeta.routingSuggestion.ttgId}
                                                    </code>
                                                </div>
                                                <div style={{ marginTop: 4 }}>
                                                    {selectedMeta.routingSuggestion.reason || 'Human confirmation required.'}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => confirmSummaryRoutingMutation.mutate()}
                                                    disabled={confirmSummaryRoutingMutation.isPending}
                                                    style={{
                                                        marginTop: 8,
                                                        padding: '5px 9px',
                                                        fontSize: 11,
                                                        background: '#1d2532',
                                                        border: '1px solid var(--border-color)',
                                                        color: '#50e3c2',
                                                        borderRadius: 4,
                                                        cursor: confirmSummaryRoutingMutation.isPending ? 'wait' : 'pointer'
                                                    }}
                                                >
                                                    {confirmSummaryRoutingMutation.isPending ? 'Confirming…' : 'Accept suggestion'}
                                                </button>
                                                {confirmSummaryRoutingMutation.error && (
                                                    <div style={{ marginTop: 6, color: '#ff8f8f' }}>
                                                        {confirmSummaryRoutingMutation.error.message}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {selectedMeta?.ttgClassification?.distribution?.length > 0 && (
                                            <div style={{ marginTop: 8 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                                    TTG match (content/tags)
                                                </div>
                                                {selectedMeta.ttgClassification.distribution.map((row) => (
                                                    <div key={`${row.code}-${row.ttgId}`} style={{ marginBottom: 6 }}>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                fontSize: 10,
                                                                gap: 8
                                                            }}
                                                        >
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {row.ttgName || row.code || row.ttgId}
                                                            </span>
                                                            <span style={{ flexShrink: 0 }}>{row.percent}%</span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                height: 6,
                                                                background: '#222',
                                                                borderRadius: 3,
                                                                overflow: 'hidden',
                                                                marginTop: 2
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    width: `${Math.min(100, row.percent)}%`,
                                                                    height: '100%',
                                                                    background: 'rgba(80,227,194,0.45)'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.85 }}>
                                                    Status:{' '}
                                                    <code>{selectedMeta.ttgClassification.status}</code>
                                                    {selectedMeta.ttgClassification.computedAt
                                                        ? ` · ${new Date(selectedMeta.ttgClassification.computedAt).toLocaleString()}`
                                                        : ''}
                                                </div>
                                            </div>
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
