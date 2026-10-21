// Exchange-rate data.
//
// Latest rates and fallback history: fawazahmed0/exchange-api (free, no key, daily,
// includes metals). History for the ~30 ECB currencies: Frankfurter (back to 1999).

const FAWAZ = [
  (date, base) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.min.json`,
  (date, base) => `https://${date}.currency-api.pages.dev/v1/currencies/${base}.min.json`,
];
const FRANKFURTER = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

// First day the fawazahmed0 dated snapshots exist.
export const FAWAZ_HISTORY_START = '2024-03-02';

export const ECB_CODES = new Set(`AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK
JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR`.split(/\s+/));

const CACHE_KEY = 'rates:latest';

async function fetchJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function upperKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.toUpperCase()] = v;
  return out;
}

/** Rates cached from the last successful fetch, or null. Shape: { date, fetchedAt, rates } (USD based). */
export function cachedRates() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

/** Fetch latest USD-based rates from both mirrors and keep whichever is newer. */
export async function fetchLatestRates() {
  const results = await Promise.allSettled(FAWAZ.map((u) => fetchJSON(u('latest', 'usd'))));
  const good = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!good.length) throw new Error('Could not reach the rate service');
  good.sort((a, b) => b.date.localeCompare(a.date));
  const data = { date: good[0].date, fetchedAt: Date.now(), rates: upperKeys(good[0].usd) };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full/private */ }
  return data;
}

/** Convert `amount` from one code to another using USD-based rates. */
export function convert(rates, amount, from, to) {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

// ---- History ---------------------------------------------------------------

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/** True when this pair can be charted over long ranges (both in the ECB set). */
export function hasLongHistory(from, to) {
  return ECB_CODES.has(from) && ECB_CODES.has(to);
}

const memo = new Map();

/**
 * Daily history for from->to between start and end (Date objects).
 * Returns [{ date: 'YYYY-MM-DD', value: number }] in ascending order.
 */
export async function fetchHistory(from, to, start, end, { maxPoints = 60 } = {}) {
  const key = `${from}/${to}/${isoDate(start)}/${isoDate(end)}`;
  if (!memo.has(key)) {
    const p = (hasLongHistory(from, to)
      ? frankfurterHistory(from, to, start, end)
      : sampledHistory(from, to, start, end, maxPoints)
    ).catch((err) => { memo.delete(key); throw err; });
    memo.set(key, p);
  }
  return memo.get(key);
}

async function frankfurterHistory(from, to, start, end) {
  if (from === to) return flat(start, end);
  const path = `/${isoDate(start)}..${isoDate(end)}?base=${from}&symbols=${to}`;
  let lastErr;
  for (const host of FRANKFURTER) {
    try {
      const data = await fetchJSON(host + path);
      return Object.entries(data.rates)
        .map(([date, r]) => ({ date, value: r[to] }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function fawazOnDate(date, base) {
  let lastErr;
  for (const url of FAWAZ) {
    try {
      return await fetchJSON(url(date, base));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Daily snapshot files, one request per day, so sample evenly across the range.
async function sampledHistory(from, to, start, end, maxPoints) {
  const floor = new Date(FAWAZ_HISTORY_START + 'T00:00:00Z');
  if (start < floor) start = floor;
  if (from === to) return flat(start, end);

  const days = Math.round((end - start) / 86400000);
  const step = Math.max(1, Math.ceil(days / maxPoints));
  const dates = [];
  for (let d = days; d >= 0; d -= step) dates.unshift(isoDate(addDays(start, d)));

  const base = from.toLowerCase();
  const quote = to.toLowerCase();
  const out = [];
  await pool(dates, 8, async (date) => {
    try {
      const data = await fawazOnDate(date, base);
      const value = data[base]?.[quote];
      if (Number.isFinite(value)) out.push({ date, value });
    } catch {
      // A missing day (today's file not published yet, CDN hiccup) just leaves a gap.
    }
  });
  if (!out.length) throw new Error('No history available');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function flat(start, end) {
  return [{ date: isoDate(start), value: 1 }, { date: isoDate(end), value: 1 }];
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
