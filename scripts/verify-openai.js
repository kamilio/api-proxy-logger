#!/usr/bin/env node

import 'dotenv/config';
import { getLogsDir } from '../src/paths.js';
import { startVerifyServer, stopVerifyServer } from './verify-helpers.js';

/**
 * Verify the proxy works with OpenAI API (streaming)
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

    const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'EchoBot',
        messages: [{ role: 'user', content: 'Say "Hello from proxy test!" and nothing else.' }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    console.log('Streaming response:\n');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('\n\n[DONE]');
          continue;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          process.stdout.write(content);
        } catch {
          // ignore parse errors
        }
      }
    }

    console.log(`\n\nVerification complete! Check ${getLogsDir()} for the captured request.`);
  } finally {
    await stopVerifyServer(server);
  }
}

main();
