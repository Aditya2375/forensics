# forensics

**Failure forensics for AI pipelines.** When a pipeline answers wrong, the question is never "is the model bad?" — it is *where did the run break?* forensics replays the recorded trace stage by stage, then runs a real delta debugger over the failing input until only the trigger is left.

Live demo: **https://aditya2375.github.io/forensics/** — fully client-side, nothing leaves the browser.

## The three incidents

| Incident | Symptom | Root cause stage | What the minimizer isolates |
| --- | --- | --- | --- |
| INC-2311 (SEV1) | Refund answer contradicts current policy | retrieve | 1 poisoned chunk (`archive/faq-2021.html`) out of 12, in 7 oracle calls instead of 4,096 exhaustive subsets |
| INC-2319 (SEV2) | Ticket summarizer emits broken JSON | generate | 1 character (`"`) out of 60 in the question, echoed unescaped into the JSON skeleton |
| INC-2327 (SEV1) | Retrieved forum post strips citations | assemble | 1 injected chunk (`forum/post-8812`) out of 8 |

## What is real here (and what is not)

- **Real:** the delta debugger (Zeller's ddmin, chunk-level and character-level), the three validators (refund-policy rules, a JSON parse check, a citation guard), the replay and minimization — all run live in your browser, every oracle call replaying the recorded pipeline through the incident's actual validator.
- **Recorded:** the traces and the model's generations. The incidents are replayed from recordings so the demo is deterministic and works offline. Edited-input judging during replay uses the same labeled validators — heuristics, not a model, and labeled as such on the page.

## How delta debugging works here

Given 12 chunks of retrieved context and a failing validator verdict, testing every subset would take 2^12 = 4,096 runs. ddmin instead splits the candidate into complements and slices, keeps whichever subset still fails, and refines granularity when no single slice carries the failure. On INC-2311 it converges on the archived 2021 FAQ in 7 oracle calls — 585x less work — and every intermediate verdict on the page is the real validator re-running, not a canned animation.

The same algorithm runs character-wise on INC-2319's question, shrinking 60 characters down to the single `"` that closes the JSON string early.

## Quickstart

```bash
npm install
npm test          # 14 unit tests: ddmin correctness, convergence on each incident's poison
npm run web       # build the demo into docs/ (esbuild bundle + fonts + assets)
node tests/browser-smoke.mjs   # 13 end-to-end checks against headless Chrome
```

Serve `docs/` with any static server (`python3 -m http.server --directory docs`) or view the deployed page.

## Layout

```
src/core/    ddmin.ts (delta debugger), trace.ts (trace model), oracle.ts (judges),
             validators.ts (3 validators), incidents.ts (3 recorded incidents)
src/web/     index.html, style.css, app.ts (4 tabs: Incident / Replay / Minimize / Report)
docs/        built demo served by GitHub Pages (bundle is committed; rebuild with npm run web)
tests/       unit tests, browser smoke test, check-docs.sh (pins README numbers to code)
.github/     CI: unit tests, docs consistency, browser smoke, supply-chain audit
```

The Report tab assembles the incident postmortem — root cause, minimal reproduction, guardrail, reproducibility — directly from the same trace and minimizer state the other tabs show, quoting the measured oracle-call counts.

## Security and privacy

No backend, no keys, no network calls: the page's Content-Security-Policy allows `connect-src 'self'` and every asset (fonts included) is self-hosted. The demo DOM is built exclusively with `textContent`/`createElement` — no HTML sinks. Incident data is synthetic. See `SECURITY_REVIEW.md` for the full checklist.
