/**
 * Read-only browser QA of local Kirvano snapshot vs the editable React app.
 * Writes evidence only below ulls-landing/qa/. Reuses existing Chrome :9335.
 *
 * Run: node ulls-landing/qa/compare-cdp.mjs --phase=before
 *      node ulls-landing/qa/compare-cdp.mjs --phase=after
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.argv.find(v => v.startsWith('--phase='))?.slice(8) || 'before';
if (!/^[a-z][a-z0-9-]{0,30}$/.test(PHASE)) throw Error(`Invalid phase ${PHASE}`);
const OUT = path.join(HERE, PHASE);
const CDP = 'http://127.0.0.1:9335';
const SITES = {
  benchmark: process.env.ULLS_QA_BENCHMARK_URL || 'http://127.0.0.1:4318/',
  app: process.env.ULLS_QA_APP_URL || 'http://127.0.0.1:4330/',
};
const VIEWS = { desktop: [1440, 900, false], mobile: [390, 844, true] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const trackerURLPatterns = [
  '*googletagmanager.com*', '*google-analytics.com*', '*clarity.ms*', '*funnelytics*',
  '*webforms.pipedrive.com*', '*lib.kirvano.com*', '*facebook.net*', '*connect.facebook.net*',
  '*doubleclick.net*', '*analytics.tiktok.com*', '*googleadservices.com*'
];

class CDPSession {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.id = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  static async open(url) {
    const self = new CDPSession(url);
    self.socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      self.socket.addEventListener('open', resolve, { once: true });
      self.socket.addEventListener('error', reject, { once: true });
    });
    self.socket.addEventListener('message', ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.id != null) {
        const pending = self.pending.get(msg.id);
        if (!pending) return;
        self.pending.delete(msg.id);
        if (msg.error) pending.reject(Error(`${msg.error.message}: ${JSON.stringify(msg.error.data || '')}`));
        else pending.resolve(msg.result || {});
      } else if (msg.method) {
        for (const handler of self.handlers.get(msg.method) || []) handler(msg.params || {});
      }
    });
    self.socket.addEventListener('close', () => {
      for (const p of self.pending.values()) p.reject(Error('CDP session closed'));
      self.pending.clear();
    });
    return self;
  }

  on(method, handler) {
    const arr = this.handlers.get(method) || [];
    arr.push(handler);
    this.handlers.set(method, arr);
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`CDP timeout: ${method}`));
      }, 25000);
      this.pending.set(id, {
        resolve: result => { clearTimeout(timeout); resolve(result); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${expression})()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: false,
      silent: true,
    });
    if (r.exceptionDetails) throw Error(`Evaluate error: ${r.exceptionDetails.text || JSON.stringify(r.exceptionDetails)}`);
    return r.result?.value;
  }

  close() { if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(); }
}

const short = (value, limit = 300) => String(value ?? '').replace(/\s+/g, ' ').slice(0, limit);

const SNAPSHOT_JS = String.raw`function () {
  const rounded = n => Math.round(n * 100) / 100;
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: rounded(r.left), y: rounded(r.top), pageY: rounded(r.top + scrollY),
      width: rounded(r.width), height: rounded(r.height),
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      opacity: s.opacity, visibility: s.visibility, display: s.display,
      color: s.color, backgroundColor: s.backgroundColor,
      borderRadius: s.borderRadius,
    };
  };
  const root = document.querySelector('[data-ulls-landing]') || document.querySelector('body > div.relative.w-full.bg-\\[\\#111111\\]') || document.body.querySelector('div.relative.w-full');
  const sections = root ? [...root.querySelectorAll(':scope > section')] : [...document.querySelectorAll('section')];
  const direct = root ? [...root.children] : [];
  const firstH1 = document.querySelector('h1');
  const header = document.querySelector('header');
  const sectionName = el => (el?.querySelector('h1,h2,h3')?.textContent || el?.id || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const imgs = [...document.querySelectorAll('img')];
  const vids = [...document.querySelectorAll('video')];
  const iframes = [...document.querySelectorAll('iframe')];
  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    totalHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    bodyScrollWidth: document.body.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    root: { tag: root?.tagName || null, class: root?.className || '', rect: rect(root) },
    directChildTags: direct.map(el => ({ tag: el.tagName, id: el.id, class: String(el.className || '').slice(0, 140) })),
    sectionCount: sections.length,
    sections: sections.map((el, i) => ({ index: i + 1, id: el.id, class: el.className, name: sectionName(el), rect: rect(el), images: el.querySelectorAll('img').length, videos: el.querySelectorAll('video').length })),
    h1: { text: firstH1?.textContent?.trim().replace(/\s+/g, ' ') || '', rect: rect(firstH1) },
    header: { rect: rect(header), htmlClass: header?.className || '' },
    fonts: { status: document.fonts.status, loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).slice(0, 50), missing: [...document.fonts].filter(f => f.status !== 'loaded').map(f => f.family + ' ' + f.weight).slice(0, 15) },
    firstAnchor: [...document.querySelectorAll('a[href]')].slice(0, 12).map(el => ({ text: el.textContent.trim().slice(0, 80), href: el.getAttribute('href') })),
    images: { count: imgs.length, lazy: imgs.filter(el => el.loading === 'lazy').length, broken: imgs.filter(el => el.complete && el.naturalWidth === 0).map(el => el.getAttribute('src')).slice(0, 30), unready: imgs.filter(el => !el.complete).map(el => el.getAttribute('src')).slice(0, 30) },
    videos: vids.map(v => ({ src: v.currentSrc || v.getAttribute('src'), poster: v.poster, paused: v.paused, readyState: v.readyState, muted: v.muted, autoplay: v.autoplay })),
    iframes: iframes.map(i => i.getAttribute('src')).filter(Boolean),
    overlayPresent: !!document.querySelector('[role=dialog], [aria-label="Fechar"]'),
    faqButtonCount: document.querySelectorAll('#faq button[aria-expanded]').length,
    chartPeriods: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(s => /^(?:7d|30d|12m)$/i.test(s)),
  };
}`;

const SCROLL_SWEEP_JS = String.raw`async function () {
  const root = document.querySelector('[data-ulls-landing]') || document.querySelector('body > div.relative.w-full') || document.body;
  const sections = [...root.querySelectorAll(':scope > section')];
  const state = [];
  for (let i = 0; i < sections.length; i++) {
    const el = sections[i];
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 650));
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const descendants = [...el.querySelectorAll('*')];
    const hidden = descendants.filter(e => {
      const t = getComputedStyle(e);
      const rr = e.getBoundingClientRect();
      return rr.width > 40 && rr.height > 10 && (t.opacity === '0' || t.visibility === 'hidden');
    });
    state.push({ index: i + 1, id: el.id, name: (el.querySelector('h1,h2,h3')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      pageY: Math.round(r.top + scrollY), viewportTop: Math.round(r.top), height: Math.round(r.height),
      opacity: s.opacity, visible: r.bottom > 0 && r.top < innerHeight,
      hiddenDescendants: hidden.length, sampleHidden: hidden.slice(0, 5).map(e => ({ tag: e.tagName, cls: String(e.className || '').slice(0, 130), text: e.textContent?.trim().slice(0, 55) })) });
  }
  await document.fonts.ready;
  const images = [...document.querySelectorAll('img')];
  const imageState = { broken: images.filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
      notComplete: images.filter(i => !i.complete).map(i => i.getAttribute('src')) };
  window.scrollTo({ top: 0, behavior: 'instant' });
  await new Promise(r => setTimeout(r, 650));
  return { sections: state, images: imageState, afterScroll: scrollY };
}`;

async function openPage(browser, viewport, url, title) {
  const target = await browser.send('Target.createTarget', { url: 'about:blank' });
  const id = target.targetId;
  let session;
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    const entry = list.find(x => x.id === id);
    if (entry?.webSocketDebuggerUrl) { session = await CDPSession.open(entry.webSocketDebuggerUrl); break; }
    await wait(150);
  }
  if (!session) throw Error('Target websocket not found: ' + id);
  const logs = { exceptions: [], console: [], entries: [], responses: [], failed: [] };
  session.on('Runtime.exceptionThrown', e => logs.exceptions.push(short(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text, 1200)));
  session.on('Runtime.consoleAPICalled', e => {
    const msg = e.args.map(a => a.value ?? a.description ?? a.type).join(' ');
    if (e.type === 'warning' || e.type === 'error') logs.console.push({ type: e.type, text: short(msg, 1200) });
  });
  session.on('Log.entryAdded', e => {
    if (e.entry.level === 'error' || e.entry.level === 'warning') logs.entries.push({ level: e.entry.level, text: short(e.entry.text, 900), url: e.entry.url || '' });
  });
  session.on('Network.responseReceived', e => {
    if (e.response.status >= 400) logs.responses.push({ status: e.response.status, url: short(e.response.url, 300) });
  });
  session.on('Network.loadingFailed', e => logs.failed.push({ type: e.type, error: e.errorText, blockedReason: e.blockedReason || '', requestId: e.requestId }));
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');
  await session.send('Network.enable');
  await session.send('Network.setBlockedURLs', { urls: trackerURLPatterns });
  await session.send('Emulation.setDeviceMetricsOverride', { width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: viewport[2], screenWidth: viewport[0], screenHeight: viewport[1] });
  if (PHASE !== 'before') {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `try {
      localStorage.setItem('kvn-cookie-consent', '1');
      localStorage.setItem('ulls:landing:consent:v1', 'accepted');
    } catch (_) {}` });
  }
  // Make comparisons deterministic; each page starts with clean local state.
  await session.send('Page.navigate', { url });
  await wait(1650);
  await session.evaluate(`async function(){await document.fonts.ready;return document.readyState}`);
  if (PHASE !== 'before') {
    // Equalize overlays across origins without navigation/reload after boot.
    await session.evaluate(`async function(){
      await document.fonts.ready;
      document.querySelector('[aria-label="Fechar"]')?.click();
      window.scrollTo({top:0,behavior:'instant'});
      return true;
    }`);
    await wait(400);
  }
  const data = await session.evaluate(SNAPSHOT_JS);
  const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(path.join(OUT, `${title}-top.png`), Buffer.from(shot.data, 'base64'));
  const scroll = await session.evaluate(SCROLL_SWEEP_JS);
  const settled = await session.evaluate(SNAPSHOT_JS);
  await wait(400);
  const metrics = await session.send('Page.getLayoutMetrics');
  const width = Math.round(metrics.cssContentSize?.width || viewport[0]);
  const fullHeight = Math.min(29000, Math.round(metrics.cssContentSize?.height || settled.totalHeight));
  let fullShotError = null;
  try {
    const full = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width, height: fullHeight, scale: 1 } });
    await fs.writeFile(path.join(OUT, `${title}-full.png`), Buffer.from(full.data, 'base64'));
  } catch (error) { fullShotError = error.message; }
  const info = { title, url, viewport, initial: data, scroll, settled, logs, fullShotError, screenshotHeight: fullHeight };
  await fs.writeFile(path.join(OUT, `${title}.json`), JSON.stringify(info, null, 2));
  await browser.send('Target.closeTarget', { targetId: id });
  session.close();
  return info;
}

// PNG decoder just for pixel metrics; Chrome screenshots use standard RGB/RGBA
// noninterlaced PNG. No third-party package or file changes beyond QA needed.
function pngPixels(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('PNG signature mismatch');
  let p = 8, width, height, color, bitDepth, interlace;
  const idat = [];
  while (p + 12 <= buf.length) {
    const n = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const val = buf.subarray(p + 8, p + 8 + n);
    if (type === 'IHDR') { width = val.readUInt32BE(0); height = val.readUInt32BE(4); bitDepth = val[8]; color = val[9]; interlace = val[12]; }
    if (type === 'IDAT') idat.push(val);
    p += 12 + n;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(color)) throw Error(`Unsupported PNG ${bitDepth}/${color}/${interlace}`);
  const bpp = color === 6 ? 4 : 3, stride = width * bpp;
  const compressed = Buffer.concat(idat);
  const inflated = zlib.inflateSync(compressed);
  const rgb = Buffer.allocUnsafe(width * height * 3);
  let prev = Buffer.alloc(stride), row = Buffer.alloc(stride), off = 0, target = 0;
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = inflated[off++];
    for (let i = 0; i < stride; i++) {
      const x = inflated[off++], a = i < bpp ? 0 : row[i - bpp], b = prev[i], c = i < bpp ? 0 : prev[i - bpp];
      row[i] = (x + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : (() => { throw Error(`Filter ${filter}`) })())) & 255;
    }
    for (let x = 0; x < width; x++) {
      rgb[target++] = row[x * bpp]; rgb[target++] = row[x * bpp + 1]; rgb[target++] = row[x * bpp + 2];
    }
    [prev, row] = [row, prev];
  }
  return { width, height, rgb };
}

async function parity(name) {
  const bp = path.join(OUT, `benchmark-${name}.png`), ap = path.join(OUT, `app-${name}.png`);
  try {
    const b = pngPixels(await fs.readFile(bp)), a = pngPixels(await fs.readFile(ap));
    const width = Math.min(b.width, a.width), height = Math.min(b.height, a.height);
    let sum = 0, exact = 0, near = 0, severe = 0, count = width * height;
    for (let y = 0; y < height; y++) {
      let bi = y * b.width * 3, ai = y * a.width * 3;
      for (let x = 0; x < width; x++, bi += 3, ai += 3) {
        const d = Math.abs(b.rgb[bi] - a.rgb[ai]) + Math.abs(b.rgb[bi + 1] - a.rgb[ai + 1]) + Math.abs(b.rgb[bi + 2] - a.rgb[ai + 2]);
        sum += d;
        if (d === 0) exact++;
        if (d <= 15) near++;
        if (d > 90) severe++;
      }
    }
    return {
      benchmarkSize: [b.width, b.height], appSize: [a.width, a.height], comparedSize: [width, height],
      meanAbsoluteChannelDelta: Math.round(sum / (count * 3) * 100) / 100,
      exactPixelPct: +(exact / count * 100).toFixed(2),
      nearPixelPct: +(near / count * 100).toFixed(2),
      severePixelPct: +(severe / count * 100).toFixed(2),
      note: 'Raw pixel metric is sensitive to animation timing, font anti-aliasing and shifted content; geometry is authoritative for layout gaps.',
    };
  } catch (e) { return { error: e.message }; }
}

function compare(a, b) {
  const diff = (x, y) => (x == null || y == null) ? null : +(x - y).toFixed(2);
  const out = {
    pageHeightDiff: diff(a.settled.totalHeight, b.settled.totalHeight),
    sectionCount: [b.initial.sectionCount, a.initial.sectionCount],
    rootChildren: [b.initial.directChildTags.length, a.initial.directChildTags.length],
    H1: {
      benchmark: b.initial.h1,
      app: a.initial.h1,
      boxDiff: {
        x: diff(a.initial.h1.rect?.x, b.initial.h1.rect?.x), y: diff(a.initial.h1.rect?.y, b.initial.h1.rect?.y),
        w: diff(a.initial.h1.rect?.width, b.initial.h1.rect?.width), h: diff(a.initial.h1.rect?.height, b.initial.h1.rect?.height),
      },
    },
    header: {
      benchmark: b.initial.header,
      app: a.initial.header,
      boxDiff: {
        x: diff(a.initial.header.rect?.x, b.initial.header.rect?.x), y: diff(a.initial.header.rect?.y, b.initial.header.rect?.y),
        w: diff(a.initial.header.rect?.width, b.initial.header.rect?.width), h: diff(a.initial.header.rect?.height, b.initial.header.rect?.height),
      },
    },
    sections: b.settled.sections.map((s, i) => {
      const t = a.settled.sections[i];
      return { n: i + 1, name: s.name, benchmarkY: s.rect?.pageY, appY: t?.rect?.pageY,
        deltaY: diff(t?.rect?.pageY, s.rect?.pageY), deltaHeight: diff(t?.rect?.height, s.rect?.height),
        benchmarkVisible: b.scroll.sections[i]?.visible, appVisible: a.scroll.sections[i]?.visible,
        benchmarkHiddenDescendants: b.scroll.sections[i]?.hiddenDescendants,
        appHiddenDescendants: a.scroll.sections[i]?.hiddenDescendants };
    }),
    newReactWarnings: a.logs.console.filter(x => /react|hydration|mismatch|warning|error/i.test(x.text)).slice(0, 25),
    newReactExceptions: a.logs.exceptions.slice(0, 25),
  };
  return out;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const version = await (await fetch(`${CDP}/json/version`)).json();
  const browser = await CDPSession.open(version.webSocketDebuggerUrl);
  const results = { phase: PHASE, timestamp: new Date().toISOString(), chrome: version.Browser, viewports: {}, errors: [] };
  try {
    for (const [view, viewport] of Object.entries(VIEWS)) {
      console.log(`[${PHASE}] ${view}: benchmarking ${SITES.benchmark}`);
      const benchmark = await openPage(browser, viewport, SITES.benchmark, `benchmark-${view}`);
      console.log(`[${PHASE}] ${view}: testing React ${SITES.app}`);
      const app = await openPage(browser, viewport, SITES.app, `app-${view}`);
      const layout = compare(app, benchmark);
      const topPixel = await parity(`${view}-top`);
      const fullPixel = await parity(`${view}-full`);
      results.viewports[view] = {
        benchmark: { height: benchmark.settled.totalHeight, sectionCount: benchmark.initial.sectionCount, font: benchmark.initial.h1.rect?.fontFamily, h1: benchmark.initial.h1.rect, header: benchmark.initial.header.rect, logs: benchmark.logs },
        app: { height: app.settled.totalHeight, sectionCount: app.initial.sectionCount, font: app.initial.h1.rect?.fontFamily, h1: app.initial.h1.rect, header: app.initial.header.rect, logs: app.logs },
        layout, pixelParity: { top: topPixel, full: fullPixel },
      };
      console.log(`[${view}] height benchmark=${benchmark.settled.totalHeight} app=${app.settled.totalHeight} delta=${layout.pageHeightDiff} sections=${benchmark.initial.sectionCount}/${app.initial.sectionCount} topMAE=${topPixel.meanAbsoluteChannelDelta} fullMAE=${fullPixel.meanAbsoluteChannelDelta}`);
      console.log(`[${view}] H1`, layout.H1.boxDiff, 'header', layout.header.boxDiff);
      console.log(`[${view}] biggest section shifts`, layout.sections.filter(x => Math.abs(x.deltaY || 0) > 4 || Math.abs(x.deltaHeight || 0) > 4).map(x => `${x.n}:${x.deltaY}/${x.deltaHeight}`).join(' '));
      await fs.writeFile(path.join(OUT, `diff-${view}.json`), JSON.stringify({ layout, pixelParity: { top: topPixel, full: fullPixel } }, null, 2));
    }
  } catch (error) {
    results.errors.push(error.stack || String(error));
    console.error(error.stack || String(error));
  } finally {
    browser.close();
    await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
  }
  if (results.errors.length) process.exitCode = 1;
}
if (process.argv.includes('--compare-only')) {
  await fs.mkdir(OUT, { recursive: true });
  const metrics = {};
  for (const view of Object.keys(VIEWS)) {
    metrics[view] = {
      top: await parity(`${view}-top`),
      full: await parity(`${view}-full`),
    };
  }
  await fs.writeFile(path.join(OUT, 'offline-pixel-parity.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
} else {
  main();
}
