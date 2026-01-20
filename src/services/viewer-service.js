import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import yaml from 'js-yaml';
import { getRecentLogs } from '../logger.js';
import { getResponsesPath } from '../paths.js';
import { extractMessage } from '../mock-utils.js';
import { updateResponseMapping } from '../responses-config.js';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function getViewerIndexData(outputDir, limit, providerFilter) {
  const logs = await getRecentLogs(outputDir, limit, providerFilter);
  const providerMeta = collectProviders(logs);
  const providerShapes = buildProviderShapes(providerMeta);
  return { logs, providerMeta, providerShapes };
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

export function buildProviderShapes(providerMeta) {
  const shapes = {};
  for (const provider of providerMeta) {
    if (provider.api_shape) {
      shapes[provider.name] = provider.api_shape;
    }
  }
  return shapes;
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

export async function saveResponseFromLog(outputDir, sourcePath, rawName, apiShape) {
  const safeName = sanitizeResponseName(rawName);
  if (!safeName) {
    throw new Error('Invalid response name');
  }

  const logsDir = resolve(outputDir);
  const resolvedSource = resolve(sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath));
  if (!isPathWithin(logsDir, resolvedSource)) {
    throw new Error('Source path must be within logs directory');
  }

  const responsesBase = dirname(getResponsesPath());
  const responsesDir = resolve(join(responsesBase, 'responses'));
  await mkdir(responsesDir, { recursive: true });

  const filename = safeName.endsWith('.yaml') ? safeName : `${safeName}.yaml`;
  const targetPath = join(responsesDir, filename);

  await copyFile(resolvedSource, targetPath);

  const logContent = await readFile(resolvedSource, 'utf-8');
  const logEntry = yaml.load(logContent);
  const message = extractMessage(logEntry?.request?.body, apiShape).trim();
  if (!message) {
    throw new Error('Unable to extract message from log for this api_shape');
  }

  const responsePath = `responses/${basename(targetPath)}`;
  updateResponseMapping(apiShape, message, responsePath);

  return { api_shape: apiShape, message, response_path: responsePath };
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

function resolveViewerLogPath(outputDir, provider, filename) {
  if (!isSafeSegment(provider) || !isSafeSegment(filename)) return null;
  if (!filename.endsWith('.yaml')) return null;

  const logsDir = resolve(outputDir);
  const providerDir = provider === 'unknown' ? logsDir : resolve(join(logsDir, provider));
  const targetPath = resolve(join(providerDir, filename));

  if (!isPathWithin(logsDir, targetPath)) return null;
  return targetPath;
}

function sanitizeResponseName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
