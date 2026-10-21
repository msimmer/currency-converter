// Single-series line chart with touch scrubbing, drawn as SVG.

const NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 28, right: 56, bottom: 26, left: 4 };

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return { ticks, step };
}

/**
 * @param {HTMLElement} container
 * @param {{ formatTick: (n:number, step:number)=>string, formatDate: (iso:string)=>string,
 *           formatAxisDate: (iso:string)=>string, onScrub?: (p|null)=>void }} opts
 */
export function createChart(container, opts) {
  let points = [];
  let geom = null;

  const svg = el('svg', { class: 'chart-svg' }, container);
  const ro = new ResizeObserver(() => render());
  ro.observe(container);

  function render() {
    svg.replaceChildren();
    geom = null;
    const W = container.clientWidth;
    const H = container.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    if (points.length < 2 || W === 0) return;

    const values = points.map((p) => p.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const padY = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
    lo -= padY;
    hi += padY;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (i / (points.length - 1)) * plotW;
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    // Grid + y labels
    const grid = el('g', { class: 'grid' }, svg);
    const { ticks, step } = niceTicks(lo, hi);
    for (const t of ticks) {
      const ty = y(t);
      el('line', { x1: PAD.left, x2: PAD.left + plotW, y1: ty, y2: ty }, grid);
      const label = el('text', { x: W - 4, y: ty + 4, 'text-anchor': 'end', class: 'axis-label' }, grid);
      label.textContent = opts.formatTick(t, step);
    }

    // X labels: start, middle, end
    const xIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    xIdx.forEach((i, n) => {
      const anchor = n === 0 ? 'start' : n === 2 ? 'end' : 'middle';
      const label = el('text', { x: x(i), y: H - 6, 'text-anchor': anchor, class: 'axis-label' }, svg);
      label.textContent = opts.formatAxisDate(points[i].date);
    });

    // Opening-value reference line
    el('line', {
      class: 'ref-line', x1: PAD.left, x2: PAD.left + plotW, y1: y(values[0]), y2: y(values[0]),
    }, svg);

    // Area + line
    const id = `grad-${Math.random().toString(36).slice(2, 8)}`;
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', class: 'area-stop-top' }, grad);
    el('stop', { offset: '100%', class: 'area-stop-bottom' }, grad);

    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const bottom = PAD.top + plotH;
    el('path', { d: `${d}L${x(points.length - 1)},${bottom}L${x(0)},${bottom}Z`, fill: `url(#${id})` }, svg);
    el('path', { d, class: 'line' }, svg);

    // Scrub layer
    const cross = el('g', { class: 'cross', visibility: 'hidden' }, svg);
    const vline = el('line', { y1: PAD.top - 6, y2: bottom }, cross);
    const dot = el('circle', { r: 5 }, cross);
    const tip = el('g', { class: 'tip' }, cross);
    const tipBg = el('rect', { rx: 6, height: 22, y: 2 }, tip);
    const tipText = el('text', { y: 17, 'text-anchor': 'middle' }, tip);

    el('rect', {
      class: 'hit', x: 0, y: 0, width: W, height: H, fill: 'transparent',
    }, svg);

    geom = { x, y, plotW, W, cross, vline, dot, tip, tipBg, tipText };
  }

  function indexAt(clientX) {
    const r = svg.getBoundingClientRect();
    const px = clientX - r.left - PAD.left;
    const i = Math.round((px / geom.plotW) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, i));
  }

  function showAt(i) {
    const p = points[i];
    const { x, y, W, cross, vline, dot, tip, tipBg, tipText } = geom;
    const cx = x(i);
    vline.setAttribute('x1', cx);
    vline.setAttribute('x2', cx);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', y(p.value));
    tipText.textContent = opts.formatDate(p.date);
    const tw = tipText.getComputedTextLength() + 16;
    const tx = Math.max(tw / 2, Math.min(W - tw / 2, cx));
    tipBg.setAttribute('x', tx - tw / 2);
    tipBg.setAttribute('width', tw);
    tipText.setAttribute('x', tx);
    cross.setAttribute('visibility', 'visible');
    opts.onScrub?.(p);
  }

  function hide() {
    geom?.cross.setAttribute('visibility', 'hidden');
    opts.onScrub?.(null);
  }

  let active = false;
  svg.addEventListener('pointerdown', (e) => {
    if (!geom) return;
    active = true;
    svg.setPointerCapture(e.pointerId);
    showAt(indexAt(e.clientX));
  });
  svg.addEventListener('pointermove', (e) => {
    if (!geom) return;
    // Mouse hover scrubs too; touch only while pressed.
    if (active || e.pointerType === 'mouse') showAt(indexAt(e.clientX));
  });
  const end = () => { active = false; hide(); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); });

  return {
    setData(pts) {
      points = pts;
      render();
    },
  };
}
