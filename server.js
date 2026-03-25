import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4260;

const ROOTS = {
  workspace: '/home/claw-agentbox/.openclaw/workspace',
  openclaw: '/media/claw-agentbox/data/9999_LocalRepo/openclaw',
  'studio-framework': '/media/claw-agentbox/data/9999_LocalRepo/Studio_Framework',
  'ui-extensions': '/media/claw-agentbox/data/9999_LocalRepo/Openclaw-OpenUSDGoodtstart-Extension',
};

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html',
  '.yml', '.yaml', '.toml', '.py', '.sh', '.env', '.gitignore', '.ini', '.cfg', '.sql'
]);

marked.setOptions({
  gfm: true,
  breaks: false,
});

function assertRoot(rootKey) {
  const rootPath = ROOTS[rootKey];
  if (!rootPath) {
    throw new Error(`Unknown root: ${rootKey}`);
  }
  return rootPath;
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

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return path.basename(filePath).toUpperCase() === 'README' || path.basename(filePath).endsWith('.md');
}

async function listDirectory(rootKey, relativePath = '') {
  const { resolved, rootPath } = resolveSafe(rootKey, relativePath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const items = entries
    .filter(entry => !entry.name.startsWith('.git'))
    .map(entry => {
      const childAbsolute = path.join(resolved, entry.name);
      const childRelative = path.relative(rootPath, childAbsolute).replaceAll(path.sep, '/');
      return {
        name: entry.name,
        path: childRelative,
        type: entry.isDirectory() ? 'dir' : 'file',
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return items;
}

app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/api/roots', (req, res) => {
  res.json({ roots: Object.entries(ROOTS).map(([key, value]) => ({ key, path: value })) });
});

app.get('/api/list', async (req, res) => {
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

app.get('/api/file', async (req, res) => {
  try {
    const root = String(req.query.root || 'workspace');
    const relPath = String(req.query.path || '');
    const mode = String(req.query.mode || 'raw');
    const { resolved, relative, rootPath } = resolveSafe(root, relPath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }
    if (!isTextFile(resolved)) {
      return res.status(415).json({ error: 'Unsupported file type for MVP' });
    }
    const raw = await fs.readFile(resolved, 'utf8');
    const ext = path.extname(resolved).toLowerCase();
    const isMarkdown = ext === '.md' || path.basename(resolved).toLowerCase().endsWith('.md');
    const html = mode === 'preview' && isMarkdown ? marked.parse(raw) : null;

    res.json({
      root,
      absolutePath: resolved,
      rootPath,
      relativePath: relative.replaceAll(path.sep, '/'),
      raw,
      html,
      isMarkdown,
      mode,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OpenClaw workbench MVP listening on http://localhost:${PORT}`);
});
