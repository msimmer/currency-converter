// Finding 2-week highs and lows, and the notification text for them.

/** One day of USD-based rates, codes upper-case. */
export interface Snapshot {
  date: string;
  rates: Record<string, number>;
}

export interface Extreme {
  to: string;
  dir: 'high' | 'low';
  value: number;
}

/** How the app names each currency: { CAD: { name: 'the Canadian Dollar', flag: '🇨🇦' } } */
export type Names = Record<string, { name: string; flag: string }>;

export interface Payload {
  title: string;
  body: string;
  tag: string;
  pair?: string; // opens this chart when tapped, e.g. 'CAD-USD'
}

const FAWAZ = [
  (date: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
  (date: string) => `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
];

const METALS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

export const WINDOW_DAYS = 14;
// A few missing snapshots are fine; much less history than this and we stay quiet.
const MIN_HISTORY = 10;

async function snapshot(date: string): Promise<Snapshot> {
  let lastErr: unknown;
  for (const url of FAWAZ) {
    try {
      // Dated snapshots never change; 'latest' moves once a day.
      const res = await fetch(url(date), { cf: { cacheTtl: date === 'latest' ? 900 : 86400 * 30 } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url(date)}`);
      const data = await res.json<{ date: string; usd: Record<string, number> }>();
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(data.usd)) rates[k.toUpperCase()] = v;
      return { date: data.date, rates };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The latest USD-based rates plus the WINDOW_DAYS days before, oldest first. Missing days are skipped. */
export async function loadHistory(): Promise<Snapshot[]> {
  const latest = await snapshot('latest');
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(latest.date, i - WINDOW_DAYS));
  const past = await Promise.allSettled(days.map(snapshot));
  return [...past.filter((r) => r.status === 'fulfilled').map((r) => r.value), latest];
}

/**
 * Pairs base→code (for each of `codes`) whose latest rate is above every rate
 * in the days before it (a high) or below every one (a low).
 */
export function findExtremes(history: Snapshot[], base: string, codes: string[]): Extreme[] {
  const latest = history[history.length - 1];
  const rate = (rates: Record<string, number>, to: string) => rates[to] / rates[base];
  const out: Extreme[] = [];
  for (const to of codes) {
    if (to === base) continue;
    const value = rate(latest.rates, to);
    const past = history.slice(0, -1).map((d) => rate(d.rates, to)).filter(Number.isFinite);
    if (!Number.isFinite(value) || past.length < MIN_HISTORY) continue;
    if (value > Math.max(...past)) out.push({ to, dir: 'high', value });
    else if (value < Math.min(...past)) out.push({ to, dir: 'low', value });
  }
  return out;
}

// Same precision rules as the app's formatRate().
export function formatRate(value: number): string {
  const opts = Math.abs(value) >= 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : Math.abs(value) >= 1 ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
      : { maximumSignificantDigits: 5 };
  return new Intl.NumberFormat('en-US', opts).format(value);
}

/** The push payload for one extreme, worded with the app's `names`. */
export function alertPayload(base: string, { to, dir, value }: Extreme, names: Names = {}): Payload {
  // CAD/XAU is a tiny number; say it as the price of gold instead.
  if (METALS.has(to) && !METALS.has(base)) {
    [base, to, value, dir] = [to, base, 1 / value, dir === 'high' ? 'low' : 'high'];
  }
  const name = (c: string) => names[c]?.name || c;
  const flags = [names[base]?.flag, names[to]?.flag].filter(Boolean).join(' ');
  const subject = name(base).charAt(0).toUpperCase() + name(base).slice(1);
  const move = dir === 'high' ? 'rises to a 2 week high' : 'falls to a 2 week low';
  return {
    title: `${flags ? flags + ' ' : ''}${base}/${to} hits ${formatRate(value)} ${dir === 'high' ? '📈' : '📉'}`,
    body: `${subject} ${move} against ${name(to)}.`,
    pair: `${base}-${to}`,
    tag: `${base}-${to}`,
  };
}
