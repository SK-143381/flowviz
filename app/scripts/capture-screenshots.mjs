#!/usr/bin/env node
/**
 * Captures the README screenshots against the real running app.
 *
 * Same server/browser lifecycle as smoke-test.mjs (isolated dev server port, headless
 * Chromium via Playwright) but drives the UI into a handful of specific states and saves a
 * PNG of the viewport for each one, instead of asserting anything. Re-run any time the UI
 * changes enough that the README screenshots go stale.
 *
 * Usage:
 *   npm run screenshots
 *
 * Requires (once per machine): npm install, then npx playwright install chromium.
 * Output: docs/images/*.png (created if missing).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(APP_ROOT, '..', 'docs', 'images');

const PORT = 4311;
const BASE_URL = `http://localhost:${PORT}/flowviz/`;

mkdirSync(OUT_DIR, { recursive: true });

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(300);
  }
  throw new Error(`Dev server at ${url} did not become ready within ${timeoutMs}ms`);
}

function startDevServer() {
  const isWin = process.platform === 'win32';
  const child = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: APP_ROOT,
    shell: isWin,
  });
  return child;
}

async function shoot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  saved ${path.relative(path.join(APP_ROOT, '..'), file)}`);
}

async function confirmAllDecisions(page, max = 30) {
  for (let i = 0; i < max; i++) {
    const btn = page.locator('button:has-text("Confirm assumption")');
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(80);
  }
}

async function main() {
  console.log(`Starting FlowViz dev server on port ${PORT}...`);
  const server = startDevServer();
  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(BASE_URL);
    await page.waitForSelector('text=FlowViz');
    await page.waitForTimeout(300);

    console.log('Capturing overview...');
    await shoot(page, '01-overview');

    console.log('Capturing decision-confirmation loop...');
    await page.fill('#chat-input', 'a web app with a cache in front of the database');
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(400);
    await shoot(page, '02-decision-confirmation');

    await confirmAllDecisions(page);
    await page.waitForTimeout(400);
    console.log('Capturing rendered architecture diagram...');
    await shoot(page, '03-architecture-diagram');

    console.log('Capturing schema / ER pane...');
    await page.click('button:has-text("Load default schema")');
    await page.waitForTimeout(500);
    await shoot(page, '04-schema-er-view');

    console.log('Capturing export menu...');
    await page.locator('.canvas-pane .export-menu').first().scrollIntoViewIfNeeded().catch(() => {});
    await shoot(page, '05-export-menu');

    console.log('Capturing an expanded pane...');
    await page.locator('h1').click();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const aria = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      if (aria?.includes('Database schema panel')) break;
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await shoot(page, '06-expanded-pane');

    console.log('\nDone. Reference these files from README.md under docs/images/.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

main().catch((err) => {
  console.error('Screenshot capture crashed:', err);
  process.exitCode = 1;
});
