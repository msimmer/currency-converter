// Sheet listing every currency: add/remove from the list, or pick one.

import { useRef, useState } from 'react';
import { availableCodes, currencyName, currencySubtitle } from '../lib/currencies';
import type { RateTable } from '../lib/rates';
import { Badge, Check, cx } from './icons';
import { useModal } from './useModal';

export type PickerRequest =
  | { mode: 'add' }
  | { mode: 'pick'; current: string; onPick: (code: string) => void };

interface Props {
  request: PickerRequest;
  open: boolean;
  rates: RateTable;
  list: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
}

export function CurrencyPicker({ request, open, rates, list, onToggle, onClose }: Props) {
  const [query, setQuery] = useState('');
  const modal = useModal(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);

  function close() {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  }

  const q = query.trim().toLowerCase();
  const { metals, fiat } = availableCodes(rates);
  const match = (c: string) => !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q);
  const selected = (c: string) => (request.mode === 'add' ? list.includes(c) : c === request.current);

  const metalMatches = metals.filter(match);
  const fiatMatches = fiat.filter(match);

  const section = (title: string, items: string[]) => {
    if (!items.length) return null;
    return (
      <>
        <h3 className="sheet-section">{title}</h3>
        <ul className="pick-list">
          {items.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={cx('pick-row', selected(c) && 'selected')}
                onClick={() => {
                  if (request.mode === 'add') {
                    onToggle(c);
                  } else {
                    request.onPick(c);
                    close();
                  }
                }}
              >
                <Badge code={c} />
                <span className="row-text"><span className="code">{c}</span><span className="name">{currencySubtitle(c)}</span></span>
                <Check />
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <>
      <div className={cx('backdrop', modal.open && 'open')} id="sheet-backdrop" hidden={modal.hidden} onClick={close} />
      <div
        className={cx('sheet', modal.open && 'open')}
        id="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        hidden={modal.hidden}
        // Swipe the sheet down by its header to dismiss.
        onTouchStart={(e) => {
          if (!(e.target as Element).closest('.sheet-head, .sheet-grabber')) return;
          swipeStart.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (swipeStart.current === null) return;
          const dy = Math.max(0, e.touches[0].clientY - swipeStart.current);
          sheetRef.current!.style.transform = `translateY(${dy}px)`;
        }}
        onTouchEnd={(e) => {
          if (swipeStart.current === null) return;
          const dy = e.changedTouches[0].clientY - swipeStart.current;
          swipeStart.current = null;
          sheetRef.current!.style.transform = '';
          if (dy > 120) close();
        }}
      >
        <div className="sheet-grabber" />
        <header className="sheet-head">
          <span />
          <h2 id="sheet-title">{request.mode === 'add' ? 'Add Currency' : 'Choose Currency'}</h2>
          <button className="text-btn" id="sheet-done" type="button" onClick={close}>Done</button>
        </header>
        <div className="search">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="sheet-search"
            type="search"
            placeholder="Search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="sheet-body" id="sheet-body">
          {section('Precious metals', metalMatches)}
          {section('Currencies', fiatMatches)}
          {!metalMatches.length && !fiatMatches.length && <p className="sheet-empty">No matches</p>}
        </div>
      </div>
    </>
  );
}
