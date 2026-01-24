#!/usr/bin/env node

import 'dotenv/config';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import {
  disableAnimations,
  ensureLatestLog,
  getScreenshotPath,
  startScreenshotServer,
  stopScreenshotServer,
} from './screenshot-helpers.js';

async function main() {
  const { server, viewerUrl, outputDir } = await startScreenshotServer();
  let browser;
  try {
    const log = await ensureLatestLog(outputDir);
    const provider = encodeURIComponent(log._viewer_provider || 'unknown');
    const filename = encodeURIComponent(log._viewer_file);
    const detailUrl = `${viewerUrl}/${provider}/${filename}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.header');
    await disableAnimations(page);
    await page.waitForTimeout(100);
    const screenshotPath = getScreenshotPath('detail.png');
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
