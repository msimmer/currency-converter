// "Send money" destinations: links, Shortcuts and emails filled from a template.
//
// Destinations are personal (which bank, who to email), so they live only in this
// device's storage. Nothing about them is part of the app's source.

const KEY = 'send:v1';
const CODE_PREFIX = 'rates-setup:';

export const TYPES = {
  link: { label: 'Link', icon: 'link' },
  shortcut: { label: 'Shortcut', icon: 'shortcut' },
  email: { label: 'Email', icon: 'mail' },
};

// Fields each type keeps; all are strings.
const FIELDS = {
  link: ['url'],
  shortcut: ['shortcut', 'input'],
  email: ['to', 'subject', 'body'],
};

export const TOKENS = [
  { token: 'amount', label: 'Amount sent' },
  { token: 'from', label: 'Currency sent' },
  { token: 'receive', label: 'Amount received' },
  { token: 'to', label: 'Currency received' },
  { token: 'rate', label: 'Rate' },
  { token: 'date', label: 'Rates date' },
];

export const DEFAULTS = {
  link: { url: 'https://' },
  shortcut: { shortcut: '', input: '{amount} {from} to {to}' },
  email: {
    to: '',
    subject: 'Currency exchange: {amount} {from} to {to}',
    body: 'Hi,\n\nI\'d like to exchange {amount} {from} for {to}.\n\n'
      + 'The rate I\'m seeing is 1 {from} = {rate} {to} (about {receive} {to}), as of {date}.\n\n'
      + 'Could you let me know your rate and when I could pick it up?\n\nThanks',
  },
};

export function newDestination(type) {
  return { id: crypto.randomUUID?.() ?? String(Date.now()), type, name: '', ...DEFAULTS[type] };
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !(raw.type in TYPES)) return null;
  const d = { id: typeof raw.id === 'string' ? raw.id : newDestination(raw.type).id, type: raw.type, name: String(raw.name ?? '') };
  for (const f of FIELDS[raw.type]) d[f] = String(raw[f] ?? '');
  return d;
}

export function loadDestinations() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.map(sanitize).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveDestinations(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  // Ask iOS/Chrome not to evict this storage.
  navigator.storage?.persist?.().catch(() => {});
}

// ---- Templates -------------------------------------------------------------

/** Replace {tokens} in a template. Unknown tokens are left as typed. */
export function fill(template, values, encode = (s) => s) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? encode(String(values[k])) : m));
}

/** The URL a destination opens, with tokens filled in. */
export function buildURL(dest, values) {
  const enc = encodeURIComponent;
  switch (dest.type) {
    case 'link':
      return fill(dest.url.trim(), values, enc);
    case 'shortcut': {
      let url = `shortcuts://run-shortcut?name=${enc(dest.shortcut.trim())}`;
      if (dest.input.trim()) url += `&input=text&text=${enc(fill(dest.input, values))}`;
      return url;
    }
    case 'email': {
      const to = dest.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        .map((a) => enc(a).replace(/%40/g, '@')).join(',');
      const params = [];
      if (dest.subject) params.push(`subject=${enc(fill(dest.subject, values))}`);
      if (dest.body) params.push(`body=${enc(fill(dest.body, values))}`);
      return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
    }
    default:
      return '';
  }
}

/** What's wrong with a destination, or '' if it's usable. */
export function problem(dest) {
  if (dest.type === 'link') {
    const url = dest.url.trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url) || url === 'https://') return 'Enter a link, e.g. https://… or an app link like yourbank://';
    if (/^(javascript|data|vbscript|file|blob):/i.test(url)) return 'That kind of link isn’t allowed';
  }
  if (dest.type === 'shortcut' && !dest.shortcut.trim()) return 'Enter the Shortcut’s name exactly as it appears in the Shortcuts app';
  return '';
}

export function openURL(url) {
  if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener');
  else window.location.href = url;
}

// ---- Backup code -----------------------------------------------------------

export function exportCode(list) {
  const json = JSON.stringify(list.map(({ id, ...rest }) => rest));
  const bytes = new TextEncoder().encode(json);
  return CODE_PREFIX + btoa(String.fromCharCode(...bytes));
}

/** Parse a setup code. Throws with a readable message if it isn't one. */
export function importCode(code) {
  const s = code.trim();
  if (!s.startsWith(CODE_PREFIX)) throw new Error('That doesn’t look like a setup code');
  let list;
  try {
    const bin = atob(s.slice(CODE_PREFIX.length));
    list = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    throw new Error('That setup code is damaged; try copying it again');
  }
  if (!Array.isArray(list)) throw new Error('That setup code is damaged; try copying it again');
  return list.map((d) => sanitize({ ...d, id: undefined })).filter(Boolean);
}
