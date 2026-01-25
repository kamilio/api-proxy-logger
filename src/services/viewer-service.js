import { readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { diffLines } from 'diff';
import yaml from 'js-yaml';
import { getRecentLogs } from '../logger.js';
import { parseCsvParam } from '../viewer-filters.js';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export const COMPARE_SECTIONS = [
  {
    key: 'requestHeaders',
    label: 'Request headers',
    getter: (log) => log?.request?.headers,
  },
  {
    key: 'responseHeaders',
    label: 'Response headers',
    getter: (log) => log?.response?.headers,
  },
  {
    key: 'requestBody',
    label: 'Request body',
    getter: (log) => log?.request?.body,
  },
  {
    key: 'responseBody',
    label: 'Response body',
    getter: (log) => log?.response?.body,
  },
];

export async function getViewerIndexData(outputDir, { limit, provider, baseUrls, methods, aliasHostMap }) {
  const logs = await getRecentLogs(outputDir, {
    limit,
    provider,
    baseUrls,
    methods,
    aliasHostMap,
  });
  const providerMeta = collectProviders(logs);
  return { logs, providerMeta };
}

export function collectProviders(logs) {
  const providerMap = new Map();
  for (const log of logs) {
    if (log?.provider && !providerMap.has(log.provider)) {
      providerMap.set(log.provider, { name: log.provider, api_shape: null });
    }
  }
  return Array.from(providerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadViewerLog(outputDir, provider, filename) {
  const resolvedPath = resolveViewerLogPath(outputDir, provider, filename);
  if (!resolvedPath) return null;

  let content;
  try {
    content = await readFile(resolvedPath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  const logEntry = yaml.load(content);
  if (!logEntry) return null;

  logEntry.provider = logEntry.provider || provider || 'unknown';
  logEntry._source_path = relative(process.cwd(), resolvedPath);
  logEntry._viewer_provider = provider;
  logEntry._viewer_file = filename;

  return logEntry;
}

export function buildBackLink(query) {
  const params = new URLSearchParams();
  if (query?.limit) {
    params.set('limit', String(query.limit));
  }
  if (query?.baseUrl) {
    params.set('baseUrl', String(query.baseUrl));
  }
  if (query?.method) {
    params.set('method', String(query.method));
  }
  const search = params.toString();
  return search ? `/__viewer__?${search}` : '/__viewer__';
}

export function buildCompareData(logs, { baselineIndex = 0 } = {}) {
  const entries = Array.isArray(logs) ? logs : [];
  const rawBaseline = Number.isInteger(baselineIndex) ? baselineIndex : 0;
  const clampedBaseline = entries.length
    ? Math.min(Math.max(0, rawBaseline), entries.length - 1)
    : 0;
  const sections = COMPARE_SECTIONS.map((section) => {
    const values = entries.map((log) => normalizeCompareValue(section.getter(log)));
    const baseValue = values[clampedBaseline] || '';
    const diffs = values.map((value) => diffLines(baseValue, value || ''));
    const allSame = values.every((value) => value === values[0]);
    return {
      key: section.key,
      label: section.label,
      values,
      diffs,
      allSame,
    };
  });
  return { sections, baselineIndex: clampedBaseline };
}

export function parseCompareLogSelection(value, { max = 3 } = {}) {
  const selections = [];
  const invalid = [];
  const seen = new Set();
  const entries = parseCsvParam(value);

  for (const entry of entries) {
    const [provider, filename, ...rest] = String(entry).split('/');
    if (!provider || !filename || rest.length) {
      invalid.push(entry);
      continue;
    }
    if (!isSafeSegment(provider) || !isSafeSegment(filename) || !filename.endsWith('.yaml')) {
      invalid.push(entry);
      continue;
    }
    if (selections.length >= max) {
      invalid.push(entry);
      continue;
    }
    const key = `${provider}/${filename}`;
    if (seen.has(key)) {
      continue;
    }
    selections.push({ provider, filename });
    seen.add(key);
  }

  return { selections, invalid };
}

function normalizeCompareValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return JSON.stringify(value, null, 2);

  const seen = new WeakSet();
  const normalize = (input) => {
    if (input === null || input === undefined) return input;
    if (typeof input !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input);
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }
    const sorted = {};
    Object.keys(input)
      .sort()
      .forEach((key) => {
        sorted[key] = normalize(input[key]);
      });
    return sorted;
  };

  return JSON.stringify(normalize(value), null, 2);
}

function isSafeSegment(value) {
  if (!value || typeof value !== 'string') return false;
  if (!SAFE_SEGMENT.test(value)) return false;
  if (value === '.' || value === '..') return false;
  return true;
}

function isPathWithin(baseDir, targetPath) {
  const relativePath = relative(baseDir, targetPath);
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

export function resolveViewerLogPath(outputDir, provider, filename) {
  if (!isSafeSegment(provider) || !isSafeSegment(filename)) return null;
  if (!filename.endsWith('.yaml')) return null;

  const logsDir = resolve(outputDir);
  const providerDir = provider === 'unknown' ? logsDir : resolve(join(logsDir, provider));
  const targetPath = resolve(join(providerDir, filename));

  if (!isPathWithin(logsDir, targetPath)) return null;
  return targetPath;
}

export async function deleteViewerLog(outputDir, provider, filename) {
  const resolvedPath = resolveViewerLogPath(outputDir, provider, filename);
  if (!resolvedPath) {
    return { success: false, error: 'invalid_path' };
  }

  try {
    await unlink(resolvedPath);
    return { success: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'not_found' };
    }
    throw error;
  }
}
