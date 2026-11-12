import {
  DEFAULT_SELECTORS, query, queryAll, matches, closest, isVisible,
  findPeriodButtons, periodOf, findFaqPanel, documentFor
} from './adapters.mjs';
import {
  PERIOD_LABELS, getChartSeries, renderChart, formatCounter, parseCounter
} from './chart.mjs';

export { DEFAULT_SELECTORS, PERIOD_LABELS, getChartSeries, formatCounter, parseCounter };

const INSTANCES = new WeakMap();
const STORAGE_KEY = 'ulls:landing:consent:v1';
const EASE = 'cubic-bezier(.16, 1, .3, 1)';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ownText = element => (element?.textContent || '').trim();

/**
 * Progressive enhancement da nova landing Ulls, SEM bundle React original,
 * tags de analytics ou integrações de terceiros. É seguro inicializar 2x:
 * a segunda chamada devolve a instância existente.
 *
 * @param {object} options
 * @param {Document|Element} [options.root]  default: [data-ulls-landing] ou document
 * @param {object} [options.selectors]       override parcial do adapter
 * @param {boolean} [options.autoCreateConsent=true]
 * @param {boolean} [options.autoCreateHelp=true]
 * @param {boolean} [options.exclusiveFaq=true]
 * @param {boolean} [options.demoForms=true]
 */
export function initLandingBehavior(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc) throw new Error('initLandingBehavior precisa de um DOM');
  const selectors = { ...DEFAULT_SELECTORS, ...(options.selectors || {}) };
  const root = options.root || query(doc, selectors.root) || doc;
  if (INSTANCES.has(root)) return INSTANCES.get(root);

  const win = doc.defaultView || globalThis.window;
  const reduceMotion = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const storage = options.storage || win?.localStorage;
  const abort = new AbortController();
  const signal = abort.signal;
  const observers = [];
  const startedCounters = new WeakSet();
  const seenReveals = new WeakSet();
  const generated = [];
  const subscriptions = [];
  const originalDisplays = new WeakMap();
  let menuOpen = false;
  let helpOpen = false;
  let currentPeriod = '12m';
  let tickPending = false;
  let counterFrames = new Set();
  let menu = null;
  let menuTrigger = null;
  let consent = null;
  let help = null;

  const listen = (target, type, fn, passive = false) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, { signal, passive });
  };

  function emit(name, detail = {}) {
    const EventCtor = win?.CustomEvent || globalThis.CustomEvent;
    if (EventCtor && root.dispatchEvent) {
      root.dispatchEvent(new EventCtor('ulls:' + name, { bubbles: true, detail }));
    }
  }

  function setVisible(element, visible) {
    if (!element) return;
    if (!originalDisplays.has(element)) originalDisplays.set(element, element.style.display);
    element.style.display = visible ? originalDisplays.get(element) : 'none';
    element.hidden = !visible;
    element.setAttribute('aria-hidden', String(!visible));
    element.dataset.state = visible ? 'open' : 'closed';
    element.classList.toggle('is-open', visible);
  }

  function createFallbackMenu(header) {
    if (!header || !doc.createElement) return null;
    const nav = query(header, 'nav');
    const links = nav ? queryAll(nav, 'a[href]') : [];
    if (!links.length) return null;
    const wrapper = doc.createElement('nav');
    wrapper.dataset.ullsMobileMenu = '';
    wrapper.dataset.ullsGenerated = 'true';
    wrapper.setAttribute('aria-label', 'Menu mobile');
    wrapper.style.cssText = [
      'position:absolute', 'top:100%', 'left:12px', 'right:12px',
      'z-index:60', 'padding:16px', 'border-radius:14px',
      'border:1px solid #353535', 'background:#191919',
      'box-shadow:0 24px 50px #0007', 'display:flex',
      'flex-direction:column', 'gap:4px'
    ].join(';');
    for (const anchor of links) {
      const copy = doc.createElement('a');
      copy.href = anchor.href;
      copy.textContent = ownText(anchor);
      copy.style.cssText = 'color:#f5f5f7;text-decoration:none;padding:12px 14px;border-radius:10px;font:500 16px/1.4 sans-serif';
      wrapper.append(copy);
    }
    wrapper.hidden = true;
    header.append(wrapper);
    generated.push(wrapper);
    return wrapper;
  }

  function setupMenu() {
    menuTrigger = query(root, selectors.menuToggle);
    const header = query(root, selectors.header);
    menu = query(root, selectors.mobileMenu);
    if (menuTrigger && !menu) menu = createFallbackMenu(header);
    if (!menu || !menuTrigger) return;
    menu.id ||= 'ulls-mobile-menu';
    menuTrigger.setAttribute('aria-controls', menu.id);
    setMenu(false, { silent: true });
  }

  function setMenu(open, { silent = false } = {}) {
    if (!menu || !menuTrigger) return false;
    menuOpen = Boolean(open);
    menuTrigger.setAttribute('aria-expanded', String(menuOpen));
    menuTrigger.setAttribute('aria-label', menuOpen ? 'Fechar menu' : 'Abrir menu');
    setVisible(menu, menuOpen);
    if (!silent) emit('menu-change', { open: menuOpen });
    return menuOpen;
  }

  function syncFaq() {
    const faq = query(root, selectors.faq);
    if (!faq) return;
    const triggers = queryAll(faq, selectors.faqTrigger)
      .filter(el => matches(el, selectors.faqTrigger) && (matches(el, 'summary') || el.hasAttribute('aria-expanded') || el.hasAttribute('data-ulls-faq-trigger')));
    for (const trigger of triggers) {
      const details = closest(trigger, 'details');
      const open = details ? details.open : trigger.getAttribute('aria-expanded') === 'true';
      const panel = findFaqPanel(trigger, selectors);
      trigger.setAttribute('aria-expanded', String(open));
      if (panel) {
        panel.id ||= 'ulls-faq-panel-' + triggers.indexOf(trigger);
        trigger.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-hidden', String(!open));
        // O SSR da Kirvano usa CSS grid-template-rows e overflow-hidden.
        if (panel.classList.contains('grid') || panel.hasAttribute('data-ulls-faq-panel')) {
          panel.style.gridTemplateRows = open ? '1fr' : '0fr';
        } else {
          panel.hidden = !open;
        }
      }
    }
  }

  function setFaq(trigger) {
    const faq = closest(trigger, selectors.faq);
    if (!faq) return false;
    const all = queryAll(faq, selectors.faqTrigger)
      .filter(el => matches(el, 'summary') || el.hasAttribute('aria-expanded') || el.hasAttribute('data-ulls-faq-trigger'));
    const oldValue = trigger.getAttribute('aria-expanded') === 'true';
    const toOpen = !oldValue;
    for (const el of all) {
      if (el !== trigger && options.exclusiveFaq === false) continue;
      const open = el === trigger ? toOpen : false;
      const details = closest(el, 'details');
      if (details) details.open = open;
      el.setAttribute('aria-expanded', String(open));
      const panel = findFaqPanel(el, selectors);
      if (panel) {
        panel.setAttribute('aria-hidden', String(!open));
        if (panel.classList.contains('grid') || panel.hasAttribute('data-ulls-faq-panel')) {
          panel.style.gridTemplateRows = open ? '1fr' : '0fr';
          panel.hidden = false;
        } else panel.hidden = !open;
      }
      const arrow = query(el, '[data-ulls-faq-icon]');
      if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : 'rotate(-90deg)';
    }
    emit('faq-change', { index: all.indexOf(trigger), open: toOpen });
    return true;
  }

  function updatePeriod(period, { silent = false } = {}) {
    const buttons = findPeriodButtons(root, selectors);
    if (!['7d', '30d', '12m'].includes(period) || !buttons.length) return false;
    currentPeriod = period;
    for (const button of buttons) {
      const active = periodOf(button) === period;
      button.classList.toggle('is-active', active);
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
      // Compatibilidade SSR Kirvano quando o Tailwind original já está disponível.
      if (!button.hasAttribute('data-ulls-period')) {
        button.classList.toggle('bg-neutral-900', active);
        button.classList.toggle('text-[#f1ece1]', active);
        button.classList.toggle('text-neutral-900/50', !active);
      }
    }
    const chartRoots = queryAll(root, selectors.chart);
    for (const chart of chartRoots) {
      chart.dataset.period = period;
      const canvas = query(chart, selectors.chartCanvas) || chart;
      if (chart === canvas && !chart.hasAttribute('data-ulls-chart-render')) {
        // Evita substituir um gráfico SSR existente sem área declarada de renderização.
        const bars = queryAll(chart, '[data-ulls-chart-bar]');
        if (bars.length) {
          const vals = getChartSeries(period);
          bars.forEach((bar, i) => {
            const value = vals[i % vals.length];
            bar.style.setProperty('--ulls-bar-height', value + '%');
            bar.style.height = value + '%';
            bar.setAttribute('aria-label', String(value));
          });
        }
      } else renderChart(canvas, period);
    }
    if (!chartRoots.length) {
      // O SSR atual não tem data-attrs no gráfico. Localiza o card pelo
      // seletor visual da Kirvano e os 12/30 blocos com height:% inline.
      const card = buttons[0].closest('.sticky') || buttons[0].parentElement?.parentElement?.parentElement;
      const rows = card ? queryAll(card, 'div.flex.items-end.justify-between') : [];
      const graph = rows.find(row => [...row.children].filter(el =>
        /height\s*:\s*[\d.]+%/i.test(el.getAttribute('style') || '')).length >= 5);
      const bars = graph ? [...graph.children].filter(el =>
        /height\s*:\s*[\d.]+%/i.test(el.getAttribute('style') || '')) : [];
      const values = getChartSeries(period);
      bars.forEach((bar, i) => {
        const value = values[i % values.length];
        bar.style.transition ||= 'height 420ms ' + EASE;
        bar.style.height = value + '%';
        bar.style.setProperty('--ulls-bar-height', value + '%');
      });
    }
    queryAll(root, selectors.chartLabel).forEach(el => { el.textContent = PERIOD_LABELS[period]; });
    queryAll(root, '[data-ulls-timeline]').forEach(timeline => {
      timeline.dataset.period = period;
      queryAll(timeline, '[data-ulls-timeline-period]').forEach(node => {
        node.hidden = node.dataset.ullsTimelinePeriod !== period;
      });
    });
    if (!silent) emit('chart-change', { period, values: [...getChartSeries(period)], demo: true });
    return true;
  }

  function setupChart() {
    const buttons = findPeriodButtons(root, selectors);
    const selected = buttons.find(b => b.dataset.active === 'true' || b.getAttribute('aria-pressed') === 'true' ||
      b.getAttribute('aria-selected') === 'true' || b.classList.contains('bg-neutral-900'));
    updatePeriod(periodOf(selected) || '12m', { silent: true });
  }

  function scrollToHash(href) {
    if (!href || !href.startsWith('#') || href === '#') return false;
    let id;
    try { id = decodeURIComponent(href.slice(1)); } catch { return false; }
    const target = doc.getElementById(id);
    if (!target) return false;
    const header = query(root, selectors.header);
    const offset = Math.max(0, Number(options.anchorOffset) ||
      (header?.getBoundingClientRect().height || 68) + (Number(options.bannerOffset) || 40) + 12);
    const top = win.scrollY + target.getBoundingClientRect().top - offset;
    win.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'instant' : 'smooth' });
    if (win.location?.hash !== href) {
      try { win.history.pushState(null, '', href); } catch { /* history restricted in file preview */ }
    }
    emit('anchor', { hash: href, top: Math.round(top) });
    return true;
  }

  function readLocal(key) {
    try { return storage?.getItem(key) ?? null; } catch { return null; }
  }
  function writeLocal(key, value) {
    try { storage?.setItem(key, value); return true; } catch { return false; }
  }

  function createConsent() {
    const wrap = doc.createElement('aside');
    wrap.dataset.ullsConsent = '';
    wrap.dataset.ullsGenerated = 'true';
    wrap.setAttribute('aria-label', 'Preferências locais');
    wrap.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:24px', 'z-index:100',
      'max-width:min(420px,calc(100vw - 48px))', 'box-sizing:border-box',
      'background:#fff', 'color:#111', 'border:1px solid #ddd',
      'border-radius:12px', 'box-shadow:0 14px 40px #0003',
      'padding:20px', 'font:400 14px/1.55 system-ui,sans-serif'
    ].join(';');
    wrap.innerHTML =
      '<p style="margin:0 0 12px">Esta demonstração usa apenas uma preferência local para lembrar sua escolha. Não envia dados a ferramentas de marketing.</p>' +
      '<button type="button" data-ulls-consent-accept style="background:#111;color:#fff;border:0;border-radius:7px;padding:11px 22px;cursor:pointer">Aceitar</button>';
    (root.nodeType === 1 ? root : doc.body).append(wrap);
    generated.push(wrap);
    return wrap;
  }

  function setupConsent() {
    consent = query(root, selectors.consent);
    if (!consent && options.autoCreateConsent !== false) consent = createConsent();
    if (!consent) return;
    if (readLocal(options.consentKey || STORAGE_KEY) === 'accepted') {
      setVisible(consent, false);
    } else setVisible(consent, true);
  }

  function acceptConsent() {
    writeLocal(options.consentKey || STORAGE_KEY, 'accepted');
    if (consent) setVisible(consent, false);
    emit('consent', { accepted: true, localOnly: true });
  }

  function createHelp() {
    const wrap = doc.createElement('div');
    wrap.dataset.ullsHelp = '';
    wrap.dataset.ullsGenerated = 'true';
    wrap.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:100;font:500 14px/1.4 system-ui,sans-serif';
    wrap.innerHTML =
      '<div data-ulls-help-panel role="region" aria-label="Ajuda" hidden style="position:absolute;bottom:58px;right:0;width:min(300px,calc(100vw - 48px));padding:18px;border-radius:14px;background:#fff;color:#111;box-shadow:0 18px 50px #0003">' +
      '<strong style="font-size:17px">Central de ajuda</strong>' +
      '<p>Esta é uma demonstração. Consulte as perguntas frequentes ou conheça as condições de atendimento.</p>' +
      '<a href="#faq" style="color:#178a7e">Ver perguntas frequentes</a>' +
      '<button type="button" data-ulls-help-close style="display:block;margin-top:14px;border:0;background:#f1f1f1;padding:8px 12px;border-radius:8px">Fechar</button>' +
      '</div><button type="button" data-ulls-help-toggle aria-expanded="false" aria-label="Abrir ajuda" style="display:block;margin-left:auto;background:#82d8d0;color:#111;border:0;border-radius:999px;min-height:48px;padding:12px 18px;box-shadow:0 8px 30px #0002;cursor:pointer">Ajuda</button>';
    (root.nodeType === 1 ? root : doc.body).append(wrap);
    generated.push(wrap);
    return wrap;
  }

  function setupHelp() {
    if (options.suppressLegacyPromo !== false) {
      // Snapshot SSR: marketing pop-up fixo, com CTAs da Kirvano original.
      // Ele não representa a ajuda local e não deve reaparecer via reveal.
      const legacyClose = query(root, 'button[aria-label="Fechar"]');
      const marketingPanel = legacyClose?.closest('div.relative');
      if (marketingPanel?.textContent?.includes('Venda online sem mensalidades')) {
        marketingPanel.hidden = true;
        marketingPanel.style.display = 'none';
        marketingPanel.dataset.ullsSuppressed = 'true';
      }
    }
    help = query(root, selectors.help);
    if (!help && options.autoCreateHelp !== false) help = createHelp();
    if (!help) return;
    setHelp(false, { silent: true });
  }

  function setHelp(open, { silent = false } = {}) {
    if (!help) return false;
    helpOpen = Boolean(open);
    const panel = query(help, selectors.helpPanel);
    const button = query(help, selectors.helpToggle);
    setVisible(panel, helpOpen);
    if (button) {
      button.setAttribute('aria-expanded', String(helpOpen));
      button.setAttribute('aria-label', helpOpen ? 'Fechar ajuda' : 'Abrir ajuda');
    }
    if (!silent) emit('help-change', { open: helpOpen, localOnly: true });
    return helpOpen;
  }

  function animateCounter(element) {
    if (startedCounters.has(element)) return;
    startedCounters.add(element);
    const target = parseCounter(element.getAttribute('data-target') ||
      element.getAttribute('data-counter-to') || element.dataset.ullsCounter || element.textContent);
    if (!Number.isFinite(target)) return;
    const precision = Math.max(0, Number(element.dataset.precision || '0') || 0);
    const prefix = element.dataset.prefix || '';
    const suffix = element.dataset.suffix || '';
    const render = num => { element.textContent = prefix + formatCounter(num, precision) + suffix; };
    if (reduceMotion()) { render(target); return; }
    const start = win.performance.now();
    const duration = Math.max(100, Number(element.dataset.duration || '1000') || 1000);
    function frame(now) {
      if (signal.aborted) return;
      const progress = clamp((now - start) / duration, 0, 1);
      render(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) {
        const id = win.requestAnimationFrame(frame);
        counterFrames.add(id);
      } else {
        render(target);
      }
    }
    const id = win.requestAnimationFrame(frame);
    counterFrames.add(id);
  }

  function revealTargetTransform(element) {
    const original = element.style.transform || '';
    // Preserva translateX(-50%) que centraliza badges/cards absolutos.
    const cleaned = original
      .replace(/translateY\([^)]*\)/g, '')
      .replace(/translate3d\(\s*0(?:px)?\s*,\s*[^,]+\s*,\s*0(?:px)?\s*\)/g, '')
      .replace(/scale\(\s*0\.[0-9]+\s*\)/g, '')
      .replace(/\s+/g, ' ').trim();
    return cleaned || 'none';
  }

  function findReveals() {
    const explicit = queryAll(root, selectors.reveal);
    // O snapshot Kirvano contém animações inline geradas pelo runtime React:
    // opacity:0 + translateY nos headings, cards, parágrafos e word-stagger.
    // O componente não executa aquele runtime; reativamos pelo DOM, com IO.
    const legacy = queryAll(root, '[style*="opacity:0"], [style*="opacity: 0"]')
      .filter(element => {
        if (element.style.opacity !== '0') return false;
        if (!/translateY\(|translate3d\(|scale\(/.test(element.style.transform || '')) return false;
        if (element.closest('[data-ulls-generated], [data-ulls-help], [data-ulls-consent], [data-ulls-suppressed], [role="dialog"], [aria-modal="true"], [hidden]')) return false;
        // Modais, pop-ups fixos e navegação têm estados próprios e não são conteúdo.
        if (element.closest('header, [class*="fixed"]')) return false;
        if (element.tagName === 'SCRIPT' || element.tagName === 'NOSCRIPT') return false;
        const style = win.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      });
    return [...new Set([...explicit, ...legacy])];
  }

  function revealElement(element) {
    element.dataset.inView = 'true';
    element.classList.add('is-visible');
    const legacy = element.style.opacity === '0';
    if (legacy || element.hasAttribute('data-ulls-reveal')) {
      element.style.opacity = '1';
      element.style.transform = revealTargetTransform(element);
    }
    seenReveals.add(element);
    emit('reveal', { element });
  }

  // Proteção adicional para SSR: alguns navegadores não disparam IO em nós
  // aninhados em sticky/grids com transforms de entrada. O scroll RAF revela
  // somente o conteúdo da viewport, mantendo o mesmo efeito de progressão.
  function revealVisibleFallback() {
    const candidates = queryAll(root,
      'section [style*="opacity:0"], section [style*="opacity: 0"], ' +
      'h1[style*="opacity:0"], h1[style*="opacity: 0"], [data-ulls-reveal]');
    for (const element of candidates) {
      if (seenReveals.has(element)) continue;
      if (element.closest('[hidden], [aria-hidden="true"], [data-ulls-generated], [data-ulls-suppressed]')) continue;
      if (element.closest('[class*="fixed"], header')) continue;
      if (element.style.opacity !== '0' && !element.hasAttribute('data-ulls-reveal')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < -80 || rect.top > win.innerHeight + 140) continue;
      revealElement(element);
    }
  }

  function setupObservers() {
    observers.splice(0).forEach(observer => observer.disconnect());
    const reveals = findReveals();
    const counters = queryAll(root, selectors.counter);
    if (!win.IntersectionObserver || reduceMotion()) {
      reveals.forEach(revealElement);
      counters.forEach(animateCounter);
      return;
    }
    const revealObserver = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        revealElement(element);
        revealObserver.unobserve(element);
      }
    }, { threshold: 0.09, rootMargin: '0px 0px 48px 0px' });
    observers.push(revealObserver);
    for (const el of reveals) {
      if (seenReveals.has(el)) continue;
      if (el.hasAttribute('data-ulls-reveal') && !el.classList.contains('is-visible')) {
        el.style.transition ||= 'opacity 560ms ' + EASE + ', transform 560ms ' + EASE;
        el.style.opacity = '0';
        el.style.transform ||= 'translate3d(0, 18px, 0)';
      }
      // CSS inline da referência não define transição: configura easing local.
      if (!el.style.transition || el.style.transition === 'none') {
        const word = Boolean(el.closest('.word-stagger'));
        const siblings = word ? [...el.parentElement.children] : [];
        const index = word ? siblings.indexOf(el) : 0;
        el.style.transition = 'opacity 600ms ' + EASE + ', transform 600ms ' + EASE;
        if (index > 0) el.style.transitionDelay = Math.min(index * 28, 450) + 'ms';
      }
      revealObserver.observe(el);
    }
    const counterObserver = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    }, { threshold: 0.25 });
    observers.push(counterObserver);
    counters.forEach(el => counterObserver.observe(el));
  }

  function onScroll() {
    if (tickPending) return;
    tickPending = true;
    win.requestAnimationFrame(() => {
      tickPending = false;
      if (signal.aborted) return;
      const position = win.scrollY || doc.documentElement.scrollTop || 0;
      revealVisibleFallback();
      const header = query(root, selectors.header);
      if (header) {
        header.dataset.scrolled = String(position > 48);
        header.classList.toggle('is-scrolled', position > 48);
      }
      const total = Math.max(1, doc.documentElement.scrollHeight - win.innerHeight);
      queryAll(root, selectors.scrollProgress).forEach(el => {
        el.style.setProperty('--ulls-scroll-progress', String(position / total));
        el.style.width = (100 * clamp(position / total, 0, 1)) + '%';
      });
      if (reduceMotion() || win.innerWidth < 768) return;
      queryAll(root, selectors.parallax).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > win.innerHeight + 200) return;
        const speed = clamp(Number(el.dataset.ullsParallax) || 0.12, -0.8, 0.8);
        const offset = clamp((win.innerHeight / 2 - (rect.top + rect.height / 2)) * speed, -120, 120);
        el.style.setProperty('--ulls-parallax-y', offset.toFixed(2) + 'px');
        if (el.hasAttribute('data-ulls-parallax-transform')) {
          el.style.transform = 'translate3d(0,' + offset.toFixed(2) + 'px,0)';
        }
      });
    });
  }

  function onPointerMove(event) {
    if (reduceMotion() || win.innerWidth < 768 || event.pointerType === 'touch') return;
    const el = closest(event.target, selectors.tilt);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
    const y = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
    el.style.setProperty('--ulls-tilt-x', (x * 7).toFixed(2) + 'deg');
    el.style.setProperty('--ulls-tilt-y', (-y * 7).toFixed(2) + 'deg');
    if (el.hasAttribute('data-ulls-tilt-transform')) {
      el.style.transform = 'perspective(900px) rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 7).toFixed(2) + 'deg)';
    }
  }

  function onClick(event) {
    const element = event.target;
    if (!element?.closest) return;
    if (closest(element, selectors.menuToggle) === menuTrigger && menuTrigger) {
      event.preventDefault();
      setMenu(!menuOpen);
      return;
    }
    if (closest(element, selectors.consentAccept) || (consent && closest(element, 'button') &&
      consent.contains(closest(element, 'button')) && /^aceitar$/i.test(ownText(closest(element, 'button'))))) {
      event.preventDefault();
      acceptConsent();
      return;
    }
    if (closest(element, selectors.consentMore)) {
      event.preventDefault();
      const details = query(consent, selectors.consentDetails);
      if (details) setVisible(details, details.hidden);
      return;
    }
    if (closest(element, selectors.helpClose)) {
      event.preventDefault();
      setHelp(false);
      return;
    }
    if (closest(element, selectors.helpToggle)) {
      event.preventDefault();
      setHelp(!helpOpen);
      return;
    }
    const faqTrigger = closest(element, selectors.faqTrigger);
    if (faqTrigger && closest(faqTrigger, selectors.faq)) {
      event.preventDefault();
      setFaq(faqTrigger);
      return;
    }
    const periodButton = closest(element, selectors.chartPeriod) || closest(element, 'button');
    if (periodButton && findPeriodButtons(root, selectors).includes(periodButton)) {
      const period = periodOf(periodButton);
      if (period) {
        event.preventDefault();
        updatePeriod(period);
        return;
      }
    }
    const anchor = closest(element, selectors.anchor);
    if (anchor) {
      const href = anchor.getAttribute('data-ulls-scroll-to') || anchor.getAttribute('href');
      if (href?.startsWith('#') && scrollToHash(href)) {
        event.preventDefault();
        if (menuOpen) setMenu(false);
        if (helpOpen) setHelp(false);
        return;
      }
    }
    const outbound = closest(element, 'a[href]');
    if (outbound && options.blockOriginalCtas !== false) {
      let host = '';
      try { host = new URL(outbound.href, win.location.href).hostname.toLowerCase(); } catch { /* malformed link */ }
      if (['app.kirvano.com', 'help.kirvano.com'].includes(host)) {
        event.preventDefault();
        setHelp(true);
        emit('demo-link', { blocked: true, destination: host });
        return;
      }
    }
    if (menuOpen && menu && !menu.contains(element) && !menuTrigger?.contains(element)) setMenu(false);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (menuOpen) setMenu(false);
      if (helpOpen) setHelp(false);
    }
  }

  function onSubmit(event) {
    if (options.demoForms === false) return;
    const form = closest(event.target, 'form');
    if (!form) return;
    event.preventDefault();
    const status = query(form, '[data-ulls-form-status], [role=status]');
    if (status) status.textContent = 'Demonstração: nenhuma informação foi enviada.';
    emit('form-demo', { form, submitted: false });
  }

  function refresh() {
    setupMenu();
    setupConsent();
    setupHelp();
    syncFaq();
    setupChart();
    setupObservers();
    onScroll();
    return api;
  }

  function destroy() {
    abort.abort();
    observers.forEach(obs => obs.disconnect());
    counterFrames.forEach(id => win.cancelAnimationFrame(id));
    generated.forEach(el => el.remove());
    subscriptions.forEach(fn => fn());
    INSTANCES.delete(root);
  }

  const api = Object.freeze({
    root, selectors, refresh, destroy, setMenu, setFaq, setHelp,
    setChartPeriod: updatePeriod, scrollToHash, acceptConsent,
    state: () => ({ menuOpen, helpOpen, period: currentPeriod, consentAccepted: readLocal(options.consentKey || STORAGE_KEY) === 'accepted' })
  });
  INSTANCES.set(root, api);
  listen(root, 'click', onClick);
  listen(root, 'submit', onSubmit);
  listen(doc, 'keydown', onKeyDown);
  listen(root, 'pointermove', onPointerMove, true);
  listen(root, 'pointerout', event => {
    const el = closest(event.target, selectors.tilt);
    if (el && !el.contains(event.relatedTarget)) {
      el.style.setProperty('--ulls-tilt-x', '0deg');
      el.style.setProperty('--ulls-tilt-y', '0deg');
      if (el.hasAttribute('data-ulls-tilt-transform')) el.style.transform = '';
    }
  }, true);
  listen(win, 'scroll', onScroll, true);
  listen(win, 'resize', onScroll, true);
  refresh();
  return api;
}
