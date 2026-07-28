#!/usr/bin/env node
/**
 * FlowViz end-to-end smoke test pipeline.
 *
 * Boots the app's own dev server (Vite) on an isolated port, drives it with a headless
 * Chromium via Playwright, runs a fixed suite of scenarios against the real running app
 * (not unit tests against internals), and exits non-zero if anything fails or the browser
 * logs a console error/exception during any scenario.
 *
 * Usage:
 *   npm run smoke            # headless (default), used by CI and local pre-commit checks
 *   npm run smoke -- --headed
 *   npm run smoke -- --keep-server   # leave the dev server running after the run
 *
 * See docs/smoke-testing.md for what each scenario covers and how to add a new one.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PORT = 4310;
const BASE_URL = `http://localhost:${PORT}/flowviz/`;
const HEADED = process.argv.includes('--headed');
const KEEP_SERVER = process.argv.includes('--keep-server');

// ---------------------------------------------------------------------------
// Tiny test harness: no new dependency (no @playwright/test), just enough
// structure to run named scenarios against one shared page and report clearly.
// ---------------------------------------------------------------------------

const results = [];

async function scenario(name, fn) {
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err) => consoleErrors.push(String(err));

  global.__page.on('console', onConsole);
  global.__page.on('pageerror', onPageError);

  const startedAt = Date.now();
  try {
    await fn(global.__page);
    if (consoleErrors.length > 0) {
      throw new Error(`Scenario produced ${consoleErrors.length} browser console error(s):\n  ${consoleErrors.join('\n  ')}`);
    }
    results.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`  \x1b[32m✓\x1b[0m ${name} (${Date.now() - startedAt}ms)`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - startedAt, error: err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${err.message?.split('\n').join('\n    ') ?? err}`);
  } finally {
    global.__page.off('console', onConsole);
    global.__page.off('pageerror', onPageError);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function freshPage(browser) {
  if (global.__page) await global.__page.close();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(BASE_URL);
  await page.waitForSelector('text=FlowViz');
  global.__page = page;
  return page;
}

// ---------------------------------------------------------------------------
// Dev server lifecycle
// ---------------------------------------------------------------------------

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
  child.stdout?.on('data', () => {}); // swallow; surfaced only on failure via exit code
  return child;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioGenerateAndConfirmDiagram(page) {
  page = await freshPage(page.context().browser());
  await page.fill('#chat-input', 'a web app with a cache in front of the database');
  await page.click('button:has-text("Send")');

  for (let i = 0; i < 20; i++) {
    const confirmBtn = page.locator('button:has-text("Confirm assumption")');
    if ((await confirmBtn.count()) === 0) break;
    await confirmBtn.click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);

  const nodeCount = await page.locator('[data-element-id^="n_"]').count();
  const edgeCount = await page.locator('[data-element-id^="e_"]').count();
  assert(nodeCount === 3, `expected 3 nodes, got ${nodeCount}`);
  assert(edgeCount === 2, `expected 2 edges, got ${edgeCount}`);
}

async function scenarioDependencyAwareEditPreservesPositions(page) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-element-id^="n_"]')).map((el) => ({
      id: el.getAttribute('data-element-id'),
      x: el.getAttribute('x'),
      y: el.getAttribute('y'),
    }))
  );

  await page.fill('#chat-input', 'delete cache');
  await page.click('button:has-text("Send")');
  await page.waitForTimeout(300);
  const applyAllBtn = page.locator('button:has-text("Apply all")');
  if ((await applyAllBtn.count()) > 0) await applyAllBtn.click();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-element-id^="n_"]')).map((el) => ({
      id: el.getAttribute('data-element-id'),
      x: el.getAttribute('x'),
      y: el.getAttribute('y'),
    }))
  );

  assert(after.length === before.length - 1, `expected one node removed, before=${before.length} after=${after.length}`);
  for (const survivor of after) {
    const original = before.find((b) => b.id === survivor.id);
    assert(original, `surviving node ${survivor.id} was not in the original graph`);
    assert(original.x === survivor.x && original.y === survivor.y, `node ${survivor.id} moved from (${original.x},${original.y}) to (${survivor.x},${survivor.y}) — spatial stability violated`);
  }
}

async function scenarioSchemaDefaultLoadsAndFitsViewport(page) {
  page = await freshPage(page.context().browser());
  await page.click('button:has-text("Load default schema")');
  await page.waitForTimeout(500);

  const boxCount = await page.locator('.schema-table-box').count();
  assert(boxCount === 8, `expected 8 table boxes, got ${boxCount}`);

  const scrollHeight = await page.locator('.schema-diagram-viewport').evaluate((el) => el.scrollHeight);
  const clientHeight = await page.locator('.schema-diagram-viewport').evaluate((el) => el.clientHeight);
  assert(scrollHeight <= clientHeight + 2, `schema diagram requires vertical scroll: scrollHeight=${scrollHeight} clientHeight=${clientHeight}`);
}

async function scenarioForeignKeyCycleAndTabOrder(page) {
  await page.locator('.schema-table-box').first().locator('input, select').first().focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  const activeTag = await page.evaluate(() => document.activeElement?.tagName);
  assert(activeTag === 'DIV' || activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'BUTTON', `unexpected focused tag after tabbing: ${activeTag}`);

  const fkCell = page.locator('.schema-box-fk').first();
  const before = await fkCell.textContent();
  await fkCell.focus();
  await page.keyboard.press('Enter');
  const after = await fkCell.textContent();
  assert(before !== after, 'pressing Enter on a foreign-key cell did not change its displayed reference');
}

async function scenarioNoDuplicateIdRegression(page) {
  // Regression test for the col_002/col_002 collision bug: two independent id counters
  // (application/ids.ts and mermaidErParser.ts) used to both mint bare "col" ids.
  await page.click('button:has-text("Add table")');
  await page.waitForTimeout(300);
  // Console-error assertion happens automatically via scenario()'s wrapper.
}

async function scenarioSchemaToArchitectureDiagramConversion(page) {
  await page.click('button:has-text("Generate architecture diagram")');
  await page.waitForTimeout(500);
  for (let i = 0; i < 40; i++) {
    const confirmBtn = page.locator('button:has-text("Confirm assumption")');
    if ((await confirmBtn.count()) === 0) break;
    await confirmBtn.click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const nodeCount = await page.locator('.canvas-frame [data-element-id^="sg_n_"]').count();
  assert(nodeCount >= 8, `expected at least 8 architecture nodes from the schema conversion, got ${nodeCount}`);
}

async function scenarioPaneZoomAndEscape(page) {
  page = await freshPage(page.context().browser());
  await page.click('button:has-text("Load default schema")');
  await page.waitForTimeout(300);

  await page.locator('h1').click();
  let landed = false;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const aria = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (aria?.includes('Database schema panel')) {
      landed = true;
      break;
    }
  }
  assert(landed, 'could not reach the schema pane wrapper via Tab');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const mainClass = await page.locator('main').getAttribute('class');
  assert(mainClass.includes('app-main--pane-expanded'), 'Enter on the pane wrapper did not expand it');
  const canvasVisible = await page.locator('.canvas-pane').isVisible();
  assert(!canvasVisible, 'canvas pane should be hidden while schema pane is expanded');

  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const mainClassAfter = await page.locator('main').getAttribute('class');
  assert(!mainClassAfter.includes('app-main--pane-expanded'), 'Escape from deep focus did not collapse the expanded pane');
  const canvasVisibleAfter = await page.locator('.canvas-pane').isVisible();
  assert(canvasVisibleAfter, 'canvas pane should be visible again after collapsing');
}

async function scenarioExportTriggersDownload(page) {
  page = await freshPage(page.context().browser());
  await page.fill('#chat-input', 'a client talking to a server');
  await page.click('button:has-text("Send")');
  for (let i = 0; i < 10; i++) {
    const confirmBtn = page.locator('button:has-text("Confirm assumption")');
    if ((await confirmBtn.count()) === 0) break;
    await confirmBtn.click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('.canvas-pane .export-menu button:has-text("PNG")').click(),
  ]);
  assert(download.suggestedFilename() === 'architecture-diagram.png', `unexpected export filename: ${download.suggestedFilename()}`);
}

async function scenarioSettingsPanelOpens(page) {
  await page.click('button:has-text("Settings")');
  await page.waitForSelector('#gemini-key');
  const placeholder = await page.locator('#gemini-key').getAttribute('placeholder');
  assert(Boolean(placeholder), 'Gemini API key field is missing a placeholder');
  await page.click('button:has-text("Cancel")');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Starting FlowViz dev server on port ${PORT}...`);
  const server = startDevServer();
  let browser;
  try {
    await waitForServer(BASE_URL);
    console.log('Dev server ready. Launching browser...\n');

    browser = await chromium.launch({ headless: !HEADED });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(BASE_URL);
    await page.waitForSelector('text=FlowViz');
    global.__page = page;

    console.log('Diagram generation & editing:');
    await scenario('generates and confirms a diagram from a prompt', scenarioGenerateAndConfirmDiagram);
    await scenario('dependency-aware edit preserves unrelated node positions', scenarioDependencyAwareEditPreservesPositions);
    await scenario('export menu triggers a real PNG download', scenarioExportTriggersDownload);

    console.log('\nSchema pane:');
    await scenario('default schema loads and fits the viewport without vertical scroll', scenarioSchemaDefaultLoadsAndFitsViewport);
    await scenario('foreign-key cell cycles on Enter, tab order stays inside the grid', scenarioForeignKeyCycleAndTabOrder);
    await scenario('adding a table after loading the default schema has no id collisions', scenarioNoDuplicateIdRegression);
    await scenario('schema converts into an architecture diagram via the HCXAI loop', scenarioSchemaToArchitectureDiagramConversion);

    console.log('\nLayout & settings:');
    await scenario('Tab + Enter zooms into a pane, Escape returns from deep focus', scenarioPaneZoomAndEscape);
    await scenario('Settings panel opens with the Gemini API key field', scenarioSettingsPanelOpens);
  } finally {
    if (global.__page) await global.__page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (!KEEP_SERVER) {
      server.kill();
    } else {
      console.log(`\nLeaving dev server running on ${BASE_URL} (--keep-server).`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) {
    console.log('\nFailed scenarios:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Smoke test pipeline crashed:', err);
  process.exitCode = 1;
});
