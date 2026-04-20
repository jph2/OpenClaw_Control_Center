#!/usr/bin/env node
/**
 * cm-unpin-synth-session-auth — strip session-level auth profile pins on
 * CM synth agents (e.g. tars-1003635291803) so the next turn re-resolves
 * the provider from agents.list[].model.primary (e.g. openai/gpt-4o).
 *
 * Symptom (observed 2026-04-20 on TG510 / TG800):
 *   sessions.json carries authProfileOverride: "moonshot:default" with
 *   authProfileOverrideSource: "auto". The gateway then runs Kimi; assistant
 *   bubbles show the literal text NO_REPLY from Telegram and OC Web.
 *   TTG000 kept authProfileOverride: "openai:default" and behaved normally.
 *
 * This does NOT delete the session or transcript — only removes:
 *   authProfileOverride, authProfileOverrideSource, authProfileOverrideCompactionCount
 * from matching session keys in the synth agent's sessions.json.
 *
 * Usage:
 *   node scripts/cm-unpin-synth-session-auth.mjs -1003635291803 [-1003773208676]
 *   node scripts/cm-unpin-synth-session-auth.mjs --dry-run -1003635291803
 *   CM_RESTART_GATEWAY=1 node scripts/cm-unpin-synth-session-auth.mjs -1003635291803
 *
 * For stale agent:main:telegram:group:<id> rows, use cm-release-telegram-session instead.
 */
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

const AUTH_KEYS = [
    'authProfileOverride',
    'authProfileOverrideSource',
    'authProfileOverrideCompactionCount'
];

function groupIdSlug(id) {
    return String(id ?? '')
        .replace(/^-/, '')
        .slice(0, 16);
}

function synthAgentId(groupId) {
    return `tars-${groupIdSlug(groupId)}`;
}

function normalizeGid(g) {
    const s = String(g).trim();
    if (!s) return s;
    if (s.startsWith('-')) return s;
    if (/^\d+$/.test(s)) return `-${s}`;
    return s;
}

function unpinFile(sessionsFile, gid, dryRun) {
    if (!fs.existsSync(sessionsFile)) {
        console.error(`SKIP: no file ${sessionsFile}`);
        return 0;
    }
    const raw = fs.readFileSync(sessionsFile, 'utf8');
    const j = JSON.parse(raw);
    let stripped = 0;
    for (const [key, entry] of Object.entries(j)) {
        if (!entry || typeof entry !== 'object') continue;
        if (!key.includes('telegram:group') || !key.includes(gid)) continue;
        let touched = false;
        for (const k of AUTH_KEYS) {
            if (k in entry) {
                delete entry[k];
                touched = true;
            }
        }
        if (touched) {
            stripped++;
            console.log(`  stripped auth pin: ${key}`);
        }
    }
    if (stripped === 0) {
        console.log(`  (no ${AUTH_KEYS.join('/')} on matching keys) ${sessionsFile}`);
        return 0;
    }
    if (dryRun) {
        console.log(`  DRY RUN — would write ${sessionsFile}`);
        return stripped;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${sessionsFile}.backup-authunpin-${ts}`;
    fs.copyFileSync(sessionsFile, backup);
    fs.writeFileSync(sessionsFile, `${JSON.stringify(j, null, 2)}\n`, { mode: 0o600 });
    console.log(`  wrote ${sessionsFile}`);
    console.log(`  backup ${backup}`);
    return stripped;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const gids = args.filter((a) => !a.startsWith('--'));

if (gids.length === 0) {
    console.error(
        'Usage: node cm-unpin-synth-session-auth.mjs [--dry-run] <telegramGroupId> [moreIds...]\n' +
            'Example: node cm-unpin-synth-session-auth.mjs -1003635291803 -1003773208676'
    );
    process.exit(1);
}

let total = 0;
for (const g of gids) {
    const gid = normalizeGid(g);
    const agentId = synthAgentId(gid);
    const sessionsFile = path.join(homedir(), '.openclaw', 'agents', agentId, 'sessions', 'sessions.json');
    console.log(`Group ${gid} → ${agentId}`);
    total += unpinFile(sessionsFile, gid, dryRun);
}

if (!dryRun && total > 0 && ['1', 'true', 'yes'].includes(String(process.env.CM_RESTART_GATEWAY || '').toLowerCase())) {
    console.log('Restarting openclaw-gateway.service ...');
    try {
        execFileSync('systemctl', ['--user', 'restart', 'openclaw-gateway.service'], { stdio: 'inherit' });
    } catch {
        console.error('systemctl restart failed — restart the gateway manually.');
        process.exit(1);
    }
}

console.log(total > 0 ? `Done (${total} session key(s) updated).` : 'Nothing to change.');
process.exit(0);
