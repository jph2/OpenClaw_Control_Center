#!/usr/bin/env node
/**
 * Apply Channel Manager IDE export (B): materialize `.cursor/agents/*.md` from
 * GET /api/exports/ide or from local channel_config.json + ideConfigBridge.
 *
 * v2: managed blocks, safe ids, fingerprint v2 (managed-region hashes).
 * Does not touch ~/.cursor — only --target (repo root).
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
    buildCanonicalSnapshot,
    buildIdeWorkbenchBundle,
    isSafeCursorAgentId
} from '../backend/services/ideConfigBridge.js';
import {
    computeIdeExportFingerprint,
    computeIdeExportFingerprintV2,
    FINGERPRINT_SCHEMA_V2,
    ideExportManagedManifestV2
} from './ideExportFingerprint.mjs';
import {
    buildRenderedAgentFiles,
    extractManagedRegion,
    extractPreservedSuffix,
    isChannelManagerIdeExportFile
} from './lib/ideAgentRenderer.mjs';

function parseArgs(argv) {
    const out = {
        dryRun: true,
        write: false,
        force: false,
        target: '',
        apiBase: '',
        config: ''
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--write') {
            out.write = true;
            out.dryRun = false;
        } else if (a === '--force') out.force = true;
        else if (a === '--target' && argv[i + 1]) out.target = argv[++i];
        else if (a === '--api-base' && argv[i + 1]) out.apiBase = argv[++i];
        else if (a === '--config' && argv[i + 1]) out.config = argv[++i];
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function defaultConfigPath() {
    const root = process.env.WORKSPACE_ROOT;
    if (!root) return '';
    return path.join(
        root,
        'OpenClaw_Control_Center',
        'Prototyp',
        'channel_CHAT-manager',
        'channel_config.json'
    );
}

async function loadBundle({ apiBase, configPath }) {
    if (apiBase) {
        const base = apiBase.replace(/\/$/, '');
        const url = `${base}/api/exports/ide`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
            throw new Error(`GET ${url} failed: HTTP ${res.status} ${await res.text()}`);
        }
        const body = await res.json();
        if (!body.ok || !body.data) {
            throw new Error(`Unexpected API response: ${JSON.stringify(body).slice(0, 500)}`);
        }
        return body.data;
    }
    const cfgResolved = configPath || defaultConfigPath();
    if (!cfgResolved) {
        throw new Error('Set WORKSPACE_ROOT or pass --config /path/to/channel_config.json or --api-base URL');
    }
    const raw = JSON.parse(await fs.readFile(cfgResolved, 'utf8'));
    const snap = buildCanonicalSnapshot(raw);
    return buildIdeWorkbenchBundle(snap);
}

function validateBundleForApply(bundle) {
    const errors = [];
    const seenIds = new Map();
    const seenRels = new Map();
    const recordUnique = (map, key, label, origin) => {
        if (!key) return;
        if (map.has(key)) {
            errors.push(`Duplicate ${label} "${key}" from ${map.get(key)} and ${origin}.`);
        } else {
            map.set(key, origin);
        }
    };
    for (const e of bundle.engines || []) {
        const id = String(e.id || '').trim();
        const origin = `engine "${id}"`;
        if (id && !isSafeCursorAgentId(id)) {
            errors.push(`Unsafe engine id "${id}" (allowed: lowercase [a-z0-9_-]).`);
        }
        recordUnique(seenIds, id, 'agent id', origin);
        recordUnique(seenRels, `.cursor/agents/${id}.md`, 'relativePath', origin);
    }
    for (const s of bundle.subagents || []) {
        const id = String(s.name || '').trim();
        const origin = `Skill Role "${id}"`;
        if (id && !isSafeCursorAgentId(id)) {
            errors.push(`Unsafe Skill Role id "${id}" (allowed: lowercase [a-z0-9_-]).`);
        }
        const rel = String(s.relativePath || `.cursor/agents/${id}.md`);
        const norm = rel.replace(/\\/g, '/');
        if (!norm.startsWith('.cursor/agents/') || norm.includes('..')) {
            errors.push(`Invalid relativePath "${rel}".`);
        }
        if (norm !== `.cursor/agents/${id}.md`) {
            errors.push(`relativePath "${rel}" must match agent id "${id}" exactly.`);
        }
        recordUnique(seenIds, id, 'agent id', origin);
        recordUnique(seenRels, norm, 'relativePath', origin);
    }
    return errors;
}

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function listOrphanCmAgentMarkdown(agentsDir, expectedRels) {
    const expected = new Set(expectedRels);
    const orphans = [];
    if (!(await pathExists(agentsDir))) return orphans;
    const names = await fs.readdir(agentsDir);
    for (const n of names) {
        if (!n.endsWith('.md')) continue;
        const rel = path.posix.join('.cursor/agents', n);
        if (expected.has(rel)) continue;
        const abs = path.join(agentsDir, n);
        let txt = '';
        try {
            txt = await fs.readFile(abs, 'utf8');
        } catch {
            continue;
        }
        if (isChannelManagerIdeExportFile(txt)) {
            orphans.push(rel);
        }
    }
    return orphans.sort();
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(`apply-ide-export.mjs — materialize CM IDE bundle under .cursor/agents/ (v2 managed blocks)

  --target <dir>     Repo root (required): writes <dir>/.cursor/agents/
  --dry-run          Print planned writes (default if --write not passed)
  --write            Write files + update cm-ide-export-fingerprint.json
  --force            Overwrite files that lack the CM marker
  --api-base <url>   e.g. http://127.0.0.1:3000 — fetch /api/exports/ide
  --config <path>    channel_config.json (else WORKSPACE_ROOT default)

Writes: Skill Role IDE profiles + main engines. Managed region: <!-- cm-managed:start --> … <!-- cm-managed:end -->
Stale check: npm run check-ide-export-stale -- --target <same-dir>

Env: WORKSPACE_ROOT — used for default --config path when --api-base is omitted
`);
        process.exit(0);
    }

    if (!args.target) {
        console.error('Error: --target <repo-root> is required.');
        process.exit(1);
    }

    const targetRoot = path.resolve(args.target);
    const bundle = await loadBundle({ apiBase: args.apiBase, configPath: args.config });

    if (bundle.kind !== 'ide_workbench_bundle' && bundle.kind !== 'cursor_bundle') {
        console.warn('Warning: bundle.kind is not ide_workbench_bundle — proceeding anyway.');
    }

    const validationErrors = validateBundleForApply(bundle);
    if (validationErrors.length) {
        console.error('Refusing to run: invalid bundle for Cursor paths.');
        for (const line of validationErrors) console.error(`  - ${line}`);
        process.exit(1);
    }

    if (Array.isArray(bundle.warnings) && bundle.warnings.length) {
        console.log('CM bundle warnings:');
        for (const w of bundle.warnings) {
            if (typeof w === 'string') console.log(`  - ${w}`);
            else console.log(`  - ${w.code}: ${JSON.stringify(w)}`);
        }
        console.log('');
    }

    const agentsDir = path.join(targetRoot, '.cursor', 'agents');
    const expectedRels = new Set();

    const preservedByRel = {};
    const tmpPlan = buildRenderedAgentFiles(bundle, { preservedByRel: {} });
    for (const f of tmpPlan) {
        expectedRels.add(f.relativePath.replace(/\\/g, '/'));
    }

    for (const f of tmpPlan) {
        const rel = f.relativePath.replace(/\\/g, '/');
        const abs = path.join(targetRoot, rel.split('/').join(path.sep));
        if (await pathExists(abs)) {
            const prev = await fs.readFile(abs, 'utf8');
            const isCm = isChannelManagerIdeExportFile(prev);
            if (isCm || args.force) {
                preservedByRel[rel] = extractPreservedSuffix(prev);
            }
        }
    }

    const filesToWrite = buildRenderedAgentFiles(bundle, { preservedByRel });
    const fpV1 = computeIdeExportFingerprint(bundle);
    const fpV2 = computeIdeExportFingerprintV2(bundle);
    const manifestV2 = ideExportManagedManifestV2(bundle);

    const orphans = await listOrphanCmAgentMarkdown(agentsDir, expectedRels);

    if (args.dryRun || !args.write) {
        const subs = filesToWrite.filter((p) => p.kind === 'subagent').length;
        const eng = filesToWrite.filter((p) => p.kind === 'engine').length;
        console.log(`Dry run: ${filesToWrite.length} file(s) (${subs} Skill Role IDE profiles, ${eng} engines) → ${agentsDir}`);
        console.log(`Fingerprint v1 (bundle payload): ${fpV1}`);
        console.log(`Fingerprint v2 (managed regions): ${fpV2}`);
        if (orphans.length) {
            console.log('\nOrphan CM-managed .md files (not in current bundle):');
            for (const o of orphans) console.log(`  - ${o}`);
        }
        for (const p of filesToWrite) {
            const rel = p.relativePath.replace(/\\/g, '/');
            const abs = path.join(targetRoot, rel.split('/').join(path.sep));
            let note = (await pathExists(abs)) ? '(exists)' : '(new)';
            if (await pathExists(abs)) {
                const prev = await fs.readFile(abs, 'utf8');
                if (!isChannelManagerIdeExportFile(prev) && !args.force) {
                    note += ' SKIP (no CM marker; use --force)';
                }
            }
            console.log(`  [${p.kind}] ${rel} ${note}`);
        }
        console.log('\nPass --write to apply.');
        process.exit(0);
    }

    await fs.mkdir(agentsDir, { recursive: true });
    let written = 0;
    let skipped = 0;

    const writtenManifest = [];

    for (const p of filesToWrite) {
        const rel = p.relativePath.replace(/\\/g, '/');
        const abs = path.join(targetRoot, rel.split('/').join(path.sep));
        if (await pathExists(abs)) {
            const prev = await fs.readFile(abs, 'utf8');
            if (!isChannelManagerIdeExportFile(prev) && !args.force) {
                console.warn(`Skip (no CM marker): ${rel}`);
                skipped++;
                continue;
            }
        }
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, p.content, 'utf8');
        console.log(`Wrote ${rel}`);
        written++;
        const disk = await fs.readFile(abs, 'utf8');
        const managed = extractManagedRegion(disk);
        const sha = crypto.createHash('sha256').update(managed ?? disk, 'utf8').digest('hex');
        writtenManifest.push({ rel, sha256: sha });
    }

    writtenManifest.sort((a, b) => a.rel.localeCompare(b.rel));

    const fpPath = path.join(targetRoot, '.cursor', 'cm-ide-export-fingerprint.json');
    await fs.mkdir(path.dirname(fpPath), { recursive: true });
    await fs.writeFile(
        fpPath,
        `${JSON.stringify(
            {
                schema: FINGERPRINT_SCHEMA_V2,
                fingerprint: fpV2,
                fingerprintV1: fpV1,
                bundleSchemaVersion: bundle.bundleSchemaVersion ?? null,
                generatedAt: new Date().toISOString(),
                managedManifest: writtenManifest.length ? writtenManifest : manifestV2,
                counts: {
                    files: filesToWrite.length,
                    written,
                    skipped
                },
                orphansDetected: orphans
            },
            null,
            2
        )}\n`,
        'utf8'
    );
    console.log(`Wrote .cursor/cm-ide-export-fingerprint.json`);

    console.log(`\nDone. Written: ${written}, skipped: ${skipped}`);
    if (orphans.length) {
        console.log(
            '\nNote: orphan CM-managed agent files remain (not removed automatically). See dry-run list.'
        );
    }
    if (skipped > 0) {
        console.log('Use --force to replace files without the CM marker.');
    }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch((e) => {
        console.error(e.message || e);
        process.exit(1);
    });
}
