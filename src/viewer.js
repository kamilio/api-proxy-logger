import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'templates', 'viewer.ejs');

let templateCache = null;

async function getTemplate() {
  if (!templateCache) {
    templateCache = await readFile(templatePath, 'utf-8');
  }
  return templateCache;
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
