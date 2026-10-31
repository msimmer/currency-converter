import { describe, expect, test } from 'vitest';
import type { LatestRates } from '../src/lib/rates';
import {
  addCurrency, amountFor, amountIn, applyKey, moveCurrency, moveToTop, rebase, removeCurrency, replaceCurrency, type AppState,
} from '../src/lib/state';

const rates: LatestRates = { date: '2026-10-23', fetchedAt: 0, rates: { USD: 1, CAD: 1.4, EUR: 0.9, XAU: 0.00025 } };

const state = (over: Partial<AppState> = {}): AppState => ({
  list: ['CAD', 'USD', 'EUR'], base: 'CAD', amount: 140, pair: ['CAD', 'USD'], range: '1M', tab: 'converter', ...over,
});

test('rebase keeps the value and holds it in the new currency', () => {
  const s = rebase(state(), rates, 'USD');
  expect(s.base).toBe('USD');
  expect(s.amount).toBeCloseTo(100);
  expect(amountIn(s, rates, 'CAD')).toBeCloseTo(140);
});

test('rebase without rates keeps the amount as it is', () => {
  expect(rebase(state(), null, 'USD')).toMatchObject({ base: 'USD', amount: 140 });
});

describe('the list', () => {
  test('removing the base currency rebases onto the next one', () => {
    const s = removeCurrency(state(), rates, 'CAD');
    expect(s.list).toEqual(['USD', 'EUR']);
    expect(s.base).toBe('USD');
    expect(s.amount).toBeCloseTo(100);
  });

  test('adding to an empty list makes it the base', () => {
    expect(addCurrency(state({ list: [], base: 'GBP' }), 'EUR')).toMatchObject({ list: ['EUR'], base: 'EUR' });
    expect(addCurrency(state(), 'USD').list).toEqual(['CAD', 'USD', 'EUR']);
  });

  test('replacing a currency already in the list moves it into the old one’s place', () => {
    const s = replaceCurrency(state(), rates, 'CAD', 'EUR');
    expect(s.list).toEqual(['EUR', 'USD']);
    expect(s.base).toBe('EUR');
    expect(s.amount).toBeCloseTo(90);
  });

  test('reordering', () => {
    expect(moveToTop(state(), 'EUR').list).toEqual(['EUR', 'CAD', 'USD']);
    expect(moveCurrency(state(), 0, 2).list).toEqual(['USD', 'EUR', 'CAD']);
  });
});

describe('keypad', () => {
  const calc = { code: 'CAD', expr: '140', fresh: true };

  test('the first digit replaces the highlighted amount; operators extend it', () => {
    expect(applyKey(calc, '5')).toEqual({ code: 'CAD', expr: '5', fresh: false });
    expect(applyKey(calc, '+')).toEqual({ code: 'CAD', expr: '140+', fresh: false });
  });

  test('= collapses the sum to a plain amount and highlights it', () => {
    expect(applyKey({ ...calc, expr: '100+40.5', fresh: false }, '=')).toEqual({ code: 'CAD', expr: '140.5', fresh: true });
  });

  test('backspace on a highlighted amount clears it', () => {
    expect(applyKey(calc, 'back').expr).toBe('');
  });

  test('amountFor: the value, 0 once cleared, otherwise unchanged', () => {
    expect(amountFor('2*3', 1)).toBe(6);
    expect(amountFor('', 1)).toBe(0);
    expect(amountFor('5/0', 1)).toBe(1);
  });
});
