import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const CONFIG_PATH = join(process.cwd(), 'config.yaml');

let configCache = null;

export function loadConfig() {
  if (configCache) return configCache;

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    configCache = yaml.load(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      configCache = { ignore_routes: [], hide_from_viewer: [] };
    } else {
      throw error;
    }
  }

  return configCache;
}

export function shouldIgnoreRoute(path) {
  const config = loadConfig();
  const ignoreRoutes = config.ignore_routes || [];

  for (const pattern of ignoreRoutes) {
    if (matchPattern(pattern, path)) {
      return true;
    }
  }

  return false;
}

export function shouldHideFromViewer(path) {
  const config = loadConfig();
  const hideRoutes = config.hide_from_viewer || [];

  for (const pattern of hideRoutes) {
    if (matchPattern(pattern, path)) {
      return true;
    }
  }

  return false;
}

function matchPattern(pattern, path) {
  // Convert glob pattern to regex
  // * matches anything except /
  // ** matches anything including /
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '\x00')      // placeholder for **
    .replace(/\*/g, '[^/]*')       // * matches anything except /
    .replace(/\x00/g, '.*');       // ** matches anything

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}
