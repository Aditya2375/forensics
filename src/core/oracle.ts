/**
 * Oracles: decide whether a candidate input still reproduces the incident's
 * failure.
 *
 * Two honest kinds:
 * - Recorded: replays the recorded model behavior for the canonical incident
 *   input. The recorded run's validator verdict is recomputed by REAL
 *   validator code (validators.ts) against the recorded generation - the
 *   oracle is not a hardcoded boolean, only the generation is recorded.
 * - Heuristic (labeled in the UI as "demo judge"): when a visitor edits the
 *   context, no recorded generation exists, so a transparent keyword rule
 *   stands in and says so.
 *
 * Delta debugging drives either kind through the same interface.
 */

import type { Chunk, Incident } from './trace.js';

export type Oracle = (subset: Chunk[]) => boolean; // true = failure reproduces

export interface OracleInfo {
  calls: number;
  kind: 'recorded' | 'heuristic';
}

/**
 * Build the recorded oracle for an incident. The failure reproduces exactly
 * when the recorded generation for that chunk subset fails the incident's
 * validator. Recorded generations live in the incident data (see
 * data/incidents.ts); this function looks them up and validates for real.
 */
export function recordedOracle(
  incident: Incident,
  generations: Map<string, string>,
  validate: (generation: string, subset: Chunk[]) => boolean,
  key: (subset: Chunk[]) => string,
): Oracle {
  return (subset) => {
    const gen = generations.get(key(subset));
    if (gen === undefined) {
      throw new Error(`no recorded generation for subset ${key(subset)} - recorded oracle is only total over the subsets ddmin visits`);
    }
    return validate(gen, subset);
  };
}

/**
 * The demo judge for visitor-edited contexts. Deliberately simple and
 * displayed as a heuristic in the UI: the failure "reproduces" when any chunk
 * carrying the incident's poison marker is present. Not presented as a model.
 */
export function heuristicOracle(incident: Incident, poisonChunkId: string): Oracle {
  return (subset) => subset.some((c) => c.id === poisonChunkId);
}
