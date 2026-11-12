#!/usr/bin/env node
/**
 * Screenshot + DOM geometry QA for a reference and an editable website.
 *
 * Uses a locally installed Chromium/Chrome/Brave/Edge or an existing Chrome
 * DevTools Protocol browser; playwright-core does not download any browsers.
 * Does not mirror pages, download assets, mutate the sites or replay forms.
 *
 * Examples:
 *   node scripts/qa_playwright.mjs --reference https://www.example.com \
 *     --clone http://127.0.0.1:4330/ --output ./qa-results
 *   node scripts/qa_playwright.mjs --reference http://127.0.0.1:4319/ \
 *     --clone http://127.0.0.1:4330/ --output ./qa-results \
 *     --cdp http://127.0.0.1:9222
 *   node scripts/qa_playwright.mjs --help
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const HELP = `Portable Playwright visual QA (local Chromium; no browser downloads)

Usage:
  node qa_playwright.mjs --reference <url|html-file> --clone <url|html-file> --output <dir> [options]

Required:
  --reference <url|html-file>  Reference benchmark (HTTP(S), file:// or local HTML)
  --clone <url|html-file>      Editable implementation to compare
  --output <directory>        Where to write JSON reports and screenshots

Browser options:
  --cdp <url>                 Connect to an already running Chrome CDP server
                              (e.g. http://127.0.0.1:9222); uses NEW contexts
  --executable <path>         Local Chromium/Chrome/Brave/Edge executable
  --headful                   Show browser (only for a new launch)

QA options:
  --viewport <name:WxH>       Repeatable; overrides default desktop/tablet/mobile
  --tolerance <px>            Geometry difference threshold, default 1
  --settle-ms <ms>            Post-load settle time, default 900
  --scroll-step <fraction>    Viewport-height increment for scroll warm, default .70
  --scroll-pause-ms <ms>      Pause at each scroll position, default 90
  --no-scroll-warm            Skip IntersectionObserver/lazy-image warmup
  --no-screenshots            Produce geometry/console JSON only
  --reduced-motion            Emulate reduced motion for predictable still frames
  --timeout-ms <ms>           Navigation/page timeouts, default 30000
  -h, --help                  Show this help

Outputs include manifest.json, reference-*/clone-*.json, viewport PNGs,
full-page JPEGs and comparison.json with section/header/heading deltas.

Constraints:
  * playwright-core must be installed separately (npm install in scripts/).
  * No browser is downloaded; a local executable or CDP is required.
  * Only the two requested pages are visited. Page assets load as normal;
    this tool does NOT save assets or submit forms/click consent controls.
  * Dynamic animations, fonts, personalization, cookie banners and late video
    frames cause pixel differences; geometry is a more stable source of truth.
  * HTML loaded via file:// may fail absolute /assets paths; prefer a local
    HTTP server to reproduce production URL resolution.
`;

function fatal(message, exitCode = 2) {
  const err = new Error(message);
  err.exitCode = exitCode;
  throw err;
}

function positiveNumber(value, name, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    fatal(`${name} must be between ${min} and ${max}: ${value}`);
  }
  return number;
}

function readArgs(argv) {
  const args = {
    viewports: [], tolerance: 1, settleMs: 900, scrollStep: .7,
    scrollPauseMs: 90, timeoutMs: 30000, warm: true,
    screenshots: true, reducedMotion: false, headful: false,
  };
  const valueArgs = new Map([
    ['--reference', 'reference'], ['--clone', 'clone'], ['--output', 'output'],
    ['--cdp', 'cdp'], ['--executable', 'executable'],
    ['--tolerance', 'tolerance'], ['--settle-ms', 'settleMs'],
    ['--scroll-step', 'scrollStep'], ['--scroll-pause-ms', 'scrollPauseMs'],
    ['--timeout-ms', 'timeoutMs'],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--headful') { args.headful = true; continue; }
    if (arg === '--reduced-motion') { args.reducedMotion = true; continue; }
    if (arg === '--no-scroll-warm') { args.warm = false; continue; }
    if (arg === '--no-screenshots') { args.screenshots = false; continue; }
    if (arg === '--viewport') {
      const spec = argv[++index];
      if (!spec) fatal('--viewport needs a value like mobile:390x844');
      const found = /^([A-Za-z][A-Za-z0-9_-]{0,31}):(\d{2,5})x(\d{2,5})$/i.exec(spec);
      if (!found) fatal(`Invalid viewport '${spec}', expected name:WxH`);
      args.viewports.push({
        name: found[1].toLowerCase(),
        width: positiveNumber(found[2], 'viewport width', 100, 16000),
        height: positiveNumber(found[3], 'viewport height', 100, 16000),
      });
      continue;
    }
    const property = valueArgs.get(arg);
    if (!property) fatal(`Unknown option '${arg}'. Try --help`);
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) fatal(`${arg} needs a value`);
    args[property] = argv[++index];
  }
  for (const required of ['reference', 'clone', 'output']) {
    if (!args[required]) fatal(`Missing --${required}. Try --help`);
  }
  args.tolerance = positiveNumber(args.tolerance, '--tolerance', 0, 500);
  args.settleMs = positiveNumber(args.settleMs, '--settle-ms', 0, 120000);
  args.scrollStep = positiveNumber(args.scrollStep, '--scroll-step', .1, 2);
  args.scrollPauseMs = positiveNumber(args.scrollPauseMs, '--scroll-pause-ms', 0, 60000);
  args.timeoutMs = positiveNumber(args.timeoutMs, '--timeout-ms', 1000, 300000);
  if (!args.viewports.length) args.viewports = DEFAULT_VIEWPORTS;
  if (new Set(args.viewports.map(item => item.name)).size !== args.viewports.length) {
    fatal('Viewport names must be unique');
  }
  if (args.cdp && args.executable) fatal('Use either --cdp or --executable, not both');
  if (args.cdp && args.headful) fatal('--headful is not applicable with --cdp');
  args.output = path.resolve(args.output);
  return args;
}

async function resolveTarget(input) {
  if (/^https?:\/\//i.test(input)) return input;
  if (/^file:\/\//i.test(input)) return input;
  const filename = path.resolve(input);
  try {
    const stat = await fs.stat(filename);
    if (!stat.isFile()) fatal(`Not an HTML file: ${filename}`);
  } catch (error) {
    if (error?.exitCode) throw error;
    fatal(`Target is not a URL or existing file: ${input}`);
  }
  return pathToFileURL(filename).href;
}

async function findBrowserExecutable() {
  const home = os.homedir();
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['LOCALAPPDATA'] || path.join(home, 'AppData/Local'), 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'BraveSoftware/Brave-Browser/Application/brave.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe') : null,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/brave-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch { /* try next installed browser */ }
  }
  fatal('No Chromium executable found. Set --executable or --cdp; no browser downloads are performed.');
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function getGeometry(page) {
  return page.evaluate(() => {
    function elementRecord(element, index) {
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        text: text.slice(0, 110),
        x: Math.round(rect.left * 10) / 10,
        y: Math.round((rect.top + scrollY) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        fontFamily: css.fontFamily,
        fontSize: css.fontSize,
        fontWeight: css.fontWeight,
        opacity: css.opacity,
        display: css.display,
      };
    }
    const sections = [...document.querySelectorAll('section')];
    const headings = [...document.querySelectorAll('h1,h2,h3')];
    const header = document.querySelector('header');
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        readyState: document.readyState,
      },
      sectionCount: sections.length,
      headingCount: headings.length,
      imageCount: document.images.length,
      videoCount: document.querySelectorAll('video').length,
      header: header ? elementRecord(header, 0) : null,
      sections: sections.map(elementRecord),
      headings: headings.map(elementRecord),
      fonts: [...document.fonts].filter(item => item.status === 'loaded')
        .map(item => ({ family: item.family, weight: item.weight, style: item.style })),
    };
  });
}

async function warmScroll(page, viewport, args) {
  if (!args.warm) return { enabled: false, steps: 0 };
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.max(1, Math.round(viewport.height * args.scrollStep));
  let steps = 0;
  for (let y = 0; y < height; y += step) {
    await page.evaluate(offset => window.scrollTo({ top: offset, behavior: 'instant' }), y);
    steps++;
    if (args.scrollPauseMs > 0) await page.waitForTimeout(args.scrollPauseMs);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(Math.min(2000, Math.max(120, args.scrollPauseMs * 2)));
  return { enabled: true, steps, height };
}

async function collectOne(browser, target, type, viewport, args) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.width <= 600,
    hasTouch: viewport.width <= 600,
    locale: 'pt-BR',
    reducedMotion: args.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const output = { target, viewport, errors: [], warnings: [], requestFailures: [], httpFailures: [] };
  page.on('console', message => {
    if (message.type() === 'error') output.errors.push({ type: 'console', message: message.text() });
    else if (message.type() === 'warning') output.warnings.push({ message: message.text() });
  });
  page.on('pageerror', error => output.errors.push({ type: 'exception', message: error.stack || error.message }));
  page.on('requestfailed', request => output.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) output.httpFailures.push({ url: response.url(), status: response.status() });
  });

  try {
    page.setDefaultTimeout(args.timeoutMs);
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch (error) {
      output.warnings.push({ message: `Font readiness not available: ${error.message}` });
    }
    await page.waitForTimeout(args.settleMs);
    const prefix = `${type}-${viewport.name}`;

    if (args.screenshots) {
      await page.screenshot({
        path: path.join(args.output, `${prefix}-viewport.png`),
        fullPage: false, animations: 'disabled', timeout: args.timeoutMs,
      });
    }
    output.warm = await warmScroll(page, viewport, args);
    output.geometry = await getGeometry(page);
    if (args.screenshots) {
      await page.screenshot({
        path: path.join(args.output, `${prefix}-full.jpg`),
        type: 'jpeg', quality: 85, fullPage: true,
        animations: 'disabled', timeout: args.timeoutMs,
      });
    }
    await fs.writeFile(path.join(args.output, `${prefix}.json`), JSON.stringify(output, null, 2), 'utf8');
    return output;
  } finally {
    await context.close();
  }
}

function compareGeometry(reference, clone, tolerance) {
  const differences = [];
  function compareRecord(source, target, label) {
    if (!source || !target) {
      if (source || target) differences.push({ item: label, missing: !source ? 'reference' : 'clone' });
      return;
    }
    for (const key of ['x', 'y', 'width', 'height']) {
      const delta = round(target[key] - source[key]);
      if (Math.abs(delta) > tolerance) {
        differences.push({ item: label, property: key, reference: source[key], clone: target[key], delta });
      }
    }
  }
  const a = reference.geometry, b = clone.geometry;
  compareRecord(a.header, b.header, 'header');
  for (let i = 0; i < Math.max(a.sections.length, b.sections.length); i++) {
    compareRecord(a.sections[i], b.sections[i], `section[${i}]`);
  }
  for (let i = 0; i < Math.max(a.headings.length, b.headings.length); i++) {
    compareRecord(a.headings[i], b.headings[i], `heading[${i}]`);
  }
  const heightDelta = b.document.height - a.document.height;
  const widthDelta = b.document.width - a.document.width;
  return {
    viewport: reference.viewport,
    pageHeights: { reference: a.document.height, clone: b.document.height, delta: heightDelta },
    pageWidths: { reference: a.document.width, clone: b.document.width, delta: widthDelta },
    sectionCounts: { reference: a.sectionCount, clone: b.sectionCount },
    headingCounts: { reference: a.headingCount, clone: b.headingCount },
    imageCounts: { reference: a.imageCount, clone: b.imageCount },
    errorCounts: { reference: reference.errors.length, clone: clone.errors.length },
    failedHttp: { reference: reference.httpFailures.length, clone: clone.httpFailures.length },
    geometryDifferences: differences.length,
    geometryPass: differences.length === 0 && Math.abs(heightDelta) <= tolerance && Math.abs(widthDelta) <= tolerance,
    differences: differences.slice(0, 100),
    truncatedDifferences: Math.max(0, differences.length - 100),
  };
}

async function run() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return; }

  const [reference, clone] = await Promise.all([
    resolveTarget(args.reference), resolveTarget(args.clone),
  ]);
  await fs.mkdir(args.output, { recursive: true });

  let playwright;
  try {
    playwright = await import('playwright-core');
  } catch {
    fatal('Missing playwright-core. Run npm install in this scripts directory. No browser download is necessary.');
  }

  const chromium = playwright.chromium;
  let browser;
  try {
    if (args.cdp) {
      browser = await chromium.connectOverCDP(args.cdp, { timeout: args.timeoutMs });
    } else {
      const executablePath = args.executable || await findBrowserExecutable();
      browser = await chromium.launch({
        executablePath, headless: !args.headful,
        args: ['--disable-extensions', '--disable-background-networking'],
        timeout: args.timeoutMs,
      });
    }

    const results = [];
    for (const viewport of args.viewports) {
      process.stdout.write(`QA ${viewport.name} ${viewport.width}x${viewport.height}: reference ... `);
      const referenceResult = await collectOne(browser, reference, 'reference', viewport, args);
      process.stdout.write('clone ... ');
      const cloneResult = await collectOne(browser, clone, 'clone', viewport, args);
      const comparison = compareGeometry(referenceResult, cloneResult, args.tolerance);
      results.push(comparison);
      process.stdout.write(
        `${comparison.geometryDifferences} box differences, height Δ${comparison.pageHeights.delta}px, ` +
        `console errors ${cloneResult.errors.length}\n`
      );
    }

    const summary = {
      schema: 'website-fidelity-cloner.qa-playwright/v1',
      generatedAt: new Date().toISOString(),
      reference, clone,
      options: {
        viewports: args.viewports, geometryTolerancePx: args.tolerance,
        scrollWarm: args.warm, scrollStep: args.scrollStep,
        scrollPauseMs: args.scrollPauseMs, settleMs: args.settleMs,
        screenshots: args.screenshots, reducedMotion: args.reducedMotion,
        connection: args.cdp ? 'CDP (new isolated contexts)' : 'local Chromium launch',
      },
      browser: browser.version(),
      comparisons: results,
      allGeometryPassed: results.every(item => item.geometryPass),
      note: 'A geometry mismatch is a signal for inspection, not a proof of copying or functional failure.',
    };
    await fs.writeFile(path.join(args.output, 'comparison.json'), JSON.stringify(summary, null, 2), 'utf8');
    await fs.writeFile(path.join(args.output, 'manifest.json'), JSON.stringify({
      generatedAt: summary.generatedAt,
      reference, clone,
      screenshots: args.screenshots,
      viewports: args.viewports.map(viewport => viewport.name),
      comparison: 'comparison.json',
    }, null, 2), 'utf8');
    process.stdout.write(`Done: ${args.output}\n`);
    if (!summary.allGeometryPassed) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

run().catch(error => {
  console.error(`QA error: ${error.message}`);
  process.exitCode = error.exitCode || 2;
});
