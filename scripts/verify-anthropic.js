#!/usr/bin/env node

import 'dotenv/config';
import { getLogsDir } from '../src/paths.js';
import { startVerifyServer, stopVerifyServer } from './verify-helpers.js';

/**
 * Verify the proxy works with Anthropic API
 */

const apiKey = process.env.POE_API_KEY;
if (!apiKey) {
  throw new Error('POE_API_KEY environment variable is required');
}

async function main() {
  let server;
  try {
    const verifyServer = await startVerifyServer();
    server = verifyServer.server;
    const proxyUrl = verifyServer.proxyUrl;

    console.log(`Testing proxy at ${proxyUrl}\n`);

    const response = await fetch(`${proxyUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4.5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Say "Hello from proxy test!" and nothing else.' }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('Response:');
    console.log(data.content?.[0]?.text || JSON.stringify(data, null, 2));

    console.log(`\n\nVerification complete! Check ${getLogsDir()} for the captured request.`);
  } finally {
    await stopVerifyServer(server);
  }
}

main();
