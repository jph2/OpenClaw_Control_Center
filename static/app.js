const state = {
  roots: [],
  currentRoot: 'workspace',
  currentFolder: 'docs',
  currentFile: '',
  currentMode: 'preview',
};

const rootSelect = document.getElementById('rootSelect');
const pathInput = document.getElementById('pathInput');
const openFolderBtn = document.getElementById('openFolderBtn');
const listing = document.getElementById('listing');
const viewer = document.getElementById('viewer');
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

function updateUrl() {
  const params = new URLSearchParams();
  params.set('root', state.currentRoot);
  if (state.currentFile) {
    params.set('path', state.currentFile);
    params.set('mode', state.currentMode);
  } else {
    params.set('dir', state.currentFolder);
  }
  history.replaceState({}, '', `/?${params.toString()}`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadRoots() {
  const data = await fetchJson('/api/roots');
  state.roots = data.roots;
  rootSelect.innerHTML = data.roots
    .map(root => `<option value="${root.key}">${root.key}</option>`)
    .join('');
}

async function loadFolder() {
  const dir = pathInput.value.trim();
  state.currentFolder = dir;
  state.currentFile = '';
  const query = new URLSearchParams({ root: state.currentRoot, path: dir });
  const data = await fetchJson(`/api/list?${query.toString()}`);
  relativePath.textContent = data.relativePath || '/';
  absolutePath.textContent = data.absolutePath;
  viewer.className = 'viewer empty-state';
  viewer.textContent = 'Select a file from the left.';
  listing.innerHTML = '';

  const entries = [];
  if (data.relativePath) {
    const parent = data.relativePath.split('/').slice(0, -1).join('/');
    entries.push({ name: '..', path: parent, type: 'dir' });
  }
  entries.push(...data.items);

  for (const item of entries) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.className = item.type;
    a.textContent = item.name;
    a.onclick = async (event) => {
      event.preventDefault();
      if (item.type === 'dir') {
        pathInput.value = item.path;
        await loadFolder();
      } else {
        await loadFile(item.path, state.currentMode);
      }
    };
    li.appendChild(a);
    listing.appendChild(li);
  }

  updateUrl();
}

async function loadFile(filePath, mode = state.currentMode) {
  state.currentFile = filePath;
  state.currentMode = mode;
  const query = new URLSearchParams({ root: state.currentRoot, path: filePath, mode });
  const data = await fetchJson(`/api/file?${query.toString()}`);
  relativePath.textContent = data.relativePath;
  absolutePath.textContent = data.absolutePath;

  if (mode === 'preview' && data.html) {
    viewer.className = 'viewer';
    viewer.innerHTML = `<article class="markdown-body">${data.html}</article>`;
    await renderMermaid();
  } else {
    viewer.className = 'viewer';
    viewer.innerHTML = `<pre><code>${escapeHtml(data.raw)}</code></pre>`;
  }

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
rootSelect.onchange = () => {
  state.currentRoot = rootSelect.value;
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
  rootSelect.value = state.currentRoot;
  pathInput.value = state.currentFile ? state.currentFile.split('/').slice(0, -1).join('/') : state.currentFolder;
  await loadFolder();
  if (state.currentFile) {
    await loadFile(state.currentFile, state.currentMode);
  }
}

init().catch(showError);
