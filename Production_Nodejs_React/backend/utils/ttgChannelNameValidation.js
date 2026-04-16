import { z } from 'zod';

/** Display names must start with TTG + exactly three digits (e.g. TTG001, TTG042). */
export const TTG_CHANNEL_NAME_PREFIX_RE = /^TTG\d{3}/;

export function isStrictTtgChannelNamesEnabled() {
    return ['1', 'true', 'yes'].includes(
        String(process.env.CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES || '').toLowerCase()
    );
}

/**
 * When CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES is enabled, every persisted channel `name`
 * must match {@link TTG_CHANNEL_NAME_PREFIX_RE}. Used on import/config and POST /update writes.
 *
 * @param {Array<{ name?: string }>} channels
 */
export function assertStrictTtgChannelNames(channels) {
    if (!isStrictTtgChannelNamesEnabled()) return;
    if (!Array.isArray(channels)) return;
    for (let i = 0; i < channels.length; i++) {
        const n = (channels[i]?.name ?? '').trim();
        if (!TTG_CHANNEL_NAME_PREFIX_RE.test(n)) {
            throw new z.ZodError([
                {
                    code: z.ZodIssueCode.custom,
                    path: ['channels', i, 'name'],
                    message:
                        'Channel display name must start with TTG followed by three digits (e.g. TTG001 My group). Set CHANNEL_MANAGER_STRICT_TTG_CHANNEL_NAMES=0 to disable, or rename the channel.'
                }
            ]);
        }
    }
}
