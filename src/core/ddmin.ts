/**
 * Delta debugging (Zeller & Hildebrandt's ddmin): given a list of
 * circumstances and an oracle that says FAIL or PASS for any subset, find a
 * minimal subset that still fails - 1-minimal, meaning removing any single
 * element makes the failure go away.
 *
 * Written as a generator so the UI can animate every oracle call. Pure and
 * synchronous: the oracle decides synchronously (recorded or heuristic), the
 * caller controls pacing.
 */

export const FAIL = true;
export const PASS = false;
export type Verdict = boolean; // true = the failure reproduces

export interface DdStep {
  /** What ddmin did this step. */
  kind: 'test-complement' | 'test-subset' | 'keep' | 'done';
  /** The candidate subset that was sent to the oracle (empty for done). */
  candidate: unknown[];
  verdict?: Verdict;
  /** Remaining circumstances after the step resolved. */
  remaining: unknown[];
  /** Current granularity n. */
  n: number;
  /** Running count of oracle calls. */
  oracleCalls: number;
}

function split<T>(c: T[], n: number): T[][] {
  const parts: T[][] = [];
  const size = Math.ceil(c.length / n);
  for (let i = 0; i < c.length; i += size) parts.push(c.slice(i, i + size));
  return parts;
}

function same<T>(a: T[], b: T[]): boolean {
  return a.length === b.length;
}

/**
 * Run ddmin over `circumstances`. Yields one DdStep per oracle call, then a
 * final {kind:'done'} step whose `remaining` is the 1-minimal failing subset.
 * The oracle must return FAIL for the full set and PASS for the empty set.
 */
export function* ddmin<T>(circumstances: T[], oracle: (subset: T[]) => Verdict): Generator<DdStep, T[], void> {
  let c = circumstances.slice();
  let n = 2;
  let oracleCalls = 0;
  while (c.length >= 2) {
    const parts = split(c, n);
    let reduced = false;
    // 1. try complements: drop one part, does it still fail?
    for (let i = 0; i < parts.length; i++) {
      const complement = parts.filter((_, j) => j !== i).flat();
      if (complement.length === c.length) continue;
      oracleCalls++;
      const v = oracle(complement);
      yield { kind: 'test-complement', candidate: complement, verdict: v, remaining: c.slice(), n, oracleCalls };
      if (v === FAIL) {
        c = complement;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    // 2. try each part alone
    for (const part of parts) {
      if (part.length === c.length) continue;
      oracleCalls++;
      const v = oracle(part);
      yield { kind: 'test-subset', candidate: part.slice(), verdict: v, remaining: c.slice(), n, oracleCalls };
      if (v === FAIL) {
        c = part.slice();
        n = 2;
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    // 3. refine granularity
    if (n < c.length) {
      n = Math.min(n * 2, c.length);
      yield { kind: 'keep', candidate: [], remaining: c.slice(), n, oracleCalls };
    } else {
      break;
    }
  }
  yield { kind: 'done', candidate: [], remaining: c.slice(), n, oracleCalls };
  return c;
}

/** Convenience: run to completion, return {minimal, oracleCalls, steps}. */
export function minimize<T>(circumstances: T[], oracle: (subset: T[]) => Verdict): { minimal: T[]; oracleCalls: number; steps: DdStep[] } {
  const steps: DdStep[] = [];
  const gen = ddmin(circumstances, oracle);
  let r = gen.next();
  while (!r.done) { steps.push(r.value); r = gen.next(); }
  return { minimal: r.value, oracleCalls: steps.length ? steps[steps.length - 1]!.oracleCalls : 0, steps };
}

/** String minimization: same algorithm over characters, for the question text. */
export function* ddminString(s: string, oracle: (sub: string) => Verdict): Generator<DdStep, string, void> {
  const gen = ddmin(s.split(''), (chars) => oracle(chars.join('')));
  let r = gen.next();
  while (!r.done) { yield r.value; r = gen.next(); }
  return r.value.join('');
}
