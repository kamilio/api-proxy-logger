import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { getConfigPath } from './paths.js';

// Support environment-based configuration paths
let cachedPath = null;
const DEFAULT_CONFIG = {
  ignore_routes: [],
  hide_from_viewer: [],
};

let configCache = null;

export function loadConfig() {
  const configPath = getConfigPath();
  if (configCache && cachedPath === configPath) return configCache;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content) || {};
    configCache = { ...DEFAULT_CONFIG, ...parsed };
    cachedPath = configPath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      configCache = { ...DEFAULT_CONFIG };
      cachedPath = configPath;
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
