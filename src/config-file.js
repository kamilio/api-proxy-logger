import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { DEFAULT_CONFIG } from './config.js';
import { getConfigPath, getHomeConfigPath } from './paths.js';

const TEMPLATE_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'config.yaml'
);

function ensureTrailingNewline(content) {
  if (!content.endsWith('\n')) {
    return `${content}\n`;
  }
  return content;
}

export function getConfigDisplayContent(configPath = getConfigPath()) {
  if (existsSync(configPath)) {
    return ensureTrailingNewline(readFileSync(configPath, 'utf-8'));
  }
  if (existsSync(TEMPLATE_CONFIG_PATH)) {
    return ensureTrailingNewline(readFileSync(TEMPLATE_CONFIG_PATH, 'utf-8'));
  }
  const fallback = yaml.dump(DEFAULT_CONFIG, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  return ensureTrailingNewline(fallback);
}

export function getConfigEditPath() {
  const configPath = getConfigPath();
  const homeConfigPath = getHomeConfigPath();
  if (resolve(configPath) === TEMPLATE_CONFIG_PATH) {
    return homeConfigPath;
  }
  return configPath;
}
