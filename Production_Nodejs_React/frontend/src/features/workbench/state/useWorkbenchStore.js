import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Tree navigation must use a directory. File paths (e.g. .../SKILL.md) are coerced to their parent folder. */
export function normalizeWorkbenchDir(p) {
    if (p == null || p === '') return 'workspace';
    if (p === 'workspace') return 'workspace';
    const s = String(p);
    // '/' must not become '' after stripping trailing slash (that mapped to workspace and broke the root picker)
    if (s === '/') return '/';
    const t = s.replace(/\/$/, '');
    if (t === '') return '/';
    const base = t.split('/').pop() || '';
    const looksLikeFile = /\.[a-zA-Z0-9]{1,12}$/.test(base);
    if (looksLikeFile) {
        const parent = t.includes('/') ? t.slice(0, t.lastIndexOf('/')) : '';
        return parent || 'workspace';
    }
    return t;
}

/** Align with Channel Manager skill paths; server must allow homedir (see backend WORKBENCH_*). */
export const USER_HOME_FALLBACK = '/home/claw-agentbox';

export const useWorkbenchStore = create(persist((set) => ({
    viewMode: 'code', // 'code' | 'diff'
    setViewMode: (mode) => set({ viewMode: mode }),
    activeFile: null,
    setActiveFile: (file) => {
        set({ activeFile: file });
        if (file) {
            set((state) => ({ recentDocs: [file, ...state.recentDocs.filter(d => d !== file)].slice(0, 10) }));
        }
    },
    autosave: false,
    setAutosave: (val) => set({ autosave: val }),
    localContent: '',
    setLocalContent: (content) => set({ localContent: content }),
    recentDocs: [],
    addRecentDoc: (file) => set((state) => {
        if (!file) return state;
        const newDocs = [file, ...state.recentDocs.filter(d => d !== file)].slice(0, 10);
        return { recentDocs: newDocs };
    }),
    recentDirs: [],
    addRecentDir: (dir) => set((state) => {
        if (!dir) return state;
        const newDirs = [dir, ...state.recentDirs.filter(d => d !== dir)].slice(0, 10);
        return { recentDirs: newDirs };
    }),
    scrollSync: true,
    setScrollSync: (val) => set({ scrollSync: val }),
    outlineMode: 'list', // 'list' | 'minimap'
    setOutlineMode: (mode) => set({ outlineMode: mode }),

    // Workspaces (always directory roots - never a .md file path)
    currentRoot: 'workspace',
    setCurrentRoot: (root) => set({ currentRoot: normalizeWorkbenchDir(root) }),
    workspaces: ['workspace'],
    addWorkspace: (ws) =>
        set((state) => {
            const dir = normalizeWorkbenchDir(ws);
            if (dir === 'workspace') return state;
            return { workspaces: [...new Set([...state.workspaces, dir])] };
        }),
    removeWorkspace: (ws) => set((state) => {
        const fresh = state.workspaces.filter(w => w !== ws);
        return { workspaces: fresh.length ? fresh : ['workspace'], currentRoot: fresh.length ? fresh[0] : 'workspace' };
    })
}), {
    name: 'workbench-storage',
    version: 2,
    migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') return persisted;
        const state = { ...persisted };
        if (state.currentRoot === '' || state.currentRoot == null) state.currentRoot = 'workspace';
        state.currentRoot = normalizeWorkbenchDir(state.currentRoot);
        const ws = Array.isArray(state.workspaces)
            ? [...new Set(state.workspaces.map(normalizeWorkbenchDir))].filter((w) => w && w !== 'workspace')
            : [];
        state.workspaces = ['workspace', ...ws];
        return state;
    },
    partialize: (state) =>
        Object.fromEntries(Object.entries(state).filter(([key]) => !['localContent'].includes(key)))
}));

/**
 * Apply ?path= / ?file= to the store (used after persist hydration so deep links win over localStorage).
 */
export function applyWorkbenchSearchParams(searchParams) {
    const queryFile = searchParams.get('file');
    const queryPath = searchParams.get('path');
    const { addWorkspace, setCurrentRoot, setActiveFile } = useWorkbenchStore.getState();
    if (queryFile) {
        const filePath = decodeURIComponent(queryFile);
        const parentDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
        const rootDir = normalizeWorkbenchDir(parentDir || filePath);
        addWorkspace(rootDir);
        setCurrentRoot(rootDir);
        setActiveFile(filePath);
        return;
    }
    if (queryPath) {
        const decoded = decodeURIComponent(queryPath);
        const raw = decoded === '/' ? '/' : decoded.replace(/\/$/, '');
        if (!raw) return;
        const baseName = raw.split('/').pop() || '';
        const looksLikeFile = /\.[a-zA-Z0-9]{1,12}$/.test(baseName);
        if (looksLikeFile) {
            const parentDir = raw.includes('/') ? raw.slice(0, raw.lastIndexOf('/')) : '';
            const rootDir = normalizeWorkbenchDir(parentDir || raw);
            addWorkspace(rootDir);
            setCurrentRoot(rootDir);
            setActiveFile(raw);
        } else {
            const rootDir = normalizeWorkbenchDir(raw);
            addWorkspace(rootDir);
            setCurrentRoot(rootDir);
            // Skill folders default to SKILL.md; filesystem root has no default file
            if (rootDir === '/') setActiveFile(null);
            else setActiveFile(`${rootDir}/SKILL.md`);
        }
    }
}
