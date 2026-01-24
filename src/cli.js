#!/usr/bin/env node

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intro, log, note, spinner, outro } from '@clack/prompts';
import { createServer } from './server.js';
import { getConfigPath, getHomeConfigPath, getLogsDir } from './paths.js';
import { getConfigDisplayContent, getConfigEditPath } from './config-file.js';
import { loadConfig } from './config.js';
import { getEditorCandidates } from './editor.js';

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  if (flags.help || positionals.includes('help')) {
    printHelp();
    return;
  }

  // Precedence: CLI flags > env vars > config file > defaults.
  applyCliEnv(flags);

  const [command, subcommand, ...rest] = positionals;

  if (command === 'config') {
    runConfigCommand(subcommand, rest);
    return;
  }

  if (flags.init || positionals.includes('init')) {
    runInit(flags.force === true);
    return;
  }

  loadConfig();

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
  let resolvedTargetUrl = targetUrl;
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error('TARGET_URL must be a valid URL (e.g. https://api.openai.com)');
  }

  if (process.env.TARGET_PORT) {
    const targetPort = parseInt(process.env.TARGET_PORT, 10);
    if (!Number.isFinite(targetPort) || targetPort <= 0 || targetPort > 65535) {
      throw new Error('TARGET_PORT must be a valid TCP port (1-65535)');
    }
    parsedTarget.port = String(targetPort);
    resolvedTargetUrl = parsedTarget.toString();
  }

  providerLabel = parsedTarget.hostname || parsedTarget.host || 'unknown';

  const config = {
    host: proxyHost,
    port: portNumber,
    outputDir: getLogsDir(),
    targetUrl: resolvedTargetUrl,
    provider: providerLabel,
  };

  intro('llm-debugger');
  log.info(`Target: ${resolvedTargetUrl}`);

  const endpointSummary = [
    `Proxy:  http://${proxyHost}:${proxyPort}/* to ${resolvedTargetUrl}`,
  ].join('\n');

  const startSpinner = spinner();
  startSpinner.start('Starting server');

  createServer(config, {
    onListen: () => {
      startSpinner.stop(`Server listening on http://${proxyHost}:${proxyPort}/viewer`);
      note(endpointSummary, 'Endpoints');
    },
  });
}

function printHelp() {
  console.log(`
Usage:
  llm-debugger [options]
  llm-debugger init [--force]
  llm-debugger config show
  llm-debugger config edit

Options:
  --proxy-host <host>  Proxy host (default: localhost)
  --proxy-port <port>  Proxy port (default: 8000)
  --target <url>       Base target URL for proxying (required)
  --target-port <port> Override target URL port
  --home <dir>         Base directory for config/logs
  --config <path>      Path to config.yaml
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
  if (flags.logs) process.env.LOG_OUTPUT_DIR = String(flags.logs);
  if (flags['proxy-host']) process.env.PROXY_HOST = String(flags['proxy-host']);
  if (flags['proxy-port']) process.env.PROXY_PORT = String(flags['proxy-port']);
  if (flags.target) process.env.TARGET_URL = String(flags.target);
  if (flags['target-port']) process.env.TARGET_PORT = String(flags['target-port']);
}

function runInit(force) {
  intro('llm-debugger init');

  const configPath = getConfigPath();
  const homeConfigPath = getHomeConfigPath();

  const cliDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = join(cliDir, '..', 'config.yaml');
  const resolvedTemplate = resolve(templatePath);
  const resolvedConfig = resolve(configPath);
  const resolvedHome = resolve(homeConfigPath);

  if (!existsSync(homeConfigPath)) {
    mkdirSync(dirname(homeConfigPath), { recursive: true });
    if (existsSync(resolvedTemplate)) {
      copyFileSync(resolvedTemplate, homeConfigPath);
    }
  }

  const targetPath = resolvedConfig === resolvedTemplate ? resolvedHome : resolvedConfig;
  if (existsSync(targetPath) && !force) {
    log.warn(`Config already exists at ${targetPath}`);
    log.info('Re-run with --force to overwrite.');
    outro('No changes made.');
    return;
  }
  if (!existsSync(targetPath) || force) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(templatePath, targetPath);
  }
  log.success(`Copied config to ${targetPath}`);
  outro('Init complete.');
}

function runConfigCommand(subcommand) {
  if (!subcommand || subcommand === 'show') {
    const content = getConfigDisplayContent();
    process.stdout.write(content);
    return;
  }

  if (subcommand === 'edit') {
    runConfigEdit();
    return;
  }

  log.error(`Unknown config command: ${subcommand}`);
  process.exitCode = 1;
}

function runConfigEdit() {
  loadConfig();
  const configPath = getConfigEditPath();
  const candidates = getEditorCandidates();

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [configPath], {
      stdio: 'inherit',
      shell: candidate.shell,
    });
    if (!result.error && result.status === 0) {
      return;
    }
  }

  console.log(configPath);
}

main();
