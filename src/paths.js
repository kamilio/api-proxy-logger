import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_BASE_DIR = join(homedir(), '.llm-debugger');

export function expandHomePath(pathValue) {
  if (!pathValue) return pathValue;
  if (pathValue === '~') return homedir();
  if (pathValue.startsWith('~/') || pathValue.startsWith('~\\')) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

export function resolvePath(pathValue) {
  return resolve(expandHomePath(pathValue));
}

export function getBaseDir() {
  return resolvePath(process.env.LLM_DEBUGGER_HOME || DEFAULT_BASE_DIR);
}

export function getConfigPath() {
  const baseDir = getBaseDir();
  return resolvePath(process.env.CONFIG_PATH || join(baseDir, 'config.yaml'));
}

export function getHomeConfigPath() {
  const baseDir = getBaseDir();
  return resolvePath(join(baseDir, 'config.yaml'));
}

export function getLogsDir() {
  const baseDir = getBaseDir();
  return resolvePath(process.env.LOG_OUTPUT_DIR || join(baseDir, 'logs'));
}

export function getPidFilePath() {
  const baseDir = getBaseDir();
  return resolvePath(join(baseDir, '.pid'));
}
