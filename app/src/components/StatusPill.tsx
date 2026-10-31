import { useEffect, useReducer } from 'react';
import { ago, formatShortDate } from '../lib/dates';
import type { LatestRates } from '../lib/rates';
import { cx } from './icons';

interface Props {
  rates: LatestRates | null;
  refreshing: boolean;
  failed: boolean;
  onRefresh: () => void;
}

export function StatusPill({ rates, refreshing, failed, onRefresh }: Props) {
  // Re-render every minute, and on return to the app, to keep "5m ago" current.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  let text: string;
  if (refreshing) {
    text = 'Updating…';
  } else if (!rates) {
    text = failed ? 'Offline · tap to retry' : 'Loading rates…';
  } else {
    const day = formatShortDate(rates.date);
    text = failed ? `Offline · ${day} rates` : `${day} rates · ${ago(rates.fetchedAt)}`;
  }

  return (
    <button
      className={cx('status-pill', refreshing && 'busy', failed && 'error')}
      id="status-pill"
      type="button"
      aria-label={`${text}. Refresh rates`}
      onClick={onRefresh}
    >
      <span id="status-text">{text}</span>
      <svg className="refresh-icon" viewBox="0 0 24 24" width="16" height="16">
        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  );
}
