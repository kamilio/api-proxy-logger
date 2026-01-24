import { readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import yaml from 'js-yaml';
import { getRecentLogs } from '../logger.js';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function getViewerIndexData(outputDir, limit, providerFilter) {
  const logs = await getRecentLogs(outputDir, limit, providerFilter);
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
  if (query?.provider) {
    params.set('provider', String(query.provider));
  }
  const search = params.toString();
  return search ? `/viewer?${search}` : '/viewer';
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
