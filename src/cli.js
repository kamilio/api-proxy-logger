#!/usr/bin/env node

import 'dotenv/config';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intro, log, note, spinner, outro } from '@clack/prompts';
import { createServer } from './server.js';
import { getConfigPath, getLogsDir } from './paths.js';

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  if (flags.help || positionals.includes('help')) {
    printHelp();
    return;
  }

  applyCliEnv(flags);

  if (flags.init || positionals.includes('init')) {
    runInit(flags.force === true);
    return;
  }

  const proxyHost = process.env.PROXY_HOST || 'localhost';

  const proxyPort = process.env.PROXY_PORT || '8000';
  const portNumber = parseInt(proxyPort, 10);
  if (!Number.isFinite(portNumber)) {
    throw new Error('PROXY_PORT must be a valid number');
  }

  const targetUrl = process.env.TARGET_URL;
  if (!targetUrl) {
    throw new Error('TARGET_URL is required. Use --target <url>.');
  }

  let providerLabel = 'unknown';
  try {
    const parsedTarget = new URL(targetUrl);
    providerLabel = parsedTarget.hostname || parsedTarget.host || 'unknown';
  } catch {
    throw new Error('TARGET_URL must be a valid URL (e.g. https://api.openai.com)');
  }

  const config = {
    host: proxyHost,
    port: portNumber,
    outputDir: getLogsDir(),
    targetUrl,
    provider: providerLabel,
  };

  intro('llm-debugger');
  log.info(`Target: ${targetUrl}`);

  const endpointSummary = [
    `Proxy URL:    http://${proxyHost}:${proxyPort}`,
    `Proxy Route:  http://${proxyHost}:${proxyPort}/proxy/*`,
    `Mock Route:   http://${proxyHost}:${proxyPort}/api/<shape>/*`,
    `Viewer:       http://${proxyHost}:${proxyPort}/viewer`,
    `Logs:         ${config.outputDir}`,
    `Client Base:  http://${proxyHost}:${proxyPort}`,
    `Target Host:  ${providerLabel}`,
  ].join('\n');

  const startSpinner = spinner();
  startSpinner.start('Starting server');

  createServer(config, {
    onListen: () => {
      startSpinner.stop(`Server listening on ${proxyHost}:${proxyPort}`);
      note(endpointSummary, 'Endpoints');
    },
  });
}

function printHelp() {
  console.log(`
Usage:
  llm-debugger [options]
  llm-debugger init [--force]

Options:
  --proxy-host <host>  Proxy host (default: localhost)
  --proxy-port <port>  Proxy port (default: 8000)
  --target <url>       Base target URL for proxying (required)
  --home <dir>         Base directory for config/logs
  --config <path>      Path to config.yaml
  --responses <path>   Path to responses.yaml
  --logs <dir>         Log output directory
  --force              Overwrite existing config on init
  -h, --help           Show this help message
`);
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [rawKey, inlineValue] = arg.slice(2).split('=');
      const key = rawKey.trim();
      if (inlineValue !== undefined) {
        flags[key] = inlineValue;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      if (arg === '-h') {
        flags.help = true;
        continue;
      }
    }

    positionals.push(arg);
  }

  return { flags, positionals };
}

function applyCliEnv(flags) {
  if (flags.home) process.env.LLM_DEBUGGER_HOME = String(flags.home);
  if (flags.config) process.env.CONFIG_PATH = String(flags.config);
  if (flags.responses) process.env.RESPONSES_PATH = String(flags.responses);
  if (flags.logs) process.env.LOG_OUTPUT_DIR = String(flags.logs);
  if (flags['proxy-host']) process.env.PROXY_HOST = String(flags['proxy-host']);
  if (flags['proxy-port']) process.env.PROXY_PORT = String(flags['proxy-port']);
  if (flags.target) process.env.TARGET_URL = String(flags.target);
}

function runInit(force) {
  intro('llm-debugger init');

  const configPath = getConfigPath();
  if (existsSync(configPath) && !force) {
    log.warn(`Config already exists at ${configPath}`);
    log.info('Re-run with --force to overwrite.');
    outro('No changes made.');
    return;
  }

  const cliDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = join(cliDir, '..', 'config.yaml');

  mkdirSync(dirname(configPath), { recursive: true });
  copyFileSync(templatePath, configPath);
  log.success(`Copied config to ${configPath}`);
  outro('Init complete.');
}

main();
