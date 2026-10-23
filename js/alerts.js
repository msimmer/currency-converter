// Settings → Rate alerts: a push notification when a pair from the list ("You
// convert" against each other currency) hits a 2-week high or low. The checking
// runs on a Cloudflare Worker (worker/); this side subscribes, keeps the
// Worker's copy of the list current, and unsubscribes.

import { ALERTS_API } from './config.js';
import { currencyName, flagEmoji, isMetal } from './currencies.js';
import { $, toast } from './ui.js';

const KEY_CACHE = 'alerts:key';
const SYNCED_KEY = 'alerts:synced'; // last list sent to the Worker, to skip repeats

let getList = () => [];
let reg = null; // service worker registration, once ready
let publicKey = null;
let subscribed = false;
let busy = false;
let loadError = false;
let syncTimer;

export function initAlerts(opts) {
  getList = opts.list;
  try { publicKey = localStorage.getItem(KEY_CACHE); } catch { /* ignore */ }
  render();
  if (!ALERTS_API || !('PushManager' in window)) return;

  // subscribe() must run straight from the tap on iOS, so get everything it
  // needs ready now.
  const cachedKey = publicKey;
  Promise.all([navigator.serviceWorker.ready, cachedKey ?? fetchKey()])
    .then(async ([r]) => {
      reg = r;
      subscribed = !!(await reg.pushManager.getSubscription());
      render();
      syncAlerts();
      if (cachedKey) fetchKey().catch(() => {}); // refresh quietly
    })
    .catch(() => {
      loadError = true;
      render();
    });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render(); // permission may have changed in Settings
  });
}

async function fetchKey() {
  const { publicKey: key } = await api('GET', '/config');
  publicKey = key;
  try { localStorage.setItem(KEY_CACHE, key); } catch { /* ignore */ }
  return key;
}

async function api(method, path, body) {
  const res = await fetch(ALERTS_API.replace(/\/$/, '') + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function keyBytes(b64url) {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ---- Keeping the Worker's list current -------------------------------------

/** Pairs as the notifications name them; metals read as a price (XAU/CAD). */
function pairs(list) {
  const [base, ...rest] = list;
  return rest.map((c) => (isMetal(c) && !isMetal(base) ? `${c}/${base}` : `${base}/${c}`));
}

function registration(sub) {
  const list = getList();
  const names = {};
  for (const c of list) {
    names[c] = { name: isMetal(c) ? currencyName(c).toLowerCase() : `the ${currencyName(c)}`, flag: flagEmoji(c) };
  }
  return {
    subscription: sub.toJSON(),
    base: list[0] ?? 'USD',
    codes: list,
    names,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function register(sub) {
  const body = JSON.stringify(registration(sub));
  await api('PUT', '/subscription', JSON.parse(body));
  try { localStorage.setItem(SYNCED_KEY, body); } catch { /* ignore */ }
}

/** Call after the list changes. Sends the new list to the Worker if alerts are on. */
export function syncAlerts() {
  render();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    let last = null;
    try { last = localStorage.getItem(SYNCED_KEY); } catch { /* ignore */ }
    if (JSON.stringify(registration(sub)) === last) return;
    register(sub).catch(() => {}); // offline: retried on the next change or launch
  }, 800);
}

// ---- Settings UI -----------------------------------------------------------

// Notification doesn't exist at all in iOS Safari outside a Home Screen app.
const permission = () => window.Notification?.permission;

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function note() {
  if (!ALERTS_API) return 'The alerts server isn’t set up yet (see worker/README.md).';
  if (!('PushManager' in window)) {
    return isIOS() && !navigator.standalone
      ? 'Add Rates to your Home Screen (Share → Add to Home Screen) and open it from there to turn on alerts.'
      : 'This browser can’t show notifications from web apps.';
  }
  if (permission() === 'denied') return 'Notifications are off for Rates. Turn them on in Settings → Notifications → Rates.';
  if (loadError) return 'Couldn’t reach the alerts server. Check your connection.';
  if (!subscribed) return 'Off';
  const p = pairs(getList());
  if (!p.length) return 'Add another currency to your list to get alerts.';
  return `Watching ${p.length < 3 ? p.join(' and ') : `${p.slice(0, -1).join(', ')} and ${p.at(-1)}`}`;
}

function render() {
  const toggle = $('#alerts-toggle');
  toggle.checked = subscribed;
  toggle.disabled = busy || !reg || !publicKey || permission() === 'denied';
  $('#alerts-status').textContent = note();
  $('#alerts-test').hidden = !subscribed;
}

async function enable() {
  // Called synchronously from the tap: iOS only allows subscribing from a user gesture.
  const pending = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  busy = true;
  render();
  let sub = null;
  try {
    sub = await pending;
    await register(sub);
    subscribed = true;
    toast('Rate alerts on');
  } catch {
    await sub?.unsubscribe().catch(() => {});
    subscribed = false;
    toast(permission() === 'denied' ? 'Notifications are blocked' : 'Couldn’t turn on alerts');
  } finally {
    busy = false;
    render();
  }
}

async function disable() {
  busy = true;
  render();
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // If this fails the Worker learns on its next push that the subscription is gone.
      await api('DELETE', '/subscription', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    try { localStorage.removeItem(SYNCED_KEY); } catch { /* ignore */ }
    subscribed = false;
  } finally {
    busy = false;
    render();
  }
}

$('#alerts-toggle').addEventListener('change', (e) => {
  if (e.target.checked) enable();
  else disable();
});

$('#alerts-test').addEventListener('click', async () => {
  try {
    const sub = await reg.pushManager.getSubscription();
    await register(sub); // make sure the Worker has it before testing
    await api('POST', '/test', { endpoint: sub.endpoint });
    toast('Test sent');
  } catch (err) {
    toast(`Test failed: ${err.message}`);
  }
});
