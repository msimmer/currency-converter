import { test } from 'vitest';
import assert from 'node:assert/strict';
import { alertPayload, findExtremes, type Snapshot } from '../src/alerts';

// USD-based history where USD per CAD (1 / CAD) follows `cadUsd`, EUR is flat.
export function history(cadUsd: number[], { eur = 0.92 } = {}): Snapshot[] {
  return cadUsd.map((v, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    rates: { USD: 1, CAD: 1 / v, EUR: eur, XAU: 0.00025 },
  }));
}

const rising = [0.71, 0.712, 0.709, 0.711, 0.713, 0.71, 0.708, 0.712, 0.714, 0.711, 0.71, 0.709, 0.712, 0.713];

test('a new high against the previous two weeks', () => {
  const out = findExtremes(history([...rising, 0.7156]), 'CAD', ['CAD', 'USD']);
  assert.equal(out.length, 1);
  assert.equal(out[0].to, 'USD');
  assert.equal(out[0].dir, 'high');
  assert.ok(Math.abs(out[0].value - 0.7156) < 1e-12);
});

test('a new low', () => {
  const out = findExtremes(history([...rising, 0.70]), 'CAD', ['USD']);
  assert.deepEqual(out.map((e) => e.dir), ['low']);
});

test('nothing inside the range, and nothing when only matching the high', () => {
  assert.deepEqual(findExtremes(history([...rising, 0.711]), 'CAD', ['USD']), []);
  assert.deepEqual(findExtremes(history([...rising, 0.714]), 'CAD', ['USD']), []);
});

test('stays quiet without enough history', () => {
  assert.deepEqual(findExtremes(history([0.71, 0.72, 0.73]), 'CAD', ['USD']), []);
});

test('skips codes the data lacks', () => {
  assert.deepEqual(findExtremes(history([...rising, 0.72]), 'CAD', ['ZZZ']), []);
});

test('notification text matches the Xe style', () => {
  const names = {
    CAD: { name: 'the Canadian Dollar', flag: '🇨🇦' },
    USD: { name: 'the US Dollar', flag: '🇺🇸' },
    XAU: { name: 'gold', flag: '' },
  };
  assert.deepEqual(alertPayload('CAD', { to: 'USD', dir: 'high', value: 0.71562 }, names), {
    title: '🇨🇦 🇺🇸 CAD/USD hits 0.71562 📈',
    body: 'The Canadian Dollar rises to a 2 week high against the US Dollar.',
    pair: 'CAD-USD',
    tag: 'CAD-USD',
  });
  const gold = alertPayload('XAU', { to: 'CAD', dir: 'low', value: 5521.4 }, names);
  assert.equal(gold.title, '🇨🇦 XAU/CAD hits 5,521.40 📉');
  assert.equal(gold.body, 'Gold falls to a 2 week low against the Canadian Dollar.');

  // CAD rising against gold reads as gold falling in CAD.
  const flipped = alertPayload('CAD', { to: 'XAU', dir: 'high', value: 1 / 5521.4 }, names);
  assert.equal(flipped.title, '🇨🇦 XAU/CAD hits 5,521.40 📉');
  assert.equal(flipped.pair, 'XAU-CAD');
});
