import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { buildEnvForOpenclawCliSpawn } from './openclawGatewayEnv.js';
import {
    buildOpenclawSendFailure,
    clip,
    logOpenclawSend,
    normalizeOpenclawSendText
} from './chatSendUtils.js';

const DEFAULT_OPENCLAW_DIST_DIR = '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/dist';
const DEFAULT_GATEWAY_TIMEOUT_MS = 630000;

export class GatewayNativeTransportUnavailable extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'GatewayNativeTransportUnavailable';
        this.code = 'GATEWAY_NATIVE_UNAVAILABLE';
        this.status = options.status || 501;
        if (options.cause) this.cause = options.cause;
    }
}

export function isGatewayNativeUnavailable(err) {
    return err?.code === 'GATEWAY_NATIVE_UNAVAILABLE';
}

export function resolveGatewaySendMode(raw = process.env.OPENCLAW_CM_SEND_TRANSPORT) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'gateway' || value === 'native' || value === 'gateway-native') return 'gateway';
    if (value === 'auto' || value === 'prefer-gateway' || value === 'gateway-auto') return 'auto';
    return 'cli';
}

export function shouldAttemptGatewayNative(mode = resolveGatewaySendMode()) {
    return mode === 'gateway' || mode === 'auto';
}

export function isGatewayNativeForced(mode = resolveGatewaySendMode()) {
    return mode === 'gateway';
}

export function buildGatewayChatSendParams({ canonical, text, attachments, idempotencyKey, timeoutMs }) {
    if (!canonical.sessionKey) {
        throw new GatewayNativeTransportUnavailable(
            'canonical sessionKey is unavailable for native chat.send'
        );
    }

    const params = {
        sessionKey: canonical.sessionKey,
        message: normalizeOpenclawSendText(text),
        deliver: false,
        idempotencyKey
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
        params.attachments = attachments;
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        params.timeoutMs = timeoutMs;
    }

    return params;
}

function listCallModuleCandidates(distDir) {
    try {
        return fs.readdirSync(distDir)
            .filter((name) => /^call-[A-Za-z0-9_-]+\.js$/.test(name))
            .sort()
            .map((name) => path.join(distDir, name));
    } catch {
        return [];
    }
}

export function getGatewayCallModuleCandidates(env = process.env) {
    const explicit = String(env.OPENCLAW_GATEWAY_CALL_MODULE || '').trim();
    if (explicit) return [explicit];

    const cliScript = String(env.OPENCLAW_CLI_SCRIPT || '').trim();
    const cliDistDir = cliScript ? path.join(path.dirname(cliScript), 'dist') : null;
    const candidates = [];
    if (cliDistDir) candidates.push(...listCallModuleCandidates(cliDistDir));
    candidates.push(...listCallModuleCandidates(DEFAULT_OPENCLAW_DIST_DIR));

    return Array.from(new Set(candidates));
}

function toImportSpecifier(candidate) {
    if (/^(file|node|data):/.test(candidate)) return candidate;
    if (path.isAbsolute(candidate) || candidate.startsWith('.')) {
        return pathToFileURL(path.resolve(candidate)).href;
    }
    return candidate;
}

export async function loadGatewayCallModule({
    candidates = getGatewayCallModuleCandidates(),
    importModule = (specifier) => import(specifier),
    existsSync = fs.existsSync
} = {}) {
    const errors = [];

    for (const candidate of candidates) {
        try {
            if ((path.isAbsolute(candidate) || candidate.startsWith('.')) && !existsSync(path.resolve(candidate))) {
                errors.push(`${candidate}: not found`);
                continue;
            }

            const mod = await importModule(toImportSpecifier(candidate));
            const callGateway = mod?.callGateway || mod?.default?.callGateway;
            if (typeof callGateway !== 'function') {
                throw new Error('module does not export callGateway');
            }
            return {
                source: candidate,
                callGateway,
                randomIdempotencyKey: mod?.randomIdempotencyKey || mod?.default?.randomIdempotencyKey
            };
        } catch (err) {
            errors.push(`${candidate}: ${clip(err?.message, 160)}`);
        }
    }

    throw new GatewayNativeTransportUnavailable(
        `OpenClaw gateway call module unavailable (${errors.join('; ') || 'no candidates'})`
    );
}

function parseGatewayTimeoutMs(raw = process.env.OPENCLAW_CM_GATEWAY_TIMEOUT_MS) {
    const parsed = Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GATEWAY_TIMEOUT_MS;
}

/** When `false`, gateway may ack before final delivery (shorter HTTP hold). Default `true`. */
function parseGatewayExpectFinal(raw = process.env.OPENCLAW_CM_GATEWAY_EXPECT_FINAL) {
    const v = String(raw ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

function createIdempotencyKey(randomIdempotencyKey) {
    try {
        if (typeof randomIdempotencyKey === 'function') {
            const key = randomIdempotencyKey();
            if (key) return key;
        }
    } catch (_) {
        /* fall through */
    }
    return randomUUID();
}

function getGatewayResultId(result) {
    if (!result || typeof result !== 'object') return null;
    return result.requestId || result.messageId || result.runId || result.id || null;
}

export async function sendViaOpenclawGateway({
    canonical,
    realChatId,
    text,
    attachments,
    requestStartedAt,
    log = logOpenclawSend,
    loadModule = loadGatewayCallModule
}) {
    const env = buildEnvForOpenclawCliSpawn();
    const token = String(env.OPENCLAW_GATEWAY_TOKEN || '').trim();
    const url = String(env.OPENCLAW_GATEWAY_URL || '').trim();

    if (!token || !url) {
        throw new GatewayNativeTransportUnavailable(
            'OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_URL are unavailable for native CM send'
        );
    }

    const moduleLoadedAt = Date.now();
    const gatewayModule = await loadModule();
    const timeoutMs = parseGatewayTimeoutMs();
    const idempotencyKey = createIdempotencyKey(gatewayModule.randomIdempotencyKey);
    const params = buildGatewayChatSendParams({ canonical, text, attachments, idempotencyKey, timeoutMs });
    const transport = 'session-native-gateway-chat';

    log('gateway_native_call_start', {
        transport,
        realChatId: String(realChatId),
        sessionId: canonical.sessionId,
        hasSessionKey: Boolean(canonical.sessionKey),
        gatewayUrl: url,
        callModule: gatewayModule.source || null,
        textLen: params.message.length,
        attachmentCount: Array.isArray(params.attachments) ? params.attachments.length : 0,
        timeoutMs
    });

    try {
        const callStartedAt = Date.now();
        const result = await gatewayModule.callGateway({
            method: 'chat.send',
            params,
            expectFinal: parseGatewayExpectFinal(),
            timeoutMs,
            url,
            token,
            clientName: 'gateway-client',
            clientDisplayName: 'channel-manager',
            mode: 'backend',
            requiredMethods: ['chat.send']
        });
        const ackedAt = Date.now();
        const gatewayResultId = getGatewayResultId(result);

        log('gateway_native_call_done', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            gatewayResultId,
            timing: {
                moduleLoadMs: callStartedAt - moduleLoadedAt,
                gatewayCallMs: ackedAt - callStartedAt,
                totalAckMs: ackedAt - requestStartedAt
            }
        });

        return {
            message_id: `${transport}-${ackedAt}`,
            transport,
            sessionKey: canonical.sessionKey,
            sessionId: canonical.sessionId,
            sessionFile: canonical.sessionFile,
            gatewayResultId,
            timing: {
                totalAckMs: ackedAt - requestStartedAt,
                gatewayCallMs: ackedAt - callStartedAt,
                moduleLoadMs: callStartedAt - moduleLoadedAt
            }
        };
    } catch (err) {
        log('gateway_native_call_err', {
            transport,
            realChatId: String(realChatId),
            sessionId: canonical.sessionId,
            message: clip(err?.message, 400)
        });
        throw buildOpenclawSendFailure({
            realChatId,
            transport,
            message: err?.message,
            cause: err
        });
    }
}
