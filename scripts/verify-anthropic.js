#!/usr/bin/env node

import 'dotenv/config';

/**
 * Verify the proxy works with Anthropic API
 */

const apiKey = process.env.POE_API_KEY;
if (!apiKey) {
  throw new Error('POE_API_KEY environment variable is required');
}

const proxyHost = process.env.PROXY_HOST;
if (!proxyHost) {
  throw new Error('PROXY_HOST environment variable is required');
}

const proxyPort = process.env.PROXY_PORT;
if (!proxyPort) {
  throw new Error('PROXY_PORT environment variable is required');
}

const proxyUrl = `http://${proxyHost}:${proxyPort}`;

async function main() {
  console.log(`Testing proxy at ${proxyUrl}\n`);

  const response = await fetch(`${proxyUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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

  console.log('\n\nVerification complete! Check ./logs for the captured request.');
}

main();
