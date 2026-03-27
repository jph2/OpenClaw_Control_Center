import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4260;
app.use(express.json({ limit: '10mb' }));

const DEFAULT_ROOTS = {
  workspace: '/home/claw-agentbox/.openclaw/workspace',
  openclaw: '/media/claw-agentbox/data/9999_LocalRepo/openclaw',
  'studio-framework': '/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework',
  'ui-extensions': '/media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension',
};
const CUSTOM_ROOTS_FILE = path.join(__dirname, 'data', 'custom-roots.json');
let customRoots = {};

const WRITABLE_ROOTS = new Set(['workspace', 'studio-framework']);

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html',
  '.yml', '.yaml', '.toml', '.py', '.sh', '.env', '.gitignore', '.ini', '.cfg', '.sql'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const PDF_EXTENSIONS = new Set(['.pdf']);

const renderer = new marked.Renderer();
renderer.heading = ({ tokens, depth }) => {
  const text = tokens.map((token) => token.text || '').join('');
  const slug = text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  return `<h${depth} id="${slug}">${text}</h${depth}>`;
};

marked.setOptions({
  gfm: true,
  breaks: false,
  renderer,
});

function getRoots() {
  return { ...DEFAULT_ROOTS, ...customRoots };
}

async function loadCustomRoots() {
  try {
    const raw = await fs.readFile(CUSTOM_ROOTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    customRoots = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    customRoots = {};
  }
}

async function saveCustomRoots() {
  await fs.mkdir(path.dirname(CUSTOM_ROOTS_FILE), { recursive: true });
  await fs.writeFile(CUSTOM_ROOTS_FILE, JSON.stringify(customRoots, null, 2) + '\n', 'utf8');
}

function makeRootKeyFromPath(targetPath) {
  return path.basename(targetPath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-root';
}

function assertRoot(rootKey) {
  const rootPath = getRoots()[rootKey];
  if (!rootPath) {
    throw new Error(`Unknown root: ${rootKey}`);
  }
  return rootPath;
}

function assertWritableRoot(rootKey) {
  if (!WRITABLE_ROOTS.has(rootKey)) {
    throw new Error(`Root is read-only: ${rootKey}`);
  }
}

function validateName(name) {
  if (!name || typeof name !== 'string') throw new Error('Name is required');
  if (name.includes('/') || name.includes('\\')) throw new Error('Name must not contain path separators');
  if (name === '.' || name === '..') throw new Error('Invalid name');
  return name.trim();
}

function resolveSafe(rootKey, relativePath = '') {
  const rootPath = assertRoot(rootKey);
  const normalized = path.normalize(relativePath || '.');
  const resolved = path.resolve(rootPath, normalized);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root');
  }
  return { rootPath, resolved, relative: relative === '' ? '.' : relative };
}

function getFileKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) || path.basename(filePath).toUpperCase() === 'README' || path.basename(filePath).endsWith('.md')) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  return 'other';
}

function isTextFile(filePath) {
  return getFileKind(filePath) === 'text';
}

function extractHeadings(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
      if (!match) return null;
      return {
        level: match[1].length,
        text: match[2].trim(),
      };
    })
    .filter(Boolean);
}

async function listDirectory(rootKey, relativePath = '') {
  const { resolved, rootPath } = resolveSafe(rootKey, relativePath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const filtered = entries.filter(entry => !entry.name.startsWith('.git'));
  const items = await Promise.all(filtered.map(async (entry) => {
    const childAbsolute = path.join(resolved, entry.name);
    const childRelative = path.relative(rootPath, childAbsolute).replaceAll(path.sep, '/');
    const stat = await fs.stat(childAbsolute);
    return {
      name: entry.name,
      path: childRelative,
      type: entry.isDirectory() ? 'dir' : 'file',
      size: stat.size,
      updatedAt: stat.mtimeMs,
      kind: entry.isDirectory() ? 'dir' : getFileKind(childAbsolute),
    };
  }));

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function buildTree(rootKey, relativePath = '', depth = 0, maxDepth = 4) {
  const items = await listDirectory(rootKey, relativePath);
  if (depth >= maxDepth) {
    return items.map((item) => ({ ...item, children: item.type === 'dir' ? [] : undefined, truncated: item.type === 'dir' }));
  }

  const result = [];
  for (const item of items) {
    if (item.type === 'dir') {
      let children = [];
      try {
        children = await buildTree(rootKey, item.path, depth + 1, maxDepth);
      } catch {
        children = [];
      }
      result.push({ ...item, children });
    } else {
      result.push(item);
    }
  }
  return result;
}

function registerApiRoutes(router) {
router.get('/roots', (req, res) => {
  const roots = getRoots();
  res.json({ roots: Object.entries(roots).map(([key, value]) => ({ key, path: value, custom: !!customRoots[key] })) });
});

router.post('/roots', async (req, res) => {
  try {
    const targetPath = String(req.body.path || '').trim();
    if (!targetPath) throw new Error('Path is required');
    const resolved = path.resolve(targetPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error('Path is not a directory');
    let key = String(req.body.key || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!key) key = makeRootKeyFromPath(resolved);
    if (DEFAULT_ROOTS[key]) throw new Error('Key conflicts with built-in workspace');
    const roots = getRoots();
    let finalKey = key;
    let suffix = 2;
    while (roots[finalKey] && roots[finalKey] !== resolved) {
      finalKey = `${key}-${suffix}`;
      suffix += 1;
    }
    customRoots[finalKey] = resolved;
    await saveCustomRoots();
    res.json({ ok: true, key: finalKey, path: resolved, custom: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/roots/remove', async (req, res) => {
  try {
    const key = String(req.body.key || '').trim();
    if (!key) throw new Error('Key is required');
    if (!customRoots[key]) throw new Error('Only custom workspaces can be removed');
    delete customRoots[key];
    await saveCustomRoots();
    res.json({ ok: true, key });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const root = String(req.query.root || 'workspace');
    const relPath = String(req.query.path || '');
    const { resolved, relative, rootPath } = resolveSafe(root, relPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    const items = await listDirectory(root, relPath);
    res.json({
      root,
      absolutePath: resolved,
      relativePath: relative === '.' ? '' : relative.replaceAll(path.sep, '/'),
      rootPath,
      items,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/file', async (req, res) => {
  try {
    const root = String(req.query.root || 'workspace');
    const relPath = String(req.query.path || '');
    const mode = String(req.query.mode || 'raw');
    const { resolved, relative, rootPath } = resolveSafe(root, relPath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const kind = getFileKind(resolved);
    const ext = path.extname(resolved).toLowerCase();

    if (kind === 'text') {
      const raw = await fs.readFile(resolved, 'utf8');
      const isMarkdown = ext === '.md' || path.basename(resolved).toLowerCase().endsWith('.md');
      const html = mode === 'preview' && isMarkdown ? marked.parse(raw) : null;
      const headings = isMarkdown ? extractHeadings(raw) : [];

      return res.json({
        root,
        absolutePath: resolved,
        rootPath,
        relativePath: relative.replaceAll(path.sep, '/'),
        kind,
        raw,
        html,
        isMarkdown,
        headings,
        updatedAt: (await fs.stat(resolved)).mtimeMs,
        mode,
      });
    }

    if (kind === 'image' || kind === 'pdf') {
      return res.json({
        root,
        absolutePath: resolved,
        rootPath,
        relativePath: relative.replaceAll(path.sep, '/'),
        kind,
        mediaUrl: `/workbench/api/media?root=${encodeURIComponent(root)}&path=${encodeURIComponent(relPath)}`,
        mode: 'preview',
      });
    }

    return res.status(415).json({ error: 'Unsupported file type for current viewer' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/docs-index', async (req, res) => {
  try {
    const root = 'workspace';
    const docsDir = path.join(assertRoot(root), 'docs');
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    const docs = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const absolutePath = path.join(docsDir, entry.name);
      const stat = await fs.stat(absolutePath);
      docs.push({
        name: entry.name,
        path: `docs/${entry.name}`,
        updatedAt: stat.mtimeMs,
      });
    }
    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({ docs: docs.slice(0, 20) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/tree', async (req, res) => {
  try {
    const root = String(req.query.root || 'workspace');
    const relPath = String(req.query.path || '');
    const maxDepth = Math.max(1, Math.min(6, Number(req.query.maxDepth || 4)));
    const tree = await buildTree(root, relPath, 0, maxDepth);
    const { resolved, relative, rootPath } = resolveSafe(root, relPath);
    res.json({
      root,
      absolutePath: resolved,
      relativePath: relative === '.' ? '' : relative.replaceAll(path.sep, '/'),
      rootPath,
      tree,
      maxDepth,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const root = String(req.query.root || 'workspace');
    const basePath = String(req.query.basePath || '');
    const maxResults = Math.max(1, Math.min(5000, Number(req.query.maxResults || 200)));
    const kindFilter = String(req.query.kind || 'all');
    const ageMinDays = req.query.ageMinDays === undefined || req.query.ageMinDays === '' ? null : Number(req.query.ageMinDays);
    const ageMaxDays = req.query.ageMaxDays === undefined || req.query.ageMaxDays === '' ? null : Number(req.query.ageMaxDays);
    const sizeMinKb = req.query.sizeMinKb === undefined || req.query.sizeMinKb === '' ? null : Number(req.query.sizeMinKb);
    const sizeMaxKb = req.query.sizeMaxKb === undefined || req.query.sizeMaxKb === '' ? null : Number(req.query.sizeMaxKb);
    const sort = String(req.query.sort || 'name');
    const now = Date.now();
    const rootPath = assertRoot(root);
    const { resolved: searchBasePath } = resolveSafe(root, basePath);
    const results = [];

    function ageMatch(updatedAt) {
      const ageDays = (now - updatedAt) / 86400000;
      if (Number.isFinite(ageMinDays) && ageDays < ageMinDays) return false;
      if (Number.isFinite(ageMaxDays) && ageDays > ageMaxDays) return false;
      return true;
    }

    function sizeMatch(size) {
      const sizeKb = size / 1024;
      if (Number.isFinite(sizeMinKb) && sizeKb < sizeMinKb) return false;
      if (Number.isFinite(sizeMaxKb) && sizeKb > sizeMaxKb) return false;
      return true;
    }

    async function walk(currentPath) {
      if (results.length >= maxResults) return;
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const filtered = entries.filter((entry) => !entry.name.startsWith('.git'));
      for (const entry of filtered) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(currentPath, entry.name);
        const rel = path.relative(rootPath, fullPath).replaceAll(path.sep, '/');
        const nameLower = entry.name.toLowerCase();
        const stat = await fs.stat(fullPath);
        const resultKind = entry.isDirectory() ? 'dir' : getFileKind(fullPath);
        const normalizedKind = resultKind === 'text' || resultKind === 'image' || resultKind === 'pdf' ? resultKind : (entry.isDirectory() ? 'dir' : 'other');
        const kindOk = kindFilter === 'all' || normalizedKind === kindFilter;
        const ageOk = ageMatch(stat.mtimeMs);
        const sizeOk = sizeMatch(stat.size);

        const nameOk = !q || nameLower.includes(q);
        if (nameOk && kindOk && ageOk && sizeOk) {
          results.push({
            name: entry.name,
            path: rel,
            type: entry.isDirectory() ? 'dir' : 'file',
            kind: normalizedKind,
            size: stat.size,
            updatedAt: stat.mtimeMs,
          });
        }
        if (entry.isDirectory()) {
          await walk(fullPath);
        }
      }
    }

    await walk(searchBasePath);
    results.sort((a, b) => {
      if (sort === 'newest') return b.updatedAt - a.updatedAt || a.name.localeCompare(b.name);
      if (sort === 'oldest') return a.updatedAt - b.updatedAt || a.name.localeCompare(b.name);
      if (sort === 'largest') return b.size - a.size || a.name.localeCompare(b.name);
      if (sort === 'smallest') return a.size - b.size || a.name.localeCompare(b.name);
      const aExact = q && a.name.toLowerCase() === q ? 0 : 1;
      const bExact = q && b.name.toLowerCase() === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name);
    });
    res.json({ root, basePath, query: q, filters: { kind: kindFilter, ageMinDays, ageMaxDays, sizeMinKb, sizeMaxKb, sort }, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/media', async (req, res) => {
  try {
    const root = String(req.query.root || 'workspace');
    const relPath = String(req.query.path || '');
    const { resolved } = resolveSafe(root, relPath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return res.status(400).send('Path is not a file');
    const kind = getFileKind(resolved);
    if (kind !== 'image' && kind !== 'pdf') return res.status(415).send('Unsupported media type');
    res.sendFile(resolved);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

router.post('/mkdir', async (req, res) => {
  try {
    const root = String(req.body.root || 'workspace');
    const dir = String(req.body.dir || '');
    const name = validateName(String(req.body.name || ''));
    assertWritableRoot(root);
    const { resolved } = resolveSafe(root, dir);
    const target = path.join(resolved, name);
    await fs.mkdir(target, { recursive: false });
    res.json({ ok: true, path: path.relative(assertRoot(root), target).replaceAll(path.sep, '/') });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/mkfile', async (req, res) => {
  try {
    const root = String(req.body.root || 'workspace');
    const dir = String(req.body.dir || '');
    const name = validateName(String(req.body.name || ''));
    const content = String(req.body.content || '');
    assertWritableRoot(root);
    if (!/\.(md|txt)$/i.test(name)) throw new Error('Only .md and .txt files are allowed in step 1');
    const { resolved } = resolveSafe(root, dir);
    const target = path.join(resolved, name);
    await fs.writeFile(target, content, { flag: 'wx' });
    res.json({ ok: true, path: path.relative(assertRoot(root), target).replaceAll(path.sep, '/') });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const root = String(req.body.root || 'workspace');
    const dir = String(req.body.dir || '');
    const name = validateName(String(req.body.name || ''));
    const base64 = String(req.body.base64 || '');
    assertWritableRoot(root);
    if (!base64) throw new Error('Upload payload missing');
    const { resolved } = resolveSafe(root, dir);
    const target = path.join(resolved, name);
    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(target, buffer, { flag: 'wx' });
    res.json({ ok: true, path: path.relative(assertRoot(root), target).replaceAll(path.sep, '/') });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const root = String(req.body.root || 'workspace');
    const filePath = String(req.body.path || '');
    const content = String(req.body.content || '');
    const expectedUpdatedAt = req.body.expectedUpdatedAt === undefined || req.body.expectedUpdatedAt === null || req.body.expectedUpdatedAt === ''
      ? null
      : Number(req.body.expectedUpdatedAt);
    assertWritableRoot(root);
    const { resolved } = resolveSafe(root, filePath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error('Path is not a file');
    if (!isTextFile(resolved)) throw new Error('Only text files can be edited in raw mode');
    if (Number.isFinite(expectedUpdatedAt) && Math.abs(stat.mtimeMs - expectedUpdatedAt) > 1) {
      return res.status(409).json({
        error: 'File changed on disk since this editor loaded it',
        code: 'conflict',
        currentUpdatedAt: stat.mtimeMs,
      });
    }
    await fs.writeFile(resolved, content, 'utf8');
    const newStat = await fs.stat(resolved);
    res.json({ ok: true, path: filePath, updatedAt: newStat.mtimeMs });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
}

app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/workbench/static', express.static(path.join(__dirname, 'static')));

const apiRouter = express.Router();
registerApiRoutes(apiRouter);
app.use('/api', apiRouter);
app.use('/workbench/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get(['/workbench', '/workbench/*', '/', '/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

await loadCustomRoots();

app.listen(PORT, () => {
  console.log(`OpenClaw workbench MVP listening on http://localhost:${PORT}`);
});
