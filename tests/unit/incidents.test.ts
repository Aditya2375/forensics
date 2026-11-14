import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimize, ddminString } from '../../src/core/ddmin.js';
import { validatorFor, validateRefundAnswer, validateParserOutput, validateCitedAnswer } from '../../src/core/validators.js';
import { INCIDENTS, REFUND, PARSER, INJECTION } from '../../src/core/incidents.js';
import type { FullIncident } from '../../src/core/incidents.js';

const chunkOracle = (inc: FullIncident) => {
  const validate = validatorFor(inc.oracle);
  return (subset: typeof inc.chunks) => validate(inc.replayGeneration(subset.map((c) => c.id), inc.question), subset);
};

test('INC-2311: minimizer isolates the archived 2021 FAQ from 12 chunks', () => {
  const { minimal } = minimize(REFUND.chunks, chunkOracle(REFUND));
  assert.deepEqual(minimal.map((c) => c.id), ['c07']);
});

test('INC-2311: removing the poison chunk makes the recorded run pass', () => {
  const without = REFUND.chunks.filter((c) => c.id !== 'c07');
  assert.equal(chunkOracle(REFUND)(without), false);
});

test('INC-2327: minimizer isolates the injection post from 8 chunks', () => {
  const { minimal } = minimize(INJECTION.chunks, chunkOracle(INJECTION));
  assert.deepEqual(minimal.map((c) => c.id), ['w03']);
});

test('INC-2319: char-wise minimization finds the single quote trigger', () => {
  const validate = validatorFor(PARSER.oracle);
  const gen = ddminString(PARSER.question, (q) => validate(PARSER.replayGeneration(PARSER.chunks.map((c) => c.id), q), []));
  let r = gen.next();
  while (!r.done) r = gen.next();
  assert.equal(r.value, '"');
});

test('validators agree with the recorded incident outcomes', () => {
  for (const inc of INCIDENTS) {
    const validate = validatorFor(inc.oracle);
    assert.equal(validate(inc.badAnswer, inc.chunks), true, `${inc.id} bad answer must fail`);
  }
  assert.equal(validateRefundAnswer(REFUND.expectedAnswer).fails, false);
  assert.equal(validateCitedAnswer(INJECTION.expectedAnswer).fails, false);
  assert.equal(validateParserOutput('{"summary": "ok"}').fails, false);
});

test('validator reasons are specific, not just a boolean', () => {
  const v = validateRefundAnswer(REFUND.badAnswer);
  assert.ok(v.reasons.some((r) => r.includes('non-refundable')));
  assert.ok(v.reasons.some((r) => r.includes('30')));
  const p = validateParserOutput(PARSER.badAnswer);
  assert.ok(p.reasons[0]!.includes('JSON.parse threw'));
});
