import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'templates', 'viewer.ejs');
const detailTemplatePath = join(__dirname, 'templates', 'viewer-detail.ejs');
const compareTemplatePath = join(__dirname, 'templates', 'viewer-compare.ejs');
const settingsTemplatePath = join(__dirname, 'templates', 'viewer-settings.ejs');
const snapshotsTemplatePath = join(__dirname, 'templates', 'viewer-snapshots.ejs');
const snapshotDetailTemplatePath = join(__dirname, 'templates', 'viewer-snapshot-detail.ejs');
const isDev = process.env.NODE_ENV !== 'production';

let templateCache = null;
let detailTemplateCache = null;
let compareTemplateCache = null;
let settingsTemplateCache = null;
let snapshotsTemplateCache = null;
let snapshotDetailTemplateCache = null;

async function getTemplate() {
  if (isDev) {
    return readFile(templatePath, 'utf-8');
  }
  if (!templateCache) {
    templateCache = await readFile(templatePath, 'utf-8');
  }
  return templateCache;
}

async function getDetailTemplate() {
  if (isDev) {
    return readFile(detailTemplatePath, 'utf-8');
  }
  if (!detailTemplateCache) {
    detailTemplateCache = await readFile(detailTemplatePath, 'utf-8');
  }
  return detailTemplateCache;
}

async function getCompareTemplate() {
  if (isDev) {
    return readFile(compareTemplatePath, 'utf-8');
  }
  if (!compareTemplateCache) {
    compareTemplateCache = await readFile(compareTemplatePath, 'utf-8');
  }
  return compareTemplateCache;
}

async function getSettingsTemplate() {
  if (isDev) {
    return readFile(settingsTemplatePath, 'utf-8');
  }
  if (!settingsTemplateCache) {
    settingsTemplateCache = await readFile(settingsTemplatePath, 'utf-8');
  }
  return settingsTemplateCache;
}

async function getSnapshotsTemplate() {
  if (isDev) {
    return readFile(snapshotsTemplatePath, 'utf-8');
  }
  if (!snapshotsTemplateCache) {
    snapshotsTemplateCache = await readFile(snapshotsTemplatePath, 'utf-8');
  }
  return snapshotsTemplateCache;
}

async function getSnapshotDetailTemplate() {
  if (isDev) {
    return readFile(snapshotDetailTemplatePath, 'utf-8');
  }
  if (!snapshotDetailTemplateCache) {
    snapshotDetailTemplateCache = await readFile(snapshotDetailTemplatePath, 'utf-8');
  }
  return snapshotDetailTemplateCache;
}

export async function renderViewer({
  logs,
  limit,
  page,
  totalPages,
  total,
  baseUrlFilters,
  aliasFilters,
  methodFilters,
  pinnedFilter,
  aliasByHost,
}) {
  const template = await getTemplate();
  return ejs.render(template, {
    logs,
    limit,
    page,
    totalPages,
    total,
    baseUrlFilters,
    aliasFilters,
    methodFilters,
    pinnedFilter,
    aliasByHost,
  });
}

export async function renderViewerDetail(log, backLink, preview) {
  const template = await getDetailTemplate();
  return ejs.render(template, {
    log,
    backLink,
    preview,
  });
}

export async function renderViewerCompare({
  logs,
  backLink,
  error,
  compareData,
  compareSections,
  baselineIndex,
}) {
  const template = await getCompareTemplate();
  return ejs.render(template, {
    logs,
    backLink,
    error,
    compareData,
    compareSections,
    baselineIndex,
  });
}

export async function renderViewerSettings(config, runtimeInfo = {}) {
  const template = await getSettingsTemplate();
  return ejs.render(template, { config, runtimeInfo });
}

export async function renderViewerSnapshots({ groups }) {
  const template = await getSnapshotsTemplate();
  return ejs.render(template, { groups });
}

export async function renderViewerSnapshotDetail({ snapshot, host, model, key }) {
  const template = await getSnapshotDetailTemplate();
  return ejs.render(template, {
    snapshot,
    host,
    model,
    key,
    detail: buildSnapshotDetailView({ snapshot, host, model, key }),
  });
}

function buildSnapshotDetailView({ snapshot, host, model, key }) {
  const request = snapshot.request || {};
  const response = snapshot.response || {};
  const metadata = snapshot.metadata || {};
  const status = response.status || snapshot.status || metadata.status || 'n/a';
  const statusNumber = Number(status);

  return {
    request,
    response,
    key: snapshot.key || key,
    method: request.method || snapshot.method || 'UNKNOWN',
    status,
    statusClass: Number.isFinite(statusNumber) ? (statusNumber < 400 ? 'ok' : 'bad') : '',
    recordedAt: snapshot.recordedAt || metadata.recordedAt || 'n/a',
    host: metadata.host || host,
    model: metadata.model || snapshot.model || model,
    path: metadata.path || requestPathname(request.url),
    requestJson: formatJson(request),
    responseJson: formatJson(response.is_binary ? formatBinaryResponse(response) : response),
  };
}

function requestPathname(url) {
  if (!url) return 'n/a';
  try {
    return new URL(url).pathname;
  } catch {
    return 'n/a';
  }
}

function formatBinaryResponse(response) {
  return `binary, ${response.body_base64 ? Buffer.from(response.body_base64, 'base64').length : 0} bytes`;
}

function formatJson(value) {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
