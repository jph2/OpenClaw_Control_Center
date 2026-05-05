import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    hydrateOpenclawSessionIndex,
    refreshChatMirrorFromCanonicalSession,
    resolveCanonicalSession
} from '../services/chat/sessionIndex.js';

function withEnv(patch, fn) {
    const previous = new Map();
    for (const key of Object.keys(patch)) {
        previous.set(key, process.env[key]);
        if (patch[key] === undefined) delete process.env[key];
        else process.env[key] = patch[key];
    }

    return Promise.resolve()
        .then(fn)
        .finally(() => {
            for (const [key, value] of previous) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        });
}

function writeSessionsJson(root, agentId, payload) {
    const dir = path.join(root, agentId, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(payload, null, 2));
}

test('resolveCanonicalSession prefers sessionFile UUID over stale entry sessionId', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-session-index-'));
    const staleId = '11111111-1111-4111-8111-111111111111';
    const fileId = '22222222-2222-4222-8222-222222222222';
    const sessionFile = path.join(dir, 'tars-100', 'sessions', `${fileId}.jsonl`);
    writeSessionsJson(dir, 'tars-100', {
        'agent:tars-100:telegram:group:-100': {
            sessionId: staleId,
            sessionFile,
            updatedAt: 100,
            modelProvider: 'openai',
            model: 'gpt-5.2'
        }
    });

    try {
        await withEnv({ OPENCLAW_AGENTS_DIR: dir, OPENCLAW_SESSIONS_JSON_PATH: undefined }, () => {
            hydrateOpenclawSessionIndex();

            const byGroup = resolveCanonicalSession('-100');
            assert.equal(byGroup.sessionId, fileId);
            assert.equal(byGroup.sessionFile, sessionFile);

            const byFileUuid = resolveCanonicalSession(fileId);
            assert.equal(byFileUuid.chatId, '-100');
            assert.equal(byFileUuid.sessionId, fileId);

            const byStaleUuid = resolveCanonicalSession(staleId);
            assert.equal(byStaleUuid.chatId, '-100');
            assert.equal(byStaleUuid.sessionId, fileId);
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('refreshChatMirrorFromCanonicalSession rehydrates sessions.json before resolving', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-session-refresh-'));
    const firstId = '33333333-3333-4333-8333-333333333333';
    const secondId = '44444444-4444-4444-8444-444444444444';
    writeSessionsJson(dir, 'tars-100', {
        'agent:tars-100:telegram:group:-100': {
            sessionId: firstId,
            sessionFile: path.join(dir, 'tars-100', 'sessions', `${firstId}.jsonl`),
            updatedAt: 100
        }
    });

    try {
        await withEnv({ OPENCLAW_AGENTS_DIR: dir, OPENCLAW_SESSIONS_JSON_PATH: undefined }, () => {
            hydrateOpenclawSessionIndex();
            assert.equal(resolveCanonicalSession('-100').sessionId, firstId);

            writeSessionsJson(dir, 'tars-100', {
                'agent:tars-100:telegram:group:-100': {
                    sessionId: firstId,
                    sessionFile: path.join(dir, 'tars-100', 'sessions', `${secondId}.jsonl`),
                    updatedAt: 200
                }
            });

            refreshChatMirrorFromCanonicalSession('-100');
            assert.equal(resolveCanonicalSession('-100').sessionId, secondId);
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
