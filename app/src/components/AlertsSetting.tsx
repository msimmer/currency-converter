// Settings → Rate alerts switch. The subscription logic is in lib/alerts.ts.

import { useEffect, useReducer, useState } from 'react';
import { api, cachedKey, fetchKey, forgetSynced, keyBytes, pairs, register, syncList } from '../lib/alerts';
import { ALERTS_API } from '../lib/config';
import { useToast } from './Toast';

// Notification doesn't exist at all in iOS Safari outside a Home Screen app.
const permission = () => window.Notification?.permission;

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function AlertsSetting({ list }: { list: string[] }) {
  const toast = useToast();
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null); // once the service worker is ready
  const [publicKey, setPublicKey] = useState(cachedKey);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [, recheck] = useReducer((n: number) => n + 1, 0);

  // subscribe() must run straight from the tap on iOS, so get everything it
  // needs ready now.
  useEffect(() => {
    if (!ALERTS_API || !('PushManager' in window)) return;
    let current = true;
    const cached = cachedKey();
    Promise.all([navigator.serviceWorker.ready, cached ?? fetchKey()])
      .then(async ([r, key]) => {
        const sub = await r.pushManager.getSubscription();
        if (!current) return;
        setReg(r);
        setPublicKey(key);
        setSubscribed(!!sub);
        if (cached) fetchKey().then((k) => { if (current) setPublicKey(k); }, () => {}); // refresh quietly
      })
      .catch(() => { if (current) setLoadError(true); });

    const onVisible = () => { if (document.visibilityState === 'visible') recheck(); }; // permission may have changed in Settings
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Keep the Worker's copy of the list current.
  useEffect(() => {
    if (!reg) return;
    const timer = setTimeout(() => {
      syncList(reg, list).catch(() => {}); // offline: retried on the next change or launch
    }, 800);
    return () => clearTimeout(timer);
  }, [reg, list]);

  async function enable() {
    if (!reg || !publicKey) return;
    // Called synchronously from the tap: iOS only allows subscribing from a user gesture.
    const pending = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    setBusy(true);
    let sub: PushSubscription | null = null;
    try {
      sub = await pending;
      await register(sub, list);
      setSubscribed(true);
      toast('Rate alerts on');
    } catch {
      await sub?.unsubscribe().catch(() => {});
      setSubscribed(false);
      toast(permission() === 'denied' ? 'Notifications are blocked' : 'Couldn’t turn on alerts');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!reg) return;
    setBusy(true);
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // If this fails the Worker learns on its next push that the subscription is gone.
        await api('DELETE', '/subscription', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      forgetSynced();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    try {
      const sub = await reg!.pushManager.getSubscription();
      if (!sub) throw new Error('Not subscribed');
      await register(sub, list); // make sure the Worker has it before testing
      await api('POST', '/test', { endpoint: sub.endpoint });
      toast('Test sent');
    } catch (err) {
      toast(`Test failed: ${(err as Error).message}`);
    }
  }

  function note() {
    if (!ALERTS_API) return 'The alerts server isn’t set up yet (see worker/README.md).';
    if (!('PushManager' in window)) {
      return isIOS() && !(navigator as Navigator & { standalone?: boolean }).standalone
        ? 'Add Rates to your Home Screen (Share → Add to Home Screen) and open it from there to turn on alerts.'
        : 'This browser can’t show notifications from web apps.';
    }
    if (permission() === 'denied') return 'Notifications are off for Rates. Turn them on in Settings → Notifications → Rates.';
    if (loadError) return 'Couldn’t reach the alerts server. Check your connection.';
    if (!subscribed) return 'Off';
    const p = pairs(list);
    if (!p.length) return 'Add another currency to your list to get alerts.';
    return `Watching ${p.length < 3 ? p.join(' and ') : `${p.slice(0, -1).join(', ')} and ${p.at(-1)}`}`;
  }

  return (
    <>
      <label className="toggle-row">
        <span className="row-text"><span className="code">2-week highs &amp; lows</span><span className="name" id="alerts-status">{note()}</span></span>
        <input
          type="checkbox"
          className="switch"
          id="alerts-toggle"
          role="switch"
          checked={subscribed}
          disabled={busy || !reg || !publicKey || permission() === 'denied'}
          onChange={(e) => (e.target.checked ? enable() : disable())}
        />
      </label>
      <div className="button-row">
        <button type="button" className="pill-btn secondary" id="alerts-test" hidden={!subscribed} onClick={sendTest}>Send a test</button>
      </div>
    </>
  );
}
