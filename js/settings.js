// Settings tab: the "Send money" destinations editor and setup-code backup.

import {
  $, actionSheet, esc, hideModal, icon, ICONS, showModal, toast,
} from './ui.js';
import {
  buildURL, exportCode, fill, importCode, loadDestinations, newDestination, openURL,
  problem, saveDestinations, TOKENS, TYPES,
} from './send.js';

let sampleValues = () => ({});
let destinations = loadDestinations();
let editor = null; // { mode: 'dest', dest, isNew } | { mode: 'restore' } | { mode: 'show', code }
let lastField = null;

const CHEV_RIGHT = '<svg class="chev-right" viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

const HINTS = {
  link: 'A web page, or an app link like <code>yourbank://</code> if your bank’s app supports one. Tokens are URL-encoded for you.',
  shortcut: 'Works with any app. In the Shortcuts app, create a shortcut with an <b>Open App</b> action for your banking app, then enter its name here exactly. The input text is passed to the shortcut, which can ignore it.',
  email: 'Separate multiple addresses with commas. Opens Mail with the message filled in; nothing is sent until you tap Send.',
};

export function initSettings(opts) {
  sampleValues = opts.sampleValues;
  renderList();
}

export function getDestinations() {
  return destinations;
}

/** The label shown for a destination in lists and menus. */
export function destinationLabel(d) {
  return d.name.trim() || TYPES[d.type].label;
}

function summary(d) {
  if (d.type === 'email') return d.to ? `Email · ${d.to}` : 'Email';
  if (d.type === 'shortcut') return `Shortcut · ${d.shortcut}`;
  const m = d.url.match(/^([a-z][a-z0-9+.-]*):\/*([^/?#]*)/i);
  if (!m) return 'Link';
  return /^https?$/i.test(m[1]) ? `Link · ${m[2]}` : `App link · ${m[1]}://`;
}

function renderList() {
  $('#dest-list').innerHTML = destinations.map((d) => `
    <li><button type="button" class="dest-row" data-id="${esc(d.id)}">
      <span class="dest-icon">${icon(ICONS[TYPES[d.type].icon])}</span>
      <span class="row-text"><span class="code">${esc(destinationLabel(d))}</span><span class="name">${esc(summary(d))}</span></span>
      ${CHEV_RIGHT}
    </button></li>`).join('');
  $('#dest-empty').hidden = destinations.length > 0;
}

$('#dest-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-id]');
  const dest = row && destinations.find((d) => d.id === row.dataset.id);
  if (dest) openEditor({ mode: 'dest', dest: { ...dest }, isNew: false });
});

$('#dest-add').addEventListener('click', () => {
  actionSheet({
    header: '<div class="action-title"><div><div class="code">Add destination</div><div class="sub">What should Send money open?</div></div></div>',
    items: Object.entries(TYPES).map(([type, t]) => ({
      label: t.label,
      icon: ICONS[t.icon],
      run: () => openEditor({ mode: 'dest', dest: newDestination(type), isNew: true }),
    })),
  });
});

$('#backup-copy').addEventListener('click', async () => {
  if (!destinations.length) return toast('Nothing to back up yet');
  const code = exportCode(destinations);
  try {
    await navigator.clipboard.writeText(code);
    toast('Setup code copied');
  } catch {
    openEditor({ mode: 'show', code });
  }
});

$('#backup-restore').addEventListener('click', () => openEditor({ mode: 'restore' }));

// ---- Editor sheet ----------------------------------------------------------

function field(key, label, value, { multiline = false, template = true, placeholder = '', inputmode = 'text' } = {}) {
  const attrs = `data-key="${key}" ${template ? 'data-template' : ''} placeholder="${esc(placeholder)}"
    autocomplete="off" autocorrect="off" autocapitalize="${inputmode === 'text' ? 'sentences' : 'off'}" spellcheck="false"`;
  const control = multiline
    ? `<textarea rows="7" ${attrs}>${esc(value)}</textarea>`
    : `<input type="text" inputmode="${inputmode}" value="${esc(value)}" ${attrs}>`;
  return `<label class="field"><span>${label}</span>${control}</label>`;
}

function destForm({ dest, isNew }) {
  const typeFields = {
    link: field('url', 'Link', dest.url, { inputmode: 'url', placeholder: 'https://… or yourbank://' }),
    shortcut: field('shortcut', 'Shortcut name', dest.shortcut, { template: false, placeholder: 'e.g. Open Bank' })
      + field('input', 'Input text (optional)', dest.input),
    email: field('to', 'To', dest.to, { template: false, inputmode: 'email', placeholder: 'name@example.com' })
      + field('subject', 'Subject', dest.subject)
      + field('body', 'Message', dest.body, { multiline: true }),
  }[dest.type];

  return `
    ${field('name', 'Name', dest.name, { template: false, placeholder: TYPES[dest.type].label })}
    <div class="segmented type-seg" role="tablist">
      ${Object.entries(TYPES).map(([type, t]) => `<button type="button" data-type="${type}" class="${type === dest.type ? 'active' : ''}">${t.label}</button>`).join('')}
    </div>
    ${typeFields}
    <p class="hint">${HINTS[dest.type]}</p>
    <div class="tokens">
      <span class="tokens-label">Tap to insert</span>
      ${TOKENS.map((t) => `<button type="button" class="token" data-token="${t.token}" title="${esc(t.label)}">{${t.token}}</button>`).join('')}
    </div>
    <div class="preview">
      <div class="preview-label">Preview</div>
      <pre id="preview"></pre>
    </div>
    <p class="form-error" id="form-error" hidden></p>
    <div class="form-actions">
      <button type="button" class="pill-btn secondary" id="editor-test">Try it</button>
      ${isNew ? '' : '<button type="button" class="pill-btn danger" id="editor-delete">Delete</button>'}
    </div>`;
}

function openEditor(state) {
  editor = state;
  lastField = null;
  const titles = { dest: state.isNew ? 'New destination' : 'Edit destination', restore: 'Restore setup', show: 'Setup code' };
  $('#editor-title').textContent = titles[state.mode];
  $('#editor-save').textContent = { dest: 'Save', restore: 'Restore', show: 'Done' }[state.mode];
  $('#editor-cancel').hidden = state.mode === 'show';
  renderEditor();
  $('#editor-body').scrollTop = 0;
  showModal($('#editor'), $('#editor-backdrop'));
}

function closeEditor() {
  document.activeElement?.blur();
  hideModal($('#editor'), $('#editor-backdrop'));
  editor = null;
}

function renderEditor() {
  const body = $('#editor-body');
  if (editor.mode === 'dest') {
    body.innerHTML = destForm(editor);
    updatePreview();
  } else if (editor.mode === 'restore') {
    body.innerHTML = `
      <label class="field"><span>Setup code</span>
        <textarea rows="6" id="restore-code" placeholder="rates-setup:…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      </label>
      <p class="hint">Paste a code from <b>Copy setup code</b>. It replaces the destinations on this device.</p>
      <p class="form-error" id="form-error" hidden></p>`;
  } else {
    body.innerHTML = `
      <label class="field"><span>Setup code</span>
        <textarea rows="6" readonly id="show-code">${esc(editor.code)}</textarea>
      </label>
      <p class="hint">Copy this and keep it somewhere private, like your password manager. It contains your destinations.</p>`;
    $('#show-code').select();
  }
}

function showError(msg) {
  const el = $('#form-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function updatePreview() {
  const { dest } = editor;
  const values = sampleValues();
  const text = dest.type === 'email'
    ? `To: ${dest.to}\nSubject: ${fill(dest.subject, values)}\n\n${fill(dest.body, values)}`
    : decodeForDisplay(buildURL(dest, values));
  $('#preview').textContent = text;
  showError('');
}

// Show URLs readably in the preview (they're encoded when opened).
function decodeForDisplay(url) {
  try { return decodeURIComponent(url); } catch { return url; }
}

const body = $('#editor-body');

body.addEventListener('input', (e) => {
  const key = e.target.dataset?.key;
  if (!key || editor?.mode !== 'dest') return;
  editor.dest[key] = e.target.value;
  updatePreview();
});

body.addEventListener('focusin', (e) => {
  if (e.target.matches('[data-template]')) lastField = e.target;
});

body.addEventListener('click', (e) => {
  if (editor?.mode !== 'dest') return;

  const typeBtn = e.target.closest('[data-type]');
  if (typeBtn && typeBtn.dataset.type !== editor.dest.type) {
    const { id, name } = editor.dest;
    editor.dest = { ...newDestination(typeBtn.dataset.type), id, name };
    renderEditor();
    return;
  }

  const tokenBtn = e.target.closest('[data-token]');
  if (tokenBtn) {
    const target = lastField ?? body.querySelector('[data-template]');
    if (!target) return;
    const text = `{${tokenBtn.dataset.token}}`;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, 'end');
    target.focus();
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (e.target.closest('#editor-test')) {
    const p = problem(editor.dest);
    if (p) return showError(p);
    openURL(buildURL(editor.dest, sampleValues()));
    return;
  }

  if (e.target.closest('#editor-delete')) {
    const { id } = editor.dest;
    actionSheet({
      header: '<div class="action-title"><div><div class="code">Delete this destination?</div></div></div>',
      items: [{
        label: 'Delete',
        icon: ICONS.trash,
        danger: true,
        run: () => {
          destinations = destinations.filter((d) => d.id !== id);
          saveDestinations(destinations);
          renderList();
          closeEditor();
        },
      }],
    });
  }
});

$('#editor-cancel').addEventListener('click', closeEditor);
$('#editor-backdrop').addEventListener('click', closeEditor);

$('#editor-save').addEventListener('click', () => {
  if (!editor) return;

  if (editor.mode === 'show') return closeEditor();

  if (editor.mode === 'restore') {
    try {
      const list = importCode($('#restore-code').value);
      destinations = list;
      saveDestinations(destinations);
      renderList();
      closeEditor();
      toast(`Restored ${list.length} destination${list.length === 1 ? '' : 's'}`);
    } catch (err) {
      showError(err.message);
    }
    return;
  }

  const { dest } = editor;
  const p = problem(dest);
  if (p) return showError(p);
  const i = destinations.findIndex((d) => d.id === dest.id);
  if (i >= 0) destinations[i] = dest;
  else destinations.push(dest);
  saveDestinations(destinations);
  renderList();
  closeEditor();
});
