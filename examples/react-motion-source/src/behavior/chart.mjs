/**
 * Dados demonstrativos locais para o mock visual do dashboard.
 * Nunca representam métricas de vendas reais nem provocam fetch/API.
 */
export const PERIOD_SERIES = Object.freeze({
  '7d': Object.freeze([29, 53, 47, 65, 50, 82, 73]),
  '30d': Object.freeze([
    23, 34, 26, 48, 40, 57, 52, 39, 62, 49,
    71, 61, 54, 70, 83, 66, 52, 76, 63, 89,
    75, 64, 93, 77, 85, 69, 95, 82, 73, 96
  ]),
  '12m': Object.freeze([33, 41, 37, 50, 58, 52, 66, 72, 68, 81, 87, 96]),
});

export const PERIOD_LABELS = Object.freeze({
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '12m': 'Últimos 12 meses',
});

export function getChartSeries(period) {
  return PERIOD_SERIES[period] || PERIOD_SERIES['12m'];
}

export function chartPath(values, width = 600, height = 200, padding = 8) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const denominator = Math.max(1, values.length - 1);
  return values.map((value, i) => {
    const x = padding + i * availableWidth / denominator;
    const y = height - padding - Math.max(0, Math.min(100, Number(value) || 0)) / 100 * availableHeight;
    return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ');
}

export function formatCounter(value, precision = 0, locale = 'pt-BR') {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Math.max(0, precision),
    maximumFractionDigits: Math.max(0, precision)
  }).format(value);
}

export function parseCounter(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return Number.NaN;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  if (comma !== -1 && dot !== -1) {
    return Number(comma > dot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, ''));
  }
  if (comma !== -1) {
    const frac = cleaned.length - comma - 1;
    return Number(frac === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.'));
  }
  if (dot !== -1 && cleaned.length - dot - 1 === 3) return Number(cleaned.replace(/\./g, ''));
  return Number(cleaned);
}

export function renderChart(chartRoot, period, options = {}) {
  if (!chartRoot || !chartRoot.ownerDocument) return null;
  const values = getChartSeries(period);
  if (chartRoot.hasAttribute('data-ulls-chart-bars')) {
    for (const [i, bar] of [...chartRoot.querySelectorAll('[data-ulls-chart-bar]')].entries()) {
      const value = values[i % values.length];
      bar.style.setProperty('--ulls-bar-height', value + '%');
      bar.style.height = value + '%';
      bar.setAttribute('aria-label', String(value));
    }
    chartRoot.dataset.period = period;
    return values;
  }
  const doc = chartRoot.ownerDocument;
  const active = chartRoot.matches?.('svg') ? chartRoot : chartRoot.querySelector('svg[data-ulls-chart-svg]');
  const tag = chartRoot.tagName?.toLowerCase();
  const svg = active || (tag === 'svg' ? chartRoot : doc.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  if (!active && tag !== 'svg') {
    svg.setAttribute('data-ulls-chart-svg', '');
    svg.setAttribute('viewBox', '0 0 600 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.minHeight = options.minHeight || '140px';
    svg.style.display = 'block';
    chartRoot.append(svg);
  }
  const width = 600;
  const height = 200;
  const pathData = chartPath(values, width, height);
  let line = svg.querySelector('[data-ulls-chart-line]');
  if (!line) {
    line = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('data-ulls-chart-line', '');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', options.color || '#82d8d0');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.append(line);
  }
  line.setAttribute('d', pathData);
  svg.setAttribute('aria-label', PERIOD_LABELS[period] || PERIOD_LABELS['12m']);
  svg.dataset.period = period;

  const bars = [...chartRoot.querySelectorAll('[data-ulls-chart-bar]')];
  for (let i = 0; i < bars.length; i++) {
    const value = values[i % values.length];
    bars[i].style.setProperty('--ulls-bar-height', value + '%');
    bars[i].style.height = value + '%';
    bars[i].setAttribute('aria-label', String(value));
  }
  return values;
}
