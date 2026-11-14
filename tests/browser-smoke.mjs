/**
 * Browser smoke test: serves docs/, drives headless Chrome over CDP, and
 * checks the demo actually works - boot, all four tabs, stage detail,
 * the step-through replay, the live delta debugger converging on the
 * right chunk, the character-level minimizer on INC-2319, the generated
 * postmortem, and no page exceptions. Runs locally and in CI
 * (ubuntu-latest ships google-chrome). No npm deps.
 * SMOKE_SHOTS=1 also writes smoke-*.png screenshots for visual review.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const HTTP_PORT = 8944;
const CDP_PORT = 9342;
const SHOTS = process.env.SMOKE_SHOTS === '1';
const root = new URL('..', import.meta.url).pathname;

const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1', '--directory', `${root}docs`], { stdio: 'ignore' });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP_PORT}`, 'about:blank',
], { stdio: 'ignore' });

const cleanup = (code) => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  process.exit(code);
};
setTimeout(() => { console.error('smoke: timeout'); cleanup(1); }, 240000);
process.on('SIGINT', () => cleanup(2));

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'ok' : 'NOT OK'} - ${name}${detail ? ' - ' + detail : ''}`);
};

await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 'chrome devtools');
const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'page exception');
  }
};
const cdp = (method, params = {}) => new Promise((resolve) => {
  const id = ++mid;
  rpcPending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900)); // let entrance animations settle

  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${root}smoke-${name}.png`, Buffer.from(r.result.data, 'base64'));
};

await cdp('Runtime.enable');
await cdp('Page.enable');
if (SHOTS) await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });

// Boot: three incidents, five-stage trace, both answer cards.
await waitFor(() => evaluate(`document.querySelectorAll('#picker .inc-card').length === 3`), 'boot');
await waitFor(() => evaluate(`document.querySelectorAll('#tab-incident .stage').length === 5`), 'trace');
const bad = await evaluate(`document.querySelector('#tab-incident .answer.bad').textContent`);
check('boot: incident view renders trace and answers', bad.includes('non-refundable'), bad.slice(0, 60));

// Stage click: generation detail shows the recorded raw output.
await evaluate(`[...document.querySelectorAll('#tab-incident .stage')][2].click()`);
const detail = await evaluate(`document.querySelector('#tab-incident .stage-detail').textContent`);
check('stage detail shows recorded generation', detail.includes('According to our FAQ'), '');

// Incident switch: INC-2319 (broken JSON) loads its own trace, then back.
await evaluate(`document.querySelectorAll('#picker .inc-card')[1].click()`);
const lede2 = await evaluate(`document.querySelector('#tab-incident .lede').textContent`);
check('incident switch loads INC-2319', lede2.includes('INC-2319'), lede2.slice(0, 24));
await evaluate(`document.querySelectorAll('#picker .inc-card')[0].click()`);

// Replay: step to the validator stage; verdict reasons appear.
await evaluate(`document.querySelector('.tab[data-tab="replay"]').click()`);
for (let i = 0; i < 4; i++) await evaluate(`[...document.querySelectorAll('#tab-replay .rbtn')].find(b => b.textContent === 'Next stage').click()`);
const prog = await evaluate(`document.querySelector('#tab-replay .rprog').textContent`);
check('replay steps to stage 5 of 5', prog.includes('5 / 5'), prog);
const verdict = await evaluate(`document.querySelector('#tab-replay').textContent`);
check('replay ends in validator verdict', verdict.includes('validator verdict') && verdict.includes('omits the 30-day window'), '');
await shot('replay');

// Minimize (chunk level, INC-2311): the live delta debugger isolates c07.
await evaluate(`document.querySelector('.tab[data-tab="minimize"]').click()`);
await evaluate(`[...document.querySelectorAll('#tab-minimize .rbtn')].find(b => b.textContent === 'Run the minimizer').click()`);
await waitFor(() => evaluate(`document.querySelector('#tab-minimize .min-status .verdict-stamp.fail')?.textContent.includes('MINIMAL REPRO FOUND')`), 'ddmin convergence', 120000);
const stats = await evaluate(`[...document.querySelectorAll('#tab-minimize .stat-row .stat')].map(s => s.textContent)`);
check('ddmin isolates the poisoned chunk', true, stats.join(' | '));
const repro = await evaluate(`document.querySelector('#tab-minimize .card').textContent`);
check('minimal repro names the archived FAQ', repro.includes('archive/faq-2021.html'), '');
const poisonMarked = await evaluate(`document.querySelectorAll('#tab-minimize .chunk.poison').length`);
check('poison chunk is marked in the grid', poisonMarked === 1, String(poisonMarked));
await shot('minimize');

// Minimize (character level, INC-2319): the trigger shrinks to one quote.
await evaluate(`document.querySelectorAll('#picker .inc-card')[1].click()`);
await evaluate(`[...document.querySelectorAll('#tab-minimize .rbtn')].find(b => b.textContent === 'Run the minimizer').click()`);
await waitFor(() => evaluate(`document.querySelector('#tab-minimize .min-status .verdict-stamp.fail')?.textContent.includes('MINIMAL TRIGGER FOUND')`), 'char ddmin', 120000);
const finalStr = await evaluate(`document.querySelector('#tab-minimize .min-string').textContent`);
check('string minimizer reduces to the quote', finalStr === '"', JSON.stringify(finalStr));
await shot('minimize-chars');

// Report: postmortem quotes the minimizer's measured numbers.
await evaluate(`document.querySelectorAll('#picker .inc-card')[0].click()`);
await evaluate(`document.querySelector('.tab[data-tab="report"]').click()`);
const report = await evaluate(`document.querySelector('#tab-report .report-doc').textContent`);
check('report names root cause and minimal repro', report.includes('Root cause') && report.includes('archive/faq-2021.html'), '');
check('report quotes oracle-call count', /\d+ oracle calls \(vs 4,096 exhaustive subsets\)/.test(report), '');
check('report carries the guardrail', report.includes('Reject refund answers that omit the current-policy citation'), '');
await shot('report');

check('no page exceptions', consoleErrors.length === 0, consoleErrors[0] ?? '');

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
cleanup(failed.length ? 1 : 0);
