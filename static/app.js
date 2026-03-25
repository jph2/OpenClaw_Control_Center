const state = {
  roots: [],
  currentRoot: 'workspace',
  currentFolder: 'docs',
  currentFile: '',
  currentMode: 'preview',
  treePath: '',
  expandedDirs: new Set(['']),
  activePath: '',
  tree: [],
  imageScale: 1,
};

const ROOT_MAP = {
  workspace: '/home/claw-agentbox/.openclaw/workspace',
  openclaw: '/media/claw-agentbox/data/9999_LocalRepo/openclaw',
  'studio-framework': '/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework',
  'ui-extensions': '/media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension',
};

const rootSelect = document.getElementById('rootSelect');
const pathInput = document.getElementById('pathInput');
const absolutePathInput = document.getElementById('absolutePathInput');
const openPathBtn = document.getElementById('openPathBtn');
const openAbsoluteBtn = document.getElementById('openAbsoluteBtn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const kindFilter = document.getElementById('kindFilter');
const ageFilter = document.getElementById('ageFilter');
const sizeFilter = document.getElementById('sizeFilter');
const searchResults = document.getElementById('searchResults');
const openFolderBtn = document.getElementById('openFolderBtn');
const refreshTreeBtn = document.getElementById('refreshTreeBtn');
const treeView = document.getElementById('treeView');
const docsIndex = document.getElementById('docsIndex');
const viewer = document.getElementById('viewer');
const outline = document.getElementById('outline');
const previewControls = document.getElementById('previewControls');
const rawBtn = document.getElementById('rawBtn');
const previewBtn = document.getElementById('previewBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const relativePathDisplay = document.getElementById('relativePathDisplay');
const absolutePathDisplay = document.getElementById('absolutePathDisplay');
const sidebarResizer = document.getElementById('sidebarResizer');
const outlineResizer = document.getElementById('outlineResizer');
const treeHeightResizer = document.getElementById('treeHeightResizer');

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

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadRoots() {
  const data = await fetchJson(apiUrl('roots'));
  state.roots = data.roots;
  rootSelect.innerHTML = data.roots.map(root => `<option value="${root.key}">${root.key}</option>`).join('');
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

function setPathDisplays(relativePath = '', absolutePath = '') {
  relativePathDisplay.value = relativePath;
  absolutePathDisplay.value = absolutePath;
  pathInput.value = relativePath;
  absolutePathInput.value = absolutePath;
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

async function openTarget(targetPath, preferredRoot = state.currentRoot) {
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
    state.currentFolder = dir;
    state.activePath = relative;
    ensureExpandedFor(dir);
    await loadTree(dir);
    await loadFile(relative, state.currentMode);
  } else {
    state.currentFolder = relative;
    state.currentFile = '';
    state.activePath = relative;
    ensureExpandedFor(relative);
    pathInput.value = relative;
    await loadFolder();
  }
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
      toggle.onclick = async () => {
        if (isExpanded) state.expandedDirs.delete(node.path);
        else state.expandedDirs.add(node.path);
        renderTree();
      };
      row.appendChild(toggle);

      const label = document.createElement('button');
      label.className = `tree-label ${state.activePath === node.path ? 'active' : ''}`;
      label.textContent = `📁 ${node.name}`;
      label.onclick = async () => {
        state.currentFolder = node.path;
        state.currentFile = '';
        state.activePath = node.path;
        ensureExpandedFor(node.path);
        await loadTree(node.path);
        renderTree();
        viewer.className = 'viewer empty-state';
        viewer.textContent = 'Folder selected. Choose a file from the tree.';
        renderOutline([]);
        renderPreviewControls('text');
        setPathDisplays(node.path, `${ROOT_MAP[state.currentRoot]}/${node.path}`.replace(/\/$/, ''));
        updateUrl();
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
      label.textContent = `📄 ${node.name}`;
      label.onclick = async () => { await loadFile(node.path, state.currentMode); };
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
    return;
  }
  renderTreeNodes(state.tree, treeView);
}

async function loadTree(rootPath = '') {
  state.treePath = rootPath;
  const data = await fetchJson(apiUrl('tree', { root: state.currentRoot, path: rootPath, maxDepth: 5 }));
  state.tree = data.tree;
  renderTree();
}

async function loadFolder() {
  const dir = pathInput.value.trim();
  state.currentFolder = dir;
  state.currentFile = '';
  state.activePath = dir;
  ensureExpandedFor(dir);
  viewer.className = 'viewer empty-state';
  viewer.textContent = 'Folder selected. Choose a file from the tree.';
  renderOutline([]);
  renderPreviewControls('text');
  await loadTree(dir);
  const abs = dir ? `${ROOT_MAP[state.currentRoot]}/${dir}` : ROOT_MAP[state.currentRoot];
  setPathDisplays(dir || '', abs);
  updateUrl();
}

async function loadFile(filePath, mode = state.currentMode) {
  state.currentFile = filePath;
  state.currentMode = mode;
  state.activePath = filePath;
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
    viewer.innerHTML = `
      <div class="media-frame">
        <div class="media-image-wrap">
          <img class="media-image" src="${data.mediaUrl}" alt="${escapeHtml(data.relativePath)}" />
        </div>
      </div>`;
    renderOutline([]);
    renderPreviewControls('image');
  } else if (data.kind === 'pdf') {
    viewer.className = 'viewer';
    viewer.innerHTML = `<div class="media-frame"><iframe class="media-pdf" src="${data.mediaUrl}"></iframe></div>`;
    renderOutline([]);
    renderPreviewControls('pdf');
  }

  setPathDisplays(data.relativePath, data.absolutePath);
  renderTree();
  updateUrl();
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

let searchDebounce = null;

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
    btn.onclick = async () => { await openTarget(result.path, state.currentRoot); };
    li.appendChild(btn);
    ul.appendChild(li);
  }
  searchResults.innerHTML = '';
  searchResults.appendChild(ul);
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
  attachResizable(sidebarResizer, '--sidebar-width', 260, 720, 'normal', 'workbench.sidebarWidth');
  attachResizable(outlineResizer, '--outline-width', 180, 500, 'inverse', 'workbench.outlineWidth');
  attachVerticalResizable(treeHeightResizer, '--tree-height', 160, 700, 'workbench.treeHeight');
}

function parseInitialState() {
  const params = new URLSearchParams(location.search);
  state.currentRoot = params.get('root') || 'workspace';
  state.currentFolder = params.get('dir') || 'docs';
  state.currentFile = params.get('path') || '';
  state.currentMode = params.get('mode') || 'preview';
}

openFolderBtn.onclick = () => loadFolder().catch(showError);
refreshTreeBtn.onclick = () => loadTree(pathInput.value.trim()).catch(showError);
openPathBtn.onclick = () => openTarget(pathInput.value.trim(), state.currentRoot).catch(showError);
openAbsoluteBtn.onclick = () => openTarget(absolutePathInput.value.trim()).catch(showError);
function scheduleSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    runSearch().catch(showError);
  }, 180);
}

searchBtn.onclick = () => runSearch().catch(showError);
searchInput.addEventListener('input', () => scheduleSearch());
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') runSearch().catch(showError); });
kindFilter.onchange = () => scheduleSearch();
ageFilter.onchange = () => scheduleSearch();
sizeFilter.onchange = () => scheduleSearch();
relativePathDisplay.addEventListener('keydown', (event) => { if (event.key === 'Enter') openTarget(relativePathDisplay.value.trim(), state.currentRoot).catch(showError); });
absolutePathDisplay.addEventListener('keydown', (event) => { if (event.key === 'Enter') openTarget(absolutePathDisplay.value.trim()).catch(showError); });
rootSelect.onchange = () => {
  state.currentRoot = rootSelect.value;
  state.currentFolder = '';
  state.currentFile = '';
  state.activePath = '';
  state.expandedDirs = new Set(['']);
  pathInput.value = '';
  absolutePathInput.value = ROOT_MAP[state.currentRoot];
  loadFolder().catch(showError);
};
rawBtn.onclick = () => { if (state.currentFile) loadFile(state.currentFile, 'raw').catch(showError); };
previewBtn.onclick = () => { if (state.currentFile) loadFile(state.currentFile, 'preview').catch(showError); };
copyLinkBtn.onclick = async () => {
  await navigator.clipboard.writeText(location.href);
  copyLinkBtn.textContent = 'Copied';
  setTimeout(() => { copyLinkBtn.textContent = 'Copy link'; }, 1200);
};

function showError(error) {
  viewer.className = 'viewer';
  viewer.innerHTML = `<pre><code>${escapeHtml(error.message)}</code></pre>`;
}

async function init() {
  parseInitialState();
  await loadRoots();
  await loadDocsIndex();
  setupResizablePanes();
  rootSelect.value = state.currentRoot;
  if (state.currentFolder) ensureExpandedFor(state.currentFolder);
  pathInput.value = state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
  absolutePathInput.value = ROOT_MAP[state.currentRoot];
  await loadFolder();
  if (state.currentFile) {
    const dir = state.currentFile.split('/').slice(0, -1).join('/');
    ensureExpandedFor(dir);
    await loadTree(dir);
    await loadFile(state.currentFile, state.currentMode);
  }
}

init().catch(showError);
