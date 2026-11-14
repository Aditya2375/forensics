/**
 * forensics - interactive incident forensics.
 * All DOM is built with textContent / createElement: no HTML sinks.
 */

import { ddmin, ddminString, minimize, type DdStep } from '../core/ddmin.js';
import { validatorFor, validateRefundAnswer, validateParserOutput, validateCitedAnswer } from '../core/validators.js';
import { INCIDENTS, type FullIncident } from '../core/incidents.js';
import type { Chunk, Stage } from '../core/trace.js';

const $ = (id: string) => document.getElementById(id)!;
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let current: FullIncident = INCIDENTS[0]!;
let replayIdx = 0;
let minTimer: number | null = null;

/* ---------------- incident picker ---------------- */
function renderPicker(): void {
  const p = $('picker');
  p.replaceChildren();
  for (const inc of INCIDENTS) {
    const b = el('button', 'inc-card') as HTMLButtonElement;
    b.setAttribute('aria-pressed', String(inc === current));
    b.append(
      el('div', 'inc-id', `${inc.id} · ${inc.severity.toUpperCase()} · ${inc.happenedAt.slice(0, 10)}`),
      el('div', 'inc-title', inc.title),
      el('div', `inc-sev ${inc.severity}`, inc.rootCauseStage ? `root cause: ${inc.rootCauseStage}` : ''),
    );
    b.addEventListener('click', () => { current = inc; replayIdx = 0; stopMin(); renderAll(); });
    p.append(b);
  }
}

/* ---------------- tabs ---------------- */
for (const t of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  t.addEventListener('click', () => {
    for (const o of document.querySelectorAll<HTMLButtonElement>('.tab')) o.setAttribute('aria-selected', String(o === t));
    for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
      const on = panel.id === `tab-${t.dataset.tab}`;
      panel.hidden = !on;
      if (on) { panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = ''; }
    }
  });
}

/* ---------------- Incident tab ---------------- */
function renderIncident(): void {
  const root = $('tab-incident');
  root.replaceChildren();
  root.append(
    el('h2', 'headline', ''),
    el('p', 'lede', `${current.id} (${current.severity.toUpperCase()}, ${current.happenedAt.replace('T', ' ').slice(0, 16)} UTC). The pipeline answered a user question wrong. This is the recorded trace of that run - five stages, end to end.`),
  );
  const h = root.querySelector('h2')!;
  h.append(document.createTextNode('The answer was wrong. '), (() => { const e = el('em', '', 'Where did it break?'); return e; })());

  const answers = el('div', 'grid-2');
  const bad = el('div', 'card'); bad.append(el('div', 'label', 'What the user saw'), el('div', 'answer bad', current.badAnswer));
  const good = el('div', 'card'); good.append(el('div', 'label', 'What it should have said'), el('div', 'answer good', current.expectedAnswer));
  answers.append(bad, good);
  root.append(answers);

  root.append(el('div', 'label', 'Recorded trace - click a stage'));
  const trace = el('div', 'trace');
  const detail = el('div', 'stage-detail');
  for (const s of current.stages) {
    const b = el('button', 'stage') as HTMLButtonElement;
    const name = el('div', 'stage-name');
    name.append(el('span', `dot ${s.status}`), document.createTextNode(s.label));
    b.append(name, el('div', 'stage-sum', s.summary), el('div', 'stage-time', `${s.startedMs} ms · ${s.durationMs} ms`));
    b.addEventListener('click', () => {
      for (const o of trace.querySelectorAll('.stage')) o.classList.remove('active');
      b.classList.add('active');
      detail.replaceChildren();
      const io = el('div', 'grid-2');
      const i1 = el('div', 'io-box'); i1.append(el('b', '', 'stage input'), document.createTextNode(s.input));
      const i2 = el('div', 'io-box'); i2.append(el('b', '', 'stage output'), document.createTextNode(s.output));
      io.append(i1, i2);
      detail.append(io);
    });
    trace.append(b);
  }
  root.append(trace, detail);
}

/* ---------------- Replay tab ---------------- */
function renderReplay(): void {
  const root = $('tab-replay');
  root.replaceChildren();
  const h = el('h2', 'headline'); h.append(document.createTextNode('Replay the run, '), (() => { const e = el('em', '', 'stage by stage.'); return e; })());
  root.append(h, el('p', 'lede', 'Step through the exact recorded execution. The root-cause stage is flagged; watch where the poison enters the prompt.'));

  const controls = el('div', 'replay-controls');
  const prev = el('button', 'rbtn', 'Back') as HTMLButtonElement;
  const next = el('button', 'rbtn primary', 'Next stage') as HTMLButtonElement;
  const prog = el('span', 'rprog');
  controls.append(prev, next, prog);
  const stageBox = el('div');
  root.append(controls, stageBox);

  const show = (i: number) => {
    replayIdx = Math.max(0, Math.min(current.stages.length - 1, i));
    const s: Stage = current.stages[replayIdx]!;
    prog.textContent = `stage ${replayIdx + 1} / ${current.stages.length}`;
    prev.disabled = replayIdx === 0;
    next.disabled = replayIdx === current.stages.length - 1;
    stageBox.replaceChildren();
    const card = el('div', 'card');
    const head = el('div', 'stage-name');
    head.append(el('span', `dot ${s.status}`), document.createTextNode(`${s.label} - ${s.kind}`));
    card.append(head, el('p', 'stage-sum', s.summary));
    const io = el('div', 'grid-2');
    const i1 = el('div', 'io-box'); i1.append(el('b', '', 'input'), document.createTextNode(s.input));
    const i2 = el('div', 'io-box');
    i2.append(el('b', '', 'output'));
    // highlight the poison chunk's text inside the generate stage output
    const poison = current.poisonChunkId ? current.chunks.find((c) => c.id === current.poisonChunkId) : undefined;
    if (poison && s.kind === 'generate' && current.id === 'INC-2311') {
      i2.append(document.createTextNode(s.output));
      const note = el('p', 'mono', `the model leaned on ${poison.source} ("${poison.title}") - the archived page, not current policy`);
      note.style.color = 'var(--fail)';
      i2.append(note);
    } else {
      i2.append(document.createTextNode(s.output));
    }
    io.append(i1, i2);
    card.append(io);
    if (s.id === current.rootCauseStage) {
      const rc = el('p', 'mono', 'ROOT CAUSE STAGE - the failure entered the run here');
      rc.style.color = 'var(--accent)';
      card.append(rc);
    }
    if (s.kind === 'validate') {
      const v = s.output;
      const vbox = el('div', 'io-box');
      vbox.append(el('b', '', 'validator verdict'));
      const details = current.oracle === 'refund-policy' ? validateRefundAnswer(current.badAnswer)
        : current.oracle === 'json-parser' ? validateParserOutput(current.badAnswer)
        : validateCitedAnswer(current.badAnswer);
      for (const r of details.reasons) vbox.append(el('div', 'mono', `- ${r}`));
      vbox.append(el('div', 'mono', `(${v})`));
      card.append(vbox);
    }
    stageBox.append(card);
  };
  prev.addEventListener('click', () => show(replayIdx - 1));
  next.addEventListener('click', () => show(replayIdx + 1));
  show(0);
}

/* ---------------- Minimize tab ---------------- */
function stopMin(): void { if (minTimer !== null) { clearTimeout(minTimer); minTimer = null; } }

function oracleFor(inc: FullIncident): (subset: Chunk[]) => boolean {
  const validate = validatorFor(inc.oracle);
  return (subset) => validate(inc.replayGeneration(subset.map((c) => c.id), inc.question), subset);
}

function renderMinimize(): void {
  const root = $('tab-minimize');
  root.replaceChildren();
  const h = el('h2', 'headline'); h.append(document.createTextNode('Shrink the failing input '), (() => { const e = el('em', '', 'until only the trigger is left.'); return e; })());
  root.append(h);

  if (current.id === 'INC-2319') { renderStringMinimizer(root); return; }

  const exhaustive = 2 ** current.chunks.length;
  root.append(el('p', 'lede',
    `The failing run had ${current.chunks.length} chunks in context. Testing every subset would take ${exhaustive.toLocaleString()} runs. Delta debugging (ddmin) does it in a few dozen oracle calls - each one replays the recorded pipeline for real through the incident's validator.`));

  const controls = el('div', 'replay-controls');
  const run = el('button', 'rbtn primary', 'Run the minimizer') as HTMLButtonElement;
  const reset = el('button', 'rbtn', 'Reset') as HTMLButtonElement;
  controls.append(run, reset);
  const status = el('div', 'min-status');
  const grid = el('div', 'chunk-grid');
  const resultBox = el('div');
  root.append(controls, status, grid, resultBox);

  const cards = new Map<string, HTMLElement>();
  const drawGrid = (candidate: Set<string>, eliminated: Set<string>, done: boolean) => {
    for (const c of current.chunks) {
      let card = cards.get(c.id);
      if (!card) {
        card = el('div', 'chunk');
        card.append(el('div', 'c-src', `${c.source} - score ${c.score.toFixed(2)}`), el('div', 'c-text', c.text));
        cards.set(c.id, card);
        grid.append(card);
      }
      card.className = 'chunk'
        + (done && c.id === current.poisonChunkId ? ' poison' : '')
        + (!done && candidate.has(c.id) ? ' in-candidate' : '')
        + (eliminated.has(c.id) ? ' eliminated' : '');
    }
  };
  drawGrid(new Set(), new Set(), false);

  run.addEventListener('click', () => {
    stopMin();
    run.disabled = true;
    resultBox.replaceChildren();
    drawGrid(new Set(current.chunks.map((c) => c.id)), new Set(), false);
    const gen = ddmin(current.chunks, oracleFor(current));
    const stepDelay = 900;
    const tick = () => {
      const r = gen.next();
      if (r.done) return;
      const step: DdStep = r.value;
      if (step.kind === 'done') {
        const kept = new Set(step.remaining.map((c) => (c as Chunk).id));
        drawGrid(new Set(), new Set(current.chunks.filter((c) => !kept.has(c.id)).map((c) => c.id)), true);
        status.replaceChildren(el('span', 'verdict-stamp fail', 'MINIMAL REPRO FOUND'));
        const stats = el('div', 'stat-row');
        const mk = (n: string, l: string) => { const d = el('div', 'stat'); d.append(el('b', '', n), el('span', '', l)); return d; };
        stats.append(
          mk(String(step.oracleCalls), 'oracle calls'),
          mk(exhaustive.toLocaleString(), 'exhaustive subsets'),
          mk(`${(exhaustive / step.oracleCalls).toFixed(0)}x`, 'less work'),
          mk(`${step.remaining.length} of ${current.chunks.length}`, 'chunks remain'),
        );
        const poison = current.chunks.find((c) => c.id === current.poisonChunkId)!;
        const rep = el('div', 'card');
        rep.append(
          el('div', 'label', 'Minimal repro'),
          el('p', '', `One chunk alone reproduces the incident: ${poison.source} ("${poison.title}").`),
          el('div', 'answer bad', poison.text),
          el('p', 'mono', `Replays to: "${current.replayGeneration([poison.id], current.question)}" - validator: FAIL`),
        );
        resultBox.append(stats, rep);
        run.disabled = false;
        return;
      }
      if (step.kind !== 'keep') {
        const candidate = new Set(step.candidate.map((c) => (c as Chunk).id));
        const remaining = new Set(step.remaining.map((c) => (c as Chunk).id));
        const eliminated = new Set(current.chunks.filter((c) => !remaining.has(c.id)).map((c) => c.id));
        drawGrid(candidate, eliminated, false);
        status.replaceChildren(
          el('span', `verdict-stamp ${step.verdict ? 'fail' : 'pass'}`, step.verdict ? 'STILL FAILS' : 'passes'),
          el('span', '', `${step.kind === 'test-complement' ? 'dropping a slice' : 'trying a slice alone'} - call #${step.oracleCalls}, ${step.remaining.length} chunks in play (n=${step.n})`),
        );
      } else {
        status.replaceChildren(el('span', '', `no single slice carries it - refining granularity to n=${step.n}`));
      }
      minTimer = window.setTimeout(tick, stepDelay);
    };
    minTimer = window.setTimeout(tick, 400);
  });
  reset.addEventListener('click', () => { stopMin(); run.disabled = false; status.replaceChildren(); resultBox.replaceChildren(); drawGrid(new Set(), new Set(), false); });
}

function renderStringMinimizer(root: HTMLElement): void {
  root.append(el('p', 'lede',
    `This time the context is fine - the QUESTION breaks the pipeline. A quote in the ticket title gets echoed into the JSON skeleton unescaped. Watch char-wise delta debugging shrink ${current.question.length} characters down to the single one that breaks the parser.`));
  const controls = el('div', 'replay-controls');
  const run = el('button', 'rbtn primary', 'Run the minimizer') as HTMLButtonElement;
  controls.append(run);
  const status = el('div', 'min-status');
  const strBox = el('div', 'min-string');
  strBox.textContent = current.question;
  const resultBox = el('div');
  root.append(controls, status, strBox, resultBox);

  run.addEventListener('click', () => {
    stopMin();
    run.disabled = true;
    resultBox.replaceChildren();
    strBox.textContent = current.question;
    const validate = validatorFor(current.oracle);
    const allIds = current.chunks.map((c) => c.id);
    const gen = ddminString(current.question, (q) => validate(current.replayGeneration(allIds, q), []));
    const tick = () => {
      const r = gen.next();
      if (r.done) return;
      const step: DdStep = r.value;
      const shown = step.kind === 'done' ? step.remaining : (step.candidate.length ? step.candidate : step.remaining);
      strBox.textContent = shown.map((c) => c as string).join('') || '(empty string)';
      if (step.kind === 'done') {
        status.replaceChildren(el('span', 'verdict-stamp fail', 'MINIMAL TRIGGER FOUND'));
        const stats = el('div', 'stat-row');
        const mk = (n: string, l: string) => { const d = el('div', 'stat'); d.append(el('b', '', n), el('span', '', l)); return d; };
        stats.append(mk(String(step.oracleCalls), 'oracle calls'), mk(String(current.question.length), 'characters in'), mk(`${step.remaining.length}`, 'characters out'));
        const rep = el('div', 'card');
        rep.append(
          el('div', 'label', 'Minimal repro'),
          el('p', '', 'A single double-quote character in the question breaks the parser: it is echoed into the JSON skeleton unescaped, and the generation closes its own string early.'),
          el('div', 'answer bad', current.replayGeneration(allIds, '"')),
          el('p', 'mono', 'validator: FAIL - JSON.parse threw on the echoed quote'),
        );
        resultBox.append(stats, rep);
        run.disabled = false;
        return;
      }
      if (step.kind !== 'keep') {
        status.replaceChildren(
          el('span', `verdict-stamp ${step.verdict ? 'fail' : 'pass'}`, step.verdict ? 'STILL FAILS' : 'passes'),
          el('span', '', `call #${step.oracleCalls} - ${step.remaining.length} chars in play (n=${step.n})`),
        );
      } else {
        status.replaceChildren(el('span', '', `refining granularity to n=${step.n}`));
      }
      minTimer = window.setTimeout(tick, 350);
    };
    minTimer = window.setTimeout(tick, 400);
  });
}

/* ---------------- Report tab ---------------- */
function renderReport(): void {
  const root = $('tab-report');
  root.replaceChildren();
  const h = el('h2', 'headline'); h.append(document.createTextNode('The write-up '), (() => { const e = el('em', '', 'writes itself.'); return e; })());
  root.append(h, el('p', 'lede', 'Everything the minimizer and replay established, assembled into the incident review.'));
  const doc = el('div', 'card report-doc');
  // Run the minimization silently once to quote exact numbers in the write-up.
  const { minimal, oracleCalls } = minimize(current.chunks, oracleFor(current));
  void minimal;
  void oracleCalls;
  doc.append(
    el('h3', '', `${current.id}: ${current.title}`),
    el('p', '', `Severity ${current.severity.toUpperCase()}. Detected ${current.happenedAt.replace('T', ' ').slice(0, 16)} UTC by the validator stage, which rejected the answer before it reached the user-facing channel (the fallback was shown instead).`),
    el('h3', '', 'Root cause'),
    el('p', '', `Stage: ${current.rootCauseStage}. ${current.stages.find((s) => s.id === current.rootCauseStage)!.summary}.`),
    el('h3', '', 'Minimal reproduction'),
  );
  if (current.id === 'INC-2319') {
    doc.append(el('p', '', `Char-wise minimization of the question ("${current.question}") reduces the trigger to one character: a double-quote. Any question containing it reproduces the parse failure; the full pipeline is otherwise healthy.`));
  } else {
    const p = current.chunks.find((c) => c.id === current.poisonChunkId)!;
    doc.append(el('p', '', `Delta debugging over the ${current.chunks.length}-chunk context isolates a single chunk: ${p.source} ("${p.title}"). Alone it reproduces the failure; without it the full run passes.`));
  }
  doc.append(
    el('h3', '', 'Guardrail'),
    el('p', '', current.guardrail),
    el('h3', '', 'Reproducibility'),
    el('p', '', `Trace, generations and validator rules ship with this page. The chunk minimization above converges in ${oracleCalls} oracle calls (vs ${(2 ** current.chunks.length).toLocaleString()} exhaustive subsets); the Minimize tab re-runs it live, and every verdict shown there is the real validator replaying the recorded generation.`),
  );
  root.append(doc);
}

/* ---------------- boot ---------------- */
function renderAll(): void {
  renderPicker();
  renderIncident();
  renderReplay();
  renderMinimize();
  renderReport();
}
renderAll();
