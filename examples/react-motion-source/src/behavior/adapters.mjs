/**
 * Contrato entre os componentes SSR e o behavior progressivo.
 * data-ulls-* é preferido; os seletores adicionais são compatibilidade com o HTML da Kirvano.
 * É possível sobrescrever qualquer entrada com initLandingBehavior({ selectors: {...} }).
 */
export const DEFAULT_SELECTORS = Object.freeze({
  root: '[data-ulls-landing]',
  header: '[data-ulls-header], header',
  menuToggle: '[data-ulls-menu-toggle], header button[aria-label="Abrir menu"], header button[aria-label="Fechar menu"]',
  mobileMenu: '[data-ulls-mobile-menu], [data-ulls-menu-panel]',
  anchor: 'a[href^="#"], [data-ulls-scroll-to]',
  faq: '[data-ulls-faq], #faq',
  faqTrigger: '[data-ulls-faq-trigger], button[aria-expanded], summary',
  faqPanel: '[data-ulls-faq-panel]',
  chart: '[data-ulls-chart]',
  chartCanvas: '[data-ulls-chart-render], [data-ulls-chart-bars]',
  chartPeriod: '[data-ulls-period]',
  chartLabel: '[data-ulls-chart-label]',
  counter: '[data-ulls-counter], [data-counter-to]',
  reveal: '[data-ulls-reveal], [data-reveal]',
  parallax: '[data-ulls-parallax]',
  tilt: '[data-ulls-tilt]',
  consent: '[data-ulls-consent], [data-cookie-banner]',
  consentAccept: '[data-ulls-consent-accept], [data-cookie-accept]',
  consentMore: '[data-ulls-consent-more]',
  consentDetails: '[data-ulls-consent-details]',
  help: '[data-ulls-help]',
  helpToggle: '[data-ulls-help-toggle]',
  helpClose: '[data-ulls-help-close]',
  helpPanel: '[data-ulls-help-panel]',
  scrollProgress: '[data-ulls-scroll-progress]',
});

export function query(root, selector) {
  if (!root || !selector) return null;
  try { return root.querySelector(selector); } catch { return null; }
}

export function queryAll(root, selector) {
  if (!root || !selector) return [];
  try { return [...root.querySelectorAll(selector)]; } catch { return []; }
}

export function matches(element, selector) {
  if (!element || !selector || typeof element.matches !== 'function') return false;
  try { return element.matches(selector); } catch { return false; }
}

export function closest(element, selector) {
  if (!element || !selector || typeof element.closest !== 'function') return null;
  try { return element.closest(selector); } catch { return null; }
}

export function isVisible(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0;
}

export function findPeriodButtons(root, selectors = DEFAULT_SELECTORS) {
  const explicit = queryAll(root, selectors.chartPeriod);
  if (explicit.length) return explicit;
  // Kirvano SSR: botões 7d/30d/12m não recebem data-attrs.
  return queryAll(root, 'button').filter(el => /^(7d|30d|12m)$/i.test((el.textContent || '').trim()));
}

export function periodOf(button) {
  const period = (button?.getAttribute('data-ulls-period') ||
    button?.getAttribute('data-period') || button?.textContent || '').trim().toLowerCase();
  return ['7d', '30d', '12m'].includes(period) ? period : null;
}

export function findFaqPanel(trigger, selectors = DEFAULT_SELECTORS) {
  const explicitId = trigger?.getAttribute('aria-controls');
  if (explicitId) {
    const owned = trigger.ownerDocument?.getElementById(explicitId);
    if (owned) return owned;
  }
  const sibling = trigger?.nextElementSibling;
  if (sibling && (matches(sibling, selectors.faqPanel) || sibling.matches('div,section'))) return sibling;
  const wrapped = trigger?.parentElement;
  const nested = wrapped ? query(wrapped, selectors.faqPanel) : null;
  if (nested) return nested;
  return wrapped?.querySelector(':scope > div:not(:first-child)') || null;
}

export function documentFor(root) {
  return root?.ownerDocument || (root?.nodeType === 9 ? root : globalThis.document);
}
