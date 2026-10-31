// The Convert tab: the "You convert" row, the other currencies, and edit mode
// (remove, drag to reorder, add).

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { display as displayExpr, evaluate, hasOperator } from '../lib/calc';
import { currencyName, formatAmount, formatRate } from '../lib/currencies';
import type { LatestRates } from '../lib/rates';
import { unlockAudio } from '../lib/sound';
import { amountIn, rate, type AppState, type Calc } from '../lib/state';
import { Badge, Chevron, cx, Plus } from './icons';
import { StatusPill } from './StatusPill';

interface Props {
  hidden: boolean;
  state: AppState;
  rates: LatestRates | null;
  calc: Calc | null;
  editing: boolean;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
  onToggleEdit: () => void;
  onAdd: () => void;
  onRemove: (code: string) => void;
  onActions: (code: string) => void;
  onStartCalc: (code: string) => void;
  onClear: () => void;
  onFinishCalc: () => void;
  onMove: (from: number, to: number) => void;
}

interface Drag {
  from: number;
  to: number;
  startY: number;
  dy: number;
  rowHeight: number;
}

export function Converter(props: Props) {
  const { hidden, state, rates, calc, editing } = props;
  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  // Bumped after a drag so the list remounts and rows land in place, rather than
  // animating back from their drag offsets.
  const [listKey, setListKey] = useState(0);

  // Keep the row being edited in view above the keypad.
  const editingCode = calc?.code;
  useEffect(() => {
    if (!editingCode) return;
    const timer = setTimeout(() => rowEls.current.get(editingCode)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
    return () => clearTimeout(timer);
  }, [editingCode]);

  // ---- Drag to reorder (edit mode) ----

  function startDrag(e: PointerEvent<HTMLSpanElement>, index: number) {
    if (!editing) return;
    e.preventDefault();
    const rows = state.list.map((c) => rowEls.current.get(c)!);
    const rowHeight = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : rows[index].offsetHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index, startY: e.clientY, dy: 0, rowHeight });
  }

  function moveDrag(e: PointerEvent<HTMLSpanElement>) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const to = Math.max(0, Math.min(state.list.length - 1, drag.from + Math.round(dy / drag.rowHeight)));
    setDrag({ ...drag, dy, to });
  }

  function endDrag() {
    if (!drag) return;
    if (drag.to !== drag.from) props.onMove(drag.from, drag.to);
    setDrag(null);
    setListKey((k) => k + 1);
  }

  function dragOffset(i: number): string | undefined {
    if (!drag) return undefined;
    const { from, to, dy, rowHeight } = drag;
    if (i === from) return `translateY(${dy}px)`;
    if (from < to && i > from && i <= to) return `translateY(${-rowHeight}px)`;
    if (from > to && i < from && i >= to) return `translateY(${rowHeight}px)`;
    return undefined;
  }

  // ---- Rows ----

  const hero = state.list[0];

  function row(code: string, i: number) {
    const isEditing = calc?.code === code;
    const value = isEditing
      ? (calc.expr ? displayExpr(calc.expr) : '0')
      : (formatAmount(amountIn(state, rates, code), code) || '—');
    // A sum gets its own full-width line; shrink anything that still won't fit.
    const hasOp = isEditing && hasOperator(calc.expr);
    const room = hasOp ? 18 : 10;
    const len = value.length + (isEditing ? 2 : 0);
    const rateLine = hasOp
      ? `= ${formatAmount(evaluate(calc.expr), code)}`
      : code === hero ? '' : `1 ${hero} → ${formatRate(rate(rates, hero, code))} ${code}`;

    return (
      <li
        key={code}
        ref={(el) => {
          if (el) rowEls.current.set(code, el);
          else rowEls.current.delete(code);
        }}
        className={cx('row', i === 0 && 'hero', isEditing && 'editing-amount', hasOp && 'has-op', drag?.from === i && 'dragging')}
        style={{ transform: dragOffset(i) }}
        onClick={() => {
          if (editing) return;
          unlockAudio();
          props.onStartCalc(code);
        }}
      >
        {i === 0 && <span className="hero-label">You convert</span>}
        <button
          className="row-del"
          type="button"
          aria-label={`Remove ${code}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove(code);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path d="M7.5 12h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="cur-btn"
          type="button"
          aria-label={`${currencyName(code)} options`}
          onClick={(e) => {
            e.stopPropagation();
            if (!editing) props.onActions(code);
          }}
        >
          <Badge code={code} />
          <span className="code">{code}</span>
          <Chevron />
        </button>
        <div className="amount">
          <span className={cx('value', isEditing && calc.fresh && !!calc.expr && 'fresh', len > room && len <= room * 1.3 && 'long', len > room * 1.3 && 'xlong')}>
            {value}
          </span>
          <button
            className="clear"
            type="button"
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              props.onClear();
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={cx('rate', hasOp && 'result')}>{rateLine}</div>
        <span
          className="row-handle"
          aria-label={`Reorder ${code}`}
          onPointerDown={(e) => startDrag(e, i)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M4 8h16M4 12h16M4 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </li>
    );
  }

  return (
    <section className="view" data-view="converter" hidden={hidden}>
      <header className="topbar">
        {/* Add lives with editing: the + appears opposite the ✓ while the list is in edit mode. */}
        <button className={cx('round-btn', !editing && 'placeholder')} id="add-btn" type="button" aria-label="Add currency" onClick={props.onAdd}>
          <Plus />
        </button>
        <StatusPill rates={rates} refreshing={props.refreshing} failed={props.refreshFailed} onRefresh={props.onRefresh} />
        <button
          className={cx('round-btn', editing && 'active')}
          id="edit-btn"
          type="button"
          aria-label={editing ? 'Done editing' : 'Edit list'}
          onClick={props.onToggleEdit}
        >
          <svg className="icon-edit" viewBox="0 0 24 24" width="22" height="22">
            <path d="M15.5 5.5l3 3M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <svg className="icon-done" viewBox="0 0 24 24" width="22" height="22">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </header>
      <main
        className="scroller"
        id="converter-scroller"
        onClick={(e) => {
          // Tapping empty space closes the keypad.
          if (!(e.target as Element).closest('.row')) props.onFinishCalc();
        }}
      >
        <ul key={listKey} className={cx('currency-list', editing && 'editing')} id="currency-list">
          {state.list.map(row)}
        </ul>
        <div className="empty" id="list-empty" hidden={state.list.length > 0}>
          <p>No currencies yet.</p>
          <button className="pill-btn" type="button" onClick={props.onAdd}>Add currency</button>
        </div>
      </main>
    </section>
  );
}
