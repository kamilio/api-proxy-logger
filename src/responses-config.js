import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import { getResponsesPath } from './paths.js';

// Support environment-based responses path
let cachedPath = null;

const DEFAULT_RESPONSES = {
  mock_responses: {},
};

let responsesCache = null;

export function loadResponsesConfig() {
  const responsesPath = getResponsesPath();
  if (responsesCache && cachedPath === responsesPath) return responsesCache;

  try {
    const content = readFileSync(responsesPath, 'utf-8');
    const parsed = yaml.load(content) || {};
    responsesCache = { ...DEFAULT_RESPONSES, ...parsed };
    cachedPath = responsesPath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      responsesCache = { ...DEFAULT_RESPONSES };
      cachedPath = responsesPath;
    } else {
      throw error;
    }
  }

  return responsesCache;
}

export function saveResponsesConfig(updatedConfig) {
  const responsesPath = getResponsesPath();
  responsesCache = updatedConfig;
  cachedPath = responsesPath;
  mkdirSync(dirname(responsesPath), { recursive: true });
  const content = yaml.dump(updatedConfig, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  writeFileSync(responsesPath, content, 'utf-8');
}

export function updateResponseMapping(apiShape, message, responsePath) {
  const config = loadResponsesConfig();
  if (!config.mock_responses[apiShape]) {
    config.mock_responses[apiShape] = {};
  }
  config.mock_responses[apiShape][message] = responsePath;
  saveResponsesConfig(config);
  return config;
}
