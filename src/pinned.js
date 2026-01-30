import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { getBaseDir } from './paths.js';

function getPinnedFilePath() {
  return join(getBaseDir(), 'pinned.yaml');
}

export function loadPinned() {
  const pinnedPath = getPinnedFilePath();
  if (!existsSync(pinnedPath)) {
    return [];
  }
  try {
    const content = readFileSync(pinnedPath, 'utf-8');
    const parsed = yaml.load(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePinned(pinned) {
  const pinnedPath = getPinnedFilePath();
  mkdirSync(dirname(pinnedPath), { recursive: true });
  const content = yaml.dump(pinned, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  writeFileSync(pinnedPath, content, 'utf-8');
}

export function isPinned(logId) {
  const pinned = loadPinned();
  return pinned.includes(logId);
}

export function pinLog(logId) {
  const pinned = loadPinned();
  if (!pinned.includes(logId)) {
    pinned.push(logId);
    savePinned(pinned);
  }
  return { pinned: true, logId };
}

export function unpinLog(logId) {
  const pinned = loadPinned();
  const index = pinned.indexOf(logId);
  if (index !== -1) {
    pinned.splice(index, 1);
    savePinned(pinned);
  }
  return { pinned: false, logId };
}

export function getPinnedSet() {
  return new Set(loadPinned());
}
