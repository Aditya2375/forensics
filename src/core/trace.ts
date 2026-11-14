/**
 * Pipeline trace model. An incident is one recorded failing run of a
 * multi-stage AI pipeline: retrieval -> prompt assembly -> generation ->
 * parse -> validation. Traces are recorded artifacts (JSON), replayed
 * deterministically; nothing here calls a live model.
 */

export type StageKind = 'retrieve' | 'assemble' | 'generate' | 'parse' | 'validate';

export interface Stage {
  id: string;
  kind: StageKind;
  label: string;
  startedMs: number;
  durationMs: number;
  status: 'ok' | 'warn' | 'fail';
  /** Human-readable summary of what this stage did. */
  summary: string;
  /** Stage input (display). */
  input: string;
  /** Stage output (display). */
  output: string;
  /** Machine detail: retrieved chunk ids, prompt sections, parse errors... */
  detail?: Record<string, unknown>;
}

export interface Chunk {
  id: string;
  source: string;
  title: string;
  text: string;
  score: number;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'sev1' | 'sev2' | 'sev3';
  happenedAt: string;
  question: string;
  /** The bad answer users saw. */
  badAnswer: string;
  /** What a correct run would have said. */
  expectedAnswer: string;
  stages: Stage[];
  chunks: Chunk[];
  /**
   * Oracle policy id (see oracle.ts): decides whether a given chunk subset +
   * question still reproduces the failure. Recorded incidents ship a recorded
   * oracle; visitor edits are judged by a clearly-labeled heuristic.
   */
  oracle: string;
  /** Guardrail that would have caught it (for the report tab). */
  guardrail: string;
  rootCauseStage: string;
}

/** Index into the stage list by id. */
export function stageById(i: Incident, id: string): Stage | undefined {
  return i.stages.find((s) => s.id === id);
}

/** Total wall time of the traced run. */
export function traceDurationMs(i: Incident): number {
  const end = Math.max(...i.stages.map((s) => s.startedMs + s.durationMs));
  const start = Math.min(...i.stages.map((s) => s.startedMs));
  return end - start;
}
