/**
 * Hero dashboard + navbar motion for the componentized Ulls landing.
 *
 * Pure DOM orchestration: no React runtime, no imports from Kirvano, no network
 * requests, and no changes to the SSR markup/assets on disk. The companion
 * stylesheet is automatically linked when this function is called.
 *
 * Usage in the host App:
 *   useEffect(() => setupDashboardEffects(document), []);
 *
 * @param {Document|Element} root
 * @returns {() => void} disconnect listeners, timers and restore DOM styles
 */

const ACTIVE = new WeakMap();
const STYLES = new WeakMap();
const NAV_THRESHOLD = 48;
const ENTER_DURATION = 760;
const WORD_DURATION = 630;
const CHART_DURATION = 1250;

function findAll(root, selector) {
  try { return [...root.querySelectorAll(selector)]; } catch { return []; }
}

function find(root, selector) {
  try { return root.querySelector(selector); } catch { return null; }
}

function installStyles(document) {
  const previous = STYLES.get(document);
  if (previous) {
    previous.references++;
    return () => {
      if (--previous.references === 0) {
        if (previous.owned) previous.element.remove();
        STYLES.delete(document);
      }
    };
  }

  const existing = document.querySelector('link[data-ulls-dashboard-styles]');
  const link = existing || document.createElement('link');
  if (!existing) {
    link.rel = 'stylesheet';
    link.setAttribute('data-ulls-dashboard-styles', '');
    // Vite resolves this static URL into the corresponding production asset.
    link.href = new URL('../styles/dashboard-effects.css', import.meta.url).href;
    document.head.append(link);
  }
  const state = { element: link, owned: !existing, references: 1 };
  STYLES.set(document, state);
  return () => {
    if (--state.references === 0) {
      if (state.owned) link.remove();
      STYLES.delete(document);
    }
  };
}

function queryDashboard(scope) {
  const aside = find(scope, '[data-ulls-dashboard-sidebar]') || findAll(scope, 'aside').find(node => {
    const text = node.textContent || '';
    return /Minha Loja/.test(text) && /Dashboard/.test(text) && /Produtos/.test(text);
  });
  const panel = aside?.parentElement;
  if (!panel || !panel.contains(aside)) return null;

  const content = aside.nextElementSibling;
  const cards = content ? [...content.children].filter(el => el.nodeType === 1) : [];
  const chartImage = cards[0]?.querySelector('img[src*="/media/Line.svg"], img[src*="media/Line.svg"]');
  const chartMask = chartImage?.parentElement || null;
  const menu = find(aside, '.flex.flex-col.gap-4');
  const menuItems = menu ? [...menu.children].filter(el => el.nodeType === 1) : [];
  const label = find(aside, '.px-3.py-4');
  const kiraDot = find(cards[3] || panel, '.bg-\\[\\#22c55e\\]');
  const salesLabel = findAll(cards[1] || panel, 'span,div')
    .find(el => el.children.length === 0 && /^8[.,]420$/.test((el.textContent || '').trim()));

  return { aside, panel, content, cards, label, menuItems, chartMask, kiraDot, salesLabel };
}

/**
 * Adds self-contained effects to the current SSR dashboard and fixed header.
 * Independent of initLandingBehavior and safe under React StrictMode cleanup.
 */
export function setupDashboardEffects(root = globalThis.document) {
  if (!root || typeof root.querySelector !== 'function') return () => {};
  const existing = ACTIVE.get(root);
  if (existing) return existing;

  const document = root.nodeType === 9 ? root : root.ownerDocument;
  const win = document?.defaultView;
  if (!document || !win) return () => {};

  const scope = root.nodeType === 9 ? (find(root, '[data-ulls-landing]') || root) : root;
  const header = find(scope, 'header');
  const surface = header && find(header, 'div.w-full.flex.items-center');
  const dashboard = queryDashboard(scope);
  const abort = new AbortController();
  const timeouts = new Set();
  const frames = new Set();
  const restorers = [];
  const memorized = new WeakMap();
  const counterOriginals = new Map();
  let disposed = false;
  let begun = false;
  let scrollFrame = 0;

  const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const track = (element, key, restore) => {
    if (!element) return;
    let keys = memorized.get(element);
    if (!keys) { keys = new Set(); memorized.set(element, keys); }
    if (!keys.has(key)) { keys.add(key); restorers.push(restore); }
  };
  const attr = (element, name, value) => {
    if (!element) return;
    const had = element.hasAttribute(name);
    const before = element.getAttribute(name);
    track(element, 'attr:' + name, () => {
      if (had) element.setAttribute(name, before);
      else element.removeAttribute(name);
    });
    if (value == null) element.removeAttribute(name);
    else element.setAttribute(name, String(value));
  };
  const style = (element, name, value) => {
    if (!element?.style) return;
    const original = element.style.getPropertyValue(name);
    const priority = element.style.getPropertyPriority(name);
    track(element, 'style:' + name, () => {
      if (original) element.style.setProperty(name, original, priority);
      else element.style.removeProperty(name);
    });
    element.style.setProperty(name, value);
  };
  const addClass = (element, name) => {
    if (!element || element.classList.contains(name)) return;
    track(element, 'class:' + name, () => element.classList.remove(name));
    element.classList.add(name);
  };
  const delay = (fn, ms) => {
    const timer = win.setTimeout(() => { timeouts.delete(timer); if (!disposed) fn(); }, ms);
    timeouts.add(timer);
    return timer;
  };
  const frame = fn => {
    const id = win.requestAnimationFrame(t => { frames.delete(id); if (!disposed) fn(t); });
    frames.add(id);
    return id;
  };
  const listen = (element, name, callback, options = {}) => {
    if (!element?.addEventListener) return;
    element.addEventListener(name, callback, { ...options, signal: abort.signal });
  };

  const styleCleanup = installStyles(document);
  if (dashboard) attr(dashboard.panel, 'data-ulls-dashboard-effects', 'ready');
  if (header && surface) {
    attr(header, 'data-ulls-navbar-ready', 'true');
    attr(surface, 'data-ulls-nav-surface', '');
  }

  function updateNavbar() {
    if (!header) return;
    // The original switches at the first downward scroll; 48px keeps the
    // transition stable against tiny scroll-wheel noise at the top.
    attr(header, 'data-ulls-navbar-scrolled', win.scrollY > NAV_THRESHOLD ? 'true' : 'false');
  }

  function scheduleScroll() {
    if (scrollFrame || disposed) return;
    scrollFrame = frame(() => {
      scrollFrame = 0;
      updateNavbar();
      // If the user jumps straight to the dashboard, ensure no stale invisible
      // assets remain while the original 2.1s introduction timer is pending.
      if (!begun && dashboard && win.scrollY > 350) beginEntrance();
    });
  }

  listen(win, 'scroll', scheduleScroll, { passive: true });
  listen(win, 'resize', scheduleScroll, { passive: true });
  updateNavbar();

  function completeStage(element) {
    if (!element || disposed) return;
    attr(element, 'data-ulls-dashboard-stage-status', 'complete');
    element.classList.remove('ulls-dashboard-entering');
    addClass(element, 'ulls-dashboard-complete');
    style(element, 'opacity', '1');
    style(element, 'transform', 'none');
  }

  function enter(element, type = 'card', duration = ENTER_DURATION) {
    if (!element || disposed) return;
    if (reduced()) { completeStage(element); return; }
    style(element, '--ulls-dashboard-duration', duration + 'ms');
    attr(element, 'data-ulls-dashboard-stage-status', 'playing');
    addClass(element, 'ulls-dashboard-entering');
    delay(() => completeStage(element), duration + 32);
  }

  function scheduleStage(element, type, at, duration = ENTER_DURATION) {
    if (!element) return;
    attr(element, 'data-ulls-dashboard-stage', type);
    if (reduced()) { completeStage(element); return; }
    delay(() => enter(element, type, duration), at);
  }

  function scheduleWords(card, at) {
    if (!card) return;
    // prepareStages() runs while SSR opacity:0 is intact, whereas the generic
    // reveal handler can set inline opacity:1 before this delayed callback.
    // Select our stable stage marker, not the mutable inline style, so every
    // Ticket médio / R$ 197 / Aprovação / Pix / Cartão word is completed.
    const nodes = findAll(card, '[data-ulls-dashboard-stage="word"]');
    nodes.slice(0, 28).forEach((node, i) => scheduleStage(node, 'word', at + i * 40, WORD_DURATION));
  }

  function prepareStages() {
    if (!dashboard) return;
    // Reserve the timeline immediately: the existing generic reveal observer
    // cannot make these nodes visible before the reference's 2.1s entrance.
    if (dashboard.label) attr(dashboard.label, 'data-ulls-dashboard-stage', 'sidebar');
    dashboard.menuItems.forEach(node => attr(node, 'data-ulls-dashboard-stage', 'sidebar'));
    dashboard.cards.forEach(card => attr(card, 'data-ulls-dashboard-stage', 'card'));
    for (const card of dashboard.cards.slice(0, 2)) {
      findAll(card, 'span[style*="opacity:0"],span[style*="opacity: 0"]')
        .filter(node => /translateY|translate3d/.test(node.style.transform))
        .slice(0, 28).forEach(node => attr(node, 'data-ulls-dashboard-stage', 'word'));
    }
  }

  function revealChart() {
    if (!dashboard?.chartMask) return;
    const node = dashboard.chartMask;
    if (reduced()) {
      attr(node, 'data-ulls-dashboard-chart', 'complete');
      style(node, 'clip-path', 'inset(0 0% 0 0)');
      return;
    }
    attr(node, 'data-ulls-dashboard-chart', 'playing');
    delay(() => {
      attr(node, 'data-ulls-dashboard-chart', 'complete');
      style(node, 'clip-path', 'inset(0 0% 0 0)');
    }, CHART_DURATION + 30);
  }

  function animateSales() {
    const element = dashboard?.salesLabel;
    if (!element || disposed) return;
    const original = (element.textContent || '').trim();
    if (!counterOriginals.has(element)) counterOriginals.set(element, original);
    if (reduced()) { element.textContent = original; return; }
    const target = 8420;
    const start = win.performance.now();
    const duration = 980;
    const formatter = new Intl.NumberFormat('pt-BR');
    function tick(now) {
      if (disposed) return;
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatter.format(Math.round(target * eased));
      if (progress < 1) frame(tick);
      else element.textContent = original;
    }
    frame(tick);
  }

  function beginEntrance() {
    if (!dashboard || disposed || begun) return;
    begun = true;

    if (reduced()) {
      for (const item of [
        ...dashboard.menuItems,
        ...dashboard.cards,
        dashboard.label,
        ...findAll(dashboard.panel, '[data-ulls-dashboard-stage="word"]')
      ].filter(Boolean)) completeStage(item);
      revealChart();
      return;
    }

    // Benchmark: shell starts at ~2100ms; the six sidebar slots and five cards
    // rise with a cascade. Timings are relative to the shell entrance, not page
    // scroll, so the dashboard feels like a single coherent demo animation.
    scheduleStage(dashboard.label, 'sidebar', 250, 710);
    dashboard.menuItems.forEach((node, i) => scheduleStage(node, 'sidebar', 480 + i * 195, 740));
    dashboard.cards.forEach((card, i) => scheduleStage(card, 'card', 420 + i * 190, 760));
    scheduleWords(dashboard.cards[0], 760);
    scheduleWords(dashboard.cards[1], 980);
    delay(animateSales, 1040);
    delay(revealChart, 1190);
  }

  function activatePanel() {
    if (!dashboard || disposed) return;
    // The source stylesheet animates this shell with rise-up after 2100ms.
    // Use its declared delay so no layout markup or CSS has to be replaced.
    const animationDelay = Math.max(0, parseFloat(win.getComputedStyle(dashboard.panel).animationDelay) || 0) * 1000;
    if (reduced()) beginEntrance();
    else delay(beginEntrance, animationDelay + 240);
  }

  function setupPointerEffects() {
    if (!dashboard) return;
    const { aside, cards, kiraDot } = dashboard;
    if (kiraDot) addClass(kiraDot, 'ulls-dashboard-kira-dot');
    // This dashboard is decorative. Keep every sidebar row (including the
    // originally highlighted Dashboard row) exactly as authored in the SSR,
    // without synthetic buttons, keyboard focus, active state or click hooks.
    attr(aside, 'data-ulls-sidebar-static', 'true');

    const finePointer = Boolean(win.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches);
    if (!finePointer || reduced()) return;
    cards.forEach((card, i) => {
      attr(card, 'data-ulls-dashboard-card', String(i));
      listen(card, 'pointerenter', () => attr(card, 'data-ulls-hover', 'true'));
      listen(card, 'pointerleave', () => attr(card, 'data-ulls-hover', 'false'));
    });
    const metric = cards[0];
    if (!metric) return;
    attr(metric, 'data-ulls-dashboard-chart-card', 'true');
    listen(metric, 'pointermove', event => {
      const rect = metric.getBoundingClientRect();
      const x = Math.min(rect.width - 1, Math.max(0, event.clientX - rect.left));
      style(metric, '--ulls-chart-pointer-x', x.toFixed(1) + 'px');
      attr(metric, 'data-ulls-chart-hover', 'true');
    }, { passive: true });
    listen(metric, 'pointerleave', () => attr(metric, 'data-ulls-chart-hover', 'false'));
  }

  if (dashboard) {
    // Assign pending status synchronously so existing SSR inline opacity:0 and
    // clip-path:100% do not depend on the original runtime to become visible.
    if (dashboard.chartMask) attr(dashboard.chartMask, 'data-ulls-dashboard-chart', 'pending');
    prepareStages();
    setupPointerEffects();
    activatePanel();
  }

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    for (const timeout of timeouts) win.clearTimeout(timeout);
    for (const id of frames) win.cancelAnimationFrame(id);
    for (const [element, text] of counterOriginals) element.textContent = text;
    for (let i = restorers.length - 1; i >= 0; i--) restorers[i]();
    styleCleanup();
    ACTIVE.delete(root);
  };
  ACTIVE.set(root, cleanup);
  return cleanup;
}

export default setupDashboardEffects;
