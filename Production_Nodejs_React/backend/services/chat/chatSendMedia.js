import path from 'path';
import os from 'os';

/** Match OpenClaw gateway `parseMessageWithAttachments` default (5 MiB). */
export const CM_CHAT_IMAGE_MAX_BYTES = 5_000_000;
export const CM_CHAT_IMAGE_BASE64_MAX_CHARS = Math.ceil((CM_CHAT_IMAGE_MAX_BYTES * 4) / 3) + 256;

export const CM_CHAT_IMAGE_MIME_WHITELIST = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
]);

function resolveUserPath(input) {
    if (!input) return '';
    if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2));
    return path.resolve(input);
}

/** Align with OpenClaw `resolveConfigDir` (state dir wins, else dirname of OPENCLAW_CONFIG_PATH). */
export function resolveOpenclawConfigDir() {
    const override = process.env.OPENCLAW_STATE_DIR?.trim();
    if (override) return resolveUserPath(override);
    const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
    if (configPath) return path.dirname(resolveUserPath(configPath));
    return path.join(os.homedir(), '.openclaw');
}

export function resolveInboundMediaDirectory() {
    return path.join(resolveOpenclawConfigDir(), 'media', 'inbound');
}

/**
 * Resolve `media/inbound/<id>` the same way OpenClaw stores attachment files.
 * @param {string} mediaId — filename only (no path separators)
 */
export function resolveInboundMediaAbsolutePath(mediaId) {
    const id = String(mediaId || '').trim();
    if (!id || id.includes('/') || id.includes('\\') || id.includes('\0') || id === '..') {
        throw new Error('unsafe media id');
    }
    const inboundDir = resolveInboundMediaDirectory();
    const resolved = path.join(inboundDir, id);
    const prefix = inboundDir + path.sep;
    if (!resolved.startsWith(prefix)) throw new Error('path escapes media inbound dir');
    return resolved;
}

/**
 * Strip `data:image/...;base64,` prefix if present.
 * @param {string} raw
 * @returns {string}
 */
export function stripBase64DataUrlPrefix(raw) {
    const s = String(raw || '').trim();
    const m = /^data:[^;]+;base64,(.*)$/i.exec(s);
    return m ? m[1] : s;
}

function estimateBase64DecodedBytes(b64) {
    const len = b64.length;
    if (len === 0) return 0;
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function isValidBase64Chunk(b64) {
    if (b64.length === 0 || b64.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/]+={0,2}$/.test(b64);
}

/**
 * Validate image payload from CM API; returns gateway attachment shape.
 * @param {{ filename?: string, mimeType: string, base64: string }} image
 */
export function normalizeGatewayImageAttachment(image) {
    const mimeRaw = String(image.mimeType || '').trim().toLowerCase();
    const mime = mimeRaw.split(';')[0].trim();
    if (!CM_CHAT_IMAGE_MIME_WHITELIST.has(mime)) {
        const err = new Error(`unsupported image mimeType: ${mime || '(empty)'}`);
        err.status = 400;
        throw err;
    }

    let b64 = stripBase64DataUrlPrefix(image.base64).replace(/\s+/g, '');
    while (b64.length % 4 !== 0) b64 += '=';
    if (!isValidBase64Chunk(b64)) {
        const err = new Error('invalid base64 payload');
        err.status = 400;
        throw err;
    }

    const est = estimateBase64DecodedBytes(b64);
    if (est <= 0) {
        const err = new Error('empty image payload');
        err.status = 400;
        throw err;
    }
    if (est > CM_CHAT_IMAGE_MAX_BYTES) {
        const err = new Error(
            `image exceeds size limit (${est} bytes > ${CM_CHAT_IMAGE_MAX_BYTES} bytes)`
        );
        err.status = 413;
        throw err;
    }

    const buf = Buffer.from(b64, 'base64');
    if (Math.abs(buf.byteLength - est) > 3) {
        const err = new Error('base64 payload corrupt or truncated');
        err.status = 400;
        throw err;
    }

    const safeName = image.filename
        ? String(image.filename)
              .replace(/[^\p{L}\p{N}._-]+/gu, '_')
              .replace(/_+/g, '_')
              .slice(0, 120)
        : 'upload';

    return {
        type: 'image',
        mimeType: mime,
        fileName: safeName || 'upload',
        content: b64
    };
}
