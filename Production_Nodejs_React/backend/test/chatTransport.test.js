import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    buildGatewayChatSendParams,
    isGatewayNativeForced,
    isGatewayNativeUnavailable,
    resolveGatewaySendMode,
    sendViaOpenclawGateway,
    shouldAttemptGatewayNative
} from '../services/chat/openclawGatewayTransport.js';

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

test('gateway send mode defaults to CLI and opts into native modes explicitly', () => {
    assert.equal(resolveGatewaySendMode(undefined), 'cli');
    assert.equal(resolveGatewaySendMode(''), 'cli');
    assert.equal(resolveGatewaySendMode('gateway'), 'gateway');
    assert.equal(resolveGatewaySendMode('gateway-native'), 'gateway');
    assert.equal(resolveGatewaySendMode('auto'), 'auto');
    assert.equal(shouldAttemptGatewayNative('cli'), false);
    assert.equal(shouldAttemptGatewayNative('auto'), true);
    assert.equal(isGatewayNativeForced('gateway'), true);
});

test('buildGatewayChatSendParams targets canonical sessions through chat.send', () => {
    const params = buildGatewayChatSendParams({
        canonical: {
            sessionId: '11111111-2222-4333-8444-555555555555',
            sessionKey: 'agent:tars-100:telegram:group:-100'
        },
        text: 'hello\nthere',
        idempotencyKey: 'idem-1',
        timeoutMs: 12345
    });

    assert.deepEqual(params, {
        sessionKey: 'agent:tars-100:telegram:group:-100',
        message: 'hello there',
        deliver: false,
        idempotencyKey: 'idem-1',
        timeoutMs: 12345
    });
});

test('buildGatewayChatSendParams requires a canonical sessionKey', () => {
    assert.throws(
        () =>
            buildGatewayChatSendParams({
                canonical: { sessionId: null, sessionKey: null },
                text: 'ping',
                idempotencyKey: 'idem-2'
            }),
        (err) => isGatewayNativeUnavailable(err) && /sessionKey/.test(err.message)
    );
});

test('sendViaOpenclawGateway calls chat.send with explicit gateway auth', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-gateway-transport-'));
    const cfg = path.join(dir, 'openclaw.json');
    fs.writeFileSync(
        cfg,
        JSON.stringify({
            gateway: { port: 19998, auth: { token: 'native-token' } }
        })
    );

    const calls = [];

    try {
        await withEnv(
            {
                OPENCLAW_CONFIG_PATH: cfg,
                OPENCLAW_GATEWAY_TOKEN: undefined,
                OPENCLAW_GATEWAY_URL: undefined,
                OPENCLAW_CM_GATEWAY_TIMEOUT_MS: undefined
            },
            async () => {
                const result = await sendViaOpenclawGateway({
                    canonical: {
                        chatId: '-100',
                        sessionId: '11111111-2222-4333-8444-555555555555',
                        sessionKey: 'agent:tars-100:telegram:group:-100',
                        sessionFile: '/tmp/session.jsonl'
                    },
                    realChatId: '-100',
                    text: 'hello',
                    requestStartedAt: Date.now(),
                    log: () => {},
                    loadModule: async () => ({
                        source: 'fake-gateway-call-module',
                        randomIdempotencyKey: () => 'idem-3',
                        callGateway: async (opts) => {
                            calls.push(opts);
                            return { requestId: 'gw-req-1' };
                        }
                    })
                });

                assert.equal(result.transport, 'session-native-gateway-chat');
                assert.equal(result.gatewayResultId, 'gw-req-1');
            }
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'chat.send');
    assert.equal(calls[0].expectFinal, true);
    assert.equal(calls[0].url, 'http://127.0.0.1:19998');
    assert.equal(calls[0].token, 'native-token');
    assert.equal(calls[0].clientName, 'gateway-client');
    assert.equal(calls[0].clientDisplayName, 'channel-manager');
    assert.equal(calls[0].mode, 'backend');
    assert.deepEqual(calls[0].requiredMethods, ['chat.send']);
    assert.deepEqual(calls[0].params, {
        sessionKey: 'agent:tars-100:telegram:group:-100',
        message: 'hello',
        deliver: false,
        idempotencyKey: 'idem-3',
        timeoutMs: 630000
    });
});

test('sendViaOpenclawGateway reports native transport unavailable without gateway token', async () => {
    await withEnv(
        {
            OPENCLAW_CONFIG_PATH: path.join(os.tmpdir(), 'does-not-exist-openclaw.json'),
            OPENCLAW_GATEWAY_TOKEN: undefined,
            OPENCLAW_GATEWAY_URL: undefined
        },
        async () => {
            await assert.rejects(
                () =>
                    sendViaOpenclawGateway({
                        canonical: { chatId: '-100', sessionId: null, sessionKey: null },
                        realChatId: '-100',
                        text: 'hello',
                        requestStartedAt: Date.now(),
                        log: () => {},
                        loadModule: async () => {
                            throw new Error('should not load without auth');
                        }
                    }),
                (err) => isGatewayNativeUnavailable(err) && /OPENCLAW_GATEWAY_TOKEN/.test(err.message)
            );
        }
    );
});
