import { mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { createServer } from '../src/server.js';
import { buildServerConfig } from '../src/server-config.js';
import { getRecentLogs, logRequest } from '../src/logger.js';

const TEST_HOME = resolve(process.cwd(), '.test-data');
const SCREENSHOT_DIR = join(TEST_HOME, 'screenshots');

export function applyScreenshotEnv() {
  if (!process.env.LLM_DEBUGGER_HOME) {
    process.env.LLM_DEBUGGER_HOME = TEST_HOME;
  }
  if (!process.env.TARGET_URL) {
    process.env.TARGET_URL = 'https://api.poe.com';
  }
  if (!process.env.PROXY_HOST) {
    process.env.PROXY_HOST = '127.0.0.1';
  }
  if (!process.env.PROXY_PORT) {
    process.env.PROXY_PORT = '8000-8010';
  }
}

export async function startScreenshotServer() {
  applyScreenshotEnv();
  const { config } = await buildServerConfig();
  const server = createServer(config);
  await once(server, 'listening');
  ensureDir(SCREENSHOT_DIR);
  return {
    server,
    config,
    viewerUrl: `http://${config.host}:${config.port}/__viewer__`,
    outputDir: config.outputDir,
  };
}

export async function stopScreenshotServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

export async function ensureLatestLog(outputDir) {
  let [log] = await getRecentLogs(outputDir, { limit: 1 });
  if (!log) {
    await withSilentConsole(() => logRequest(outputDir, buildSampleLog()));
    [log] = await getRecentLogs(outputDir, { limit: 1 });
  }
  if (!log) {
    throw new Error('Unable to create a sample log for screenshots.');
  }
  return log;
}

export function getScreenshotPath(filename) {
  ensureDir(SCREENSHOT_DIR);
  return join(SCREENSHOT_DIR, filename);
}

export async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      * {
        animation: none !important;
        transition: none !important;
      }
    `,
  });
}

function ensureDir(pathname) {
  mkdirSync(pathname, { recursive: true });
}

async function withSilentConsole(fn) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

function buildSampleLog() {
  return {
    provider: 'test',
    method: 'POST',
    url: 'https://api.poe.com/v1/chat/completions',
    status: 200,
    duration: 123,
    requestHeaders: {
      'content-type': 'application/json',
    },
    requestBody: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello from screenshot tool.' }],
      stream: false,
    },
    responseHeaders: {
      'content-type': 'application/json',
    },
    responseBody: {
      id: 'sample-log',
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from the proxy.' },
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    },
    isStreaming: false,
  };
}
