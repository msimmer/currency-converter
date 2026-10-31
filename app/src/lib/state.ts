// The converter's saved state, and the changes the UI makes to it. Everything
// here is pure: each change returns a new state.

import { evaluate, isOp, press } from './calc';
import { plainAmount } from './currencies';
import { convert, type LatestRates } from './rates';

export type Tab = 'converter' | 'charts' | 'settings';
export const TABS: Tab[] = ['converter', 'charts', 'settings'];

export type RangeKey = '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | '10Y' | 'MAX';

export interface AppState {
  list: string[]; // the first one is the "You convert" currency
  base: string; // the currency `amount` is held in
  amount: number;
  pair: [string, string]; // the chart's from/to
  range: RangeKey;
  tab: Tab;
}

const STATE_KEY = 'state:v1';

const DEFAULTS: AppState = {
  list: ['CAD', 'USD', 'EUR', 'XAU'],
  base: 'CAD',
  amount: 100,
  pair: ['CAD', 'USD'],
  range: '1M',
  tab: 'converter',
};

export function loadState(rates: LatestRates | null): AppState {
  let saved: Partial<AppState> = {};
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') ?? {}; } catch { /* ignore */ }
  let state = { ...DEFAULTS, ...saved };
  if (!TABS.includes(state.tab)) state.tab = 'converter';
  if (!state.list.includes(state.base) && state.list.length) state = rebase(state, rates, state.list[0]);
  return state;
}

export function saveState(state: AppState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ---- Amounts ---------------------------------------------------------------

export function rate(rates: LatestRates | null, from: string, to: string): number {
  if (!rates || !(from in rates.rates) || !(to in rates.rates)) return NaN;
  return convert(rates.rates, 1, from, to);
}

export function amountIn(state: AppState, rates: LatestRates | null, code: string): number {
  return state.amount * rate(rates, state.base, code);
}

/** Hold the current amount in `code` instead, without changing its value. */
export function rebase(state: AppState, rates: LatestRates | null, code: string): AppState {
  if (code === state.base) return state;
  const value = amountIn(state, rates, code);
  return { ...state, base: code, amount: Number.isFinite(value) ? value : state.amount };
}

// ---- The list --------------------------------------------------------------

export function addCurrency(state: AppState, code: string): AppState {
  if (state.list.includes(code)) return state;
  return { ...state, base: state.list.length ? state.base : code, list: [...state.list, code] };
}

export function removeCurrency(state: AppState, rates: LatestRates | null, code: string): AppState {
  let next = state;
  if (code === state.base) {
    const other = state.list.find((c) => c !== code);
    if (other) next = rebase(state, rates, other);
  }
  return { ...next, list: state.list.filter((c) => c !== code) };
}

export function replaceCurrency(state: AppState, rates: LatestRates | null, oldCode: string, newCode: string): AppState {
  if (oldCode === newCode) return state;
  const next = state.base === oldCode ? rebase(state, rates, newCode) : state;
  const list = state.list.filter((c) => c !== newCode);
  list[list.indexOf(oldCode)] = newCode;
  return { ...next, list };
}

export function moveToTop(state: AppState, code: string): AppState {
  return { ...state, list: [code, ...state.list.filter((c) => c !== code)] };
}

export function moveCurrency(state: AppState, from: number, to: number): AppState {
  const list = [...state.list];
  const [code] = list.splice(from, 1);
  list.splice(to, 0, code);
  return { ...state, list };
}

// ---- Calculator keypad -----------------------------------------------------

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '+' | '-' | '*' | '/' | '=' | 'back' | 'done';

/** The amount being typed into one row while the keypad is open. */
export interface Calc {
  code: string;
  expr: string;
  fresh: boolean; // the amount is highlighted, so the next digit replaces it
}

/** Apply a key (other than Done) to the expression. */
export function applyKey(calc: Calc, key: Exclude<KeypadKey, 'done'> | 'clear'): Calc {
  if (key === '=') {
    const v = evaluate(calc.expr);
    return { ...calc, expr: Number.isFinite(v) ? plainAmount(v, calc.code) : calc.expr, fresh: true };
  }
  if (key === 'clear') return { ...calc, expr: '', fresh: false };
  if (isOp(key)) return { ...calc, expr: press(calc.expr, key), fresh: false };
  // Digit, '.', or backspace: the first one replaces the highlighted amount.
  const expr = calc.fresh ? '' : calc.expr;
  return { ...calc, expr: key !== 'back' || expr ? press(expr, key) : expr, fresh: false };
}

/** The amount an expression sets: its value, 0 once cleared, else unchanged. */
export function amountFor(expr: string, current: number): number {
  const value = evaluate(expr);
  if (Number.isFinite(value)) return value;
  return expr ? current : 0;
}
