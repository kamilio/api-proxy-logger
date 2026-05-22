import { createHash } from 'node:crypto';
import { readdir, readFile, unlink, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import yaml from 'js-yaml';

const SNAPSHOT_KEY_LENGTH = 12;
const PROMPT_PREVIEW_LENGTH = 120;

export function generateSnapshotKey({ method, url, body }) {
  const normalized = stableStringify({
    method,
    url,
    body: normalizeBodyForSnapshotKey(body),
  });

  return createHash('sha256').update(normalized).digest('hex').slice(0, SNAPSHOT_KEY_LENGTH);
}

export function sanitizeForFs(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

export function extractModelFromBody(body) {
  const parsed = parseJsonBody(body);
  if (isPlainObject(parsed) && typeof parsed.model === 'string') {
    return sanitizeForFs(parsed.model);
  }
  return 'default';
}

export function buildSnapshotPath(snapshotDir, { url, model, key }) {
  const parsedUrl = new URL(url);
  const hostPath = sanitizeForFs(`${parsedUrl.host}${parsedUrl.pathname}`);
  const safeModel = sanitizeForFs(model);
  return join(snapshotDir, hostPath, safeModel, `${key}.json`);
}

export function resolveSnapshotDir(config) {
  return config?.snapshot_dir || join(process.cwd(), '.snapshots');
}

export async function loadSnapshot(snapshotPath) {
  try {
    const content = await readFile(snapshotPath, 'utf8');
    return snapshotPath.endsWith('.yaml') ? yaml.load(content) : JSON.parse(content);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveSnapshot(snapshotPath, entry) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  const content = snapshotPath.endsWith('.yaml')
    ? yaml.dump(entry, { indent: 2, lineWidth: -1, noRefs: true })
    : JSON.stringify(entry, null, 2);
  await writeFile(snapshotPath, content);
}

export async function listSnapshots(snapshotDir) {
  const files = await findSnapshotFiles(snapshotDir);
  const summaries = [];

  for (const file of files) {
    const entry = await loadSnapshot(file.path);
    if (!entry) continue;

    summaries.push(buildSnapshotSummary(file, entry));
  }

  return summaries;
}

export async function deleteSnapshot(snapshotPath) {
  try {
    await unlink(snapshotPath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function normalizeBodyForSnapshotKey(body) {
  const parsed = parseJsonBody(body);
  if (parsed !== undefined) {
    return parsed;
  }
  return bodyToUtf8(body);
}

function parseJsonBody(body) {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (Array.isArray(body) || isPlainObject(body)) {
    return body;
  }

  const text = bodyToUtf8(body);
  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function bodyToUtf8(body) {
  if (body === null || body === undefined) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString('utf8');
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8');
  }
  return String(body);
}

function stableStringify(value) {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value) {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortForStableStringify(value[key]);
        return sorted;
      }, {});
  }

  return value;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isNotFound(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

async function readDirOrEmpty(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
}

function sortDirEntries(entries) {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

async function findSnapshotFiles(snapshotDir) {
  const files = [];
  const hostEntries = await readDirOrEmpty(snapshotDir);

  for (const hostEntry of sortDirEntries(hostEntries)) {
    if (!hostEntry.isDirectory()) continue;

    const host = hostEntry.name;
    const hostDir = join(snapshotDir, host);
    const modelEntries = await readDirOrEmpty(hostDir);

    for (const modelEntry of sortDirEntries(modelEntries)) {
      if (!modelEntry.isDirectory()) continue;

      const model = modelEntry.name;
      const modelDir = join(hostDir, model);
      const snapshotEntries = await readDirOrEmpty(modelDir);

      for (const snapshotEntry of sortDirEntries(snapshotEntries)) {
        if (!snapshotEntry.isFile() || !snapshotEntry.name.endsWith('.json')) continue;

        files.push({
          host,
          model,
          path: join(modelDir, snapshotEntry.name),
        });
      }
    }
  }

  return files;
}

function buildSnapshotSummary(file, entry) {
  return {
    key: typeof entry.key === 'string' ? entry.key : basename(file.path, '.json'),
    host: file.host,
    path: file.path,
    model: extractSummaryModel(entry, file.model),
    method: extractSummaryMethod(entry),
    status: extractSummaryStatus(entry),
    recordedAt: entry.recordedAt ?? entry.metadata?.recordedAt,
    promptPreview: extractPromptPreview(entry),
  };
}

function extractSummaryMethod(entry) {
  return entry.request?.method ?? entry.method ?? 'UNKNOWN';
}

function extractSummaryModel(entry, fallback) {
  if (typeof entry.model === 'string') return sanitizeForFs(entry.model);
  if (typeof entry.metadata?.model === 'string') return sanitizeForFs(entry.metadata.model);
  const body = extractRequestBody(entry);
  const model = extractModelFromBody(body);
  return model === 'default' ? fallback : model;
}

function extractSummaryStatus(entry) {
  return entry.status ?? entry.response?.status ?? entry.metadata?.status;
}

function extractPromptPreview(entry) {
  if (typeof entry.promptPreview === 'string') {
    return truncatePreview(entry.promptPreview);
  }

  const body = extractRequestBody(entry);
  const parsed = parseJsonBody(body);
  const prompt = extractPrompt(parsed) || extractPrompt(body);
  return truncatePreview(prompt);
}

function extractRequestBody(entry) {
  return entry.request?.body ?? entry.body ?? entry.requestBody ?? entry.request;
}

function extractPrompt(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (!isPlainObject(value)) {
    return '';
  }

  if (typeof value.prompt === 'string') {
    return value.prompt;
  }
  if (typeof value.input === 'string') {
    return value.input;
  }
  if (Array.isArray(value.messages)) {
    return extractPromptFromMessages(value.messages);
  }

  return '';
}

function extractPromptFromMessages(messages) {
  const userMessage = messages.find((message) => message?.role === 'user') ?? messages[0];
  const content = userMessage?.content;

  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function truncatePreview(value) {
  if (!value) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim().slice(0, PROMPT_PREVIEW_LENGTH);
}
