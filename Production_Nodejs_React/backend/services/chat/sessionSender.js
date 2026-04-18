import fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { resolveCanonicalSession } from './sessionIndex.js';

const execAsync = promisify(exec);

let _openclawRuntimeCache = null;

function resolveOpenclawRuntime() {
    if (_openclawRuntimeCache) return _openclawRuntimeCache;

    const nodeCandidates = [process.env.OPENCLAW_NODE_BIN, '/usr/bin/node', '/usr/local/bin/node'].filter(Boolean);

    let nodeBin = null;
    let nodeVersion = null;
    for (const candidate of nodeCandidates) {
        try {
            const out = execSync(`${candidate} --version`, {
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

    const cliCandidates = [
        process.env.OPENCLAW_CLI_SCRIPT,
        '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/openclaw.mjs'
    ].filter(Boolean);
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
    logOpenclawCli('runtime_resolved', {
        nodeBin,
        nodeVersion,
        cliScript,
        fallbackToPath: !(nodeBin && cliScript)
    });
    return _openclawRuntimeCache;
}

function clip(s, max = 600) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .slice(0, max);
}

function logOpenclawCli(phase, payload) {
    console.log('[Chat/sessionSender][openclaw]', phase, JSON.stringify(payload));
}

export async function sendMessageToChat(chatId, text) {
    const requestStartedAt = Date.now();
    const canonical = resolveCanonicalSession(chatId);
    const realChatId = canonical.chatId;

    logOpenclawCli('inject_start', {
        rawChatId: String(chatId),
        realChatId: String(realChatId),
        sessionKey: canonical.sessionKey,
        sessionId: canonical.sessionId,
        textLen: String(text).length,
        requestStartedAt
    });

    if (!text || !text.trim()) {
        logOpenclawCli('inject_skip', { reason: 'empty_message', realChatId: String(realChatId) });
        return { message_id: `ui-empty-${Date.now()}`, transport: 'noop', timing: { totalMs: Date.now() - requestStartedAt } };
    }

    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const runtime = resolveOpenclawRuntime();
    const useExplicitRuntime = Boolean(runtime.nodeBin && runtime.cliScript);
    const invocation = useExplicitRuntime
        ? `"${runtime.nodeBin}" "${runtime.cliScript}"`
        : 'openclaw';
    const pathAugmentation = useExplicitRuntime
        ? ''
        : 'export PATH=$PATH:/home/claw-agentbox/.npm-global/bin && ';

    let cmd = null;
    let transport = null;
    let logPath = null;

    if (canonical.sessionId) {
        transport = 'session-native-cli';
        logPath = `/tmp/openclaw-cm-send-${canonical.sessionId}.log`;
        cmd = `${pathAugmentation}nohup ${invocation} agent --session-id "${canonical.sessionId}" --message "${safeText}" --json >${logPath} 2>&1 & echo $!`;
    } else {
        transport = 'legacy-telegram-deliver';
        logPath = `/tmp/openclaw-cm-send-${realChatId}.log`;
        cmd = `${pathAugmentation}nohup ${invocation} agent --channel telegram --to "${realChatId}" --message "${safeText}" --deliver >${logPath} 2>&1 & echo $!`;
    }

    try {
        const spawnStartedAt = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
        const ackedAt = Date.now();
        const spawnedPid = String(stdout || '').trim().split('\n').pop()?.trim() || null;

        logOpenclawCli('inject_spawned', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            spawnedPid,
            nodeBin: runtime.nodeBin,
            nodeVersion: runtime.nodeVersion,
            stderrPreview: clip(stderr, 400),
            timing: {
                spawnExecMs: ackedAt - spawnStartedAt,
                totalAckMs: ackedAt - requestStartedAt
            }
        });

        setTimeout(() => {
            try {
                if (!logPath || !fs.existsSync(logPath)) return;
                const snapshot = fs.readFileSync(logPath, 'utf8');
                if (/Node\.js v\d+\.\d+\+? is required|Cannot find module|Error: |TypeError: |SyntaxError: /i.test(snapshot)) {
                    logOpenclawCli('inject_cli_startup_error', {
                        transport,
                        sessionId: canonical.sessionId,
                        spawnedPid,
                        logPath,
                        excerpt: clip(snapshot, 500)
                    });
                }
            } catch (_) {
                /* best-effort */
            }
        }, 300);

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
        logOpenclawCli('inject_err', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            message: clip(err?.message, 400),
            stderrPreview: clip(err?.stderr, 400),
            stdoutPreview: clip(err?.stdout, 400)
        });
        console.error('[Chat/sessionSender] openclaw agent failed to spawn:', err.message);
        const fail = new Error(
            `OpenClaw CLI spawn failed for chat ${realChatId} via ${transport}: ${clip(err?.message, 200)}`
        );
        fail.status = 502;
        fail.cause = err;
        throw fail;
    }
}
