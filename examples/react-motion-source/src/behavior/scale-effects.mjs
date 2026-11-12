/**
 * Scoped entrance/micro-interactions for 02-escalar.html (the three sticky
 * growth cards). Nothing is inserted into the card markup and no bar heights,
 * period buttons, scroll positions, or sticky styles are replaced.
 *
 * Import ../styles/scale-effects.css and call setupScaleEffects(document)
 * AFTER mounting the section. Call the returned cleanup on unmount.
 * `behavior/index.mjs` remains the sole owner of 7d/30d/12m clicks/data.
 */

const INSTANCES = new WeakMap();
const PERIODS = new Set(['7d', '30d', '12m']);

function findSection(root) {
  if (!root?.querySelectorAll) return null;
  const marked = root.querySelector('[data-ulls-scale-section]');
  if (marked) return marked;
  const sections = root.matches?.('section')
    ? [root, ...root.querySelectorAll('section')]
    : [...root.querySelectorAll('section')];
  // Structural fallback also works after users edit the copy in the catalog.
  // The original title is in PT-BR; comparing its ASCII end is independent of
  // any variations in accents, nonbreaking spaces, or text serialization.
  return sections.find(section =>
    /precisa\s+para\s+escalar/i.test(
      section.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    )
  ) || sections.find(section => findCards(section).length === 3) || null;
}

function findCards(section) {
  // Original DOM: <section><div.max-w-7xl><div intro/> <div.grid>
  // 3 direct div.sticky ... </div></div></section>.
  const content = section.firstElementChild;
  if (!content) return [];
  const candidate = [...content.children].find(el =>
    el.classList.contains('lg:grid') &&
    el.classList.contains('gap-4') &&
    el.children.length === 3
  );
  if (!candidate) return [];
  const cards = [...candidate.children];
  if (!cards.every(card => card.classList?.contains('sticky') && card.querySelector('h3'))) return [];
  return cards;
}

function findBars(card) {
  // The graph has six ORIGINAL divs with inline height percentages, one per
  // visible column. Never create or re-render the chart itself.
  return [...card.querySelectorAll('div')]
    .filter(node => node.classList.contains('items-end') &&
      node.classList.contains('justify-between'))
    .map(row => [...row.children].filter(child =>
      child.tagName === 'DIV' && /^\d+(?:\.\d+)?%$/.test(child.style.height || '')))
    .find(columns => columns.length >= 5) || [];
}

export function setupScaleEffects(root = globalThis.document) {
  const section = findSection(root);
  const cards = section ? findCards(section) : [];
  if (!section || cards.length !== 3) return () => {};

  const existing = INSTANCES.get(section);
  if (existing) {
    existing.refs++;
    let released = false;
    return () => { if (!released) { released = true; existing.release(); } };
  }

  const doc = section.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  const originals = [];
  const animations = new Set();
  let observer;
  let disposed = false;

  const marker = (node, key, value = '') => {
    if (!node) return;
    originals.push([node, key, node.getAttribute(key)]);
    node.setAttribute(key, value);
  };
  const variable = (node, key, value) => {
    originals.push([node, `style:${key}`, node.style.getPropertyValue(key)]);
    node.style.setProperty(key, value);
  };
  const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  marker(section, 'data-ulls-scale');
  const intro = section.firstElementChild?.firstElementChild;
  if (intro) marker(intro, 'data-ulls-scale-intro');

  const [payments, offers, dashboard] = cards;
  cards.forEach((card, index) => {
    marker(card, 'data-ulls-scale-card', String(index + 1));
    const titleWords = [...card.querySelectorAll('h3 > span')];
    titleWords.forEach((word, i) => {
      marker(word, 'data-ulls-scale-word', 'title');
      variable(word, '--ulls-scale-word-index', String(i));
    });
    const bodyWords = [...card.querySelectorAll('p > span')];
    bodyWords.forEach((word, i) => {
      marker(word, 'data-ulls-scale-word', 'body');
      variable(word, '--ulls-scale-word-index', String(i));
    });
  });

  // Card 1: original payment methods list and its four badges/icons.
  const paymentArt = [...payments.querySelectorAll('div')].find(node =>
    node.classList.contains('absolute') &&
    node.classList.contains('bottom-0') &&
    node.classList.contains('h-[240px]')
  );
  if (paymentArt) {
    marker(paymentArt, 'data-ulls-scale-art', 'payment');
    const list = paymentArt.querySelector('.flex.flex-col.gap-2');
    if (list) [...list.children].forEach((row, i) => {
      marker(row, 'data-ulls-scale-payrow');
      variable(row, '--ulls-scale-row-index', String(i));
    });
  }

  // Card 2: original labels, centered illustration, floating commission and
  // animated amount. Its translateX(-50%) MUST remain intact when animated.
  const labels = [...offers.querySelectorAll('span')].filter(el =>
    /^(Order bump|Upsell|Downsell)$/.test(el.textContent?.trim() || '') &&
    el.classList.contains('rounded-md')
  );
  labels.forEach((label, i) => {
    marker(label, 'data-ulls-scale-label');
    variable(label, '--ulls-scale-label-index', String(i));
  });
  const offerImg = offers.querySelector('img[src*="comissao-face"]') ||
    offers.querySelector('img');
  if (offerImg?.parentElement?.classList.contains('absolute')) {
    marker(offerImg.parentElement, 'data-ulls-scale-art', 'offer');
  }
  const commissionPop = [...offers.querySelectorAll('div')].find(el =>
    /scale\(0\.94\)/.test(el.getAttribute('style') || '') &&
    /comiss[aã]o/i.test(el.textContent || '')
  );
  if (commissionPop) {
    marker(commissionPop, 'data-ulls-scale-commission');
    const amount = commissionPop.querySelector('span.inline-block.font-semibold');
    if (amount) marker(amount, 'data-ulls-scale-commission-amount');
  }

  // Card 3: existing six CSS bars. behavior/index.mjs already sets height (%)
  // and raises `ulls:chart-change`; this module merely animates the visuals.
  const bars = findBars(dashboard);
  bars.forEach((bar, i) => {
    marker(bar, 'data-ulls-scale-bar');
    variable(bar, '--ulls-scale-bar-index', String(i));
  });

  function activate(card) {
    if (disposed || card.hasAttribute('data-ulls-scale-entered')) return;
    card.setAttribute('data-ulls-scale-entered', 'true');
    // Animation affects transform/opacity ONLY, not height/top/position.
    // IntersectionObserver observes each card separately for mobile sticky.
    if (observer) observer.unobserve(card);
  }

  if (win.IntersectionObserver && !reduced()) {
    observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) activate(entry.target);
      }
    }, { root: null, rootMargin: '0px 0px 64px 0px', threshold: 0.07 });
    cards.forEach(card => observer.observe(card));
  } else {
    cards.forEach(activate);
  }

  function onChartChange(event) {
    if (disposed || !PERIODS.has(event.detail?.period)) return;
    if (!section.contains(event.target) && event.target !== doc.querySelector('[data-ulls-landing]')) return;
    // `event.detail` arrives after the original handler updates button state
    // and heights. Do NOT dispatch clicks/change heights/call updatePeriod.
    dashboard.setAttribute('data-ulls-scale-period', event.detail.period);
    if (reduced() || !dashboard.hasAttribute('data-ulls-scale-entered')) return;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!bar.animate) continue;
      const animation = bar.animate(
        [{ transform: 'scaleY(0.77)', opacity: 0.82 }, { transform: 'scaleY(1)', opacity: 1 }],
        { duration: 430 + i * 38, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'none' }
      );
      animations.add(animation);
      animation.addEventListener('finish', () => animations.delete(animation), { once: true });
      animation.addEventListener('cancel', () => animations.delete(animation), { once: true });
    }
  }

  // The main controller dispatches from the app root without bubbles:true.
  // Listen on the SAME element; document would never see the event.
  const eventRoot = section.closest('[data-ulls-landing]') || doc;
  eventRoot.addEventListener('ulls:chart-change', onChartChange, { signal });

  const record = {
    refs: 1,
    release() {
      if (--record.refs > 0 || disposed) return;
      disposed = true;
      controller.abort();
      observer?.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
      cards.forEach(card => card.removeAttribute('data-ulls-scale-entered'));
      dashboard.removeAttribute('data-ulls-scale-period');
      for (let i = originals.length - 1; i >= 0; i--) {
        const [node, key, value] = originals[i];
        if (key.startsWith('style:')) {
          const property = key.slice(6);
          if (value) node.style.setProperty(property, value);
          else node.style.removeProperty(property);
        } else if (value === null) node.removeAttribute(key);
        else node.setAttribute(key, value);
      }
      INSTANCES.delete(section);
    },
  };
  INSTANCES.set(section, record);

  let released = false;
  return () => { if (!released) { released = true; record.release(); } };
}

export default setupScaleEffects;
