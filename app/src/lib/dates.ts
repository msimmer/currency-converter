// Date labels. Rate dates are calendar days (YYYY-MM-DD), so they're read and
// shown in UTC to keep them from shifting a day in the local time zone.

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const utc = (iso: string) => new Date(iso + 'T00:00:00Z');

/** "Oct 23" */
export const formatShortDate = (iso: string): string => shortDate.format(utc(iso));

/** "Oct 23, 2026" */
export const formatDate = (iso: string): string => longDate.format(utc(iso));

/** Axis label for a chart spanning `days`: day, month or year. */
export function formatAxisDate(iso: string, days: number): string {
  const opts: Intl.DateTimeFormatOptions = days <= 182 ? { month: 'short', day: 'numeric' }
    : days <= 400 ? { month: 'short', year: '2-digit' }
      : { year: 'numeric' };
  return utc(iso).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
