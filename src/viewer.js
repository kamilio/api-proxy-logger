import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'templates', 'viewer.ejs');
const detailTemplatePath = join(__dirname, 'templates', 'viewer-detail.ejs');
const isDev = process.env.NODE_ENV !== 'production';

let templateCache = null;
let detailTemplateCache = null;

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

export async function renderViewer(logs, limit, providerFilter, providers, providerShapes, apiShapes) {
  const template = await getTemplate();
  return ejs.render(template, {
    logs,
    limit,
    providerFilter,
    providers,
    providerShapes,
    apiShapes,
  });
}

export async function renderViewerDetail(log, apiShapes, providerShapes, backLink) {
  const template = await getDetailTemplate();
  return ejs.render(template, {
    log,
    apiShapes,
    providerShapes,
    backLink,
  });
}
