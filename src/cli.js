#!/usr/bin/env node

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intro, log, note, spinner, outro } from '@clack/prompts';
import { createServer } from './server.js';
import { getConfigPath, getHomeConfigPath } from './paths.js';
import { getConfigDisplayContent, getConfigEditPath } from './config-file.js';
import { getEditorCandidates } from './editor.js';
import { resolveAliasConfig } from './aliases.js';
import { addAliasToConfig, removeAliasFromConfig } from './config-aliases.js';
import { buildServerConfig } from './server-config.js';

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

  const {
    config,
    fileConfig,
    proxyHost,
    portNumber,
    resolvedTargetUrl,
  } = await buildServerConfig();

  intro('llm-debugger');

  const aliasLines = Object.keys(fileConfig.aliases || {})
    .map((alias) => {
      const resolved = resolveAliasConfig(fileConfig.aliases, alias);
      if (!resolved) return null;
      return `Alias:  http://${proxyHost}:${portNumber}/__proxy__/${alias} -> ${resolved.url}`;
    })
    .filter(Boolean);

  const endpointSummary = [
    `Proxy:  http://${proxyHost}:${portNumber}/ to ${resolvedTargetUrl}`,
    ...aliasLines,
  ].join('\n');

  const startSpinner = spinner();
  startSpinner.start('Starting server');

  createServer(config, {
    onListen: () => {
      startSpinner.stop(`View http://${proxyHost}:${portNumber}/__viewer__`);
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
  llm-debugger config add-alias <alias> <url>
  llm-debugger config remove-alias <alias>

Options:
  --proxy-host <host>  Proxy host (default: localhost)
  --port <port>        Proxy port or range (default: 8000-8010)
  --proxy-port <port>  Proxy port (alias of --port)
  --target <url>       Base target URL for proxying (required)
  --target-port <port> Override target URL port
  --home <dir>         Base directory for config/logs
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
  if (flags.port) process.env.PROXY_PORT = String(flags.port);
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

function runConfigCommand(subcommand, args) {
  if (!subcommand || subcommand === 'show') {
    const content = getConfigDisplayContent();
    process.stdout.write(content);
    return;
  }

  if (subcommand === 'edit') {
    runConfigEdit();
    return;
  }

  if (subcommand === 'add-alias') {
    runConfigAddAlias(args);
    return;
  }

  if (subcommand === 'remove-alias') {
    runConfigRemoveAlias(args);
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

function runConfigAddAlias(args) {
  const [aliasName, url] = args;
  if (!aliasName || !url) {
    log.error('Usage: llm-debugger config add-alias <alias> <url>');
    process.exitCode = 1;
    return;
  }

  const result = addAliasToConfig(aliasName, url);
  log.success(`Added alias ${result.alias} -> ${result.url}`);
  log.info(`Config: ${result.configPath}`);
}

function runConfigRemoveAlias(args) {
  const [aliasName] = args;
  if (!aliasName) {
    log.error('Usage: llm-debugger config remove-alias <alias>');
    process.exitCode = 1;
    return;
  }

  const result = removeAliasFromConfig(aliasName);
  log.success(`Removed alias ${result.alias}`);
  log.info(`Config: ${result.configPath}`);
}

main();
