import test from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import {
    TTG_CHANNEL_NAME_PREFIX_RE,
    assertStrictTtgChannelNames
} from '../utils/ttgChannelNameValidation.js';

test('TTG_CHANNEL_NAME_PREFIX_RE accepts TTG + three digits at start', () => {
    assert.ok(TTG_CHANNEL_NAME_PREFIX_RE.test('TTG001'));
    assert.ok(TTG_CHANNEL_NAME_PREFIX_RE.test('TTG042 My topic'));
    assert.ok(!TTG_CHANNEL_NAME_PREFIX_RE.test('TG001 x'));
    assert.ok(!TTG_CHANNEL_NAME_PREFIX_RE.test('TTG01 x'));
    assert.ok(!TTG_CHANNEL_NAME_PREFIX_RE.test('x TTG001'));
});

test('assertStrictTtgChannelNames respects env', () => {
    const prev = process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES;
    try {
        process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES = '0';
        assert.doesNotThrow(() => assertStrictTtgChannelNames([{ name: 'anything' }]));

        process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES = '1';
        assert.throws(() => assertStrictTtgChannelNames([{ name: 'bad' }]), z.ZodError);
        assert.doesNotThrow(() => assertStrictTtgChannelNames([{ name: 'TTG001 ok' }]));
    } finally {
        if (prev === undefined) delete process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES;
        else process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES = prev;
    }
});
