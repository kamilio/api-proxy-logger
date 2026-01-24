import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'templates', 'viewer.ejs');
const detailTemplatePath = join(__dirname, 'templates', 'viewer-detail.ejs');
const compareTemplatePath = join(__dirname, 'templates', 'viewer-compare.ejs');
const isDev = process.env.NODE_ENV !== 'production';

let templateCache = null;
let detailTemplateCache = null;
let compareTemplateCache = null;

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

export async function renderViewer({
  logs,
  limit,
  baseUrlFilters,
  methodFilters,
}) {
  const template = await getTemplate();
  return ejs.render(template, {
    logs,
    limit,
    baseUrlFilters,
    methodFilters,
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

export async function renderViewerCompare({ logs, backLink, error }) {
  const template = await getCompareTemplate();
  return ejs.render(template, {
    logs,
    backLink,
    error,
  });
}
