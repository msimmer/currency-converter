// Small DOM helpers shared by the views: modals and the action sheet.

export const $ = (sel) => document.querySelector(sel);

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
})[c]);

export const icon = (d, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

export const ICONS = {
  swap: 'M4 8h14l-4-4M20 16H6l4 4',
  chart: 'M4 20V13M9.3 20V8M14.6 20v-6M20 20V5',
  up: 'M12 19V5M5 12l7-7 7 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shortcut: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
};

const hideTimers = new WeakMap();

export function showModal(el, backdrop) {
  // Reopening while the close animation runs (e.g. one action sheet opening
  // another) must cancel the pending hide.
  clearTimeout(hideTimers.get(el));
  el.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('open');
    backdrop.classList.add('open');
  }));
}

export function hideModal(el, backdrop) {
  el.classList.remove('open');
  backdrop.classList.remove('open');
  hideTimers.set(el, setTimeout(() => {
    el.hidden = true;
    backdrop.hidden = true;
  }, 280));
}

// ---- Action sheet ----------------------------------------------------------

let actionRuns = [];

/**
 * Show an iOS-style action sheet.
 * @param {{ header?: string, items: { label: string, icon?: string, danger?: boolean, run: () => void }[] }} opts
 *   `header` is trusted HTML; labels are escaped.
 */
export function actionSheet({ header = '', items }) {
  actionRuns = items.map((i) => i.run);
  $('#actions-body').innerHTML = header + items.map((item, i) => `
    <button type="button" class="action${item.danger ? ' danger' : ''}" data-i="${i}">
      ${item.icon ? icon(item.icon) : ''}<span>${esc(item.label)}</span>
    </button>`).join('');
  showModal($('#actions'), $('#actions-backdrop'));
}

function closeActionSheet() {
  hideModal($('#actions'), $('#actions-backdrop'));
}

$('#actions').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-i], [data-act="cancel"]');
  if (!btn) return;
  closeActionSheet();
  if (btn.dataset.i !== undefined) actionRuns[btn.dataset.i]?.();
});
$('#actions-backdrop').addEventListener('click', closeActionSheet);

// ---- Toast -----------------------------------------------------------------

let toastTimer;

export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
