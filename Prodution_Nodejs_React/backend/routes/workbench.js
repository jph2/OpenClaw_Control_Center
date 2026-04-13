import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import multer from 'multer';
import { resolveSafe } from '../utils/security.js';
import { apiLimiter, fsHeavyLimiter } from '../utils/rateLimiter.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * G4 Security Fix-Gate: Validation Schemas
 */
const ListDirectorySchema = z.object({
    path: z.string().optional().default('')
});

const FileQuerySchema = z.object({
    path: z.string().min(1)
});

const WriteFileSchema = z.object({
    path: z.string().min(1),
    content: z.string()
});

/**
 * Utility: File kind determination
 */
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.css', '.html', '.yml', '.yaml', '.sh', '.env', '.gitignore', '.csv', '.xml']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function getFileKind(filePath) {
    const filename = path.basename(filePath).toLowerCase();
    if (filename === '.env' || filename.startsWith('.env.')) return 'text';
    
    const ext = path.extname(filePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    return 'other';
}

/**
 * GET /api/workbench/list
 * Lists directory contents tightly controlled by G1 resolveSafe.
 */
router.get('/list', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = ListDirectorySchema.parse(req.query);
        const { resolved, relative } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        
        let stat;
        try {
            stat = await fs.stat(resolved);
        } catch (err) {
            return res.status(403).json({ error: true, message: 'Permission denied or path does not exist.' });
        }
        
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: true, message: 'Target is not a directory.' });
        }

        let entries = [];
        try {
            entries = await fs.readdir(resolved, { withFileTypes: true });
        } catch (err) {
            return res.status(403).json({ error: true, message: 'Permission denied reading directory contents.' });
        }
        
        // Hide .git and node_modules folders securely
        const filtered = entries.filter(entry => !entry.name.startsWith('.git') && entry.name !== 'node_modules');
        
        const items = [];
        await Promise.all(filtered.map(async (entry) => {
            const childAbsolute = path.join(resolved, entry.name);
            try {
                const childStat = await fs.stat(childAbsolute);
                items.push({
                    name: entry.name,
                    type: entry.isDirectory() ? 'dir' : 'file',
                    kind: entry.isDirectory() ? 'dir' : getFileKind(childAbsolute),
                    size: childStat.size,
                    updatedAt: childStat.mtimeMs
                });
            } catch (err) {
                // Ignore unreadable entries
            }
        }));

        res.json({
            ok: true,
            relativePath: relative === '.' ? '' : relative,
            items: items.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name);
            })
        });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * GET /api/workbench/tree
 * High-cost recursive file scan function protected by G2 Heavy Rate Limiter.
 */
router.get('/tree', fsHeavyLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = ListDirectorySchema.parse(req.query);
        const { resolved, relative } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        
        const maxDepth = 8; // Safely increased to support deeper project structures.

        async function buildTree(currentPath, currentDepth) {
            if (currentDepth > maxDepth) return [];
            
            let entries = [];
            try {
                entries = await fs.readdir(currentPath, { withFileTypes: true });
            } catch (err) {
                console.error(`[WARN] Skipping unreadable directory ${currentPath}:`, err.message);
                return [];
            }
            
            const filtered = entries.filter(e => !e.name.startsWith('.git') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build' && !e.isSymbolicLink());
            
            const rawResult = await Promise.all(filtered.map(async (entry) => {
                const childPath = path.join(currentPath, entry.name);
                try {
                    const stat = await fs.stat(childPath);
                    const item = {
                        name: entry.name,
                        type: entry.isDirectory() ? 'dir' : 'file',
                        path: childPath,
                        size: stat.size,
                        updatedAt: stat.mtimeMs
                    };

                    if (entry.isDirectory()) {
                        item.children = await buildTree(childPath, currentDepth + 1);
                    } else {
                        item.kind = getFileKind(childPath);
                    }
                    return item;
                } catch (err) {
                    return null; // Skip unreadable files
                }
            }));
            
            const result = rawResult.filter(Boolean);
            return result.sort((a, b) => a.type === 'dir' && b.type !== 'dir' ? -1 : 1);
        }

        const tree = await buildTree(resolved, 0);
        res.json({ ok: true, relativePath: relative === '.' ? '' : relative, tree });
        
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * GET /api/workbench/file
 * Reads a single file safely.
 */
router.get('/file', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = FileQuerySchema.parse(req.query);
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) return res.status(400).json({ error: true, message: 'Not a file' });

        const kind = getFileKind(resolved);
        if (kind === 'text') {
            const raw = await fs.readFile(resolved, 'utf8');
            res.json({ ok: true, raw, kind, updatedAt: stat.mtimeMs });
        } else {
            // Usually we stream images differently, but for now we just acknowledge it
            res.status(415).json({ error: true, message: 'Binary files not supported in raw text output.' });
        }
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

/**
 * POST /api/workbench/save
 * Safely writes file contents.
 */
router.post('/save', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath, content } = WriteFileSchema.parse(req.body);
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        
        await fs.writeFile(resolved, content, 'utf8');
        res.json({ ok: true, message: 'File saved successfully.' });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

const FsActionSchema = z.object({
    path: z.string().min(1),
    dest: z.string().optional()
});

router.post('/mkdir', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = FsActionSchema.parse(req.body);
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        await fs.mkdir(resolved, { recursive: true });
        res.json({ ok: true, message: 'Directory created' });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

router.post('/touch', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = FsActionSchema.parse(req.body);
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        await fs.writeFile(resolved, '');
        res.json({ ok: true, message: 'File created' });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

router.post('/delete', apiLimiter, async (req, res, next) => {
    try {
        const { path: relPath } = FsActionSchema.parse(req.body);
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        await fs.rm(resolved, { recursive: true, force: true });
        res.json({ ok: true, message: 'Deleted successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

router.post('/duplicate', apiLimiter, async (req, res, next) => {
    try {
        const { path: srcPath, dest: destPath } = FsActionSchema.parse(req.body);
        const { resolved: srcResolved } = await resolveSafe(process.env.WORKSPACE_ROOT, srcPath);
        const { resolved: destResolved } = await resolveSafe(process.env.WORKSPACE_ROOT, destPath);
        await fs.cp(srcResolved, destResolved, { recursive: true });
        res.json({ ok: true, message: 'Duplicated successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) error.status = 400;
        next(error);
    }
});

router.post('/upload', apiLimiter, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw new Error('No file uploaded');
        const relPath = req.body.path || req.file.originalname;
        const { resolved } = await resolveSafe(process.env.WORKSPACE_ROOT, relPath);
        await fs.writeFile(resolved, req.file.buffer);
        res.json({ ok: true, message: 'File uploaded' });
    } catch (error) {
        next(error);
    }
});

export default router;
