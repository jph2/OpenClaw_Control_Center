const state = {
  roots: [],
  currentRoot: 'workspace',
  currentFolder: 'docs',
  currentFile: '',
  currentMode: 'preview',
  treePath: '',
  expandedDirs: new Set(['']),
  activePath: '',
};

const rootSelect = document.getElementById('rootSelect');
const pathInput = document.getElementById('pathInput');
const openFolderBtn = document.getElementById('openFolderBtn');
const refreshTreeBtn = document.getElementById('refreshTreeBtn');
const treeView = document.getElementById('treeView');
const docsIndex = document.getElementById('docsIndex');
const viewer = document.getElementById('viewer');
const outline = document.getElementById('outline');
const rawBtn = document.getElementById('rawBtn');
const previewBtn = document.getElementById('previewBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const relativePath = document.getElementById('relativePath');
const absolutePath = document.getElementById('absolutePath');

function escapeHtml(input) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function appBase() {
  const path = window.location.pathname || '/';
  return path.endsWith('/') ? path.slice(0, -1) || '/' : path;
}

function apiUrl(pathname, params) {
  const url = new URL(`${appBase()}/api/${pathname}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
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
  const base = appBase();
  history.replaceState({}, '', `${base}/?${params.toString()}`);
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
  rootSelect.innerHTML = data.roots
    .map(root => `<option value="${root.key}">${root.key}</option>`)
    .join('');
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-');
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
    const slug = slugifyHeading(heading.text);
    a.href = `#${slug}`;
    a.textContent = heading.text;
    li.appendChild(a);
    outline.appendChild(li);
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
      state.currentRoot = 'workspace';
      rootSelect.value = 'workspace';
      pathInput.value = 'docs';
      state.expandedDirs.add('docs');
      await loadTree('docs');
      await loadFile(doc.path, 'preview');
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
        state.activePath = node.path;
        pathInput.value = node.path;
        state.expandedDirs.add(node.path);
        relativePath.textContent = node.path || '/';
        await loadTree(node.path);
        renderTree();
        viewer.className = 'viewer empty-state';
        viewer.textContent = 'Folder selected. Choose a file from the tree.';
        outline.innerHTML = '<li class="muted">No headings</li>';
        updateUrl();
      };
      row.appendChild(label);
      wrapper.appendChild(row);

      if (isExpanded) {
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'tree-children';
        if (node.children?.length) {
          renderTreeNodes(node.children, childrenWrap);
        } else if (node.truncated) {
          childrenWrap.innerHTML = '<div class="muted small">Depth limit reached</div>';
        } else {
          childrenWrap.innerHTML = '<div class="muted small">Empty</div>';
        }
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
      label.onclick = async () => {
        await loadFile(node.path, state.currentMode);
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
  relativePath.textContent = dir || '/';
  absolutePath.textContent = '—';
  viewer.className = 'viewer empty-state';
  viewer.textContent = 'Folder selected. Choose a file from the tree.';
  outline.innerHTML = '<li class="muted">No headings</li>';
  state.expandedDirs.add('');
  if (dir) {
    const parts = dir.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      state.expandedDirs.add(parts.slice(0, i + 1).join('/'));
    }
  }
  await loadTree(dir);
  updateUrl();
}

async function loadFile(filePath, mode = state.currentMode) {
  state.currentFile = filePath;
  state.currentMode = mode;
  state.activePath = filePath;
  const data = await fetchJson(apiUrl('file', { root: state.currentRoot, path: filePath, mode }));
  relativePath.textContent = data.relativePath;
  absolutePath.textContent = data.absolutePath;

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

function parseInitialState() {
  const params = new URLSearchParams(location.search);
  state.currentRoot = params.get('root') || 'workspace';
  state.currentFolder = params.get('dir') || 'docs';
  state.currentFile = params.get('path') || '';
  state.currentMode = params.get('mode') || 'preview';
}

openFolderBtn.onclick = () => loadFolder().catch(showError);
refreshTreeBtn.onclick = () => loadTree(pathInput.value.trim()).catch(showError);
rootSelect.onchange = () => {
  state.currentRoot = rootSelect.value;
  state.currentFolder = '';
  state.currentFile = '';
  state.activePath = '';
  state.expandedDirs = new Set(['']);
  pathInput.value = '';
  loadFolder().catch(showError);
};
rawBtn.onclick = () => {
  if (state.currentFile) loadFile(state.currentFile, 'raw').catch(showError);
};
previewBtn.onclick = () => {
  if (state.currentFile) loadFile(state.currentFile, 'preview').catch(showError);
};
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
  rootSelect.value = state.currentRoot;
  pathInput.value = state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
  if (state.currentFolder) {
    const parts = state.currentFolder.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      state.expandedDirs.add(current);
    }
  }
  await loadFolder();
  if (state.currentFile) {
    const dir = state.currentFile.split('/').slice(0, -1).join('/');
    const parts = dir.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      state.expandedDirs.add(current);
    }
    await loadTree(dir);
    await loadFile(state.currentFile, state.currentMode);
  }
}

init().catch(showError);
