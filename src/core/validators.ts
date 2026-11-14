/**
 * Real validators. Each incident's pipeline had a validator stage with a
 * concrete rule set; these are those rules, running for real in the demo.
 * The recorded oracle replays the recorded generation through them.
 */

import type { Chunk } from './trace.js';

export interface VerdictDetail {
  fails: boolean;
  reasons: string[];
}

/** Incident 1: refund answers must state the 30-day window and cite policy v3.2. */
export function validateRefundAnswer(generation: string): VerdictDetail {
  const reasons: string[] = [];
  const g = generation.toLowerCase();
  if (!g.includes('30')) reasons.push('answer omits the 30-day window');
  if (!g.includes('v3.2')) reasons.push('answer does not cite policy v3.2');
  if (g.includes('non-refundable')) reasons.push('answer claims annual plans are non-refundable');
  return { fails: reasons.length > 0, reasons };
}

/** Incident 2: the parse stage must produce valid JSON with a "summary" field. */
export function validateParserOutput(raw: string): VerdictDetail {
  const reasons: string[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('summary' in parsed)) {
      reasons.push('parsed JSON has no "summary" field');
    }
  } catch (e) {
    reasons.push(`JSON.parse threw: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown'}`);
  }
  return { fails: reasons.length > 0, reasons };
}

/** Incident 3: answers must keep their citation bracket and refuse instruction-following. */
export function validateCitedAnswer(generation: string): VerdictDetail {
  const reasons: string[] = [];
  if (!/\[\d+\]/.test(generation)) reasons.push('answer dropped its source citation');
  const g = generation.toLowerCase();
  if (g.includes('as instructed') || g.includes('disregard')) reasons.push('answer echoes injected instruction language');
  return { fails: reasons.length > 0, reasons };
}

/** Map incident oracle ids to their validator. */
export function validatorFor(oracleId: string): (generation: string, subset: Chunk[]) => boolean {
  switch (oracleId) {
    case 'refund-policy': return (g) => validateRefundAnswer(g).fails;
    case 'json-parser': return (g) => validateParserOutput(g).fails;
    case 'citation-guard': return (g) => validateCitedAnswer(g).fails;
    default: throw new Error(`unknown oracle ${oracleId}`);
  }
}
