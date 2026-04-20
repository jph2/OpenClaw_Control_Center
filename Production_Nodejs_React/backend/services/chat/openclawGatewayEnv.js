import fs from 'fs';
import os from 'os';
import path from 'path';

/** @typedef {{ token: string, port: number } | null} GatewayAuthSlice */

let _authCache = { path: null, mtimeMs: null, slice: null };

/**
 * Reads gateway.auth.token and gateway.port from openclaw.json (cached by mtime).
 * @returns {GatewayAuthSlice}
 */
export function readGatewayAuthFromOpenclawConfig() {
    const configPath =
        typeof process.env.OPENCLAW_CONFIG_PATH === 'string' && process.env.OPENCLAW_CONFIG_PATH.trim()
            ? process.env.OPENCLAW_CONFIG_PATH.trim()
            : path.join(os.homedir(), '.openclaw', 'openclaw.json');

    try {
        const st = fs.statSync(configPath);
        if (_authCache.path === configPath && _authCache.mtimeMs === st.mtimeMs) {
            return _authCache.slice;
        }

        const raw = fs.readFileSync(configPath, 'utf8');
        const j = JSON.parse(raw);
        const tokenRaw = j?.gateway?.auth?.token;
        const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
        const portRaw = j?.gateway?.port;
        const port =
            typeof portRaw === 'number' && Number.isFinite(portRaw) && portRaw > 0
                ? portRaw
                : 18789;

        const slice = token ? { token, port } : null;
        _authCache = { path: configPath, mtimeMs: st.mtimeMs, slice };
        return slice;
    } catch {
        _authCache = { path: configPath, mtimeMs: null, slice: null };
        return null;
    }
}

/**
 * Merge process.env with OpenClaw gateway credentials so `openclaw agent` uses the
 * warm local gateway (WebSocket RPC) instead of falling back to embedded mode
 * (~20s+ cold start per send). See roadmap §8b.1.
 *
 * Precedence: OPENCLAW_GATEWAY_TOKEN env → openclaw.json gateway.auth.token.
 * URL: OPENCLAW_GATEWAY_URL env → http://127.0.0.1:<port from json or 18789>.
 *
 * @returns {NodeJS.ProcessEnv}
 */
export function buildEnvForOpenclawCliSpawn() {
    const env = { ...process.env };
    const disk = readGatewayAuthFromOpenclawConfig();
    const token = String(env.OPENCLAW_GATEWAY_TOKEN || disk?.token || '').trim();
    if (!token) {
        return env;
    }
    env.OPENCLAW_GATEWAY_TOKEN = token;
    if (!String(env.OPENCLAW_GATEWAY_URL || '').trim()) {
        const port = disk?.port ?? 18789;
        env.OPENCLAW_GATEWAY_URL = `http://127.0.0.1:${port}`;
    }
    return env;
}
