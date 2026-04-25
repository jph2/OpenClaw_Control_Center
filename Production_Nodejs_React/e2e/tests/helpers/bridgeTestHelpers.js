import fs from 'node:fs/promises';
import path from 'node:path';

const TESTS_DIR = path.dirname(new URL(import.meta.url).pathname);
const E2E_ROOT = path.resolve(TESTS_DIR, '..', '..');
const PRODUCTION_ROOT = path.resolve(E2E_ROOT, '..');
const LOCAL_REPO_ROOT = path.resolve(PRODUCTION_ROOT, '..', '..');

export const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:3000';

export function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayDateSlug() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultA070Root() {
  return process.env.E2E_A070_ROOT
    || path.join(LOCAL_REPO_ROOT, 'Studio_Framework', '050_Artifacts', 'A070_ide_cursor_summaries');
}

export function defaultOpenClawWorkspace() {
  return process.env.E2E_OPENCLAW_WORKSPACE || '/home/claw-agentbox/.openclaw/workspace';
}

export async function apiJson(request, method, apiPath, body) {
  const url = `${backendUrl}${apiPath}`;
  const options = {
    headers: { 'Content-Type': 'application/json' }
  };
  let response;
  if (method === 'GET') {
    response = await request.get(url, options);
  } else if (method === 'POST') {
    response = await request.post(url, { ...options, data: body });
  } else if (method === 'PUT') {
    response = await request.put(url, { ...options, data: body });
  } else {
    throw new Error(`Unsupported API method: ${method}`);
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok()) {
    throw new Error(`${method} ${apiPath} failed (${response.status()}): ${text}`);
  }
  return data;
}

export async function getChannels(request) {
  const result = await apiJson(request, 'GET', '/api/channels');
  const channels = result?.data?.channels || [];
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error('GET /api/channels returned no channels; cannot run E2E_GOLDEN_PATH_8B5.');
  }
  return channels;
}

export function pickTestChannel(channels) {
  const sorted = sortChannelsForDisplay(channels);
  const forced = process.env.E2E_TTG_ID;
  if (forced) {
    const match = sorted.find((channel) => String(channel.id) === forced);
    if (!match) throw new Error(`E2E_TTG_ID=${forced} was not found in /api/channels.`);
    return match;
  }
  return sorted[0];
}

function ttgNumericPrefix(name) {
  if (name == null || typeof name !== 'string') return Number.MAX_SAFE_INTEGER;
  // Accept legacy TG### display names during migration; TTG### is canonical.
  const match = name.match(/^(?:TTG|TG)(\d+)/i);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

export function sortChannelsForDisplay(channels) {
  return [...channels].sort((a, b) => {
    const prefixA = ttgNumericPrefix(a?.name);
    const prefixB = ttgNumericPrefix(b?.name);
    if (prefixA !== prefixB) return prefixA - prefixB;
    const nameCmp = String(a?.name || '').localeCompare(String(b?.name || ''));
    if (nameCmp !== 0) return nameCmp;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

export function buildDraft({ runId, channel, projectId }) {
  const date = todayDateSlug();
  const channelId = String(channel.id);
  const safeChannelId = channelId.replace(/[^0-9-]/g, '');
  const relativePath = `drafts/e2e/${date}__${safeChannelId}__${projectId}__${runId}__summary.md`;
  const text = [
    '# E2E Golden Path 8B5',
    '',
    `- Run: ${runId}`,
    `- Channel: ${channel.name || channelId}`,
    `- TTG: ${channelId}`,
    `- Project: ${projectId}`,
    '- Purpose: Playwright operator-flow proof for the IDE memory bridge.',
    ''
  ].join('\n');
  return { relativePath, text };
}

export async function writeEvidence(testInfo, name, payload) {
  await testInfo.attach(name, {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json'
  });
}

export async function cleanupDraftAndSidecar(relativePath) {
  const a070Root = defaultA070Root();
  const normalized = relativePath.split('/').join(path.sep);
  const draftPath = path.join(a070Root, normalized);
  const sidecarPath = draftPath.replace(/\.md$/i, '.meta.json');
  await Promise.allSettled([
    fs.unlink(draftPath),
    fs.unlink(sidecarPath)
  ]);
}

export async function cleanupMemoryPromotion(meta) {
  const marker = meta?.promotion?.marker;
  const target = meta?.promotion?.target;
  if (!marker || !target) return;
  const memoryFile = path.join(defaultOpenClawWorkspace(), 'memory', target);
  let raw;
  try {
    raw = await fs.readFile(memoryFile, 'utf8');
  } catch {
    return;
  }
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockPattern = new RegExp(`\\n\\n${escapedMarker}[\\s\\S]*?(?=\\n\\n<!-- CM_PROMOTE_|$)`, 'm');
  const next = raw.replace(blockPattern, '');
  if (next !== raw) {
    await fs.writeFile(memoryFile, next, 'utf8');
  }
}
