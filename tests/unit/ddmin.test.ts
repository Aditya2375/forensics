import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimize, ddmin, ddminString, FAIL, PASS } from '../../src/core/ddmin.js';

// classic: exactly one poisoned element among many
test('ddmin isolates a single poisoned element', () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  const { minimal } = minimize(items, (s) => s.includes(7));
  assert.deepEqual(minimal, [7]);
});

test('ddmin finds a minimal pair when the failure needs two elements', () => {
  const items = Array.from({ length: 8 }, (_, i) => i);
  const { minimal } = minimize(items, (s) => s.includes(2) && s.includes(5));
  assert.deepEqual(minimal.sort(), [2, 5]);
});

test('ddmin is far cheaper than exhaustive search', () => {
  const items = Array.from({ length: 16 }, (_, i) => i);
  const { oracleCalls } = minimize(items, (s) => s.includes(9));
  assert.ok(oracleCalls < 60, `oracle called ${oracleCalls} times, exhaustive would be 65535`);
});

test('ddmin returns the full set when everything is required', () => {
  const items = [1, 2, 3];
  const { minimal } = minimize(items, (s) => s.length === 3);
  assert.deepEqual(minimal, [1, 2, 3]);
});

test('minimality: removing any element of the result makes the failure vanish', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const oracle = (s: number[]) => s.includes(4) && s.includes(7);
  const { minimal } = minimize(items, oracle);
  for (let i = 0; i < minimal.length; i++) {
    const without = minimal.filter((_, j) => j !== i);
    assert.equal(oracle(without), PASS, `removing element ${minimal[i]} should pass`);
  }
});

test('ddmin yields inspectable steps and ends with done', () => {
  const items = Array.from({ length: 6 }, (_, i) => i);
  const gen = ddmin(items, (s) => s.includes(3));
  const kinds: string[] = [];
  let r = gen.next();
  while (!r.done) { kinds.push(r.value.kind); r = gen.next(); }
  assert.ok(kinds.includes('test-complement'));
  assert.equal(kinds[kinds.length - 1], 'done');
  assert.deepEqual(r.value, [3]);
});

test('ddmin order-independence: shuffled input still finds the poison', () => {
  const a = [9, 1, 4, 7, 2, 8, 3, 6, 5, 0];
  const { minimal } = minimize(a, (s) => s.includes(6));
  assert.deepEqual(minimal, [6]);
});

test('ddminString minimizes a failing string character-wise', () => {
  const s = 'the quick brown fox jumps over the lazy dog';
  const gen = ddminString(s, (sub) => sub.includes('fox'));
  let r = gen.next();
  while (!r.done) r = gen.next();
  assert.equal(r.value, 'fox');
});
