const state = {
  roots: [],
  currentRoot: 'workspace',
  currentFolder: '',
  currentFile: '',
  currentMode: 'preview',
  treePath: '',
  expandedDirs: new Set(['']),
  activePath: '',
  tree: [],
  imageScale: 1,
  history: [],
  historyIndex: -1,
  suppressHistory: false,
  autosave: false,
  autosaveDelayMs: 900,
  activeDocumentKey: null,
  documents: new Map(),
  lastFocusedElement: null,
  paneTabs: {
    left: 'raw',
    right: 'preview',
  },
  syncScroll: true,
  scrollSyncLock: false,
  lastScrollRatio: { left: 0, right: 0 },
  lastActiveScrollSide: 'left',
  selectionMirror: {
    text: '',
    source: null,
  },
  treeFilter: {
    query: '',
    kind: 'all',
    ageMin: '',
    ageMax: '',
    sizeMin: '',
    sizeMax: '',
    sort: 'name',
    matches: null,
    totalMatches: 0,
  },
};

const ROOT_MAP = {
  workspace: '/home/claw-agentbox/.openclaw/workspace',
  openclaw: '/media/claw-agentbox/data/9999_LocalRepo/openclaw',
  'studio-framework': '/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework',
  'ui-extensions': '/media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension',
};

// Dynamically load workspaces from Channel Manager
async function loadWorkspaces() {
  try {
    const response = await fetch('http://localhost:3401/api/workspaces');
    if (response.ok) {
      const workspaces = await response.json();
      workspaces.forEach(ws => {
        const key = ws.name.toLowerCase().replace(/\s+/g, '-');
        if (!ROOT_MAP[key]) {
          ROOT_MAP[key] = ws.path;
        }
      });
      populateRootSelect();
    }
  } catch (e) {
    console.log('Could not load workspaces from Channel Manager:', e);
  }
}

const rootSelect = document.getElementById('rootSelect');
const addRootBtn = document.getElementById('addRootBtn');
const removeRootBtn = document.getElementById('removeRootBtn');
const searchInput = document.getElementById('searchInput');
const kindFilter = document.getElementById('kindFilter');
const ageMinInput = document.getElementById('ageMinInput');
const ageMaxInput = document.getElementById('ageMaxInput');
const sizeMinInput = document.getElementById('sizeMinInput');
const sizeMaxInput = document.getElementById('sizeMaxInput');
const sortFilter = document.getElementById('sortFilter');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const searchResults = document.getElementById('searchResults');
const pathInput = document.getElementById('pathInput');
const absolutePathInput = document.getElementById('absolutePathInput');
const openPathBtn = document.getElementById('openPathBtn');
const openAbsoluteBtn = document.getElementById('openAbsoluteBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const newFileBtn = document.getElementById('newFileBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadInput = document.getElementById('uploadInput');
const dropZone = document.getElementById('dropZone');
const refreshTreeBtn = document.getElementById('refreshTreeBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const upBtn = document.getElementById('upBtn');
const breadcrumbs = document.getElementById('breadcrumbs');
const debugStatus = document.getElementById('debugStatus');
const treeView = document.getElementById('treeView');
const docsIndex = document.getElementById('docsIndex');
const viewer = document.getElementById('viewer');
const secondaryViewer = document.getElementById('secondaryViewer');
const outlineViewer = document.getElementById('outlineViewer');
const currentRootLabel = document.getElementById('currentRootLabel');
const currentRelativeLabel = document.getElementById('currentRelativeLabel');
const currentAbsoluteLabel = document.getElementById('currentAbsoluteLabel');
const previewControls = document.getElementById('previewControls');
const leftTabRaw = document.getElementById('leftTabRaw');
const leftTabPreview = document.getElementById('leftTabPreview');
const leftTabOutline = document.getElementById('leftTabOutline');
const rightTabRaw = document.getElementById('rightTabRaw');
const rightTabPreview = document.getElementById('rightTabPreview');
const rightTabOutline = document.getElementById('rightTabOutline');
const editorTools = document.getElementById('editorTools');
const findInput = document.getElementById('findInput');
const replaceInput = document.getElementById('replaceInput');
const findNextBtn = document.getElementById('findNextBtn');
const replaceBtn = document.getElementById('replaceBtn');
const replaceAllBtn = document.getElementById('replaceAllBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const saveBtn = document.getElementById('saveBtn');
const revertBtn = document.getElementById('revertBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const sidebarResizer = document.getElementById('sidebarResizer');
const previewResizer = document.getElementById('previewResizer');
const outlineResizer = document.getElementById('outlineResizer');
const treeHeightResizer = document.getElementById('treeHeightResizer');
const sidebarNarrowerBtn = document.getElementById('sidebarNarrowerBtn');
const sidebarWiderBtn = document.getElementById('sidebarWiderBtn');
const treeSmallerBtn = document.getElementById('treeSmallerBtn');
const treeLargerBtn = document.getElementById('treeLargerBtn');
const autosaveCheckbox = document.getElementById('autosaveCheckbox');
const docStatus = document.getElementById('docStatus');
const unsavedModal = document.getElementById('unsavedModal');
const unsavedModalCard = unsavedModal?.querySelector('.modal-card') || null;
const unsavedModalMessage = document.getElementById('unsavedModalMessage');
const modalStayBtn = document.getElementById('modalStayBtn');
const modalDiscardBtn = document.getElementById('modalDiscardBtn');
const modalSaveBtn = document.getElementById('modalSaveBtn');

let searchDebounce = null;
let markdownModulePromise = null;
let unsavedModalResolver = null;

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setSaveState(doc, saveState, extra = {}) {
  if (!doc) return;
  doc.saveState = saveState;
  Object.assign(doc, extra);
  state.documents.set(doc.key, doc);
  updateDocumentStatus();
  updateDebugStatus();
}

function clearAutosaveTimer(doc) {
  if (!doc?.autosaveTimer) return;
  clearTimeout(doc.autosaveTimer);
  doc.autosaveTimer = null;
}

function scheduleAutosave(doc = currentDoc()) {
  if (!doc) return;
  clearAutosaveTimer(doc);
  if (!state.autosave || !isWritableRoot(doc.root) || !isDocumentDirty(doc)) return;
  doc.autosaveTimer = setTimeout(() => {
    saveDocument(doc, { trigger: 'autosave' }).catch((error) => {
      setSaveState(doc, 'error', { lastError: error.message || String(error) });
      showError(error);
    });
  }, state.autosaveDelayMs);
}

function escapeHtml(input) {
  return String(input).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function appBase() {
  const path = window.location.pathname || '/';
  return path.endsWith('/') ? path.slice(0, -1) || '/' : path;
}

function apiUrl(pathname, params) {
  const url = new URL(`${appBase()}/api/${pathname}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function slugifyHeading(text) {
  return text.toLowerCase().trim().replaceAll(/[^a-z0-9\s-]/g, '').replaceAll(/\s+/g, '-');
}

function extractHeadings(markdown = '') {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
      if (!match) return null;
      return { level: match[1].length, text: match[2].trim() };
    })
    .filter(Boolean);
}

function renderOutlineHtml(headings = []) {
  if (!headings.length) return '<div class="muted">No headings</div>';
  const items = headings.map((heading) => {
    const indent = (heading.level - 1) * 12;
    return `<li style="margin-left:${indent}px"><a href="#${slugifyHeading(heading.text)}">${escapeHtml(heading.text)}</a></li>`;
  }).join('');
  return `<ul class="outline-list">${items}</ul>`;
}

function documentKey(root, filePath) {
  return `${root}:${filePath}`;
}

function getDocument(root, filePath) {
  if (!root || !filePath) return null;
  return state.documents.get(documentKey(root, filePath)) || null;
}

function currentDoc() {
  return getDocument(state.currentRoot, state.currentFile);
}

function setCurrentDocument(doc) {
  state.activeDocumentKey = doc ? doc.key : null;
  if (doc) state.documents.set(doc.key, doc);
}

function isDocumentDirty(doc = currentDoc()) {
  return !!(doc && doc.workingContent !== doc.savedContent);
}

function dirtyDocumentCount() {
  let count = 0;
  for (const doc of state.documents.values()) {
    if (isDocumentDirty(doc)) count += 1;
  }
  return count;
}

function dirtyLabelForFile(pathValue, root = state.currentRoot) {
  const doc = getDocument(root, pathValue);
  return !!(doc && isDocumentDirty(doc));
}

function isTreeFilterActive() {
  const { query, kind, ageMin, ageMax, sizeMin, sizeMax } = state.treeFilter;
  return !!(query || kind !== 'all' || ageMin !== '' || ageMax !== '' || sizeMin !== '' || sizeMax !== '');
}

function normalizeRangeValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? String(num) : '';
}

function sortNodes(nodes = []) {
  const sort = state.treeFilter.sort;
  const compare = (a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    if (sort === 'name') return a.name.localeCompare(b.name);
    const aTime = a.updatedAt || 0;
    const bTime = b.updatedAt || 0;
    const aSize = a.size || 0;
    const bSize = b.size || 0;
    if (sort === 'newest') return bTime - aTime || a.name.localeCompare(b.name);
    if (sort === 'oldest') return aTime - bTime || a.name.localeCompare(b.name);
    if (sort === 'largest') return bSize - aSize || a.name.localeCompare(b.name);
    if (sort === 'smallest') return aSize - bSize || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  };
  return [...nodes].sort(compare).map((node) => ({
    ...node,
    children: node.children ? sortNodes(node.children) : node.children,
  }));
}

function applyTreeFilter(nodes = []) {
  const matches = state.treeFilter.matches;
  const active = isTreeFilterActive();
  const activePath = state.activePath || state.currentFile || state.currentFolder || '';
  const walk = (inputNodes) => {
    const output = [];
    for (const node of inputNodes) {
      const filteredChildren = node.children ? walk(node.children) : [];
      const isExactMatch = !active || !matches || matches.has(node.path);
      const isAncestorOfActive = !!activePath && (activePath === node.path || activePath.startsWith(`${node.path}/`));
      const keepNode = node.type === 'dir'
        ? (isExactMatch || filteredChildren.length > 0 || isAncestorOfActive)
        : isExactMatch;
      if (!keepNode) continue;
      output.push({
        ...node,
        children: node.children ? filteredChildren : undefined,
      });
    }
    return output;
  };
  return walk(sortNodes(nodes));
}

function updateFilterStatus(text) {
  if (searchResults) searchResults.textContent = text;
}

function setEditorMode(active) {
  editorTools.classList.toggle('hidden', !active);
}

function activeRawPane() {
  return 'left';
}

function getPaneContainer(side) {
  if (side === 'left') return viewer;
  if (side === 'right') return secondaryViewer;
  if (side === 'outline') return outlineViewer;
  return null;
}

function renderPaneTabState() {
}

function renderLineNumbers(text) {
  const lines = text.split('\n').length;
  return Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function renderPreviewControls(kind = 'text') {
  previewControls.innerHTML = '';
  const syncBtn = document.createElement('button');
  syncBtn.textContent = `Scroll lock: ${state.syncScroll ? 'on' : 'off'}`;
  syncBtn.onclick = () => {
    state.syncScroll = !state.syncScroll;
    if (state.syncScroll) requestAnimationFrame(() => alignPanesFromSavedRatio());
    renderPreviewControls(kind);
  };
  previewControls.appendChild(syncBtn);
  const alignBtn = document.createElement('button');
  alignBtn.textContent = 'Align now';
  alignBtn.onclick = () => alignPanesFromSavedRatio();
  previewControls.appendChild(alignBtn);
  if (kind !== 'image') return;
  const controls = [
    ['Fit', () => setImageScale(0.6)],
    ['100%', () => setImageScale(1)],
    ['-', () => setImageScale(Math.max(0.2, Number((state.imageScale - 0.1).toFixed(2))))],
    ['+', () => setImageScale(Math.min(2, Number((state.imageScale + 0.1).toFixed(2))))],
  ];
  for (const [label, fn] of controls) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = fn;
    previewControls.appendChild(btn);
  }
}

function setImageScale(scale) {
  state.imageScale = scale;
  document.documentElement.style.setProperty('--image-scale', String(scale));
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set('root', state.currentRoot);
  if (state.currentFile) {
    params.set('path', state.currentFile);
    params.set('mode', state.currentMode);
  } else {
    params.set('dir', state.currentFolder);
  }
  history.replaceState({}, '', `${appBase()}/?${params.toString()}`);
}

function currentAbsolutePath() {
  const rootPath = ROOT_MAP[state.currentRoot] || '';
  if (state.currentFile) return `${rootPath}/${state.currentFile}`.replace(/\/+/g, '/');
  if (state.currentFolder) return `${rootPath}/${state.currentFolder}`.replace(/\/+/g, '/');
  return rootPath;
}

function currentRelativePath() {
  return state.currentFile || state.currentFolder || '';
}

function currentRelativeLabelText() {
  const doc = currentDoc();
  const dirtySuffix = isDocumentDirty(doc) ? ' • unsaved' : '';
  return `${currentRelativePath() || '(root)'}${dirtySuffix}`;
}

function updateSummary() {
  currentRootLabel.textContent = state.currentRoot || '—';
  currentRelativeLabel.textContent = currentRelativeLabelText();
  currentAbsoluteLabel.textContent = currentAbsolutePath() || '—';
  pathInput.value = state.currentFile || state.currentFolder || '';
  absolutePathInput.value = currentAbsolutePath();
  updateDocumentStatus();
}

function countTreeItems(nodes = []) {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children?.length) count += countTreeItems(node.children);
  }
  return count;
}

function updateDebugStatus(extra = '') {
  const doc = currentDoc();
  const lines = [
    `root: ${state.currentRoot}`,
    `folder: ${state.currentFolder || '(root)'}`,
    `treePath: ${state.treePath || '(root)'}`,
    `file: ${state.currentFile || '(none)'}`,
    `treeItems: ${countTreeItems(state.tree || [])}`,
    `autosave: ${state.autosave ? `on/${state.autosaveDelayMs}ms` : 'off'}`,
    `saveState: ${doc?.saveState || '(none)'}`,
    `dirtyCurrent: ${doc && isDocumentDirty(doc) ? 'yes' : 'no'}`,
    `dirtyTracked: ${dirtyDocumentCount()}`,
  ];
  if (extra) lines.push(`note: ${extra}`);
  debugStatus.textContent = lines.join(' | ');
}

function updateDocumentStatus() {
  const doc = currentDoc();
  if (!docStatus) return;
  const dirtyCount = dirtyDocumentCount();
  const parts = [state.autosave ? `Autosave on (${Math.round(state.autosaveDelayMs / 100) / 10}s debounce)` : 'Autosave off'];
  if (doc) {
    if (doc.saveState === 'saving') parts.push('Saving…');
    else if (doc.saveState === 'error') parts.push(`Save failed: ${doc.lastError || 'unknown error'}`);
    else if (doc.saveState === 'dirty-autosave') parts.push('Unsaved changes • autosave pending');
    else if (doc.saveState === 'dirty') parts.push('Unsaved changes');
    else parts.push(`Saved at ${formatTime(doc.lastSavedAt)}`);
  }
  if (dirtyCount > 0) parts.push(`${dirtyCount} dirty doc${dirtyCount === 1 ? '' : 's'}`);
  docStatus.textContent = parts.join(' • ');
}

function ensureExpandedFor(pathValue = '') {
  state.expandedDirs.add('');
  const parts = pathValue.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    state.expandedDirs.add(current);
  }
}

function inferRootFromAbsolute(absPath) {
  for (const [key, rootPath] of Object.entries(ROOT_MAP)) {
    if (absPath === rootPath || absPath.startsWith(`${rootPath}/`)) {
      return { root: key, relative: absPath.slice(rootPath.length).replace(/^\//, '') };
    }
  }
  return null;
}

function pushHistory(entry) {
  if (state.suppressHistory) return;
  const last = state.history[state.historyIndex];
  if (last && last.root === entry.root && last.path === entry.path && last.mode === entry.mode) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(entry);
  state.historyIndex = state.history.length - 1;
  updateNavButtons();
}

function currentTargetDir() {
  return state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
}

function isWritableRoot(root = state.currentRoot) {
  return root === 'workspace' || root === 'studio-framework';
}

function updateNavButtons() {
  const writable = isWritableRoot();
  const doc = currentDoc();
  const dirty = isDocumentDirty(doc);
  backBtn.disabled = state.historyIndex <= 0;
  forwardBtn.disabled = state.historyIndex >= state.history.length - 1;
  upBtn.disabled = !(state.currentFolder || state.currentFile);
  newFolderBtn.disabled = !writable;
  newFileBtn.disabled = !writable;
  uploadBtn.disabled = !writable;
  saveBtn.disabled = !writable || !state.currentFile || !doc || !dirty;
  revertBtn.disabled = !state.currentFile || !doc || state.autosave || !dirty;
  if (undoBtn) undoBtn.disabled = !doc || doc.undoIndex <= 0;
  if (redoBtn) redoBtn.disabled = !doc || doc.undoIndex >= doc.undoStack.length - 1;
  dropZone.classList.toggle('disabled', !writable);
  dropZone.textContent = writable ? 'Drop file here into current folder' : 'Drag-and-drop disabled in read-only roots';
  updateDocumentStatus();
}

function renderBreadcrumbs() {
  breadcrumbs.innerHTML = '';
  const parts = (state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder || '').split('/').filter(Boolean);
  const chain = [''];
  for (let i = 0; i < parts.length; i += 1) chain.push(parts.slice(0, i + 1).join('/'));
  const labels = [state.currentRoot, ...parts];
  chain.forEach((pathValue, index) => {
    const btn = document.createElement('button');
    btn.textContent = labels[index] || state.currentRoot;
    btn.onclick = () => guardedOpenFolderAt(pathValue).catch(showError);
    breadcrumbs.appendChild(btn);
    if (index < chain.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '/';
      breadcrumbs.appendChild(sep);
    }
  });
}

async function loadRoots(selectedKey = state.currentRoot) {
  const data = await fetchJson(apiUrl('roots'));
  state.roots = data.roots;
  rootSelect.innerHTML = data.roots.map(root => `<option value="${root.key}">${root.key}${root.custom ? ' *' : ''}</option>`).join('');
  const availableKeys = new Set(data.roots.map((root) => root.key));
  if (!availableKeys.has(selectedKey)) selectedKey = data.roots[0]?.key || 'workspace';
  state.currentRoot = selectedKey;
  rootSelect.value = selectedKey;
  const selected = data.roots.find((root) => root.key === selectedKey);
  if (removeRootBtn) removeRootBtn.disabled = !selected?.custom;
}

async function loadDocsIndex() {
  const data = await fetchJson(apiUrl('docs-index'));
  docsIndex.innerHTML = '';
  for (const doc of data.docs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.className = `file${dirtyLabelForFile(doc.path, doc.root) ? ' dirty-link' : ''}`;
    const timeLabel = new Date(doc.updatedAt).toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    a.textContent = `${doc.root} · ${doc.path}`;
    a.title = `${doc.absolutePath}\n${timeLabel}`;
    if (dirtyLabelForFile(doc.path, doc.root)) a.title += '\nUnsaved changes';
    a.onclick = async (event) => {
      event.preventDefault();
      await guardedOpenTarget(doc.path, doc.root);
    };
    li.appendChild(a);
    docsIndex.appendChild(li);
  }
}

function renderTreeNodes(nodes, container) {
  for (const node of nodes) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    const row = document.createElement('div');
    row.className = 'tree-row';
    const nodeIsDirty = node.type === 'file' && dirtyLabelForFile(node.path);

    if (node.type === 'dir') {
      const toggle = document.createElement('button');
      toggle.className = 'tree-toggle';
      const isExpanded = state.expandedDirs.has(node.path);
      toggle.textContent = isExpanded ? '▾' : '▸';
      toggle.onclick = () => {
        if (isExpanded) state.expandedDirs.delete(node.path);
        else state.expandedDirs.add(node.path);
        renderTree();
      };
      row.appendChild(toggle);

      const label = document.createElement('button');
      label.className = `tree-label ${state.activePath === node.path ? 'active' : ''}`;
      const text = document.createElement('span');
      text.className = 'tree-label-text';
      text.textContent = `📁 ${node.name}`;
      label.appendChild(text);
      label.onclick = () => {
        if (window.getSelection && String(window.getSelection()).length > 0) return;
        guardedOpenFolderAt(node.path).catch(showError);
      };
      row.appendChild(label);
      wrapper.appendChild(row);

      if (isExpanded) {
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'tree-children';
        if (node.children?.length) renderTreeNodes(node.children, childrenWrap);
        else if (node.truncated) childrenWrap.innerHTML = '<div class="muted small">Depth limit reached</div>';
        else childrenWrap.innerHTML = '<div class="muted small">Empty</div>';
        wrapper.appendChild(childrenWrap);
      }
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-kind';
      spacer.textContent = '•';
      row.appendChild(spacer);

      const label = document.createElement('button');
      label.className = `tree-label ${state.activePath === node.path ? 'active' : ''}`;
      const meta = document.createElement('span');
      meta.className = 'tree-label-meta';
      if (nodeIsDirty) {
        const dirtyDot = document.createElement('span');
        dirtyDot.className = 'dirty-dot';
        dirtyDot.title = 'Unsaved changes';
        meta.appendChild(dirtyDot);
      }
      const text = document.createElement('span');
      text.className = 'tree-label-text';
      text.textContent = `📄 ${node.name}`;
      meta.appendChild(text);
      label.appendChild(meta);
      label.onclick = () => {
        if (window.getSelection && String(window.getSelection()).length > 0) return;
        guardedLoadFile(node.path, state.currentMode).catch(showError);
      };
      row.appendChild(label);
      wrapper.appendChild(row);
    }

    container.appendChild(wrapper);
  }
}

function renderTree() {
  treeView.innerHTML = '';
  const visibleTree = applyTreeFilter(state.tree || []);
  if (!visibleTree.length) {
    const active = isTreeFilterActive();
    const matchesSize = state.treeFilter.matches?.size ?? 0;
    const note = active ? `No items match the current tree filter. (matches: ${matchesSize}, treePath: ${state.treePath || '(root)'})` : 'No files';
    treeView.innerHTML = `<div class="muted">${note}</div>`;
    updateDebugStatus(`tree empty after render | filterActive=${active ? 'yes' : 'no'} | matches=${matchesSize}`);
    return;
  }
  renderTreeNodes(visibleTree, treeView);
  const activeLabel = treeView.querySelector('.tree-label.active');
  if (activeLabel) {
    requestAnimationFrame(() => {
      activeLabel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  updateDebugStatus(`tree rendered | visible=${countTreeItems(visibleTree)}`);
}

async function loadTree(rootPath = '') {
  state.treePath = rootPath;
  updateDebugStatus('loading tree');
  const data = await fetchJson(apiUrl('tree', { root: state.currentRoot, path: rootPath, maxDepth: 5 }));
  state.tree = data.tree;
  await runSearch({ silent: true });
  renderTree();
}

function renderFolderViewMessage() {
  const message = state.currentFolder ? 'Folder selected. Choose a file from the tree.' : 'Root loaded. Choose a folder or file from the tree.';
  viewer.className = 'viewer empty-state';
  secondaryViewer.className = 'viewer empty-state';
  outlineViewer.className = 'viewer empty-state';
  viewer.textContent = message;
  secondaryViewer.textContent = message;
  outlineViewer.textContent = message;
  renderPreviewControls('text');
  updateDocumentStatus();
}

function getFocusableElements() {
  if (!unsavedModalCard) return [];
  return Array.from(unsavedModalCard.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.hasAttribute('disabled'));
}

function showUnsavedModal(label) {
  return new Promise((resolve) => {
    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    unsavedModalResolver = resolve;
    unsavedModalMessage.textContent = `You have unsaved changes in ${label}. What should happen before leaving this document?`;
    unsavedModal.classList.remove('hidden');
    unsavedModal.setAttribute('aria-hidden', 'false');
    modalSaveBtn.focus();
  });
}

function closeUnsavedModal(result) {
  if (!unsavedModalResolver) return;
  const resolve = unsavedModalResolver;
  unsavedModalResolver = null;
  unsavedModal.classList.add('hidden');
  unsavedModal.setAttribute('aria-hidden', 'true');
  if (state.lastFocusedElement?.focus) state.lastFocusedElement.focus();
  state.lastFocusedElement = null;
  resolve(result);
}

function createDocumentState({ root, filePath, raw, isMarkdown, kind, updatedAt }) {
  return {
    key: documentKey(root, filePath),
    root,
    filePath,
    kind,
    isMarkdown,
    savedContent: raw,
    workingContent: raw,
    savedUpdatedAt: updatedAt || null,
    lastSavedAt: updatedAt || null,
    saveState: 'saved',
    lastError: null,
    autosaveTimer: null,
    undoStack: [raw],
    undoIndex: 0,
    lastSelectionStart: 0,
    lastSelectionEnd: 0,
  };
}

function pushUndoSnapshot(doc, value) {
  if (!doc) return;
  if (doc.undoStack[doc.undoIndex] === value) return;
  doc.undoStack = doc.undoStack.slice(0, doc.undoIndex + 1);
  doc.undoStack.push(value);
  if (doc.undoStack.length > 300) doc.undoStack.shift();
  doc.undoIndex = doc.undoStack.length - 1;
}

function applyDocumentContent(doc, value, options = {}) {
  doc.workingContent = value;
  if (!options.skipUndo) pushUndoSnapshot(doc, value);
  if (doc.workingContent !== doc.savedContent) {
    doc.saveState = state.autosave ? 'dirty-autosave' : 'dirty';
    doc.lastError = null;
  } else if (doc.saveState !== 'saving') {
    doc.saveState = 'saved';
  }
  state.documents.set(doc.key, doc);
  updateSummary();
  updateNavButtons();
  renderTree();
  loadDocsIndex().catch(() => {});
  updateDebugStatus();
  scheduleAutosave(doc);
}

function getRawEditor(side = activeRawPane()) {
  return side ? getPaneContainer(side)?.querySelector('[data-role="raw-editor"]') : null;
}

function getLineNumbers(side = activeRawPane()) {
  return side ? getPaneContainer(side)?.querySelector('[data-role="line-numbers"]') : null;
}

function syncDocumentFromEditor() {
  const doc = currentDoc();
  const rawEditor = getRawEditor();
  if (!doc || !rawEditor) return;
  doc.workingContent = rawEditor.value;
  doc.lastSelectionStart = rawEditor.selectionStart;
  doc.lastSelectionEnd = rawEditor.selectionEnd;
  state.documents.set(doc.key, doc);
}

function updateRawEditorUI(rawEditor, value, options = {}) {
  rawEditor.value = value;
  const lineNumbers = rawEditor.closest('.raw-editor-wrap')?.querySelector('[data-role="line-numbers"]');
  if (lineNumbers) lineNumbers.textContent = renderLineNumbers(value);
  if (options.restoreSelection) {
    const doc = currentDoc();
    if (doc) rawEditor.setSelectionRange(doc.lastSelectionStart ?? value.length, doc.lastSelectionEnd ?? value.length);
  }
}

function restoreUndoState(doc, step) {
  const nextIndex = doc.undoIndex + step;
  if (nextIndex < 0 || nextIndex >= doc.undoStack.length) return;
  doc.undoIndex = nextIndex;
  doc.workingContent = doc.undoStack[doc.undoIndex];
  state.documents.set(doc.key, doc);
  const rawEditor = getRawEditor();
  if (rawEditor) {
    updateRawEditorUI(rawEditor, doc.workingContent);
    rawEditor.focus();
    const pos = rawEditor.value.length;
    rawEditor.setSelectionRange(pos, pos);
  }
  renderCurrentFile();
  updateSummary();
  updateNavButtons();
  renderTree();
  loadDocsIndex().catch(() => {});
  updateDebugStatus(step < 0 ? 'undo' : 'redo');
}

function setupRawEditor(doc, side) {
  const rawEditor = getRawEditor(side);
  const lineNumbers = getLineNumbers(side);
  if (!rawEditor || !doc) return;
  rawEditor.value = doc.workingContent;
  if (lineNumbers) lineNumbers.textContent = renderLineNumbers(doc.workingContent);
  if (typeof doc.lastSelectionStart === 'number' && typeof doc.lastSelectionEnd === 'number') {
    rawEditor.setSelectionRange(doc.lastSelectionStart, doc.lastSelectionEnd);
  }
  rawEditor.addEventListener('input', () => {
    applyDocumentContent(doc, rawEditor.value);
    if (lineNumbers) lineNumbers.textContent = renderLineNumbers(rawEditor.value);
    doc.lastSelectionStart = rawEditor.selectionStart;
    doc.lastSelectionEnd = rawEditor.selectionEnd;
    refreshPassivePanes(doc, side).catch(showError);
  });
  rawEditor.addEventListener('scroll', () => {
    if (lineNumbers) lineNumbers.scrollTop = rawEditor.scrollTop;
    state.lastActiveScrollSide = side;
    state.lastScrollRatio[side] = getScrollRatio(rawEditor);
    syncPaneScroll(side, 'raw');
  });
  rawEditor.addEventListener('click', () => {
    handleRawSelectionSync(doc, side);
  });
  rawEditor.addEventListener('keyup', () => {
    handleRawSelectionSync(doc, side);
  });
  rawEditor.addEventListener('select', () => {
    handleRawSelectionSync(doc, side);
  });
  rawEditor.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      restoreUndoState(doc, -1);
      return;
    }
    if ((mod && event.key.toLowerCase() === 'y') || (mod && event.shiftKey && event.key.toLowerCase() === 'z')) {
      event.preventDefault();
      restoreUndoState(doc, 1);
    }
  });
}

async function getMarked() {
  if (!markdownModulePromise) markdownModulePromise = import('https://cdn.jsdelivr.net/npm/marked@15/lib/marked.esm.js');
  return markdownModulePromise;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightPreviewSelection(target, text) {
  if (!text || text.length < 2) return;
  const article = target.querySelector('.markdown-body') || target.querySelector('pre');
  if (!article) return;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const needle = text.trim();
  if (!needle) return;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const haystack = node.nodeValue || '';
    const index = haystack.indexOf(needle);
    if (index < 0) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + needle.length);
    const mark = document.createElement('mark');
    mark.className = 'mirror-highlight';
    try {
      range.surroundContents(mark);
      mark.scrollIntoView({ block: 'center', inline: 'nearest' });
      return;
    } catch {
      return;
    }
  }
}

function reflectSelectionToRaw(text) {
  const rawEditor = getRawEditor('left');
  if (!rawEditor || !text) return;
  const needle = text.trim();
  if (!needle) return;
  const index = rawEditor.value.indexOf(needle);
  if (index < 0) return;
  rawEditor.focus();
  rawEditor.setSelectionRange(index, index + needle.length);
  const lineHeight = parseFloat(getComputedStyle(rawEditor).lineHeight) || 21;
  const before = rawEditor.value.slice(0, index);
  const lineNumber = before.split('\n').length - 1;
  rawEditor.scrollTop = Math.max(0, (lineNumber - 3) * lineHeight);
}

function handleRawSelectionSync(doc, side) {
  const rawEditor = getRawEditor(side);
  if (!rawEditor) return;
  const selectedText = rawEditor.value.slice(rawEditor.selectionStart, rawEditor.selectionEnd);
  doc.lastSelectionStart = rawEditor.selectionStart;
  doc.lastSelectionEnd = rawEditor.selectionEnd;
  state.selectionMirror = { text: selectedText, source: 'raw' };
  refreshPassivePanes(doc, side).catch(showError);
}

function handlePreviewSelectionSync() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !secondaryViewer.contains(selection.anchorNode)) return;
  const text = selection.toString().trim();
  if (!text) return;
  state.selectionMirror = { text, source: 'preview' };
  reflectSelectionToRaw(text);
}

function renderOutlinePane(target, doc) {
  target.className = 'viewer';
  target.innerHTML = renderOutlineHtml(doc.isMarkdown ? extractHeadings(doc.workingContent) : []);
}

function renderRawPane(target) {
  target.className = 'viewer';
  target.innerHTML = `
    <div class="raw-editor-wrap">
      <pre data-role="line-numbers" class="raw-line-numbers"></pre>
      <textarea data-role="raw-editor" class="raw-editor" wrap="off" spellcheck="false"></textarea>
    </div>`;
}

async function renderPreviewPane(target, doc) {
  target.className = 'viewer';
  if (doc.isMarkdown) {
    const { marked } = await getMarked();
    target.innerHTML = `<article class="markdown-body">${marked.parse(doc.workingContent)}</article>`;
    await renderMermaid(target);
  } else {
    target.innerHTML = `<pre><code>${escapeHtml(doc.workingContent)}</code></pre>`;
  }
  if (state.selectionMirror.source === 'raw') {
    highlightPreviewSelection(target, state.selectionMirror.text);
  }
}

function getScrollSource(side) {
  const mode = state.paneTabs[side];
  const pane = getPaneContainer(side);
  if (!pane) return null;
  if (mode === 'raw') return pane.querySelector('[data-role="raw-editor"]');
  if (mode === 'preview' || mode === 'outline') return pane;
  return null;
}

function getScrollRatio(target) {
  if (!target) return 0;
  const maxScroll = Math.max(1, target.scrollHeight - target.clientHeight);
  return target.scrollTop / maxScroll;
}

function getLockedPanePair() {
  return { rawSide: 'left', previewSide: 'right' };
}

function applyScrollRatio(target, ratio) {
  if (!target) return;
  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  target.scrollTop = maxScroll * ratio;
}

function syncPaneScroll(fromSide, fromMode) {
  if (!state.syncScroll || state.scrollSyncLock) return;
  const pair = getLockedPanePair();
  if (!pair) return;
  const source = getScrollSource(fromSide);
  const targetSide = fromSide === 'left' ? 'right' : 'left';
  const target = getScrollSource(targetSide);
  if (!source || !target) return;
  if (!((fromMode === 'raw' && targetSide === pair.previewSide) || (fromMode === 'preview' && targetSide === pair.rawSide))) return;
  const ratio = getScrollRatio(source);
  state.lastActiveScrollSide = fromSide;
  state.lastScrollRatio.left = ratio;
  state.lastScrollRatio.right = ratio;
  state.scrollSyncLock = true;
  applyScrollRatio(target, ratio);
  requestAnimationFrame(() => { state.scrollSyncLock = false; });
}

function alignPanesFromSavedRatio(preferredSide = null) {
  if (!state.syncScroll) return;
  const pair = getLockedPanePair();
  if (!pair) return;
  const sourceSide = preferredSide || state.lastActiveScrollSide || pair.rawSide;
  const targetSide = sourceSide === 'left' ? 'right' : 'left';
  const source = getScrollSource(sourceSide) || getScrollSource(pair.rawSide) || getScrollSource(pair.previewSide);
  const target = getScrollSource(targetSide) || getScrollSource(pair.previewSide) || getScrollSource(pair.rawSide);
  if (!source || !target) return;
  const liveRatio = getScrollRatio(source);
  const ratio = Number.isFinite(liveRatio) ? liveRatio : (state.lastScrollRatio[sourceSide] ?? state.lastScrollRatio[targetSide] ?? 0);
  state.lastScrollRatio.left = ratio;
  state.lastScrollRatio.right = ratio;
  state.scrollSyncLock = true;
  applyScrollRatio(source, ratio);
  applyScrollRatio(target, ratio);
  requestAnimationFrame(() => { state.scrollSyncLock = false; });
}

async function refreshPassivePanes(doc, sourceSide = null) {
  if (sourceSide !== 'right') {
    secondaryViewer.onscroll = null;
    await renderPreviewPane(secondaryViewer, doc);
    secondaryViewer.onscroll = () => {
      state.lastActiveScrollSide = 'right';
      state.lastScrollRatio.right = getScrollRatio(secondaryViewer);
      syncPaneScroll('right', 'preview');
    };
  }
  renderOutlinePane(outlineViewer, doc);
}

async function renderCurrentFile() {
  const doc = currentDoc();
  if (!doc) return;
  viewer.onscroll = null;
  secondaryViewer.onscroll = null;
  outlineViewer.onscroll = null;
  renderRawPane(viewer);
  setupRawEditor(doc, 'left');
  await renderPreviewPane(secondaryViewer, doc);
  renderOutlinePane(outlineViewer, doc);
  secondaryViewer.onscroll = () => {
    state.lastActiveScrollSide = 'right';
    state.lastScrollRatio.right = getScrollRatio(secondaryViewer);
    syncPaneScroll('right', 'preview');
  };
  secondaryViewer.onmouseup = () => handlePreviewSelectionSync();
  secondaryViewer.onkeyup = () => handlePreviewSelectionSync();
  renderPreviewControls('text');
  setEditorMode(true);
  updateSummary();
  updateNavButtons();
  requestAnimationFrame(() => alignPanesFromSavedRatio());
}

async function renderTextDocument(doc) {
  await renderCurrentFile();
}

async function openFolderAt(dir = '', options = {}) {
  state.currentFolder = dir;
  state.currentFile = '';
  state.activePath = dir;
  state.treePath = dir;
  state.expandedDirs = new Set(['']);
  ensureExpandedFor(dir);
  renderFolderViewMessage();
  await loadTree(dir);
  updateSummary();
  renderBreadcrumbs();
  updateUrl();
  updateNavButtons();
  if (!options.skipHistory) pushHistory({ root: state.currentRoot, path: dir, mode: 'folder' });
}

async function loadFile(filePath, mode = state.currentMode, options = {}) {
  state.currentFile = filePath;
  state.currentMode = mode;
  state.activePath = filePath;
  state.currentFolder = filePath.split('/').slice(0, -1).join('/');
  ensureExpandedFor(state.currentFolder);

  const data = await fetchJson(apiUrl('file', { root: state.currentRoot, path: filePath, mode: 'raw' }));

  if (data.kind === 'text') {
    const key = documentKey(state.currentRoot, filePath);
    let doc = state.documents.get(key);
    if (!doc) {
      doc = createDocumentState({ root: state.currentRoot, filePath, raw: data.raw, isMarkdown: data.isMarkdown, kind: data.kind, updatedAt: data.updatedAt });
      state.documents.set(key, doc);
    } else {
      doc.kind = data.kind;
      doc.isMarkdown = data.isMarkdown;
      if (!isDocumentDirty(doc)) {
        doc.savedContent = data.raw;
        doc.workingContent = data.raw;
        doc.savedUpdatedAt = data.updatedAt || doc.savedUpdatedAt || null;
        doc.lastSavedAt = data.updatedAt || doc.lastSavedAt || null;
        doc.saveState = 'saved';
        doc.lastError = null;
        doc.undoStack = [data.raw];
        doc.undoIndex = 0;
      }
    }
    setCurrentDocument(doc);
    await renderTextDocument(doc);
  } else {
    setCurrentDocument(null);
    const mediaHtml = data.kind === 'image'
      ? `<div class="media-frame"><div class="media-image-wrap"><img class="media-image" src="${data.mediaUrl}" alt="${escapeHtml(data.relativePath)}" /></div></div>`
      : `<div class="media-frame"><iframe class="media-pdf" src="${data.mediaUrl}"></iframe></div>`;
    viewer.className = 'viewer';
    secondaryViewer.className = 'viewer';
    outlineViewer.className = 'viewer empty-state';
    if (data.kind === 'image') setImageScale(0.6);
    viewer.innerHTML = mediaHtml;
    secondaryViewer.innerHTML = mediaHtml;
    outlineViewer.textContent = 'Outline is available for text/markdown files only.';
    renderPreviewControls(data.kind);
    setEditorMode(false);
  }

  updateSummary();
  renderBreadcrumbs();
  renderTree();
  updateUrl();
  updateNavButtons();
  loadDocsIndex().catch(() => {});
  if (!options.skipHistory) pushHistory({ root: state.currentRoot, path: filePath, mode });
}

async function renderMermaid(container = viewer) {
  const blocks = Array.from(container.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid'));
  if (!blocks.length) return;
  const mermaid = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
  mermaid.default.initialize({ startOnLoad: false, theme: 'dark' });
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const source = block.textContent;
    const id = `mermaid-${i}-${Date.now()}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid';
    try {
      const { svg } = await mermaid.default.render(id, source);
      wrapper.innerHTML = svg;
      block.parentElement.replaceWith(wrapper);
    } catch (error) {
      const pre = document.createElement('pre');
      pre.innerHTML = `<code>${escapeHtml(source)}</code>`;
      const msg = document.createElement('div');
      msg.className = 'muted';
      msg.textContent = `Mermaid render failed: ${error.message}`;
      block.parentElement.replaceWith(pre);
      pre.insertAdjacentElement('afterend', msg);
    }
  }
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString();
}

async function runSearch(options = {}) {
  state.treeFilter.query = searchInput.value.trim();
  state.treeFilter.kind = kindFilter.value;
  state.treeFilter.ageMin = normalizeRangeValue(ageMinInput?.value);
  state.treeFilter.ageMax = normalizeRangeValue(ageMaxInput?.value);
  state.treeFilter.sizeMin = normalizeRangeValue(sizeMinInput?.value);
  state.treeFilter.sizeMax = normalizeRangeValue(sizeMaxInput?.value);
  state.treeFilter.sort = sortFilter?.value || 'name';

  if (ageMinInput) ageMinInput.value = state.treeFilter.ageMin;
  if (ageMaxInput) ageMaxInput.value = state.treeFilter.ageMax;
  if (sizeMinInput) sizeMinInput.value = state.treeFilter.sizeMin;
  if (sizeMaxInput) sizeMaxInput.value = state.treeFilter.sizeMax;

  const active = isTreeFilterActive();
  if (!active) {
    state.treeFilter.matches = null;
    state.treeFilter.totalMatches = 0;
    updateFilterStatus(`No active tree filter. Sorting by ${state.treeFilter.sort}.`);
    if (!options.silent) renderTree();
    return;
  }

  const data = await fetchJson(apiUrl('search', {
    root: state.currentRoot,
    basePath: state.treePath || '',
    q: state.treeFilter.query,
    maxResults: 5000,
    kind: state.treeFilter.kind,
    ageMinDays: state.treeFilter.ageMin,
    ageMaxDays: state.treeFilter.ageMax,
    sizeMinKb: state.treeFilter.sizeMin,
    sizeMaxKb: state.treeFilter.sizeMax,
    sort: state.treeFilter.sort,
  }));

  const matches = new Set();
  for (const result of data.results) {
    const parts = result.path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      matches.add(current);
    }
  }
  state.treeFilter.matches = matches;
  state.treeFilter.totalMatches = data.results.length;

  const bits = [];
  if (state.treeFilter.query) bits.push(`name contains “${state.treeFilter.query}”`);
  if (state.treeFilter.kind !== 'all') bits.push(`kind: ${state.treeFilter.kind}`);
  if (state.treeFilter.ageMin !== '' || state.treeFilter.ageMax !== '') bits.push(`age: ${state.treeFilter.ageMin || '0'}–${state.treeFilter.ageMax || '∞'} days`);
  if (state.treeFilter.sizeMin !== '' || state.treeFilter.sizeMax !== '') bits.push(`size: ${state.treeFilter.sizeMin || '0'}–${state.treeFilter.sizeMax || '∞'} KB`);
  bits.push(`sort: ${state.treeFilter.sort}`);
  if (state.treePath) bits.push(`scope: ${state.treePath}`);
  updateFilterStatus(`${data.results.length} matching item${data.results.length === 1 ? '' : 's'} • ${bits.join(' • ')}`);
  if (!options.silent) renderTree();
}

async function openTarget(targetPath, preferredRoot = state.currentRoot, options = {}) {
  if (!targetPath) return;
  let root = preferredRoot;
  let relative = targetPath.trim();

  if (relative.startsWith('/')) {
    const inferred = inferRootFromAbsolute(relative);
    if (!inferred) throw new Error('Absolute path does not match an approved root');
    root = inferred.root;
    relative = inferred.relative;
  }

  state.currentRoot = root;
  rootSelect.value = root;

  if (!relative || !relative.includes('/')) {
    const search = relative.trim();
    if (search && !search.includes('/') && !search.startsWith('.')) {
      searchInput.value = search;
      await runSearch();
      return;
    }
  }

  const isLikelyFile = /\.[a-zA-Z0-9]{1,8}$/.test(relative);
  if (isLikelyFile) {
    const dir = relative.split('/').slice(0, -1).join('/');
    await loadTree(dir);
    await loadFile(relative, state.currentMode, options);
  } else {
    await openFolderAt(relative, options);
  }
}

function scheduleSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    runSearch().catch(showError);
  }, 180);
}

function attachResizable(handle, initialVar, min, max, direction = 'normal', storageKey) {
  if (!handle) return;

  const startResize = (startX, moveType, upType) => {
    const startValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10) || min;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    updateDebugStatus(`resize start ${initialVar}=${startValue}`);

    const onMove = (moveEvent) => {
      const currentX = moveEvent.clientX ?? moveEvent.pageX;
      const delta = currentX - startX;
      const raw = direction === 'inverse' ? startValue - delta : startValue + delta;
      const value = Math.max(min, Math.min(max, raw));
      document.documentElement.style.setProperty(initialVar, `${value}px`);
      if (storageKey) localStorage.setItem(storageKey, String(value));
      if (initialVar === '--outline-width') requestAnimationFrame(() => alignPanesFromSavedRatio());
      updateDebugStatus(`resizing ${initialVar}=${value}`);
    };

    const onUp = () => {
      window.removeEventListener(moveType, onMove);
      window.removeEventListener(upType, onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10) || startValue;
      if (initialVar === '--outline-width') requestAnimationFrame(() => alignPanesFromSavedRatio());
      updateDebugStatus(`resize end ${initialVar}=${finalValue}`);
    };

    window.addEventListener(moveType, onMove);
    window.addEventListener(upType, onUp);
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startResize(event.clientX, 'pointermove', 'pointerup');
  });
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    updateDebugStatus(`mousedown ${initialVar}`);
    startResize(event.clientX, 'mousemove', 'mouseup');
  });
}

function attachVerticalResizable(handle, initialVar, min, max, storageKey) {
  if (!handle) return;

  const startResize = (startY, moveType, upType) => {
    const startValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10) || min;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    updateDebugStatus(`resize start ${initialVar}=${startValue}`);

    const onMove = (moveEvent) => {
      const currentY = moveEvent.clientY ?? moveEvent.pageY;
      const delta = currentY - startY;
      const value = Math.max(min, Math.min(max, startValue + delta));
      document.documentElement.style.setProperty(initialVar, `${value}px`);
      if (storageKey) localStorage.setItem(storageKey, String(value));
      updateDebugStatus(`resizing ${initialVar}=${value}`);
    };

    const onUp = () => {
      window.removeEventListener(moveType, onMove);
      window.removeEventListener(upType, onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10) || startValue;
      updateDebugStatus(`resize end ${initialVar}=${finalValue}`);
    };

    window.addEventListener(moveType, onMove);
    window.addEventListener(upType, onUp);
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startResize(event.clientY, 'pointermove', 'pointerup');
  });
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    updateDebugStatus(`mousedown ${initialVar}`);
    startResize(event.clientY, 'mousemove', 'mouseup');
  });
}

function setCssSizeVar(name, value, storageKey) {
  document.documentElement.style.setProperty(name, `${value}px`);
  if (storageKey) localStorage.setItem(storageKey, String(value));
}

function setupResizablePanes() {
  const savedSidebar = localStorage.getItem('workbench.sidebarWidth');
  const savedPreview = localStorage.getItem('workbench.previewWidth');
  const savedOutline = localStorage.getItem('workbench.outlineWidth');
  const viewportWidth = window.innerWidth || 1600;
  const savedTreeHeight = localStorage.getItem('workbench.treeHeight');
  const savedAutosave = localStorage.getItem('workbench.autosave');
  if (savedSidebar) setCssSizeVar('--sidebar-width', savedSidebar, null);
  if (savedPreview) {
    const clampedPreview = Math.max(15, Math.min(Math.floor(viewportWidth * 0.8), Number(savedPreview)));
    setCssSizeVar('--preview-width', clampedPreview, null);
  }
  if (savedOutline) {
    const clampedOutline = Math.max(15, Math.min(320, Number(savedOutline)));
    setCssSizeVar('--outline-width', clampedOutline, null);
  }
  if (savedTreeHeight) setCssSizeVar('--tree-height', savedTreeHeight, null);
  state.autosave = savedAutosave === 'true';
  if (autosaveCheckbox) autosaveCheckbox.checked = state.autosave;
  attachResizable(sidebarResizer, '--sidebar-width', 260, 760, 'normal', 'workbench.sidebarWidth');
  attachResizable(previewResizer, '--preview-width', 15, Math.floor(viewportWidth * 0.8), 'inverse', 'workbench.previewWidth');
  attachResizable(outlineResizer, '--outline-width', 15, 320, 'inverse', 'workbench.outlineWidth');
  attachVerticalResizable(treeHeightResizer, '--tree-height', 160, 700, 'workbench.treeHeight');

  if (sidebarResizer) {
    sidebarResizer.ondblclick = () => {
      const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 410;
      const next = current >= 520 ? 360 : current + 80;
      setCssSizeVar('--sidebar-width', next, 'workbench.sidebarWidth');
      updateDebugStatus(`sidebar dblclick resize --sidebar-width=${next}`);
    };
    sidebarResizer.onclick = () => updateDebugStatus('sidebar resizer click detected');
  }

  if (treeHeightResizer) {
    treeHeightResizer.ondblclick = () => {
      const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tree-height'), 10) || 340;
      const next = current >= 420 ? 260 : current + 80;
      setCssSizeVar('--tree-height', next, 'workbench.treeHeight');
      updateDebugStatus(`tree dblclick resize --tree-height=${next}`);
    };
    treeHeightResizer.onclick = () => updateDebugStatus('tree resizer click detected');
  }

  if (sidebarNarrowerBtn) sidebarNarrowerBtn.onclick = () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 410;
    const next = Math.max(260, current - 40);
    setCssSizeVar('--sidebar-width', next, 'workbench.sidebarWidth');
    updateDebugStatus(`sidebar step resize --sidebar-width=${next}`);
  };
  if (sidebarWiderBtn) sidebarWiderBtn.onclick = () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 410;
    const next = Math.min(760, current + 40);
    setCssSizeVar('--sidebar-width', next, 'workbench.sidebarWidth');
    updateDebugStatus(`sidebar step resize --sidebar-width=${next}`);
  };
  if (treeSmallerBtn) treeSmallerBtn.onclick = () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tree-height'), 10) || 340;
    const next = Math.max(160, current - 40);
    setCssSizeVar('--tree-height', next, 'workbench.treeHeight');
    updateDebugStatus(`tree step resize --tree-height=${next}`);
  };
  if (treeLargerBtn) treeLargerBtn.onclick = () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tree-height'), 10) || 340;
    const next = Math.min(700, current + 40);
    setCssSizeVar('--tree-height', next, 'workbench.treeHeight');
    updateDebugStatus(`tree step resize --tree-height=${next}`);
  };
}

function parseInitialState() {
  const params = new URLSearchParams(location.search);
  state.currentRoot = params.get('root') || 'workspace';
  state.currentFolder = params.get('dir') || '';
  state.currentFile = params.get('path') || '';
  state.currentMode = params.get('mode') || 'preview';
}

async function navigateHistory(delta) {
  const nextIndex = state.historyIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.history.length) return;
  const entry = state.history[nextIndex];
  const allowed = await ensureCanLeaveCurrentDocument(entry.root, entry.path || '');
  if (!allowed) return;
  state.historyIndex = nextIndex;
  state.suppressHistory = true;
  try {
    await openTarget(entry.path, entry.root, { skipHistory: true });
  } finally {
    state.suppressHistory = false;
    updateNavButtons();
  }
}

async function navigateUp() {
  const source = state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
  if (!source) return;
  const parent = source.split('/').slice(0, -1).join('/');
  await guardedOpenFolderAt(parent);
}

async function postJson(pathname, payload) {
  const res = await fetch(apiUrl(pathname), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function saveDocument(doc = currentDoc(), options = {}) {
  if (!doc) return false;
  if (!isWritableRoot(doc.root)) throw new Error('Current root is read-only');
  if (!doc.filePath) return false;
  clearAutosaveTimer(doc);
  if (!isDocumentDirty(doc) && options.trigger !== 'manual') return true;
  setSaveState(doc, 'saving', { lastError: null });
  let data;
  try {
    data = await postJson('save', {
      root: doc.root,
      path: doc.filePath,
      content: doc.workingContent,
      expectedUpdatedAt: doc.savedUpdatedAt,
    });
  } catch (error) {
    setSaveState(doc, 'error', { lastError: error.message || String(error) });
    throw error;
  }
  doc.savedContent = doc.workingContent;
  doc.savedUpdatedAt = data.updatedAt || Date.now();
  doc.lastSavedAt = doc.savedUpdatedAt;
  doc.saveState = 'saved';
  doc.lastError = null;
  if (options.resetUndoToSaved) {
    doc.undoStack = [doc.savedContent];
    doc.undoIndex = 0;
  }
  state.documents.set(doc.key, doc);
  updateSummary();
  updateNavButtons();
  renderTree();
  loadDocsIndex().catch(() => {});
  updateDebugStatus(`file saved (${options.trigger || 'manual'})`);
  return true;
}

function revertRawFile() {
  const doc = currentDoc();
  if (!doc || state.autosave) return;
  clearAutosaveTimer(doc);
  doc.workingContent = doc.savedContent;
  doc.undoStack = [doc.savedContent];
  doc.undoIndex = 0;
  doc.saveState = 'saved';
  doc.lastError = null;
  state.documents.set(doc.key, doc);
  const rawEditor = getRawEditor();
  if (rawEditor) updateRawEditorUI(rawEditor, doc.savedContent);
  renderCurrentFile().catch(showError);
  updateSummary();
  updateNavButtons();
  renderTree();
  loadDocsIndex().catch(() => {});
  updateDebugStatus('reverted to saved');
}

async function ensureCanLeaveCurrentDocument(nextRoot = state.currentRoot, nextPath = '') {
  syncDocumentFromEditor();
  const doc = currentDoc();
  if (!doc || !isDocumentDirty(doc)) return true;
  const sameTarget = doc.root === nextRoot && doc.filePath === nextPath;
  if (sameTarget) return true;

  if (state.autosave) {
    await saveDocument(doc);
    return true;
  }

  const label = doc.filePath || '(untitled)';
  const decision = await showUnsavedModal(label);
  if (decision === 'save') {
    await saveDocument(doc);
    return true;
  }
  if (decision === 'discard') return true;
  return false;
}

async function guardedOpenFolderAt(dir = '', options = {}) {
  const allowed = await ensureCanLeaveCurrentDocument(state.currentRoot, '');
  if (!allowed) return;
  await openFolderAt(dir, options);
}

async function guardedLoadFile(filePath, mode = state.currentMode, options = {}) {
  const allowed = await ensureCanLeaveCurrentDocument(state.currentRoot, filePath);
  if (!allowed) return;
  await loadFile(filePath, mode, options);
}

async function guardedOpenTarget(targetPath, preferredRoot = state.currentRoot, options = {}) {
  let root = preferredRoot;
  let relative = targetPath?.trim?.() || '';
  if (relative.startsWith('/')) {
    const inferred = inferRootFromAbsolute(relative);
    if (!inferred) throw new Error('Absolute path does not match an approved root');
    root = inferred.root;
    relative = inferred.relative;
  }
  const allowed = await ensureCanLeaveCurrentDocument(root, /\.[a-zA-Z0-9]{1,8}$/.test(relative) ? relative : '');
  if (!allowed) return;
  await openTarget(targetPath, preferredRoot, options);
}

function findInRaw(next = true) {
  const rawEditor = getRawEditor();
  if (!rawEditor) return;
  const query = findInput.value;
  if (!query) return;
  const text = rawEditor.value;
  const start = next ? rawEditor.selectionEnd : Math.max(0, rawEditor.selectionStart - query.length - 1);
  const index = next ? text.indexOf(query, start) : text.lastIndexOf(query, start);
  if (index >= 0) {
    rawEditor.focus();
    rawEditor.setSelectionRange(index, index + query.length);
  }
}

function replaceInRaw(all = false) {
  const doc = currentDoc();
  const rawEditor = getRawEditor();
  if (!rawEditor || !doc) return;
  const query = findInput.value;
  const replacement = replaceInput.value;
  if (!query) return;
  if (all) {
    rawEditor.value = rawEditor.value.split(query).join(replacement);
  } else if (rawEditor.selectionStart !== rawEditor.selectionEnd && rawEditor.value.slice(rawEditor.selectionStart, rawEditor.selectionEnd) === query) {
    const before = rawEditor.value.slice(0, rawEditor.selectionStart);
    const after = rawEditor.value.slice(rawEditor.selectionEnd);
    const pos = rawEditor.selectionStart;
    rawEditor.value = before + replacement + after;
    rawEditor.setSelectionRange(pos, pos + replacement.length);
  }
  applyDocumentContent(doc, rawEditor.value);
  const lineNumbers = getLineNumbers();
  if (lineNumbers) lineNumbers.textContent = renderLineNumbers(rawEditor.value);
  refreshPassivePanes(doc, activeRawPane()).catch(showError);
}

async function createFolder() {
  const name = window.prompt('New folder name');
  if (!name) return;
  const dir = currentTargetDir();
  await postJson('mkdir', { root: state.currentRoot, dir, name });
  await guardedOpenFolderAt(dir || '');
}

async function createFile() {
  const name = window.prompt('New file name (.md or .txt)');
  if (!name) return;
  const dir = currentTargetDir();
  const content = /\.md$/i.test(name) ? '# New file\n' : '';
  const result = await postJson('mkfile', { root: state.currentRoot, dir, name, content });
  await guardedOpenTarget(result.path, state.currentRoot);
}

async function uploadSelectedFile(file) {
  if (!file) return;
  const dir = currentTargetDir();
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const base64 = btoa(binary);
  const result = await postJson('upload', { root: state.currentRoot, dir, name: file.name, base64 });
  await guardedOpenTarget(result.path, state.currentRoot);
}

function showError(error) {
  viewer.className = 'viewer';
  secondaryViewer.className = 'viewer';
  outlineViewer.className = 'viewer';
  const html = `<pre><code>${escapeHtml(error.message)}</code></pre>`;
  viewer.innerHTML = html;
  secondaryViewer.innerHTML = html;
  outlineViewer.innerHTML = html;
  updateDebugStatus(`error: ${error.message}`);
}

rootSelect.onchange = async () => {
  const nextRoot = rootSelect.value;
  const allowed = await ensureCanLeaveCurrentDocument(nextRoot, '');
  if (!allowed) {
    rootSelect.value = state.currentRoot;
    return;
  }
  state.currentRoot = nextRoot;
  const selected = state.roots.find((root) => root.key === nextRoot);
  if (removeRootBtn) removeRootBtn.disabled = !selected?.custom;
  state.currentFolder = '';
  state.currentFile = '';
  state.activePath = '';
  state.tree = [];
  state.treePath = '';
  state.expandedDirs = new Set(['']);
  setCurrentDocument(null);
  updateFilterStatus('No active tree filter.');
  openFolderAt('').catch(showError);
};

searchInput.addEventListener('input', () => scheduleSearch());
kindFilter.onchange = () => scheduleSearch();
if (ageMinInput) ageMinInput.addEventListener('input', () => scheduleSearch());
if (ageMaxInput) ageMaxInput.addEventListener('input', () => scheduleSearch());
if (sizeMinInput) sizeMinInput.addEventListener('input', () => scheduleSearch());
if (sizeMaxInput) sizeMaxInput.addEventListener('input', () => scheduleSearch());
if (sortFilter) sortFilter.onchange = () => scheduleSearch();
if (clearFilterBtn) clearFilterBtn.onclick = () => {
  searchInput.value = '';
  kindFilter.value = 'all';
  if (ageMinInput) ageMinInput.value = '';
  if (ageMaxInput) ageMaxInput.value = '';
  if (sizeMinInput) sizeMinInput.value = '';
  if (sizeMaxInput) sizeMaxInput.value = '';
  if (sortFilter) sortFilter.value = 'name';
  scheduleSearch();
};
openPathBtn.onclick = () => guardedOpenTarget(pathInput.value.trim(), state.currentRoot).catch(showError);
openAbsoluteBtn.onclick = () => guardedOpenTarget(absolutePathInput.value.trim()).catch(showError);
openFolderBtn.onclick = () => guardedOpenFolderAt(pathInput.value.trim()).catch(showError);
newFolderBtn.onclick = () => createFolder().catch(showError);
newFileBtn.onclick = () => createFile().catch(showError);
uploadBtn.onclick = () => uploadInput.click();
uploadInput.onchange = () => {
  const file = uploadInput.files?.[0];
  uploadSelectedFile(file).catch(showError).finally(() => { uploadInput.value = ''; });
};
dropZone.addEventListener('dragover', (event) => {
  if (!isWritableRoot()) return;
  event.preventDefault();
  dropZone.classList.add('active');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('active');
});
dropZone.addEventListener('drop', (event) => {
  dropZone.classList.remove('active');
  if (!isWritableRoot()) return;
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) uploadSelectedFile(file).catch(showError);
});
refreshTreeBtn.onclick = () => loadTree(state.currentFolder || '').catch(showError);
backBtn.onclick = () => navigateHistory(-1).catch(showError);
forwardBtn.onclick = () => navigateHistory(1).catch(showError);
upBtn.onclick = () => navigateUp().catch(showError);
pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') guardedOpenTarget(pathInput.value.trim(), state.currentRoot).catch(showError);
});
absolutePathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') guardedOpenTarget(absolutePathInput.value.trim()).catch(showError);
});

saveBtn.onclick = () => saveDocument(currentDoc(), { trigger: 'manual' }).catch(showError);
revertBtn.onclick = () => revertRawFile();
findNextBtn.onclick = () => findInRaw(true);
replaceBtn.onclick = () => replaceInRaw(false);
replaceAllBtn.onclick = () => replaceInRaw(true);
undoBtn.onclick = () => {
  const doc = currentDoc();
  if (doc) restoreUndoState(doc, -1);
};
redoBtn.onclick = () => {
  const doc = currentDoc();
  if (doc) restoreUndoState(doc, 1);
};
copyLinkBtn.onclick = async () => {
  await navigator.clipboard.writeText(location.href);
  copyLinkBtn.textContent = 'Copied';
  setTimeout(() => { copyLinkBtn.textContent = 'Copy link'; }, 1200);
};
if (addRootBtn) {
  addRootBtn.onclick = async () => {
    const targetPath = window.prompt('Add workspace root folder path');
    if (!targetPath) return;
    const key = window.prompt('Optional workspace key (leave blank to auto-generate)') || '';
    try {
      const result = await postJson('roots', { path: targetPath, key });
      await loadRoots(result.key);
      updateDebugStatus(`workspace added: ${result.key}`);
    } catch (error) {
      showError(error);
    }
  };
}
if (removeRootBtn) {
  removeRootBtn.onclick = async () => {
    const selected = state.roots.find((root) => root.key === rootSelect.value);
    if (!selected?.custom) return;
    const confirmed = window.confirm(`Remove workspace ${selected.key}?`);
    if (!confirmed) return;
    try {
      await postJson('roots/remove', { key: selected.key });
      await loadRoots('workspace');
      state.currentFolder = '';
      state.currentFile = '';
      state.activePath = '';
      state.tree = [];
      state.treePath = '';
      state.expandedDirs = new Set(['']);
      setCurrentDocument(null);
      await openFolderAt('');
      updateDebugStatus(`workspace removed: ${selected.key}`);
    } catch (error) {
      showError(error);
    }
  };
}
if (autosaveCheckbox) {
  autosaveCheckbox.addEventListener('change', () => {
    state.autosave = autosaveCheckbox.checked;
    localStorage.setItem('workbench.autosave', String(state.autosave));
    const doc = currentDoc();
    if (state.autosave) scheduleAutosave(doc);
    else clearAutosaveTimer(doc);
    updateNavButtons();
    updateSummary();
    updateDebugStatus('autosave toggled');
  });
}
if (modalStayBtn) modalStayBtn.onclick = () => closeUnsavedModal('stay');
if (modalDiscardBtn) modalDiscardBtn.onclick = () => closeUnsavedModal('discard');
if (modalSaveBtn) modalSaveBtn.onclick = () => closeUnsavedModal('save');
if (unsavedModal) {
  unsavedModal.addEventListener('click', (event) => {
    if (event.target === unsavedModal) closeUnsavedModal('stay');
  });
}
window.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    syncDocumentFromEditor();
    saveDocument(currentDoc(), { trigger: 'manual' }).catch(showError);
    return;
  }
  if (unsavedModalResolver) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeUnsavedModal('stay');
      return;
    }
    if (event.key === 'Tab') {
      const focusables = getFocusableElements();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !unsavedModalCard.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !unsavedModalCard.contains(active)) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
  }
});
window.addEventListener('resize', () => {
  requestAnimationFrame(() => alignPanesFromSavedRatio());
});

window.addEventListener('beforeunload', (event) => {
  syncDocumentFromEditor();
  const doc = currentDoc();
  if (doc && state.autosave && isDocumentDirty(doc)) {
    saveDocument(doc, { trigger: 'autosave' }).catch(() => {});
  }
  if (dirtyDocumentCount() > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

async function init() {
  parseInitialState();
  await loadWorkspaces(); // Load dynamic workspaces from Channel Manager
  await loadRoots(state.currentRoot);
  await loadDocsIndex();
  setupResizablePanes();
  updateSummary();
  renderBreadcrumbs();
  updateNavButtons();

  if (state.currentFile) {
    const dir = state.currentFile.split('/').slice(0, -1).join('/');
    ensureExpandedFor(dir);
    await loadTree(dir);
    await loadFile(state.currentFile, state.currentMode);
    return;
  }

  await openFolderAt(state.currentFolder || '');
}

init().catch(showError);
