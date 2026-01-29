import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import { DEFAULT_CONFIG } from './config.js';
import { getConfigEditPath } from './config-file.js';
import { resolveAliasConfig } from './aliases.js';

const ALIAS_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function normalizeConfig(parsed) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(parsed || {}),
  };
  config.env = {
    ...DEFAULT_CONFIG.env,
    ...(parsed?.env || {}),
  };
  config.aliases = {
    ...DEFAULT_CONFIG.aliases,
    ...(parsed?.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {}),
  };
  return config;
}

function readConfigFile(configPath) {
  if (!existsSync(configPath)) {
    return normalizeConfig({});
  }
  const content = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(content) || {};
  return normalizeConfig(parsed);
}

function writeConfigFile(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true });
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  writeFileSync(configPath, content, 'utf-8');
}

export function addAliasToConfig(aliasName, url, configPath = getConfigEditPath()) {
  if (!ALIAS_NAME_PATTERN.test(aliasName || '')) {
    throw new Error('Alias must be a safe path segment (letters, numbers, ".", "_", "-").');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(String(url));
  } catch {
    throw new Error('Alias URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Alias URL must use http or https.');
  }

  const config = readConfigFile(configPath);
  const existing = config.aliases?.[aliasName];
  config.aliases = {
    ...config.aliases,
    [aliasName]: {
      ...(existing && typeof existing === 'object' ? existing : {}),
      url: parsedUrl.toString(),
    },
  };

  writeConfigFile(configPath, config);
  return { configPath, alias: aliasName, url: parsedUrl.toString() };
}

export function removeAliasFromConfig(aliasName, configPath = getConfigEditPath()) {
  if (!ALIAS_NAME_PATTERN.test(aliasName || '')) {
    throw new Error('Alias must be a safe path segment (letters, numbers, ".", "_", "-").');
  }

  const config = readConfigFile(configPath);
  if (!Object.prototype.hasOwnProperty.call(config.aliases || {}, aliasName)) {
    throw new Error(`Alias "${aliasName}" not found.`);
  }

  const updatedAliases = { ...config.aliases };
  delete updatedAliases[aliasName];
  config.aliases = updatedAliases;

  writeConfigFile(configPath, config);
  return { configPath, alias: aliasName };
}

export function setDefaultAliasInConfig(aliasName, configPath = getConfigEditPath()) {
  if (!ALIAS_NAME_PATTERN.test(aliasName || '')) {
    throw new Error('Alias must be a safe path segment (letters, numbers, ".", "_", "-").');
  }

  const config = readConfigFile(configPath);
  const resolved = resolveAliasConfig(config.aliases, aliasName);
  if (!resolved) {
    throw new Error(`Alias "${aliasName}" not found.`);
  }

  config.default_alias = aliasName;
  writeConfigFile(configPath, config);
  return { configPath, alias: aliasName };
}

const ALLOWED_CONFIG_KEYS = ['enabled', 'default_alias'];

function parseValue(value) {
  if (value === true || value === false) return value;
  if (value === null) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

export function setConfigValue(key, value, configPath = getConfigEditPath()) {
  if (!ALLOWED_CONFIG_KEYS.includes(key)) {
    throw new Error(`Unknown config key: ${key}. Allowed keys: ${ALLOWED_CONFIG_KEYS.join(', ')}`);
  }

  const config = readConfigFile(configPath);
  config[key] = parseValue(value);
  writeConfigFile(configPath, config);
  return { configPath, key, value: config[key] };
}
