import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildEnvForOpenclawCliSpawn } from '../services/chat/openclawGatewayEnv.js';

test('buildEnvForOpenclawCliSpawn fills token and URL from openclaw.json when env vars absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-openclaw-gw-'));
    const cfg = path.join(dir, 'openclaw.json');
    fs.writeFileSync(
        cfg,
        JSON.stringify({
            gateway: { port: 19999, auth: { token: 'test-gateway-token-xyz' } }
        })
    );

    const prevPath = process.env.OPENCLAW_CONFIG_PATH;
    const prevTok = process.env.OPENCLAW_GATEWAY_TOKEN;
    const prevUrl = process.env.OPENCLAW_GATEWAY_URL;

    process.env.OPENCLAW_CONFIG_PATH = cfg;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.OPENCLAW_GATEWAY_URL;

    try {
        const env = buildEnvForOpenclawCliSpawn();
        assert.equal(env.OPENCLAW_GATEWAY_TOKEN, 'test-gateway-token-xyz');
        assert.equal(env.OPENCLAW_GATEWAY_URL, 'http://127.0.0.1:19999');
    } finally {
        if (prevPath !== undefined) process.env.OPENCLAW_CONFIG_PATH = prevPath;
        else delete process.env.OPENCLAW_CONFIG_PATH;
        if (prevTok !== undefined) process.env.OPENCLAW_GATEWAY_TOKEN = prevTok;
        else delete process.env.OPENCLAW_GATEWAY_TOKEN;
        if (prevUrl !== undefined) process.env.OPENCLAW_GATEWAY_URL = prevUrl;
        else delete process.env.OPENCLAW_GATEWAY_URL;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('buildEnvForOpenclawCliSpawn keeps explicit OPENCLAW_GATEWAY_URL when token from disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-openclaw-gw-'));
    const cfg = path.join(dir, 'openclaw.json');
    fs.writeFileSync(
        cfg,
        JSON.stringify({
            gateway: { port: 18789, auth: { token: 'from-disk' } }
        })
    );

    const prevPath = process.env.OPENCLAW_CONFIG_PATH;
    const prevTok = process.env.OPENCLAW_GATEWAY_TOKEN;
    const prevUrl = process.env.OPENCLAW_GATEWAY_URL;

    process.env.OPENCLAW_CONFIG_PATH = cfg;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9999';

    try {
        const env = buildEnvForOpenclawCliSpawn();
        assert.equal(env.OPENCLAW_GATEWAY_TOKEN, 'from-disk');
        assert.equal(env.OPENCLAW_GATEWAY_URL, 'http://127.0.0.1:9999');
    } finally {
        if (prevPath !== undefined) process.env.OPENCLAW_CONFIG_PATH = prevPath;
        else delete process.env.OPENCLAW_CONFIG_PATH;
        if (prevTok !== undefined) process.env.OPENCLAW_GATEWAY_TOKEN = prevTok;
        else delete process.env.OPENCLAW_GATEWAY_TOKEN;
        if (prevUrl !== undefined) process.env.OPENCLAW_GATEWAY_URL = prevUrl;
        else delete process.env.OPENCLAW_GATEWAY_URL;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
