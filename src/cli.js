#!/usr/bin/env node

import 'dotenv/config';
import { createServer } from './server.js';

const targetUrl = process.env.TARGET_URL;
if (!targetUrl) {
  throw new Error('TARGET_URL environment variable is required (e.g. https://api.poe.com)');
}

const poeApiKey = process.env.POE_API_KEY;
if (!poeApiKey) {
  throw new Error('POE_API_KEY environment variable is required (get it from https://poe.com/api_key)');
}

const proxyHost = process.env.PROXY_HOST;
if (!proxyHost) {
  throw new Error('PROXY_HOST environment variable is required (e.g. localhost)');
}

const proxyPort = process.env.PROXY_PORT;
if (!proxyPort) {
  throw new Error('PROXY_PORT environment variable is required (e.g. 8000)');
}

const config = {
  targetUrl,
  host: proxyHost,
  port: parseInt(proxyPort, 10),
  outputDir: './logs',
};

console.log(`
╔══════════════════════════════════════════════════════════╗
║                   LLM API Debugger                       ║
╚══════════════════════════════════════════════════════════╝

  Target API:   ${config.targetUrl}
  Proxy Host:   ${proxyHost}
  Proxy Port:   ${proxyPort}
  Proxy URL:    http://${proxyHost}:${proxyPort}
  Logs:         ${config.outputDir}
  Viewer:       http://${proxyHost}:${proxyPort}/viewer

  Set your LLM client's base URL to http://${proxyHost}:${proxyPort}
`);

createServer(config);
