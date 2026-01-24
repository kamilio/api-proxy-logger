#!/usr/bin/env node

import 'dotenv/config';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import {
  disableAnimations,
  getScreenshotPath,
  startScreenshotServer,
  stopScreenshotServer,
} from './screenshot-helpers.js';
import { getRecentLogs } from '../src/logger.js';

async function main() {
  const { server, viewerUrl, outputDir } = await startScreenshotServer();
  let browser;
  try {
    const logs = await getRecentLogs(outputDir, { limit: 3 });
    if (logs.length < 3) {
      throw new Error('Need at least 3 logs to capture compare screenshot.');
    }

    const selections = logs.map((log) => {
      const provider = encodeURIComponent(log._viewer_provider || log.provider || 'unknown');
      const filename = encodeURIComponent(log._viewer_file);
      return `${provider}/${filename}`;
    });

    const params = new URLSearchParams();
    params.set('logs', selections.join(','));
    const compareUrl = `${viewerUrl}/compare?${params.toString()}`;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(compareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.compare-grid');
    await disableAnimations(page);
    await page.waitForTimeout(100);
    const screenshotPath = getScreenshotPath('compare.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(pathToFileURL(screenshotPath).toString());
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopScreenshotServer(server);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
