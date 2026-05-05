/**
 * Shared CM → Cursor `.cursor/agents/*.md` renderer (bundle v2).
 * Used by apply-ide-export.mjs and ideExportFingerprint.mjs.
 */

export const CM_EXPORT_MARKER_V1 = '<!-- cm-ide-export:v1 managed-by-channel-manager-apply-script -->';
export const CM_EXPORT_MARKER_V2 = '<!-- cm-ide-export:v2 managed-by-channel-manager-apply-script -->';

export const CM_MANAGED_START = '<!-- cm-managed:start -->';
export const CM_MANAGED_END = '<!-- cm-managed:end -->';

const LEGACY_USER_SECTION_SUB =
    /^_Add workflow-specific instructions below this line.*$/m;
const LEGACY_USER_SECTION_ENGINE = /^_Add triad \/ persona prose below this line if needed\._$/m;
const LEGACY_GENERATED_PLACEHOLDER =
    /^_(Add workflow-specific instructions below this line|Add triad \/ persona prose below this line).*_$/s;

function delimiterLineIndex(lines, marker) {
    return lines.findIndex((line) => line.trim() === marker);
}

function normalizePreservedSuffix(suffix) {
    const trimmed = String(suffix || '').trimEnd();
    return LEGACY_GENERATED_PLACEHOLDER.test(trimmed.trim()) ? '' : trimmed;
}

/** True if file is CM-owned (v1 or v2 marker on first line). */
export function isChannelManagerIdeExportFile(content) {
    const first = String(content).split(/\r?\n/, 1)[0] || '';
    return /^<!-- cm-ide-export:v[12] /.test(first.trim());
}

/** Extract user-editable suffix after managed block, or legacy heuristic. */
export function extractPreservedSuffix(existingContent) {
    const text = String(existingContent);
    const lines = text.split(/\r?\n/);
    const endLine = delimiterLineIndex(lines, CM_MANAGED_END);
    if (endLine !== -1) {
        return normalizePreservedSuffix(
            lines
                .slice(endLine + 1)
                .join('\n')
                .replace(/^\s*\n/, '')
        );
    }
    if (LEGACY_USER_SECTION_SUB.test(text)) {
        const m = text.match(LEGACY_USER_SECTION_SUB);
        return m ? normalizePreservedSuffix(text.slice(m.index)) : '';
    }
    if (LEGACY_USER_SECTION_ENGINE.test(text)) {
        const m = text.match(LEGACY_USER_SECTION_ENGINE);
        return m ? normalizePreservedSuffix(text.slice(m.index)) : '';
    }
    return '';
}

function yamlEscapeBlock(s) {
    return String(s).replace(/\n/g, '\n  ');
}

function renderManagedInnerEngine(engine) {
    const id = String(engine.id || 'engine');
    const name = String(engine.name || id);
    const desc = `${name} — **main agent (engine)** from Channel Manager`;
    const skills = [...(engine.effectiveDefaultSkills || engine.defaultSkills || [])];
    const skillsLine = skills.length
        ? skills.map((s) => `- \`${s}\``).join('\n')
        : '_— none in CM defaultSkills (after inactive filter) —_';
    const inactive = engine.inactiveSkills?.length
        ? `\n\n**Inactive (CM):** ${engine.inactiveSkills.map((s) => `\`${s}\``).join(', ')}`
        : '';

    return `---
name: ${id}
description: |
  ${yamlEscapeBlock(desc)}
model: inherit
readonly: false
---

# ${name}

**CM main agent id:** \`${id}\`  
**Enabled (CM):** \`${engine.enabled !== false}\`

## Default skills (IDs from Channel Manager)

${skillsLine}${inactive}

_Skill Roles with \`parent: ${id}\` are exported as IDE Agent Profile files in this folder._

_Generated in the managed region. Edit custom prose only below the managed end marker._
`;
}

function renderManagedInnerSubagent(entry) {
    const fm = entry.suggestedFrontmatter || {};
    const desc = String(fm.description || `${entry.displayName} — parent: ${entry.parentEngine}`);
    const skills = Array.isArray(entry.effectiveSkillIds)
        ? entry.effectiveSkillIds
        : Array.isArray(entry.skillIds)
          ? entry.skillIds
          : [];
    const skillsLine = skills.length
        ? skills.map((s) => `- \`${s}\``).join('\n')
        : '_— none in CM additionalSkills (after inactive filter) —_';
    const parent = entry.parentEngine == null ? '' : String(entry.parentEngine);
    const parentLine = parent
        ? `\`${parent}\``
        : '`null` (CM parent missing — see bundle warnings)';
    const inactive = entry.inactiveSkills?.length
        ? `\n\n**Inactive (CM):** ${entry.inactiveSkills.map((s) => `\`${s}\``).join(', ')}`
        : '';

    return `---
name: ${fm.name || entry.name}
description: |
  ${yamlEscapeBlock(desc)}
model: ${fm.model ?? 'inherit'}
readonly: ${fm.readonly === true}
---

# ${entry.displayName || entry.name}

**CM Skill Role id:** \`${entry.name}\`  
**Parent engine:** ${parentLine}  
**Enabled (CM):** \`${entry.enabled !== false}\`  
**Projection:** OpenClaw \`mergeIntoSynth\`; Cursor \`IDE Agent Profile\`; Runtime Worker \`no\`

## Skills (IDs from Channel Manager)

${skillsLine}${inactive}

_Generated in the managed region. Custom prose belongs below the managed end marker._
`;
}

/**
 * Full file: marker v2 + managed region + optional preserved suffix.
 * @param {{ managedInner: string, preservedSuffix?: string }} opts
 */
export function composeAgentMarkdownFile({ managedInner, preservedSuffix = '' }) {
    const suffix = preservedSuffix.trim();
    const body = `${CM_EXPORT_MARKER_V2}
${CM_MANAGED_START}
${managedInner.trim()}
${CM_MANAGED_END}
${suffix ? `\n${suffix}\n` : ''}`;
    return body;
}

/** @returns {string|null} */
export function extractManagedRegion(content) {
    const text = String(content);
    const lines = text.split(/\r?\n/);
    const s = delimiterLineIndex(lines, CM_MANAGED_START);
    const e = delimiterLineIndex(lines, CM_MANAGED_END);
    if (s === -1 || e === -1 || e < s) return null;
    return lines.slice(s, e + 1).join('\n');
}

/**
 * @param {object} bundle - ide_workbench_bundle from ideConfigBridge (v2)
 * @returns {{ relativePath: string, content: string, kind: string, name: string }[]}
 */
export function buildRenderedAgentFiles(bundle, options = {}) {
    const { preservedByRel = {} } = options;
    const out = [];

    for (const engine of bundle.engines || []) {
        const id = String(engine.id || '').trim();
        if (!id) continue;
        const rel = `.cursor/agents/${id}.md`;
        const inner = renderManagedInnerEngine(engine);
        const preserved = preservedByRel[rel] ?? '';
        out.push({
            relativePath: rel,
            kind: 'engine',
            name: id,
            content: composeAgentMarkdownFile({ managedInner: inner, preservedSuffix: preserved })
        });
    }

    for (const entry of bundle.subagents || []) {
        const rel = entry.relativePath || `.cursor/agents/${entry.name}.md`;
        const inner = renderManagedInnerSubagent(entry);
        const preserved = preservedByRel[rel] ?? '';
        out.push({
            relativePath: rel,
            kind: 'subagent',
            name: entry.name,
            content: composeAgentMarkdownFile({ managedInner: inner, preservedSuffix: preserved })
        });
    }

    return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
