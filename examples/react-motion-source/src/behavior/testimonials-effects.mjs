/**
 * Progressive enhancement for the two-copy testimonial carousel in the
 * immutable Kirvano SSR markup (09-depoimentos.html).
 *
 * Import the companion ../styles/testimonials-faq-effects.css from the app's
 * stylesheet entrypoint. No React, analytics, timers on a global interval, or
 * changes to the reference HTML are required.
 *
 * @param {Document | Element} root DOM to search, defaults to the current page.
 * @returns {() => void} cleanup, safe to invoke more than once.
 */

const INSTANCES = new WeakMap();

const SELECTOR = '[data-ulls-testimonials]';
const TRACK_SELECTOR = '[data-ulls-testimonials-track]';

function findSection(root) {
  if (!root?.querySelectorAll) return null;
  if (root.matches?.(SELECTOR)) return root;
  const byMarker = root.querySelector(SELECTOR);
  if (byMarker) return byMarker;

  // The original section has no stable id or data-* marker. Find it by the
  // landmark heading + duplicated card row, never by a global flex class.
  const candidates = [...root.querySelectorAll('section')];
  if (root.matches?.('section')) candidates.unshift(root);
  return candidates.find((section) => {
    const heading = section.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!/hist[oó]rias\s+de\s+quem\s+cresce/i.test(heading)) return false;
    return [...section.querySelectorAll('div')].some((node) =>
      node.classList.contains('overflow-hidden') &&
      node.firstElementChild?.matches('div.flex.w-max') &&
      node.firstElementChild.children.length >= 3
    );
  }) || null;
}

function findTrack(section) {
  const marked = section.querySelector(TRACK_SELECTOR);
  if (marked) return marked;
  return [...section.querySelectorAll('div.overflow-hidden')]
    .map((node) => node.firstElementChild)
    .find((node) => node?.matches('div.flex.w-max') && node.children.length >= 3) || null;
}

function cardSignature(node) {
  return `${node.querySelector('img')?.getAttribute('src') || ''}\n` +
    (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function existingCopyCount(cards) {
  const half = cards.length / 2;
  if (!Number.isInteger(half) || half < 2) return 0;
  for (let i = 0; i < half; i++) {
    if (cardSignature(cards[i]) !== cardSignature(cards[i + half])) return 0;
  }
  return half;
}

export function setupTestimonialsEffects(root = globalThis.document) {
  const section = findSection(root);
  if (!section) return () => {};

  const previous = INSTANCES.get(section);
  if (previous) {
    previous.refs++;
    let released = false;
    return () => {
      if (!released) { released = true; previous.release(); }
    };
  }

  const track = findTrack(section);
  const viewport = track?.parentElement;
  if (!track || !viewport || track.children.length < 2) return () => {};

  const doc = section.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};

  const injected = [];
  const markedNodes = [
    [section, 'data-ulls-testimonials'],
    [viewport, 'data-ulls-testimonials-viewport'],
    [track, 'data-ulls-testimonials-track'],
  ];
  const priorMarkers = markedNodes.map(([node, name]) => node.getAttribute(name));
  for (const [node, name] of markedNodes) node.setAttribute(name, '');

  // The reference ships Junior/Yuri/Yan twice; do NOT append a third copy.
  // If content is edited to a single set in the future, duplicate once solely
  // for a seamless loop. Generated cards are inaccessible to screen readers.
  let cards = [...track.children];
  let originals = existingCopyCount(cards);
  if (!originals) {
    originals = cards.length;
    for (const original of cards) {
      const clone = original.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');
      clone.setAttribute('data-ulls-testimonials-clone', '');
      for (const element of [clone, ...clone.querySelectorAll('[id]')]) element.removeAttribute('id');
      track.append(clone);
      injected.push(clone);
    }
    cards = [...track.children];
  }

  // The original SSR second copy has no aria-hidden attribute; it should not
  // be read twice, even though it must remain in the exact visual layout.
  const hiddenSecondCopy = [];
  for (let i = originals; i < cards.length - injected.length; i++) {
    const card = cards[i];
    hiddenSecondCopy.push([card, card.getAttribute('aria-hidden')]);
    card.setAttribute('aria-hidden', 'true');
  }

  const oldDistance = track.style.getPropertyValue('--ulls-testimonials-distance');
  const oldDuration = track.style.getPropertyValue('--ulls-testimonials-duration');
  const controller = new AbortController();
  const { signal } = controller;
  let resizeObserver = null;
  let touchTimer = null;
  let frame = 0;
  let destroyed = false;

  function measure() {
    if (destroyed || !track.isConnected) return;
    const elements = [...track.children];
    if (elements.length <= originals) return;
    // This measures the *start* of the next copy, including the inter-copy
    // gap. translateX(-50%) alone introduces a visible ~10px seam because
    // flex gap contributes five gaps for the six original cards.
    const distance = elements[originals].getBoundingClientRect().left -
      elements[0].getBoundingClientRect().left;
    if (!(distance > 0)) return;
    const speed = win.matchMedia?.('(max-width: 639px)')?.matches ? 38 : 46;
    const seconds = Math.max(12, distance / speed);
    track.style.setProperty('--ulls-testimonials-distance', `${distance.toFixed(2)}px`);
    track.style.setProperty('--ulls-testimonials-duration', `${seconds.toFixed(2)}s`);
  }

  function scheduleMeasure() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => { frame = 0; measure(); });
  }

  function clearTouch() {
    if (touchTimer !== null) win.clearTimeout(touchTimer);
    touchTimer = null;
  }

  function pauseForTouch() {
    clearTouch();
    viewport.dataset.ullsTestimonialsTouchPaused = 'true';
  }

  function resumeAfterTouch() {
    clearTouch();
    // A short hold after the user lifts their finger avoids an unexpected
    // movement while they are scanning a longer review on a phone.
    touchTimer = win.setTimeout(() => {
      viewport.removeAttribute('data-ulls-testimonials-touch-paused');
      touchTimer = null;
    }, 1200);
  }

  viewport.addEventListener('touchstart', pauseForTouch, { passive: true, signal });
  viewport.addEventListener('touchend', resumeAfterTouch, { passive: true, signal });
  viewport.addEventListener('touchcancel', resumeAfterTouch, { passive: true, signal });
  win.addEventListener('resize', scheduleMeasure, { passive: true, signal });
  if (typeof win.ResizeObserver === 'function') {
    resizeObserver = new win.ResizeObserver(scheduleMeasure);
    resizeObserver.observe(viewport);
    // Respond to changed card widths after font or content changes.
    resizeObserver.observe(cards[0]);
  }
  if (doc.fonts?.ready) doc.fonts.ready.then(() => { if (!destroyed) scheduleMeasure(); });
  measure();

  const record = {
    refs: 1,
    release() {
      if (--record.refs > 0 || destroyed) return;
      destroyed = true;
      controller.abort();
      resizeObserver?.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      clearTouch();
      viewport.removeAttribute('data-ulls-testimonials-touch-paused');
      for (const node of injected) node.remove();
      for (const [card, old] of hiddenSecondCopy) {
        if (old === null) card.removeAttribute('aria-hidden');
        else card.setAttribute('aria-hidden', old);
      }
      for (const [i, [node, name]] of markedNodes.entries()) {
        if (priorMarkers[i] === null) node.removeAttribute(name);
        else node.setAttribute(name, priorMarkers[i]);
      }
      if (oldDistance) track.style.setProperty('--ulls-testimonials-distance', oldDistance);
      else track.style.removeProperty('--ulls-testimonials-distance');
      if (oldDuration) track.style.setProperty('--ulls-testimonials-duration', oldDuration);
      else track.style.removeProperty('--ulls-testimonials-duration');
      INSTANCES.delete(section);
    },
  };
  INSTANCES.set(section, record);
  let released = false;
  return () => {
    if (!released) { released = true; record.release(); }
  };
}

export default setupTestimonialsEffects;
