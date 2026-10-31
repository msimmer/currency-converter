// The Chart tab: a pair, its history over a range, and summary stats.

import { useEffect, useState } from 'react';
import { currencyName, formatPercent, formatRate, formatTick } from '../lib/currencies';
import { formatAxisDate, formatDate } from '../lib/dates';
import { fetchHistory, hasLongHistory, type HistoryPoint, type LatestRates } from '../lib/rates';
import { rate, type RangeKey } from '../lib/state';
import { Chart } from './Chart';
import { Badge, Chevron, cx } from './icons';

const RANGES: Record<RangeKey, { days: number | null; label: string; points?: number }> = {
  '1W': { days: 7, label: 'past week', points: 8 },
  '1M': { days: 30, label: 'past month', points: 31 },
  '3M': { days: 91, label: 'past 3 months', points: 46 },
  '6M': { days: 182, label: 'past 6 months', points: 61 },
  '1Y': { days: 365, label: 'past year', points: 53 },
  '5Y': { days: 1826, label: 'past 5 years' },
  '10Y': { days: 3652, label: 'past 10 years' },
  MAX: { days: null, label: 'since Mar 2024', points: 70 },
};

function rangesFor(from: string, to: string): RangeKey[] {
  return hasLongHistory(from, to)
    ? ['1W', '1M', '3M', '6M', '1Y', '5Y', '10Y']
    : ['1W', '1M', '3M', '6M', '1Y', 'MAX'];
}

function downsample(pts: HistoryPoint[], max = 400): HistoryPoint[] {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const out = [];
  for (let i = 0; i < max - 1; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

interface Props {
  hidden: boolean;
  pair: [string, string];
  range: RangeKey;
  rates: LatestRates | null;
  onPair: (pair: [string, string]) => void;
  onRange: (range: RangeKey) => void;
  onPickCurrency: (index: 0 | 1) => void;
}

export function ChartView({ hidden, pair, range: savedRange, rates, onPair, onRange, onPickCurrency }: Props) {
  const [from, to] = pair;
  const available = rangesFor(from, to);
  // 5Y/10Y only exist for ECB pairs and Max only for the rest; fall back to the closest.
  const range = available.includes(savedRange)
    ? savedRange
    : savedRange === 'MAX' ? '5Y' : (available.includes('MAX') ? 'MAX' : '1Y');
  useEffect(() => {
    if (range !== savedRange) onRange(range);
  }, [range, savedRange, onRange]);

  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [scrub, setScrub] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reloads each time the tab is shown; history is memoized, so that's cheap.
  useEffect(() => {
    if (hidden) return;
    let current = true;
    const { days, points: maxPoints } = RANGES[range];
    const end = new Date();
    const start = days ? new Date(end.getTime() - days * 86400000) : new Date(0);
    setStatus('loading');
    fetchHistory(from, to, start, end, { maxPoints })
      .then((pts) => {
        if (!current) return;
        setPoints(downsample(pts));
        setScrub(null);
        setStatus('ready');
      })
      .catch(() => {
        if (!current) return;
        setPoints([]);
        setScrub(null);
        setStatus('error');
      });
    return () => { current = false; };
  }, [hidden, from, to, range, attempt]);

  const first = points[0];
  const last = points.at(-1);
  const shown = (scrub !== null ? points[scrub] : undefined) ?? last;

  let head;
  if (!shown || !first) {
    head = { rate: rate(rates, from, to), change: null, date: '' };
  } else {
    const diff = shown.value - first.value;
    const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
    head = {
      rate: shown.value,
      change: { dir, text: `${arrow} ${formatRate(Math.abs(diff))} (${formatPercent(first.value ? diff / first.value : 0)})` },
      date: scrub !== null ? formatDate(shown.date) : RANGES[range].label,
    };
  }

  const values = points.map((p) => p.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const stats: [string, string][] = points.length < 2 ? [] : [
    ['Open', formatRate(values[0])],
    ['Close', formatRate(values[values.length - 1])],
    ['High', formatRate(hi)],
    ['Low', formatRate(lo)],
    ['Average', formatRate(values.reduce((a, b) => a + b, 0) / values.length)],
    ['Spread', formatPercent((hi - lo) / lo, { signed: false })],
  ];

  const label = `${from} to ${to} exchange rate, ${RANGES[range].label}` + (first && last
    ? `, from ${formatRate(first.value)} to ${formatRate(last.value)}`
    : '');

  const pairButton = (code: string, index: 0 | 1) => (
    <button
      className="pair-btn card"
      id={index === 0 ? 'pair-from' : 'pair-to'}
      type="button"
      aria-label={`${index === 0 ? 'From' : 'To'} ${currencyName(code)}`}
      onClick={() => onPickCurrency(index)}
    >
      <Badge code={code} />
      <span className="code">{code}</span>
      <Chevron />
    </button>
  );

  return (
    <section className="view" data-view="charts" hidden={hidden}>
      <header className="topbar">
        <span className="round-btn placeholder" />
        <h1 className="page-title">Chart</h1>
        <span className="round-btn placeholder" />
      </header>
      <main className="scroller">
        <div className="pair-picker">
          {pairButton(from, 0)}
          <button className="swap-btn" id="pair-swap" type="button" aria-label="Swap currencies" onClick={() => onPair([to, from])}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
          {pairButton(to, 1)}
        </div>

        <div className="chart-head">
          <div className="chart-rate" id="chart-rate">{`1 ${from} = ${formatRate(head.rate)} ${to}`}</div>
          <div className="chart-sub">
            <span className={cx('chart-change', head.change?.dir)} id="chart-change">{head.change?.text}</span>
            <span className="chart-date" id="chart-date">{head.date}</span>
          </div>
        </div>

        <div className="chart-wrap">
          <Chart
            points={points}
            scrub={scrub}
            onScrub={setScrub}
            formatTick={formatTick}
            formatDate={formatDate}
            formatAxisDate={(iso) => formatAxisDate(iso, RANGES[range].days ?? 9999)}
            label={label}
          />
          <div className="chart-overlay" id="chart-overlay" hidden={status === 'ready'}>
            {status === 'loading' && <span className="spinner" />}
            {status === 'error' && (
              <button type="button" className="pill-btn" id="chart-retry" onClick={() => setAttempt((n) => n + 1)}>
                Couldn’t load history. Retry
              </button>
            )}
          </div>
        </div>

        <div className="segmented" id="ranges" role="tablist">
          {available.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              className={r === range ? 'active' : ''}
              onClick={() => { if (r !== range) onRange(r); }}
            >
              {r === 'MAX' ? 'Max' : r}
            </button>
          ))}
        </div>
        <p className="chart-note" id="chart-note" hidden={hasLongHistory(from, to)}>
          History for metals and less common currencies starts March 2024.
        </p>

        <dl className="stats card" id="stats">
          {stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </main>
    </section>
  );
}
