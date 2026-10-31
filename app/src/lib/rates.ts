// Exchange-rate data.
//
// Latest rates and fallback history: fawazahmed0/exchange-api (free, no key, daily,
// includes metals). History for the ~30 ECB currencies: Frankfurter (back to 1999).

/** Units of each currency per US dollar, keyed by upper-case code. */
export type RateTable = Record<string, number>;

export interface LatestRates {
  date: string; // YYYY-MM-DD of the rates
  fetchedAt: number;
  rates: RateTable;
}

export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// A fawazahmed0 file: { date, <base>: { <code>: rate } }, codes lower-case.
type Snapshot = { date: string } & { [base: string]: Record<string, number> };

const FAWAZ = [
  (date: string, base: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.min.json`,
  (date: string, base: string) => `https://${date}.currency-api.pages.dev/v1/currencies/${base}.min.json`,
];
const FRANKFURTER = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

// First day the fawazahmed0 dated snapshots exist.
export const FAWAZ_HISTORY_START = '2024-03-02';

export const ECB_CODES = new Set(`AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK
JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR`.split(/\s+/));

const CACHE_KEY = 'rates:latest';

async function fetchJSON<T>(url: string, timeoutMs = 12000): Promise<T> {
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

function upperKeys(obj: Record<string, number>): RateTable {
  const out: RateTable = {};
  for (const [k, v] of Object.entries(obj)) out[k.toUpperCase()] = v;
  return out;
}

/** Rates cached from the last successful fetch, or null. */
export function cachedRates(): LatestRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Fetch latest USD-based rates from both mirrors and keep whichever is newer. */
export async function fetchLatestRates(): Promise<LatestRates> {
  const results = await Promise.allSettled(FAWAZ.map((u) => fetchJSON<Snapshot>(u('latest', 'usd'))));
  const good = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!good.length) throw new Error('Could not reach the rate service');
  good.sort((a, b) => b.date.localeCompare(a.date));
  const data = { date: good[0].date, fetchedAt: Date.now(), rates: upperKeys(good[0].usd) };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full/private */ }
  return data;
}

/** Convert `amount` from one code to another using USD-based rates. */
export function convert(rates: RateTable, amount: number, from: string, to: string): number {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

// ---- History ---------------------------------------------------------------

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/** True when this pair can be charted over long ranges (both in the ECB set). */
export function hasLongHistory(from: string, to: string): boolean {
  return ECB_CODES.has(from) && ECB_CODES.has(to);
}

const memo = new Map<string, Promise<HistoryPoint[]>>();

/** Daily history for from->to between start and end, in ascending order. */
export function fetchHistory(
  from: string,
  to: string,
  start: Date,
  end: Date,
  { maxPoints = 60 }: { maxPoints?: number } = {},
): Promise<HistoryPoint[]> {
  const key = `${from}/${to}/${isoDate(start)}/${isoDate(end)}`;
  let p = memo.get(key);
  if (!p) {
    p = (hasLongHistory(from, to)
      ? frankfurterHistory(from, to, start, end)
      : sampledHistory(from, to, start, end, maxPoints)
    ).catch((err) => { memo.delete(key); throw err; });
    memo.set(key, p);
  }
  return p;
}

async function frankfurterHistory(from: string, to: string, start: Date, end: Date): Promise<HistoryPoint[]> {
  if (from === to) return flat(start, end);
  const path = `/${isoDate(start)}..${isoDate(end)}?base=${from}&symbols=${to}`;
  let lastErr: unknown;
  for (const host of FRANKFURTER) {
    try {
      const data = await fetchJSON<{ rates: Record<string, Record<string, number>> }>(host + path);
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

async function fawazOnDate(date: string, base: string): Promise<Snapshot> {
  let lastErr: unknown;
  for (const url of FAWAZ) {
    try {
      return await fetchJSON<Snapshot>(url(date, base));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Daily snapshot files, one request per day, so sample evenly across the range.
async function sampledHistory(from: string, to: string, start: Date, end: Date, maxPoints: number): Promise<HistoryPoint[]> {
  const floor = new Date(FAWAZ_HISTORY_START + 'T00:00:00Z');
  if (start < floor) start = floor;
  if (from === to) return flat(start, end);

  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const step = Math.max(1, Math.ceil(days / maxPoints));
  const dates: string[] = [];
  for (let d = days; d >= 0; d -= step) dates.unshift(isoDate(addDays(start, d)));

  const base = from.toLowerCase();
  const quote = to.toLowerCase();
  const out: HistoryPoint[] = [];
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

function flat(start: Date, end: Date): HistoryPoint[] {
  return [{ date: isoDate(start), value: 1 }, { date: isoDate(end), value: 1 }];
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
