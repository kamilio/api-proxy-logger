import { createHash } from 'node:crypto';
import { mkdir, writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import yaml from 'js-yaml';
import { sanitizeBody, sanitizeHeaders, sanitizeUrl } from './redact.js';
import { filterLogs } from './viewer-filters.js';
import { loadConfig } from './config.js';
import { getPinnedSet } from './pinned.js';

async function getAllLogFiles(outputDir) {
  const files = [];
  try {
    await collectLogFiles(outputDir, outputDir, files);
  } catch {
    // Directory doesn't exist yet
  }
  return files;
}

async function collectLogFiles(rootDir, dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectLogFiles(rootDir, path, files);
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      const logId = relative(rootDir, path);
      files.push({ path, name: entry.name, logId });
    }
  }
}

async function rotateLogsIfNeeded(outputDir) {
  const config = loadConfig();
  const maxLogs = config.max_logs;
  if (!maxLogs || maxLogs <= 0) return;

  const files = await getAllLogFiles(outputDir);
  const pinnedSet = getPinnedSet();

  // Separate pinned and unpinned files
  const unpinnedFiles = files.filter((f) => !pinnedSet.has(f.logId));

  if (unpinnedFiles.length <= maxLogs) return;

  // Sort by filename (which contains timestamp) - oldest first
  unpinnedFiles.sort((a, b) => a.name.localeCompare(b.name));

  const toDelete = unpinnedFiles.slice(0, unpinnedFiles.length - maxLogs);
  for (const file of toDelete) {
    try {
      await unlink(file.path);
      console.log(`  Rotated: ${file.name}`);
    } catch {
      // Ignore deletion errors
    }
  }
}

export async function logRequest(outputDir, data) {
  const sanitizedRequestHeaders = sanitizeHeaders(data.requestHeaders || {});
  const sanitizedResponseHeaders = sanitizeHeaders(data.responseHeaders || {});
  const sanitizedRequestBody = sanitizeBody(data.requestBody);
  const sanitizedResponseBody = sanitizeBody(data.responseBody);
  const sanitizedUrl = sanitizeUrl(data.url);

  const logEntry = {
    request: {
      method: data.method,
      url: sanitizedUrl,
      headers: sanitizedRequestHeaders,
      body: sanitizedRequestBody,
    },
    response: {
      status: data.status,
      headers: sanitizedResponseHeaders,
      is_streaming: data.isStreaming,
    },
  };

  if (data.responseBodyBase64) {
    logEntry.response.body_base64 = data.responseBodyBase64;
    logEntry.response.is_binary = data.isBinary === true;
  } else {
    logEntry.response.body = sanitizedResponseBody;
  }

  const filepath = buildLogPath(outputDir, {
    method: data.method,
    url: data.url,
    body: data.requestBody,
    prefix: data.recordingPrefix,
  });
  const content = yaml.dump(logEntry, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, content, 'utf-8');
  console.log(`  Logged: ${data.method} ${sanitizedUrl} -> ${data.status} (${data.duration}ms)`);

  await rotateLogsIfNeeded(outputDir);

  return filepath;
}

export function buildLogPath(outputDir, { method, url, body, prefix }) {
  const basePath = extractBasePath(url);
  const model = extractModelFromBody(body) || extractModelFromUrl(url);
  const key = createLogKey({ method, url, body });
  const filename = createLogFilename(key, prefix);
  return model
    ? join(outputDir, basePath, model, filename)
    : join(outputDir, basePath, filename);
}

function createLogFilename(key, prefix) {
  const rawPrefix = typeof prefix === 'string' ? prefix.trim() : '';
  const safePrefix = rawPrefix ? sanitizeForFs(rawPrefix) : '';
  return safePrefix ? `${safePrefix}-${key}.yaml` : `${key}.yaml`;
}

function createLogKey({ method, url, body }) {
  const normalized = stableStringify({
    method,
    url,
    body: normalizeBodyForKey(body),
  });
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function extractBasePath(urlValue) {
  try {
    const url = new URL(urlValue);
    return sanitizeForFs(baseDomain(url.hostname));
  } catch {
    return sanitizeForFs(urlValue || 'unknown');
  }
}

function baseDomain(hostname) {
  if (!hostname) return 'unknown';
  if (hostname === 'localhost') return hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function extractModelFromBody(body) {
  const parsed = parseJsonBody(body);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.model === 'string') {
    return sanitizeForFs(normalizeModelName(parsed.model));
  }
  return null;
}

function normalizeModelName(model) {
  const parts = String(model).split('/').filter(Boolean);
  return parts.length ? parts.at(-1) : model;
}

function extractModelFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    const match = url.pathname.match(/\/models\/([^/:]+)(?::|\/|$)/);
    return match ? sanitizeForFs(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}

function normalizeBodyForKey(body) {
  const parsed = parseJsonBody(body);
  return parsed === undefined ? bodyToString(body) : parsed;
}

function parseJsonBody(body) {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = bodyToString(body);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function bodyToString(body) {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return String(body);
}

function stableStringify(value) {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value) {
  if (Array.isArray(value)) return value.map(sortForStableStringify);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortForStableStringify(value[key]);
        return sorted;
      }, {});
  }
  return value;
}

function sanitizeForFs(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

export async function getRecentLogs(outputDir, limitOrOptions = 20, provider = null) {
  let limit = 20;
  let offset = 0;
  let providerFilter = null;
  let baseUrls = null;
  let methods = null;
  let aliases = null;
  let aliasHostMap = null;

  if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
    limit = Number.isFinite(limitOrOptions.limit) ? limitOrOptions.limit : 20;
    offset = Number.isFinite(limitOrOptions.offset) ? limitOrOptions.offset : 0;
    providerFilter = limitOrOptions.provider || null;
    baseUrls = limitOrOptions.baseUrls || null;
    methods = limitOrOptions.methods || null;
    aliases = limitOrOptions.aliases || null;
    aliasHostMap = limitOrOptions.aliasHostMap || null;
  } else {
    limit = limitOrOptions;
    providerFilter = provider;
  }

  try {
    let fileEntries = await getAllLogFiles(outputDir);
    if (providerFilter) {
      fileEntries = fileEntries.filter((entry) => entry.logId === providerFilter || entry.logId.startsWith(`${providerFilter}/`));
    }

    const logs = await Promise.all(
      fileEntries.map(async (entry) => {
        const content = await readFile(entry.path, 'utf-8');
        const log = yaml.load(content);
        if (log && !log.provider) {
          log.provider = 'unknown';
        }
        if (log) {
          const [viewerProvider, ...viewerFileParts] = entry.logId.split('/');
          log._source_path = relative(process.cwd(), entry.path);
          log._viewer_provider = viewerProvider || 'unknown';
          log._viewer_file = viewerFileParts.length ? viewerFileParts.join('/') : basename(entry.path);
        }
        return log;
      })
    );

    const filteredLogs = filterLogs(logs.filter(Boolean), {
      baseUrls,
      methods,
      aliases,
      aliasHostMap,
    });
    const sorted = filteredLogs.sort((a, b) => {
      const aTime = Date.parse(a.timestamp || '') || 0;
      const bTime = Date.parse(b.timestamp || '') || 0;
      return bTime - aTime;
    });
    const total = sorted.length;
    const paginated = sorted.slice(offset, offset + limit);
    return { logs: paginated, total };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
