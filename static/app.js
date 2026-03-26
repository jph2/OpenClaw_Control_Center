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
};

const ROOT_MAP = {
  workspace: '/home/claw-agentbox/.openclaw/workspace',
  openclaw: '/media/claw-agentbox/data/9999_LocalRepo/openclaw',
  'studio-framework': '/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework',
  'ui-extensions': '/media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension',
};

const rootSelect = document.getElementById('rootSelect');
const searchInput = document.getElementById('searchInput');
const kindFilter = document.getElementById('kindFilter');
const ageFilter = document.getElementById('ageFilter');
const sizeFilter = document.getElementById('sizeFilter');
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
const currentRootLabel = document.getElementById('currentRootLabel');
const currentRelativeLabel = document.getElementById('currentRelativeLabel');
const currentAbsoluteLabel = document.getElementById('currentAbsoluteLabel');
const outline = document.getElementById('outline');
const previewControls = document.getElementById('previewControls');
const rawBtn = document.getElementById('rawBtn');
const previewBtn = document.getElementById('previewBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const sidebarResizer = document.getElementById('sidebarResizer');
const outlineResizer = document.getElementById('outlineResizer');
const treeHeightResizer = document.getElementById('treeHeightResizer');

let searchDebounce = null;

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

function renderOutline(headings = []) {
  outline.innerHTML = '';
  if (!headings.length) {
    outline.innerHTML = '<li class="muted">No headings</li>';
    return;
  }
  for (const heading of headings) {
    const li = document.createElement('li');
    li.style.marginLeft = `${(heading.level - 1) * 12}px`;
    const a = document.createElement('a');
    a.href = `#${slugifyHeading(heading.text)}`;
    a.textContent = heading.text;
    li.appendChild(a);
    outline.appendChild(li);
  }
}

function renderPreviewControls(kind = 'text') {
  previewControls.innerHTML = '';
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

function updateSummary() {
  currentRootLabel.textContent = state.currentRoot || '—';
  currentRelativeLabel.textContent = currentRelativePath() || '(root)';
  currentAbsoluteLabel.textContent = currentAbsolutePath() || '—';
  pathInput.value = state.currentFile || state.currentFolder || '';
  absolutePathInput.value = currentAbsolutePath();
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
  const lines = [
    `root: ${state.currentRoot}`,
    `folder: ${state.currentFolder || '(root)'}`,
    `treePath: ${state.treePath || '(root)'}`,
    `file: ${state.currentFile || '(none)'}`,
    `treeItems: ${countTreeItems(state.tree || [])}`,
  ];
  if (extra) lines.push(`note: ${extra}`);
  debugStatus.textContent = lines.join(' | ');
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

function isWritableRoot() {
  return state.currentRoot === 'workspace' || state.currentRoot === 'studio-framework';
}

function updateNavButtons() {
  backBtn.disabled = state.historyIndex <= 0;
  forwardBtn.disabled = state.historyIndex >= state.history.length - 1;
  upBtn.disabled = !(state.currentFolder || state.currentFile);
  const writable = isWritableRoot();
  newFolderBtn.disabled = !writable;
  newFileBtn.disabled = !writable;
  uploadBtn.disabled = !writable;
  dropZone.classList.toggle('disabled', !writable);
  dropZone.textContent = writable ? 'Drop file here into current folder' : 'Drag-and-drop disabled in read-only roots';
}

function renderBreadcrumbs() {
  breadcrumbs.innerHTML = '';
  const parts = (state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder || '').split('/').filter(Boolean);
  const chain = [''];
  for (let i = 0; i < parts.length; i += 1) {
    chain.push(parts.slice(0, i + 1).join('/'));
  }
  const labels = [state.currentRoot, ...parts];
  chain.forEach((pathValue, index) => {
    const btn = document.createElement('button');
    btn.textContent = labels[index] || state.currentRoot;
    btn.onclick = () => openFolderAt(pathValue).catch(showError);
    breadcrumbs.appendChild(btn);
    if (index < chain.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '/';
      breadcrumbs.appendChild(sep);
    }
  });
}

async function loadRoots() {
  const data = await fetchJson(apiUrl('roots'));
  state.roots = data.roots;
  rootSelect.innerHTML = data.roots.map(root => `<option value="${root.key}">${root.key}</option>`).join('');
}

async function loadDocsIndex() {
  const data = await fetchJson(apiUrl('docs-index'));
  docsIndex.innerHTML = '';
  for (const doc of data.docs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'file';
    a.textContent = doc.name;
    a.onclick = async (event) => {
      event.preventDefault();
      await openTarget(doc.path, 'workspace');
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
      label.onclick = (event) => {
        if (window.getSelection && String(window.getSelection()).length > 0) return;
        openFolderAt(node.path).catch(showError);
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
      const text = document.createElement('span');
      text.className = 'tree-label-text';
      text.textContent = `📄 ${node.name}`;
      label.appendChild(text);
      label.onclick = () => {
        if (window.getSelection && String(window.getSelection()).length > 0) return;
        loadFile(node.path, state.currentMode).catch(showError);
      };
      row.appendChild(label);
      wrapper.appendChild(row);
    }

    container.appendChild(wrapper);
  }
}

function renderTree() {
  treeView.innerHTML = '';
  if (!state.tree?.length) {
    treeView.innerHTML = '<div class="muted">No files</div>';
    updateDebugStatus('tree empty after render');
    return;
  }
  renderTreeNodes(state.tree, treeView);
  updateDebugStatus();
}

async function loadTree(rootPath = '') {
  state.treePath = rootPath;
  updateDebugStatus('loading tree');
  const data = await fetchJson(apiUrl('tree', { root: state.currentRoot, path: rootPath, maxDepth: 5 }));
  state.tree = data.tree;
  renderTree();
}

function renderFolderViewMessage() {
  viewer.className = 'viewer empty-state';
  viewer.textContent = state.currentFolder ? 'Folder selected. Choose a file from the tree.' : 'Root loaded. Choose a folder or file from the tree.';
  renderOutline([]);
  renderPreviewControls('text');
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
  const data = await fetchJson(apiUrl('file', { root: state.currentRoot, path: filePath, mode }));

  if (data.kind === 'text') {
    if (mode === 'preview' && data.html) {
      viewer.className = 'viewer';
      viewer.innerHTML = `<article class="markdown-body">${data.html}</article>`;
      renderOutline(data.headings);
      await renderMermaid();
    } else {
      viewer.className = 'viewer';
      viewer.innerHTML = `<pre><code>${escapeHtml(data.raw)}</code></pre>`;
      renderOutline(data.headings || []);
    }
    renderPreviewControls('text');
  } else if (data.kind === 'image') {
    viewer.className = 'viewer';
    setImageScale(0.6);
    viewer.innerHTML = `<div class="media-frame"><div class="media-image-wrap"><img class="media-image" src="${data.mediaUrl}" alt="${escapeHtml(data.relativePath)}" /></div></div>`;
    renderOutline([]);
    renderPreviewControls('image');
  } else if (data.kind === 'pdf') {
    viewer.className = 'viewer';
    viewer.innerHTML = `<div class="media-frame"><iframe class="media-pdf" src="${data.mediaUrl}"></iframe></div>`;
    renderOutline([]);
    renderPreviewControls('pdf');
  }

  updateSummary();
  renderBreadcrumbs();
  renderTree();
  updateUrl();
  updateNavButtons();
  if (!options.skipHistory) pushHistory({ root: state.currentRoot, path: filePath, mode });
}

async function renderMermaid() {
  const blocks = Array.from(viewer.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid'));
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

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.textContent = 'Start typing to search.';
    return;
  }
  const data = await fetchJson(apiUrl('search', {
    root: state.currentRoot,
    q,
    maxResults: 30,
    kind: kindFilter.value,
    age: ageFilter.value,
    size: sizeFilter.value,
  }));
  if (!data.results.length) {
    searchResults.innerHTML = `<div>No matches for <strong>${escapeHtml(q)}</strong>.</div>`;
    return;
  }
  const ul = document.createElement('ul');
  for (const result of data.results) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.innerHTML = `${result.type === 'dir' ? '📁' : '📄'} ${escapeHtml(result.path)}<div class="search-meta">${escapeHtml(result.kind)} • ${formatBytes(result.size)} • ${formatDate(result.updatedAt)}</div>`;
    btn.onclick = async () => {
      if (result.type === 'dir') await openFolderAt(result.path);
      else await openTarget(result.path, state.currentRoot);
    };
    li.appendChild(btn);
    ul.appendChild(li);
  }
  searchResults.innerHTML = '';
  searchResults.appendChild(ul);
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
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10);
    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const raw = direction === 'inverse' ? startValue - delta : startValue + delta;
      const value = Math.max(min, Math.min(max, raw));
      document.documentElement.style.setProperty(initialVar, `${value}px`);
      if (storageKey) localStorage.setItem(storageKey, String(value));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function attachVerticalResizable(handle, initialVar, min, max, storageKey) {
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startValue = parseInt(getComputedStyle(document.documentElement).getPropertyValue(initialVar), 10);
    const onMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      const value = Math.max(min, Math.min(max, startValue + delta));
      document.documentElement.style.setProperty(initialVar, `${value}px`);
      if (storageKey) localStorage.setItem(storageKey, String(value));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setupResizablePanes() {
  const savedSidebar = localStorage.getItem('workbench.sidebarWidth');
  const savedOutline = localStorage.getItem('workbench.outlineWidth');
  const savedTreeHeight = localStorage.getItem('workbench.treeHeight');
  if (savedSidebar) document.documentElement.style.setProperty('--sidebar-width', `${savedSidebar}px`);
  if (savedOutline) document.documentElement.style.setProperty('--outline-width', `${savedOutline}px`);
  if (savedTreeHeight) document.documentElement.style.setProperty('--tree-height', `${savedTreeHeight}px`);
  attachResizable(sidebarResizer, '--sidebar-width', 260, 760, 'normal', 'workbench.sidebarWidth');
  attachResizable(outlineResizer, '--outline-width', 180, 500, 'inverse', 'workbench.outlineWidth');
  attachVerticalResizable(treeHeightResizer, '--tree-height', 160, 700, 'workbench.treeHeight');
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
  state.historyIndex = nextIndex;
  const entry = state.history[nextIndex];
  state.suppressHistory = true;
  try {
    if (entry.mode === 'folder') await openTarget(entry.path, entry.root, { skipHistory: true });
    else await openTarget(entry.path, entry.root, { skipHistory: true });
  } finally {
    state.suppressHistory = false;
    updateNavButtons();
  }
}

async function navigateUp() {
  const source = state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
  if (!source) return;
  const parent = source.split('/').slice(0, -1).join('/');
  await openFolderAt(parent);
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

async function createFolder() {
  const name = window.prompt('New folder name');
  if (!name) return;
  const dir = currentTargetDir();
  await postJson('mkdir', { root: state.currentRoot, dir, name });
  await openFolderAt(dir || '');
}

async function createFile() {
  const name = window.prompt('New file name (.md or .txt)');
  if (!name) return;
  const dir = currentTargetDir();
  const content = /\.md$/i.test(name) ? '# New file\n' : '';
  const result = await postJson('mkfile', { root: state.currentRoot, dir, name, content });
  await openTarget(result.path, state.currentRoot);
}

async function uploadSelectedFile(file) {
  if (!file) return;
  const dir = currentTargetDir();
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const result = await postJson('upload', { root: state.currentRoot, dir, name: file.name, base64 });
  await openTarget(result.path, state.currentRoot);
}

function showError(error) {
  viewer.className = 'viewer';
  viewer.innerHTML = `<pre><code>${escapeHtml(error.message)}</code></pre>`;
  updateDebugStatus(`error: ${error.message}`);
}

rootSelect.onchange = () => {
  state.currentRoot = rootSelect.value;
  state.currentFolder = '';
  state.currentFile = '';
  state.activePath = '';
  state.tree = [];
  state.treePath = '';
  state.expandedDirs = new Set(['']);
  searchResults.textContent = 'Start typing to search.';
  openFolderAt('').catch(showError);
};

searchInput.addEventListener('input', () => scheduleSearch());
kindFilter.onchange = () => scheduleSearch();
ageFilter.onchange = () => scheduleSearch();
sizeFilter.onchange = () => scheduleSearch();
openPathBtn.onclick = () => openTarget(pathInput.value.trim(), state.currentRoot).catch(showError);
openAbsoluteBtn.onclick = () => openTarget(absolutePathInput.value.trim()).catch(showError);
openFolderBtn.onclick = () => openFolderAt(pathInput.value.trim()).catch(showError);
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
  if (file) {
    uploadSelectedFile(file).catch(showError);
  }
});
refreshTreeBtn.onclick = () => loadTree(state.currentFolder || '').catch(showError);
backBtn.onclick = () => navigateHistory(-1).catch(showError);
forwardBtn.onclick = () => navigateHistory(1).catch(showError);
upBtn.onclick = () => navigateUp().catch(showError);
pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openTarget(pathInput.value.trim(), state.currentRoot).catch(showError);
});
absolutePathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openTarget(absolutePathInput.value.trim()).catch(showError);
});
rawBtn.onclick = () => { if (state.currentFile) loadFile(state.currentFile, 'raw').catch(showError); };
previewBtn.onclick = () => { if (state.currentFile) loadFile(state.currentFile, 'preview').catch(showError); };
copyLinkBtn.onclick = async () => {
  await navigator.clipboard.writeText(location.href);
  copyLinkBtn.textContent = 'Copied';
  setTimeout(() => { copyLinkBtn.textContent = 'Copy link'; }, 1200);
};

async function init() {
  parseInitialState();
  await loadRoots();
  if (!state.roots.find((r) => r.key === state.currentRoot)) {
    state.currentRoot = state.roots[0]?.key || 'workspace';
  }
  rootSelect.value = state.currentRoot;
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
