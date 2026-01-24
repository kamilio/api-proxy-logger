#!/usr/bin/env node

import 'dotenv/config';
import { fork } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../src/server.js';
import { buildServerConfig } from '../src/server-config.js';
import { getPidFilePath } from '../src/paths.js';

const START_TIMEOUT_MS = 5000;
const STOP_TIMEOUT_MS = 5000;
const STOP_POLL_INTERVAL_MS = 100;

const [command] = process.argv.slice(2);

if (!command || command === 'help' || command === '--help') {
  printHelp();
  process.exit(0);
}

try {
  if (command === 'start') {
    await startDaemon();
  } else if (command === 'stop') {
    await stopDaemon();
  } else if (command === 'restart') {
    await restartDaemon();
  } else if (command === 'status') {
    await statusDaemon();
  } else if (command === 'run') {
    await runServer();
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/daemon.js start
  node scripts/daemon.js stop
  node scripts/daemon.js restart
  node scripts/daemon.js status
`);
}

async function startDaemon() {
  const pidPath = getPidFilePath();
  ensureDir(pidPath);

  const existingPid = readPid(pidPath);
  if (existingPid && isProcessRunning(existingPid)) {
    throw new Error(`Process already running (PID ${existingPid}).`);
  }
  if (existingPid && !isProcessRunning(existingPid)) {
    safeUnlink(pidPath);
  }

  const child = fork(fileURLToPath(import.meta.url), ['run'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, LLM_DEBUGGER_DAEMON: '1' },
  });

  let ready;
  try {
    ready = await waitForReady(child, START_TIMEOUT_MS);
  } catch (error) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
  writePid(pidPath, child.pid);

  const viewerUrl = `http://${ready.host}:${ready.port}/__viewer__`;
  console.log(`Started llm-debugger on ${viewerUrl} (PID ${child.pid}).`);

  child.disconnect();
  child.unref();
}

async function stopDaemon() {
  const pidPath = getPidFilePath();
  const pid = readPid(pidPath);
  if (!pid) {
    console.log('No PID file found. Nothing to stop.');
    return;
  }

  if (!isProcessRunning(pid)) {
    safeUnlink(pidPath);
    console.log(`Stale PID file removed (${pid}).`);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code === 'ESRCH') {
      safeUnlink(pidPath);
      console.log(`Process ${pid} is not running.`);
      return;
    }
    throw error;
  }
  const exited = await waitForExit(pid, STOP_TIMEOUT_MS);
  if (!exited) {
    throw new Error(`Process ${pid} did not exit after SIGTERM.`);
  }

  safeUnlink(pidPath);
  console.log(`Stopped llm-debugger (PID ${pid}).`);
}

async function restartDaemon() {
  await stopDaemon();
  await startDaemon();
}

async function statusDaemon() {
  const pidPath = getPidFilePath();
  const pid = readPid(pidPath);
  if (!pid) {
    console.log('llm-debugger is not running.');
    process.exitCode = 1;
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`llm-debugger is running (PID ${pid}).`);
    return;
  }

  safeUnlink(pidPath);
  console.log(`llm-debugger is not running. Removed stale PID ${pid}.`);
  process.exitCode = 1;
}

async function runServer() {
  let server;
  try {
    const { config } = await buildServerConfig();

    server = createServer(config, {
      onListen: () => {
        notifyParent({ type: 'ready', host: config.host, port: config.port });
      },
    });

    server.on('error', (error) => {
      notifyParent({ type: 'error', message: error.message });
      console.error(error.message);
      process.exit(1);
    });

    process.on('SIGTERM', () => {
      server.close(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    notifyParent({ type: 'error', message: error.message });
    if (!process.send) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

function notifyParent(payload) {
  if (typeof process.send === 'function') {
    process.send(payload);
  }
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readPid(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8').trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid)) return null;
  return pid;
}

function writePid(filePath, pid) {
  writeFileSync(filePath, String(pid), 'utf-8');
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function isProcessRunning(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await delay(STOP_POLL_INTERVAL_MS);
  }
  return !isProcessRunning(pid);
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for server to start.'));
    }, timeoutMs);

    child.on('message', (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timeout);
        resolve(message);
      } else if (message?.type === 'error') {
        clearTimeout(timeout);
        reject(new Error(message.message || 'Server failed to start.'));
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server process exited (${code ?? 'unknown'}).`));
    });
  });
}
