#!/usr/bin/env node
/**
 * Fetches GET /api/exports/ide (fallback: /api/exports/cursor) and writes IDE workbench files under an explicit target directory.
 * Usage: node scripts/export-cursor-bundle.mjs <absolute-or-relative-target-dir>
 * Env: EXPORT_API_URL (default http://127.0.0.1:3000)
 */
import fs from 'fs/promises';
import path from 'path';

function fmLine(key, val) {
    if (typeof val === 'boolean') return `${key}: ${val}`;
    if (val === null || val === undefined) return `${key}: ""`;
    return `${key}: ${JSON.stringify(String(val))}`;
}

function buildAgentMarkdown(entry) {
    const fm = entry.suggestedFrontmatter || {};
    const lines = ['---'];
    for (const [k, v] of Object.entries(fm)) {
        lines.push(fmLine(k, v));
    }
    lines.push('---', '');
    lines.push(`# ${entry.displayName || entry.name}`, '');
    if (entry.parentEngine) {
        lines.push(`Parent engine: \`${entry.parentEngine}\``, '');
    }
    lines.push('Projection: OpenClaw `mergeIntoSynth`; Cursor `IDE Agent Profile`; Runtime Worker `no`', '');
    const skills = Array.isArray(entry.skillIds) ? entry.skillIds : [];
    lines.push('## Suggested skills', '');
    if (skills.length === 0) {
        lines.push('_(none)_', '');
    } else {
        for (const id of skills) {
            lines.push(`- \`${id}\``);
        }
        lines.push('');
    }
    return lines.join('\n');
}

async function main() {
    const rawTarget = process.argv[2];
    if (!rawTarget || rawTarget === '-h' || rawTarget === '--help') {
        console.error('Usage: node scripts/export-cursor-bundle.mjs <target-directory>');
        console.error('Requires an explicit target path. Fetches GET /api/exports/ide (EXPORT_API_URL).');
        process.exit(rawTarget ? 0 : 1);
    }

    const targetRoot = path.resolve(process.cwd(), rawTarget);
    const baseUrl = (process.env.EXPORT_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    let url = `${baseUrl}/api/exports/ide`;
    let res = await fetch(url);
    if (!res.ok) {
        url = `${baseUrl}/api/exports/cursor`;
        res = await fetch(url);
    }
    if (!res.ok) {
        console.error(`HTTP ${res.status} from ${url}`);
        process.exit(1);
    }
    const body = await res.json();
    const k = body.data?.kind;
    if (!body.ok || !body.data || (k !== 'ide_workbench_bundle' && k !== 'cursor_bundle')) {
        console.error('Unexpected response:', body);
        process.exit(1);
    }
    const data = body.data;

    await fs.mkdir(targetRoot, { recursive: true });

    const written = [];
    for (const sub of data.subagents || []) {
        const rel = sub.relativePath || `.cursor/agents/${sub.name || sub.id}.md`;
        const abs = path.join(targetRoot, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        const md = buildAgentMarkdown(sub);
        await fs.writeFile(abs, md, 'utf8');
        written.push(rel);
    }

    const enginesPath = path.join(targetRoot, '.cursor', 'channel-manager-engines.json');
    await fs.mkdir(path.dirname(enginesPath), { recursive: true });
    await fs.writeFile(enginesPath, JSON.stringify(data.engines || [], null, 2), 'utf8');
    written.push('.cursor/channel-manager-engines.json');

    const notePath = path.join(targetRoot, '.cursor', 'ide-workbench-bundle-note.txt');
    await fs.writeFile(notePath, `${data.note || ''}\n`, 'utf8');
    written.push('.cursor/ide-workbench-bundle-note.txt');

    console.log(`Wrote ${written.length} artifact(s) under ${targetRoot}:`);
    for (const w of written) console.log(`  - ${w}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
