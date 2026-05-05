import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { extractMarkdownFrontmatter, parseArtifactHeaderBinding } from './artifactHeaderBinding.js';
import { classifyArtifactTtg, loadTtgDefinitions } from './ttgClassifier.js';
import { buildRoutingSuggestionFromClassification } from './ideWorkUnit.js';
import { mergeOpenBrainSyncIntoRecords } from './openBrainSyncAudit.js';

const SCHEMA_VERSION = 'studio-framework.artifact-index.v1';

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

export function canonicalJson(value) {
    return JSON.stringify(sortedJson(value));
}

export function normalizeMarkdownBody(markdown = '') {
    const { body } = extractMarkdownFrontmatter(markdown);
    return String(body || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function asArray(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function sourcePathFor(studioRoot, filePath) {
    return path.relative(studioRoot, filePath).split(path.sep).join('/');
}

function artifactIdFromPath(sourcePath) {
    return sourcePath
        .replace(/\.md$/i, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 120) || 'artifact';
}

export function detectSecretLikeContent(markdown = '', sourcePath = '') {
    const findings = [];
    const text = String(markdown || '');
    const source = String(sourcePath || '');

    if (/(^|\/)\.env(\.|$|\/)/i.test(source) || /(^|\/)\.env$/i.test(source)) {
        findings.push({ severity: 'blocked', reason: 'source path references a .env file' });
    }
    if (/(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}/i.test(text)) {
        findings.push({ severity: 'blocked', reason: 'token-like key/value found' });
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
        findings.push({ severity: 'blocked', reason: 'private key block found' });
    }
    if (/\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(text)) {
        findings.push({ severity: 'blocked', reason: 'known token prefix found' });
    }

    if (findings.some((f) => f.severity === 'blocked')) {
        return {
            status: 'blocked',
            findings,
            reason: findings.map((f) => f.reason).join('; ')
        };
    }
    return { status: 'clear', findings: [], reason: '' };
}

function headerHealth(parsed) {
    if (!parsed.hasHeader) return { status: 'missing', reason: 'artifact has no YAML frontmatter' };
    if (!parsed.frontmatter.id || !parsed.frontmatter.type) {
        return { status: 'required_fields_missing', reason: 'artifact header is missing id or type' };
    }
    if (!parsed.currentTtgId) {
        return { status: 'required_fields_missing', reason: 'artifact header is missing current_ttg.id' };
    }
    if (!parsed.hasValidCurrentTtg) {
        return { status: 'required_fields_missing', reason: 'artifact header current_ttg.id is invalid' };
    }
    return { status: 'valid', reason: '' };
}

function bindingFromHeader(parsed) {
    if (parsed.hasValidCurrentTtg) {
        return {
            status: 'confirmed',
            method: 'artifact_header',
            ttgId: parsed.currentTtgId,
            initialTtgId: parsed.initialTtgId || '',
            reason: parsed.current?.reason || 'artifact header current_ttg.id'
        };
    }
    if (parsed.hasValidInitialTtg) {
        return {
            status: 'inferred',
            method: 'artifact_header',
            ttgId: parsed.initialTtgId,
            initialTtgId: parsed.initialTtgId,
            reason: 'artifact header initial_ttg.id fallback; current_ttg.id missing'
        };
    }
    return {
        status: 'unknown',
        method: 'none',
        ttgId: null,
        initialTtgId: parsed.initialTtgId || '',
        reason: parsed.hasHeader ? 'no valid artifact TTG binding' : 'missing artifact header'
    };
}

function exportEligibility({ header, binding, secretGate }) {
    if (secretGate.status === 'blocked') return { status: 'blocked', reason: secretGate.reason };
    if (header.status !== 'valid') return { status: 'needs_review', reason: header.reason };
    if (binding.status !== 'confirmed') return { status: 'needs_review', reason: 'binding is not confirmed' };
    return { status: 'ready', reason: '' };
}

export function buildContentHashInput(record, markdown) {
    return {
        schema_version: SCHEMA_VERSION,
        artifact: {
            id: record.artifact.id,
            type: record.artifact.type,
            status: record.artifact.status
        },
        tags: [...record.artifact.tags].sort(),
        current_ttg: {
            id: record.ttg.current?.id || ''
        },
        project: {
            id: record.project.id || ''
        },
        source_path: record.sourcePath,
        markdown_body: normalizeMarkdownBody(markdown)
    };
}

export function indexMarkdownArtifact({ studioRoot, filePath, markdown, ttgDefinitions = [] }) {
    const sourcePath = sourcePathFor(studioRoot, filePath);
    const text = String(markdown || '');
    const parsed = parseArtifactHeaderBinding(text);
    const fm = parsed.frontmatter || {};
    const header = headerHealth(parsed);
    const binding = bindingFromHeader(parsed);
    const project = {
        id: String(parsed.project?.id || ''),
        repoSlug: String(parsed.project?.repo_slug || parsed.project?.repoSlug || ''),
        root: String(parsed.project?.root || '')
    };
    const record = {
        schema: SCHEMA_VERSION,
        artifact: {
            id: String(fm.id || artifactIdFromPath(sourcePath)),
            title: String(fm.title || ''),
            type: String(fm.type || 'UNKNOWN'),
            status: String(fm.status || 'unknown'),
            tags: asArray(fm.tags),
            created: String(fm.created || ''),
            lastModified: String(fm.last_modified || fm.lastModified || '')
        },
        sourcePath,
        ttg: {
            initial: parsed.initial ? {
                id: parsed.initial.id,
                name: parsed.initial.name,
                reason: parsed.initial.reason
            } : null,
            current: parsed.current ? {
                id: parsed.current.id,
                name: parsed.current.name,
                reason: parsed.current.reason
            } : null
        },
        project,
        binding,
        header,
        contentHash: '',
        secretGate: detectSecretLikeContent(text, sourcePath),
        classificationEvidence: null,
        routingSuggestion: null,
        exportEligibility: { status: 'needs_review', reason: '' },
        promote: {
            status: 'not_promoted',
            marker: null,
            contentHash: null
        },
        openBrain: {
            syncStatus: 'not_synced',
            thoughtId: null,
            contentHash: null
        }
    };
    if (record.binding.status === 'unknown' && record.secretGate.status !== 'blocked' && ttgDefinitions.length) {
        const classification = classifyArtifactTtg({
            artifact: record.artifact,
            markdown: text,
            ttgDefinitions
        });
        record.classificationEvidence = classification;
        record.routingSuggestion = buildRoutingSuggestionFromClassification(classification);
    }
    record.contentHash = sha256(canonicalJson(buildContentHashInput(record, text)));
    record.exportEligibility = exportEligibility({
        header: record.header,
        binding: record.binding,
        secretGate: record.secretGate
    });
    return record;
}

async function walkMarkdown(dir, base, acc = []) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return acc;
    }
    for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) await walkMarkdown(full, base, acc);
        else if (ent.isFile() && ent.name.endsWith('.md')) acc.push(full);
    }
    return acc;
}

export async function buildArtifactIndex({ studioRoot, roots = ['050_Artifacts'], channelMappings = [] } = {}) {
    if (!studioRoot) throw new Error('studioRoot is required');
    const ttgDefinitions = await loadTtgDefinitions({ studioRoot, channelMappings });
    const files = [];
    for (const rel of roots) {
        await walkMarkdown(path.join(studioRoot, rel), studioRoot, files);
    }
    const records = [];
    for (const filePath of files.sort()) {
        const markdown = await fs.readFile(filePath, 'utf8');
        records.push(indexMarkdownArtifact({ studioRoot, filePath, markdown, ttgDefinitions }));
    }
    await mergeOpenBrainSyncIntoRecords(records);
    return {
        schema: SCHEMA_VERSION,
        studioRoot,
        generatedAt: new Date().toISOString(),
        count: records.length,
        records
    };
}
