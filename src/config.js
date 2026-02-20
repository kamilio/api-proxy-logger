import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { getConfigPath, getHomeConfigPath } from './paths.js';

// Support environment-based configuration paths
let cachedPath = null;
export const DEFAULT_CONFIG = {
  enabled: true,
  env: {},
  ignore_routes: [],
  hide_from_viewer: [],
  default_alias: null,
  aliases: {},
  max_logs: 100,
  editor: null,
};

let configCache = null;
let cachedMtimeMs = null;
const TEMPLATE_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'config.yaml'
);

export function loadConfig({ forceReload = false } = {}) {
  const homeConfigPath = getHomeConfigPath();
  ensureHomeConfig(homeConfigPath);
  let configPath = getConfigPath();
  if (resolve(configPath) === TEMPLATE_CONFIG_PATH) {
    configPath = homeConfigPath;
  }
  if (!forceReload && configCache && cachedPath === configPath) {
    const currentMtime = getConfigMtime(configPath);
    if (currentMtime !== null && cachedMtimeMs === currentMtime) {
      return configCache;
    }
    if (currentMtime === null && cachedMtimeMs === null) {
      return configCache;
    }
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content) || {};
    const parsedAliases =
      parsed.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {};
    configCache = {
      ...DEFAULT_CONFIG,
      ...parsed,
      env: { ...DEFAULT_CONFIG.env, ...(parsed.env || {}) },
      aliases: { ...DEFAULT_CONFIG.aliases, ...parsedAliases },
    };
    cachedPath = configPath;
    cachedMtimeMs = getConfigMtime(configPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      configCache = { ...DEFAULT_CONFIG };
      cachedPath = configPath;
      writeDefaultConfig(configPath, configCache);
      cachedMtimeMs = getConfigMtime(configPath);
    } else {
      throw error;
    }
  }

  applyEnv(configCache.env);
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

function applyEnv(envConfig) {
  if (!envConfig || typeof envConfig !== 'object') return;
  for (const [key, value] of Object.entries(envConfig)) {
    if (value === undefined || value === null) continue;
    // Config env is lowest precedence; do not override existing env.
    if (process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }
}

function getConfigMtime(configPath) {
  try {
    return statSync(configPath).mtimeMs;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeDefaultConfig(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true });
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  writeFileSync(configPath, content, 'utf-8');
}

function ensureHomeConfig(homeConfigPath) {
  if (existsSync(homeConfigPath)) return;
  mkdirSync(dirname(homeConfigPath), { recursive: true });
  if (existsSync(TEMPLATE_CONFIG_PATH)) {
    copyFileSync(TEMPLATE_CONFIG_PATH, homeConfigPath);
    return;
  }
  writeDefaultConfig(homeConfigPath, DEFAULT_CONFIG);
}
