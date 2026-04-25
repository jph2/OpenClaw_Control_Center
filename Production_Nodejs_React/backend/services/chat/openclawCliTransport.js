import fs from 'fs';
import { execFileSync, spawn } from 'child_process';
import { buildEnvForOpenclawCliSpawn } from './openclawGatewayEnv.js';
import {
    buildOpenclawSendFailure,
    clip,
    logOpenclawSend,
    normalizeOpenclawSendText
} from './chatSendUtils.js';

const DEFAULT_OPENCLAW_CLI_SCRIPT = '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/openclaw.mjs';
const DEFAULT_OPENCLAW_GLOBAL_BIN = '/home/claw-agentbox/.npm-global/bin';

let _openclawRuntimeCache = null;

export function resolveOpenclawRuntime(log = logOpenclawSend) {
    if (_openclawRuntimeCache) return _openclawRuntimeCache;

    const nodeCandidates = [process.env.OPENCLAW_NODE_BIN, '/usr/bin/node', '/usr/local/bin/node'].filter(Boolean);

    let nodeBin = null;
    let nodeVersion = null;
    for (const candidate of nodeCandidates) {
        try {
            const out = execFileSync(candidate, ['--version'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            const major = parseInt(String(out).replace(/^v/, '').split('.')[0], 10);
            if (Number.isFinite(major) && major >= 22) {
                nodeBin = candidate;
                nodeVersion = out;
                break;
            }
        } catch (_) {
            /* try next */
        }
    }

    const cliCandidates = [process.env.OPENCLAW_CLI_SCRIPT, DEFAULT_OPENCLAW_CLI_SCRIPT].filter(Boolean);
    let cliScript = null;
    for (const candidate of cliCandidates) {
        try {
            if (fs.existsSync(candidate)) {
                cliScript = candidate;
                break;
            }
        } catch (_) {
            /* ignore */
        }
    }

    _openclawRuntimeCache = { nodeBin, nodeVersion, cliScript };
    log('runtime_resolved', {
        nodeBin,
        nodeVersion,
        cliScript,
        fallbackToPath: !(nodeBin && cliScript)
    });
    return _openclawRuntimeCache;
}

function safeLogToken(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .slice(0, 140);
}

function buildCliPlan({ canonical, realChatId, text, log }) {
    const runtime = resolveOpenclawRuntime(log);
    const useExplicitRuntime = Boolean(runtime.nodeBin && runtime.cliScript);
    const command = useExplicitRuntime ? runtime.nodeBin : 'openclaw';
    const args = useExplicitRuntime ? [runtime.cliScript, 'agent'] : ['agent'];
    const message = normalizeOpenclawSendText(text);

    let transport;
    let logPath;

    if (canonical.sessionId) {
        transport = 'session-native-cli';
        logPath = `/tmp/openclaw-cm-send-${safeLogToken(canonical.sessionId)}.log`;
        args.push('--session-id', canonical.sessionId, '--message', message, '--json');
    } else {
        transport = 'legacy-telegram-deliver';
        logPath = `/tmp/openclaw-cm-send-${safeLogToken(realChatId)}.log`;
        args.push('--channel', 'telegram', '--to', String(realChatId), '--message', message, '--deliver');
    }

    return { runtime, useExplicitRuntime, command, args, transport, logPath };
}

function closeFd(fd) {
    if (typeof fd !== 'number') return;
    try {
        fs.closeSync(fd);
    } catch (_) {
        /* best effort */
    }
}

function waitUntilSpawned(child) {
    return new Promise((resolve, reject) => {
        const onSpawn = () => {
            cleanup();
            resolve();
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            child.off('spawn', onSpawn);
            child.off('error', onError);
        };
        child.once('spawn', onSpawn);
        child.once('error', onError);
    });
}

function scheduleStartupLogCheck({ logPath, log, transport, sessionId, spawnedPid }) {
    const timer = setTimeout(() => {
        try {
            if (!logPath || !fs.existsSync(logPath)) return;
            const snapshot = fs.readFileSync(logPath, 'utf8');
            if (/Node\.js v\d+\.\d+\+? is required|Cannot find module|Error: |TypeError: |SyntaxError: /i.test(snapshot)) {
                log('inject_cli_startup_error', {
                    transport,
                    sessionId,
                    spawnedPid,
                    logPath,
                    excerpt: clip(snapshot, 500)
                });
            }
        } catch (_) {
            /* best-effort */
        }
    }, 300);
    timer.unref?.();
}

export async function sendViaOpenclawCli({ canonical, realChatId, text, requestStartedAt, log = logOpenclawSend }) {
    const { runtime, useExplicitRuntime, command, args, transport, logPath } = buildCliPlan({
        canonical,
        realChatId,
        text,
        log
    });

    let outFd = null;
    let errFd = null;

    try {
        const spawnStartedAt = Date.now();
        const childEnv = buildEnvForOpenclawCliSpawn();
        if (!useExplicitRuntime) {
            childEnv.PATH = [childEnv.PATH, DEFAULT_OPENCLAW_GLOBAL_BIN].filter(Boolean).join(':');
        }

        const warmGateway = Boolean(
            childEnv.OPENCLAW_GATEWAY_TOKEN && String(childEnv.OPENCLAW_GATEWAY_TOKEN).trim()
        );
        log('gateway_env_for_spawn', {
            warmGateway,
            gatewayUrl: warmGateway ? childEnv.OPENCLAW_GATEWAY_URL || null : null
        });

        outFd = fs.openSync(logPath, 'a');
        errFd = fs.openSync(logPath, 'a');
        const child = spawn(command, args, {
            detached: true,
            stdio: ['ignore', outFd, errFd],
            env: childEnv
        });
        await waitUntilSpawned(child);
        child.unref();

        closeFd(outFd);
        closeFd(errFd);
        outFd = null;
        errFd = null;

        const ackedAt = Date.now();
        const spawnedPid = child.pid ? String(child.pid) : null;

        log('inject_spawned', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            spawnedPid,
            nodeBin: runtime.nodeBin,
            nodeVersion: runtime.nodeVersion,
            warmGateway,
            timing: {
                spawnExecMs: ackedAt - spawnStartedAt,
                totalAckMs: ackedAt - requestStartedAt
            }
        });

        scheduleStartupLogCheck({
            logPath,
            log,
            transport,
            sessionId: canonical.sessionId,
            spawnedPid
        });

        return {
            message_id: `${transport}-${ackedAt}`,
            transport,
            sessionKey: canonical.sessionKey,
            sessionId: canonical.sessionId,
            sessionFile: canonical.sessionFile,
            spawnedPid,
            timing: {
                totalAckMs: ackedAt - requestStartedAt,
                spawnExecMs: ackedAt - spawnStartedAt
            }
        };
    } catch (err) {
        closeFd(outFd);
        closeFd(errFd);

        log('inject_err', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            message: clip(err?.message, 400)
        });
        console.error('[Chat/sessionSender] openclaw agent failed to spawn:', err.message);
        throw buildOpenclawSendFailure({
            realChatId,
            transport,
            message: err?.message,
            cause: err
        });
    }
}
