import { describe, expect, test } from 'vitest';
import { display, evaluate, hasOperator, press } from '../src/lib/calc';

describe('evaluate', () => {
  test('respects precedence', () => {
    expect(evaluate('2836.97+1000*1.05')).toBeCloseTo(3886.97);
    expect(evaluate('10-4/2')).toBe(8);
  });

  test('ignores a trailing operator', () => {
    expect(evaluate('12+')).toBe(12);
  });

  test('is NaN for empty or invalid input, and for division by zero', () => {
    expect(evaluate('')).toBeNaN();
    expect(evaluate('1..2')).toBeNaN();
    expect(evaluate('5/0')).toBeNaN();
  });
});

describe('press', () => {
  test('replaces a trailing operator instead of stacking them', () => {
    expect(press('12+', '*')).toBe('12*');
    expect(press('', '+')).toBe('');
  });

  test('adds a leading zero and allows one decimal point per number', () => {
    expect(press('', '.')).toBe('0.');
    expect(press('1.5', '.')).toBe('1.5');
    expect(press('1.5+', '.')).toBe('1.5+0.');
  });

  test('replaces a lone zero and caps the length of a number', () => {
    expect(press('0', '7')).toBe('7');
    expect(press('1'.repeat(15), '2')).toBe('1'.repeat(15));
  });
});

test('display uses spaced typographic operators', () => {
  expect(display('1200+35.5*2')).toBe('1200 + 35.5 × 2');
  expect(hasOperator('12+')).toBe(false);
  expect(hasOperator('12+3')).toBe(true);
});
