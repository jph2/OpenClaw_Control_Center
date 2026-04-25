import { isValidTtgId } from './ttgBindingResolver.js';

function stripQuotes(value) {
    const s = String(value || '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

function parseScalar(value) {
    const s = stripQuotes(value);
    if (s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    return s;
}

export function extractMarkdownFrontmatter(markdown = '') {
    const text = String(markdown || '');
    if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
        return { frontmatter: '', body: text, hasFrontmatter: false };
    }
    const newline = text.startsWith('---\r\n') ? '\r\n' : '\n';
    const start = 3 + newline.length;
    const endMarker = `${newline}---`;
    const end = text.indexOf(endMarker, start);
    if (end === -1) return { frontmatter: '', body: text, hasFrontmatter: false };
    const afterEnd = end + endMarker.length;
    const bodyStart = text.startsWith(newline, afterEnd) ? afterEnd + newline.length : afterEnd;
    return {
        frontmatter: text.slice(start, end),
        body: text.slice(bodyStart),
        hasFrontmatter: true
    };
}

export function parseSimpleYamlFrontmatter(frontmatter = '') {
    const root = {};
    let currentKey = null;

    for (const rawLine of String(frontmatter || '').split(/\r?\n/)) {
        const withoutComment = rawLine.replace(/\s+#.*$/, '');
        if (!withoutComment.trim()) continue;

        const top = withoutComment.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
        if (top) {
            const [, key, rest = ''] = top;
            currentKey = key;
            root[key] = rest.trim() === '' ? {} : parseScalar(rest.trim());
            continue;
        }

        const nested = withoutComment.match(/^\s{2,}([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
        if (
            nested
            && currentKey
            && root[currentKey]
            && typeof root[currentKey] === 'object'
            && !Array.isArray(root[currentKey])
        ) {
            const [, key, rest = ''] = nested;
            root[currentKey][key] = parseScalar(rest.trim());
        }
    }

    return root;
}

export function parseArtifactHeaderBinding(markdown = '') {
    const extracted = extractMarkdownFrontmatter(markdown);
    if (!extracted.hasFrontmatter) {
        return {
            hasHeader: false,
            frontmatter: {},
            current: null,
            initial: null,
            project: {},
            binding: {},
            currentTtgId: '',
            initialTtgId: '',
            hasValidCurrentTtg: false,
            hasValidInitialTtg: false
        };
    }

    const frontmatter = parseSimpleYamlFrontmatter(extracted.frontmatter);
    const current = frontmatter.current_ttg && typeof frontmatter.current_ttg === 'object'
        ? {
            id: String(frontmatter.current_ttg.id || ''),
            name: String(frontmatter.current_ttg.name || ''),
            reason: String(frontmatter.current_ttg.reason || '')
        }
        : null;
    const initial = frontmatter.initial_ttg && typeof frontmatter.initial_ttg === 'object'
        ? {
            id: String(frontmatter.initial_ttg.id || ''),
            name: String(frontmatter.initial_ttg.name || ''),
            reason: String(frontmatter.initial_ttg.reason || '')
        }
        : null;

    return {
        hasHeader: true,
        frontmatter,
        current,
        initial,
        project: frontmatter.project && typeof frontmatter.project === 'object' ? frontmatter.project : {},
        binding: frontmatter.binding && typeof frontmatter.binding === 'object' ? frontmatter.binding : {},
        currentTtgId: current?.id || '',
        initialTtgId: initial?.id || '',
        hasValidCurrentTtg: isValidTtgId(current?.id),
        hasValidInitialTtg: isValidTtgId(initial?.id)
    };
}
