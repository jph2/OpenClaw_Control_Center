import crypto from 'crypto';
import path from 'path';
import {
    detectSecretLikeContent,
    normalizeMarkdownBody
} from './artifactIndex.js';

export const OPEN_BRAIN_EXPORT_SCHEMA = 'studio-framework.open-brain-export.v1';

export class OpenBrainExportBlockedError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'OpenBrainExportBlockedError';
        this.status = 400;
        this.details = details;
    }
}

function sortedJson(value) {
    if (Array.isArray(value)) return value.map(sortedJson);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, sortedJson(value[key])])
        );
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(sortedJson(value));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function portableSourcePath(sourcePath = '') {
    const normalized = String(sourcePath || '').split(path.sep).join('/');
    if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
        throw new OpenBrainExportBlockedError('Open Brain export requires a portable relative sourcePath', {
            sourcePath: normalized
        });
    }
    return normalized;
}

function exportModeForBinding(status) {
    if (status === 'confirmed') return 'knowledge';
    return 'review';
}

function reviewStateFor(record) {
    const bindingStatus = record?.binding?.status || 'unknown';
    if (bindingStatus === 'confirmed') return 'confirmed';
    if (bindingStatus === 'ambiguous') return 'ambiguous';
    if (bindingStatus === 'inferred' || bindingStatus === 'needs_review') return 'needs_review';
    return 'unknown';
}

export function buildOpenBrainDedupIdentity({ artifactId, contentHash }) {
    return sha256(canonicalJson({
        schema: OPEN_BRAIN_EXPORT_SCHEMA,
        artifact_id: artifactId,
        content_hash: contentHash
    }));
}

export function assertOpenBrainExportAllowed(record, markdown = '') {
    if (!record) {
        throw new OpenBrainExportBlockedError('Artifact index record is required');
    }
    if (record.secretGate?.status === 'blocked') {
        throw new OpenBrainExportBlockedError('Artifact is blocked by secret gate', {
            secretGate: record.secretGate
        });
    }
    const sourcePath = portableSourcePath(record.sourcePath);
    const secretGate = detectSecretLikeContent(markdown, sourcePath);
    if (secretGate.status === 'blocked') {
        throw new OpenBrainExportBlockedError('Artifact content is blocked by secret gate', {
            secretGate
        });
    }
    return { sourcePath, secretGate };
}

export function buildOpenBrainExportRecord(record, options = {}) {
    const markdown = String(options.markdown || '');
    const { sourcePath } = assertOpenBrainExportAllowed(record, markdown);
    const bindingStatus = record.binding?.status || 'unknown';
    const exportMode = exportModeForBinding(bindingStatus);
    const reviewState = reviewStateFor(record);
    const contentHash = record.contentHash || sha256(normalizeMarkdownBody(markdown));
    const artifactId = record.artifact?.id || sourcePath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const producer = options.producer || {};
    const createdAt = options.now || new Date().toISOString();

    return {
        schema: OPEN_BRAIN_EXPORT_SCHEMA,
        operation: 'upsert',
        target: 'thoughts',
        exportMode,
        knowledgeStatus: exportMode === 'knowledge' ? 'confirmed' : 'review',
        dedup: {
            identity: buildOpenBrainDedupIdentity({ artifactId, contentHash }),
            artifactId,
            contentHash,
            schemaVersion: OPEN_BRAIN_EXPORT_SCHEMA
        },
        artifact: {
            id: artifactId,
            title: record.artifact?.title || '',
            type: record.artifact?.type || 'UNKNOWN',
            status: record.artifact?.status || 'unknown',
            tags: Array.isArray(record.artifact?.tags) ? record.artifact.tags : []
        },
        source: {
            path: sourcePath
        },
        content: {
            format: 'markdown',
            hash: contentHash,
            markdown: normalizeMarkdownBody(markdown)
        },
        ttg: {
            initial: record.ttg?.initial || null,
            current: record.ttg?.current || null,
            binding: {
                status: bindingStatus,
                method: record.binding?.method || 'none',
                ttgId: record.binding?.ttgId || null,
                candidates: record.binding?.candidates || undefined,
                reason: record.binding?.reason || '',
                reviewState
            }
        },
        project: {
            id: record.project?.id || '',
            repoSlug: record.project?.repoSlug || '',
            root: record.project?.root || ''
        },
        classificationEvidence: record.classificationEvidence || null,
        producer: {
            surface: producer.surface || 'unknown',
            agent: producer.agent || '',
            model: producer.model || '',
            sessionId: producer.sessionId || '',
            operator: producer.operator || '',
            createdAt: producer.createdAt || ''
        },
        sync: {
            status: 'not_synced',
            targetThoughtId: null,
            lastSyncedAt: null
        },
        createdAt
    };
}
