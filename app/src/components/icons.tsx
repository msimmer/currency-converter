import { flagSrc, isMetal, METALS } from '../lib/currencies';

export const ICONS = {
  swap: 'M4 8h14l-4-4M20 16H6l4 4',
  chart: 'M4 20V13M9.3 20V8M14.6 20v-6M20 20V5',
  up: 'M12 19V5M5 12l7-7 7 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shortcut: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
};

export function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 24 24" width="18" height="18">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Check() {
  return (
    <svg className="check" viewBox="0 0 24 24" width="22" height="22">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Plus({ size = 24, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The round badge shown next to a currency: its flag, or a coloured disc for a metal. */
export function Badge({ code }: { code: string }) {
  if (isMetal(code)) {
    return <span className={`badge metal metal-${code.toLowerCase()}`}>{METALS[code].symbol}</span>;
  }
  return <img className="badge" src={flagSrc(code)} alt="" loading="lazy" decoding="async" />;
}

/** Class names from a list, skipping falsy ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
