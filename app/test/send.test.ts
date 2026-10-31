import { expect, test } from 'vitest';
import { buildURL, exportCode, fill, importCode, newDestination, problem, type Destination } from '../src/lib/send';

const values = { amount: '100.00', from: 'CAD', receive: '71.56', to: 'USD', rate: '0.7156', date: 'Oct 23, 2026' };

test('fill replaces known tokens and leaves unknown ones', () => {
  expect(fill('{amount} {from} {nope}', values)).toBe('100.00 CAD {nope}');
});

test('links get URL-encoded tokens', () => {
  const dest: Destination = { id: '1', type: 'link', name: '', url: ' https://bank.example/send?amt={amount}&note={date} ' };
  expect(buildURL(dest, values)).toBe('https://bank.example/send?amt=100.00&note=Oct%2023%2C%202026');
});

test('shortcuts run by name with the input as text', () => {
  const dest: Destination = { id: '1', type: 'shortcut', name: '', shortcut: 'Open Bank', input: '{amount} {from}' };
  expect(buildURL(dest, values)).toBe('shortcuts://run-shortcut?name=Open%20Bank&input=text&text=100.00%20CAD');
});

test('email keeps @ readable and fills subject and body', () => {
  const dest: Destination = { id: '1', type: 'email', name: '', to: 'a@x.com; b@y.com', subject: '{from} to {to}', body: '' };
  expect(buildURL(dest, values)).toBe('mailto:a@x.com,b@y.com?subject=CAD%20to%20USD');
});

test('problem rejects unusable or unsafe links', () => {
  expect(problem(newDestination('link'))).toMatch(/Enter a link/);
  expect(problem({ id: '1', type: 'link', name: '', url: 'javascript:alert(1)' })).toMatch(/isn’t allowed/);
  expect(problem({ id: '1', type: 'link', name: '', url: 'yourbank://pay' })).toBe('');
  expect(problem(newDestination('shortcut'))).toMatch(/Shortcut’s name/);
});

test('setup codes round-trip without ids, including non-ASCII text', () => {
  const list: Destination[] = [
    { id: 'a', type: 'email', name: 'Café', to: 'x@y.z', subject: 'Héllo', body: '€' },
    { id: 'b', type: 'link', name: '', url: 'https://example.com' },
  ];
  const restored = importCode(exportCode(list));
  expect(restored.map(({ id: _id, ...rest }) => rest)).toEqual(list.map(({ id: _id, ...rest }) => rest));
  expect(restored[0].id).not.toBe('a');
});

test('importCode explains bad codes', () => {
  expect(() => importCode('hello')).toThrow(/doesn’t look like a setup code/);
  expect(() => importCode('rates-setup:!!!')).toThrow(/damaged/);
});
