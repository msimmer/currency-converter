import {
  availableCodes, badgeHTML, currencyName, currencySubtitle,
  formatAmount, formatPercent, formatRate, formatTick, plainAmount,
} from './currencies.js';
import {
  cachedRates, convert, fetchHistory, fetchLatestRates, hasLongHistory,
} from './rates.js';
import { createChart } from './chart.js';
import {
  OPS, display as displayExpr, evaluate, hasOperator, press,
} from './calc.js';

// ---- State -----------------------------------------------------------------

const STATE_KEY = 'state:v1';
const STALE_AFTER_MS = 30 * 60 * 1000;

const state = Object.assign({
  list: ['CAD', 'USD', 'EUR', 'XAU'],
  base: 'CAD',
  amount: 100,
  pair: ['CAD', 'USD'],
  range: '1M',
  tab: 'converter',
}, loadState());

let rates = cachedRates(); // { date, fetchedAt, rates }
let refreshing = false;
let refreshError = null;
let editing = false;
let calc = null; // { code, expr, fresh } while the keypad is open

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) ?? {}; } catch { return {}; }
}

function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

// Enables :active styles on iOS.
document.addEventListener('touchstart', () => {}, { passive: true });

// ---- Rates -----------------------------------------------------------------

async function refreshRates({ force = false } = {}) {
  if (refreshing) return;
  if (!force && rates && Date.now() - rates.fetchedAt < STALE_AFTER_MS) return;
  refreshing = true;
  refreshError = null;
  renderStatus();
  try {
    rates = await fetchLatestRates();
  } catch (err) {
    refreshError = err;
  } finally {
    refreshing = false;
    refreshRows();
    renderStatus();
  }
}

function rate(from, to) {
  if (!rates || !(from in rates.rates) || !(to in rates.rates)) return NaN;
  return convert(rates.rates, 1, from, to);
}

function amountIn(code) {
  return state.amount * rate(state.base, code);
}

/** Store the current amount in `code` instead, without changing its value. */
function rebase(code) {
  if (code === state.base) return;
  const value = amountIn(code);
  if (Number.isFinite(value)) state.amount = value;
  state.base = code;
}

// ---- Converter list --------------------------------------------------------

const listEl = $('#currency-list');

function rowHTML(code, i) {
  return `
    <li class="row${i === 0 ? ' hero' : ''}" data-code="${code}">
      ${i === 0 ? '<span class="hero-label">You convert</span>' : ''}
      <button class="row-del" type="button" aria-label="Remove ${code}">
        <svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12h9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>
      <button class="cur-btn" type="button" aria-label="${esc(currencyName(code))} options">
        ${badgeHTML(code)}<span class="code">${code}</span>${CHEVRON}
      </button>
      <div class="amount">
        <span class="value"></span>
        <button class="clear" type="button" aria-label="Clear">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="rate"></div>
      <span class="row-handle" aria-label="Reorder ${code}">
        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 8h16M4 12h16M4 16h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </span>
    </li>`;
}

function renderList() {
  if (!state.list.includes(state.base) && state.list.length) rebase(state.list[0]);
  listEl.innerHTML = state.list.map(rowHTML).join('');
  listEl.classList.toggle('editing', editing);
  $('#list-empty').hidden = state.list.length > 0;
  $('#edit-btn').classList.toggle('active', editing);
  $('#edit-btn').setAttribute('aria-label', editing ? 'Done editing' : 'Edit list');
  refreshRows();
}

// Update every row's amount and rate line in place.
function refreshRows() {
  const hero = state.list[0];
  for (const li of listEl.children) {
    const code = li.dataset.code;
    const value = li.querySelector('.value');
    const rateEl = li.querySelector('.rate');
    const isEditing = calc?.code === code;
    li.classList.toggle('editing-amount', isEditing);

    if (isEditing) {
      value.textContent = calc.expr ? displayExpr(calc.expr) : '0';
      value.classList.toggle('fresh', calc.fresh && !!calc.expr);
    } else {
      value.textContent = formatAmount(amountIn(code), code) || '—';
      value.classList.remove('fresh');
    }
    // A sum gets its own full-width line; shrink anything that still won't fit.
    const hasOp = isEditing && hasOperator(calc.expr);
    li.classList.toggle('has-op', hasOp);
    const room = hasOp ? 18 : 10;
    const len = value.textContent.length + (isEditing ? 2 : 0);
    value.classList.toggle('long', len > room && len <= room * 1.3);
    value.classList.toggle('xlong', len > room * 1.3);

    if (hasOp) {
      rateEl.textContent = `= ${formatAmount(evaluate(calc.expr), code)}`;
      rateEl.classList.add('result');
    } else {
      rateEl.textContent = code === hero ? '' : `1 ${hero} → ${formatRate(rate(hero, code))} ${code}`;
      rateEl.classList.remove('result');
    }
  }
}

listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const code = row.dataset.code;

  if (e.target.closest('.row-del')) return removeCurrency(code);
  if (editing) return;
  if (e.target.closest('.cur-btn')) {
    finishCalc();
    return openActions(code);
  }
  if (e.target.closest('.clear')) return calcKey('clear');
  startCalc(code);
});

// Tapping empty space closes the keypad.
$('#converter-scroller').addEventListener('click', (e) => {
  if (!e.target.closest('.row')) finishCalc();
});

function removeCurrency(code) {
  if (calc?.code === code) finishCalc();
  if (code === state.base) {
    const next = state.list.find((c) => c !== code);
    if (next) rebase(next);
  }
  state.list = state.list.filter((c) => c !== code);
  saveState();
  renderList();
}

function addCurrency(code) {
  if (state.list.includes(code)) return;
  if (!state.list.length) state.base = code;
  state.list.push(code);
  saveState();
  renderList();
}

function replaceCurrency(oldCode, newCode) {
  if (oldCode === newCode) return;
  if (state.base === oldCode) rebase(newCode);
  const list = state.list.filter((c) => c !== newCode);
  list[list.indexOf(oldCode)] = newCode;
  state.list = list;
  saveState();
  renderList();
}

function moveToTop(code) {
  state.list = [code, ...state.list.filter((c) => c !== code)];
  saveState();
  renderList();
}

$('#edit-btn').addEventListener('click', () => {
  finishCalc();
  editing = !editing;
  renderList();
});

const openAdd = () => { finishCalc(); openSheet({ mode: 'add' }); };
$('#add-btn').addEventListener('click', openAdd);
document.querySelector('[data-action="add"]').addEventListener('click', openAdd);

// Drag-to-reorder with the handle (edit mode).
listEl.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.row-handle');
  if (!handle || !editing) return;
  e.preventDefault();
  const row = handle.closest('.row');
  const rows = [...listEl.children];
  const from = rows.indexOf(row);
  const h = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : row.offsetHeight;
  const startY = e.clientY;
  let to = from;

  row.classList.add('dragging');
  handle.setPointerCapture(e.pointerId);

  const move = (ev) => {
    const dy = ev.clientY - startY;
    row.style.transform = `translateY(${dy}px)`;
    to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
    rows.forEach((r, i) => {
      if (r === row) return;
      let shift = 0;
      if (from < to && i > from && i <= to) shift = -h;
      if (from > to && i < from && i >= to) shift = h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    if (to !== from) {
      const [code] = state.list.splice(from, 1);
      state.list.splice(to, 0, code);
      saveState();
    }
    renderList();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
});

// ---- Calculator keypad -----------------------------------------------------

const keypad = $('#keypad');

function startCalc(code) {
  if (calc?.code === code) return;
  finishCalc({ keepOpen: true });
  rebase(code);
  calc = { code, expr: plainAmount(state.amount, code), fresh: true };
  saveState();
  refreshRows();
  if (!document.body.classList.contains('keypad-open')) {
    document.body.style.setProperty('--keypad-h', `${keypad.offsetHeight}px`);
    document.body.classList.add('keypad-open');
    keypad.setAttribute('aria-hidden', 'false');
  }
  const row = listEl.querySelector(`[data-code="${code}"]`);
  setTimeout(() => row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
}

function finishCalc({ keepOpen = false } = {}) {
  if (!calc) return;
  const value = evaluate(calc.expr);
  if (Number.isFinite(value)) state.amount = value;
  else if (!calc.expr) state.amount = 0;
  calc = null;
  saveState();
  if (!keepOpen) {
    document.body.classList.remove('keypad-open');
    keypad.setAttribute('aria-hidden', 'true');
  }
  refreshRows();
}

function calcKey(key) {
  if (!calc) return;
  if (key === 'done') return finishCalc();

  if (key === '=') {
    const v = evaluate(calc.expr);
    if (Number.isFinite(v)) calc.expr = plainAmount(v, calc.code);
    calc.fresh = true;
  } else if (key === 'clear') {
    calc.expr = '';
    calc.fresh = false;
  } else if (key in OPS) {
    calc.fresh = false;
    calc.expr = press(calc.expr, key);
  } else {
    // Digit, '.', or backspace: the first one replaces the highlighted amount.
    if (calc.fresh) calc.expr = '';
    calc.fresh = false;
    if (key !== 'back' || calc.expr) calc.expr = press(calc.expr, key);
  }

  const value = evaluate(calc.expr);
  if (Number.isFinite(value)) state.amount = value;
  else if (!calc.expr) state.amount = 0;
  saveState();
  refreshRows();
}

keypad.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-key]');
  if (btn) calcKey(btn.dataset.key);
});

// Hardware keyboard support (desktop, iPad keyboards).
document.addEventListener('keydown', (e) => {
  if (!calc || e.metaKey || e.ctrlKey) return;
  const map = { Enter: '=', Backspace: 'back', Escape: 'done', x: '*', X: '*', ',': '.' };
  const key = map[e.key] ?? e.key;
  if (/^[0-9.]$/.test(key) || key in OPS || ['=', 'back', 'done'].includes(key)) {
    e.preventDefault();
    calcKey(key === '=' && !hasOperator(calc.expr) ? 'done' : key);
  }
});

// ---- Row actions -----------------------------------------------------------

let actionHandlers = {};

function openActions(code) {
  const hero = state.list[0];
  const other = code === hero ? state.list[1] : hero;
  const icon = (d) => `<svg viewBox="0 0 24 24" width="22" height="22"><path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const items = [
    ['change', 'Change currency', icon('M4 8h14l-4-4M20 16H6l4 4')],
    other && ['chart', `Chart ${code}/${other}`, icon('M4 20V13M9.3 20V8M14.6 20v-6M20 20V5')],
    code !== hero && ['top', 'Make “You convert”', icon('M12 19V5M5 12l7-7 7 7')],
    ['remove', 'Remove', icon('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'), 'danger'],
  ].filter(Boolean);

  actionHandlers = {
    change: () => openSheet({ mode: 'pick', current: code, onPick: (c) => replaceCurrency(code, c) }),
    chart: () => openChart(code, other),
    top: () => moveToTop(code),
    remove: () => removeCurrency(code),
  };

  $('#actions-body').innerHTML = `
    <div class="action-title">${badgeHTML(code)}
      <div><div class="code">${code}</div><div class="sub">${esc(currencySubtitle(code))}</div></div>
    </div>
    ${items.map(([act, label, svg, cls = '']) => `
      <button type="button" class="action ${cls}" data-act="${act}">${svg}<span>${esc(label)}</span></button>`).join('')}`;
  showModal($('#actions'), $('#actions-backdrop'));
}

function closeActions() {
  hideModal($('#actions'), $('#actions-backdrop'));
}

$('#actions').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  closeActions();
  actionHandlers[btn.dataset.act]?.();
});
$('#actions-backdrop').addEventListener('click', closeActions);

function showModal(el, backdrop) {
  el.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('open');
    backdrop.classList.add('open');
  }));
}

function hideModal(el, backdrop) {
  el.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => {
    if (el.classList.contains('open')) return;
    el.hidden = true;
    backdrop.hidden = true;
  }, 280);
}

// ---- Status pill -----------------------------------------------------------

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtISO = (iso) => dateFmt.format(new Date(iso + 'T00:00:00Z'));

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function renderStatus() {
  const pill = $('#status-pill');
  const text = $('#status-text');
  pill.classList.toggle('busy', refreshing);
  pill.classList.toggle('error', !!refreshError);
  if (refreshing) {
    text.textContent = 'Updating…';
  } else if (!rates) {
    text.textContent = refreshError ? 'Offline · tap to retry' : 'Loading rates…';
  } else {
    const day = shortDate.format(new Date(rates.date + 'T00:00:00Z'));
    text.textContent = refreshError ? `Offline · ${day} rates` : `${day} rates · ${ago(rates.fetchedAt)}`;
  }
  pill.setAttribute('aria-label', `${text.textContent}. Refresh rates`);
}

$('#status-pill').addEventListener('click', () => refreshRates({ force: true }));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshRates();
    renderStatus();
  }
});
setInterval(renderStatus, 60000);

// ---- Currency picker sheet -------------------------------------------------

let sheet = null; // { mode: 'add' | 'pick', current?, onPick? }

function openSheet(opts) {
  if (!rates) return;
  sheet = opts;
  $('#sheet-title').textContent = opts.mode === 'add' ? 'Add Currency' : 'Choose Currency';
  $('#sheet-search').value = '';
  renderSheet();
  $('#sheet-body').scrollTop = 0;
  showModal($('#sheet'), $('#sheet-backdrop'));
}

function closeSheet() {
  document.activeElement?.blur();
  hideModal($('#sheet'), $('#sheet-backdrop'));
  sheet = null;
}

function renderSheet() {
  const q = $('#sheet-search').value.trim().toLowerCase();
  const { metals, fiat } = availableCodes(rates.rates);
  const match = (c) => !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q);
  const selected = (c) => (sheet.mode === 'add' ? state.list.includes(c) : c === sheet.current);

  const section = (title, codes) => {
    const items = codes.filter(match);
    if (!items.length) return '';
    return `<h3 class="sheet-section">${title}</h3><ul class="pick-list">${items.map((c) => `
      <li><button type="button" class="pick-row${selected(c) ? ' selected' : ''}" data-code="${c}">
        ${badgeHTML(c)}
        <span class="row-text"><span class="code">${c}</span><span class="name">${esc(currencySubtitle(c))}</span></span>
        <svg class="check" viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button></li>`).join('')}</ul>`;
  };

  const html = section('Precious metals', metals) + section('Currencies', fiat);
  $('#sheet-body').innerHTML = html || '<p class="sheet-empty">No matches</p>';
}

$('#sheet-search').addEventListener('input', renderSheet);
$('#sheet-done').addEventListener('click', closeSheet);
$('#sheet-backdrop').addEventListener('click', closeSheet);

$('#sheet-body').addEventListener('click', (e) => {
  const btn = e.target.closest('.pick-row');
  if (!btn || !sheet) return;
  const code = btn.dataset.code;
  if (sheet.mode === 'add') {
    if (state.list.includes(code)) removeCurrency(code);
    else addCurrency(code);
    btn.classList.toggle('selected', state.list.includes(code));
  } else {
    sheet.onPick(code);
    closeSheet();
  }
});

// Swipe the sheet down to dismiss.
{
  const sheetEl = $('#sheet');
  let startY = null;
  sheetEl.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.sheet-head, .sheet-grabber')) return;
    startY = e.touches[0].clientY;
  }, { passive: true });
  sheetEl.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheetEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheetEl.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    sheetEl.style.transform = '';
    if (dy > 120) closeSheet();
  });
}

// ---- Charts ----------------------------------------------------------------

const RANGES = {
  '1W': { days: 7, label: 'past week', points: 8 },
  '1M': { days: 30, label: 'past month', points: 31 },
  '3M': { days: 91, label: 'past 3 months', points: 46 },
  '6M': { days: 182, label: 'past 6 months', points: 61 },
  '1Y': { days: 365, label: 'past year', points: 53 },
  '5Y': { days: 1826, label: 'past 5 years' },
  '10Y': { days: 3652, label: 'past 10 years' },
  MAX: { days: null, label: 'since Mar 2024', points: 70 },
};

function rangesFor(from, to) {
  return hasLongHistory(from, to)
    ? ['1W', '1M', '3M', '6M', '1Y', '5Y', '10Y']
    : ['1W', '1M', '3M', '6M', '1Y', 'MAX'];
}

let chartPoints = [];
let chartToken = 0;

const chart = createChart($('#chart'), {
  formatTick,
  formatDate: fmtISO,
  formatAxisDate: (iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    const days = RANGES[state.range].days ?? 9999;
    const opts = days <= 182 ? { month: 'short', day: 'numeric' }
      : days <= 400 ? { month: 'short', year: '2-digit' }
        : { year: 'numeric' };
    return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
  },
  onScrub: (p) => renderChartHead(p),
});

function openChart(from, to) {
  state.pair = [from, to];
  saveState();
  switchTab('charts');
}

function renderPairButtons() {
  const [from, to] = state.pair;
  const btn = (code) => `${badgeHTML(code)}<span class="code">${code}</span>${CHEVRON}`;
  $('#pair-from').innerHTML = btn(from);
  $('#pair-to').innerHTML = btn(to);
  $('#pair-from').setAttribute('aria-label', `From ${currencyName(from)}`);
  $('#pair-to').setAttribute('aria-label', `To ${currencyName(to)}`);
}

function renderRanges() {
  const [from, to] = state.pair;
  const available = rangesFor(from, to);
  if (!available.includes(state.range)) {
    state.range = state.range === 'MAX' ? '5Y' : (available.includes('MAX') ? 'MAX' : '1Y');
  }
  $('#ranges').innerHTML = available.map((r) => `
    <button type="button" role="tab" data-range="${r}" aria-selected="${r === state.range}"
      class="${r === state.range ? 'active' : ''}">${r === 'MAX' ? 'Max' : r}</button>`).join('');
  const note = $('#chart-note');
  note.hidden = hasLongHistory(from, to);
  note.textContent = 'History for metals and less common currencies starts March 2024.';
}

function renderChartHead(scrub = null) {
  const [from, to] = state.pair;
  const pts = chartPoints;
  const last = pts[pts.length - 1];
  const p = scrub ?? last;
  const changeEl = $('#chart-change');
  if (!p) {
    $('#chart-rate').textContent = `1 ${from} = ${formatRate(rate(from, to))} ${to}`;
    changeEl.textContent = '';
    $('#chart-date').textContent = '';
    return;
  }
  $('#chart-rate').textContent = `1 ${from} = ${formatRate(p.value)} ${to}`;
  const first = pts[0].value;
  const diff = p.value - first;
  const pct = first ? diff / first : 0;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  changeEl.className = `chart-change ${dir}`;
  changeEl.textContent = `${arrow} ${formatRate(Math.abs(diff))} (${formatPercent(pct)})`;
  $('#chart-date').textContent = scrub ? fmtISO(p.date) : RANGES[state.range].label;
}

function renderStats() {
  const pts = chartPoints;
  if (pts.length < 2) {
    $('#stats').innerHTML = '';
    return;
  }
  const vals = pts.map((p) => p.value);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const item = (k, v) => `<div><dt>${k}</dt><dd>${formatRate(v)}</dd></div>`;
  $('#stats').innerHTML = item('Open', vals[0]) + item('Close', vals[vals.length - 1])
    + item('High', hi) + item('Low', lo) + item('Average', avg)
    + `<div><dt>Spread</dt><dd>${formatPercent((hi - lo) / lo, { signed: false })}</dd></div>`;
}

function downsample(pts, max = 400) {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const out = [];
  for (let i = 0; i < max - 1; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

async function loadChart() {
  renderPairButtons();
  renderRanges();
  const [from, to] = state.pair;
  const range = RANGES[state.range];
  const token = ++chartToken;
  const overlay = $('#chart-overlay');

  const end = new Date();
  const start = range.days ? new Date(end.getTime() - range.days * 86400000) : new Date(0);

  overlay.hidden = false;
  overlay.innerHTML = '<span class="spinner"></span>';
  try {
    const pts = await fetchHistory(from, to, start, end, { maxPoints: range.points });
    if (token !== chartToken) return;
    chartPoints = downsample(pts);
    overlay.hidden = true;
  } catch {
    if (token !== chartToken) return;
    chartPoints = [];
    overlay.innerHTML = '<button type="button" class="pill-btn" id="chart-retry">Couldn’t load history. Retry</button>';
    $('#chart-retry').addEventListener('click', loadChart);
  }
  chart.setData(chartPoints);
  $('#chart').setAttribute('aria-label',
    `${from} to ${to} exchange rate, ${range.label}` + (chartPoints.length
      ? `, from ${formatRate(chartPoints[0].value)} to ${formatRate(chartPoints[chartPoints.length - 1].value)}`
      : ''));
  renderChartHead();
  renderStats();
}

$('#ranges').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-range]');
  if (!btn || btn.dataset.range === state.range) return;
  state.range = btn.dataset.range;
  saveState();
  loadChart();
});

$('#pair-swap').addEventListener('click', () => {
  state.pair.reverse();
  saveState();
  loadChart();
});

for (const [id, idx] of [['#pair-from', 0], ['#pair-to', 1]]) {
  $(id).addEventListener('click', () => openSheet({
    mode: 'pick',
    current: state.pair[idx],
    onPick: (code) => {
      if (code === state.pair[1 - idx]) state.pair.reverse();
      else state.pair[idx] = code;
      saveState();
      loadChart();
    },
  }));
}

// ---- Tabs ------------------------------------------------------------------

function switchTab(tab) {
  finishCalc();
  state.tab = tab;
  saveState();
  for (const view of document.querySelectorAll('.view')) view.hidden = view.dataset.view !== tab;
  for (const btn of document.querySelectorAll('.tab')) btn.classList.toggle('active', btn.dataset.tab === tab);
  $('.dock').classList.toggle('no-fab', tab !== 'converter');
  if (tab === 'charts') loadChart();
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) switchTab(btn.dataset.tab);
});

// ---- Boot ------------------------------------------------------------------

renderList();
renderStatus();
switchTab(state.tab);
refreshRates();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js');
}
