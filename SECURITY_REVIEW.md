# Security review - forensics

Item-by-item pass over the pre-ship checklist, with evidence. Statuses: PASS
(checked, evidence below), N/A (the thing the item protects does not exist in
this project - stated explicitly, not skipped silently), TODO (must happen
before or right after publication).

Architecture context for every item below: forensics is a fully static site.
No backend, no database, no auth, no accounts, no cookies, no analytics, no
API keys, no forms, no uploads, no text input fields of any kind. The page
makes no network calls beyond fetching its own same-origin files - the CSP
allows `connect-src 'self'` and nothing else. All demo state lives in page
memory; nothing persists.

## Pre-ship routine

1. **Read the diff** - PASS. All source (src/, scripts/, tests/) was reviewed
   line by line; the only generated file is the bundled docs/app.js, which
   is built from src/ and drift-checked in CI (the browser-smoke job deletes
   docs/, rebuilds it strictly from source, and fails on any git diff).
2. **gitleaks detect** - PASS. CI job `supply-chain` runs gitleaks 8.24.3
   (sha256-verified binary, full history - the hosted action breaks on
   root-commit ranges). The minified bundle is allowlisted in .gitleaks.toml
   as a build artifact. A manual scan of src/, scripts/, tests/ and
   README.md for key/token/secret-shaped strings found only the English word
   "tokens" in trace descriptions. No keys exist anywhere by design (no
   backends to key).
3. **Dependency audit** - PASS. `npm audit`: 0 vulnerabilities. There are no
   runtime dependencies at all - esbuild and typescript are dev-only; the
   shipped bundle is self-contained. CI reruns npm audit on every push.
4. **Static scan** - PASS. CI job `supply-chain` runs semgrep with the
   repo's own local rules (.github/semgrep-rules.yml, no account) over src/
   and scripts/ on every push. The same risky-sink greps (innerHTML,
   outerHTML, insertAdjacentHTML, document.write, eval, new Function) were
   run locally before publication: zero hits.
5. **Logged-out test** - N/A. There is nothing to log in to. Every byte the
   site serves is public by design; all state is per-tab memory.
6. **MDN Observatory scan** - N/A, verified by hand instead. Observatory
   scans hosts, not paths: scanning aditya2375.github.io returns 404
   because there is no user-level Pages site at the apex. Verified directly
   instead: `curl -sI https://aditya2375.github.io/forensics/` must return
   200 with strict-transport-security (GitHub Pages default for
   *.github.io, curl-verified on the sibling site 2026-11-13); Pages cannot
   send the remaining security headers, so CSP is delivered via <meta>
   (item 17) and confirmed present in the served live HTML after
   publication.
7. **Push public only after checks** - PASS (process). Nothing was pushed
   before this review, check-docs, unit tests (14) and the browser smoke
   test (13 checks) all passed locally.

## Secrets and keys

8. **(1) No secret in code, config, bundle or history** - PASS. The project
   has no secrets to leak. CI runs gitleaks over full git history. GitHub
   secret scanning + push protection enabled on the repo at creation (free
   on public repos).
9. **(2) Keys meant to be public** - N/A. No keys of any kind ship.
10. **(3) Gitignore secrets before first commit** - PASS. .gitignore covers
    .env*, *.keystore, *.jks, local.properties, *service-account*.json,
    node_modules/, dist/ and local scratch (smoke-*.png) since the first
    commit.
11. **(4) Rotate anything that ever leaked** - N/A. Nothing ever existed to
    leak.

## Access control and data

12. **(5) RLS on every table** - N/A. No database.
13. **(6) Storage buckets private by default** - N/A. No buckets; nothing
    persists outside the tab.
14. **(7) Authorization on the server** - N/A. No server, no per-user
    resources.
15. **(8) Collect less** - PASS. The site collects nothing: no analytics, no
    telemetry, no cookies. All three incidents are synthetic fixtures
    written for this demo (fictional tickets, docs and forum posts);
    scanned for email addresses, phone numbers and real names - none
    present.

## Injection and input handling

16. **(9) No untrusted text into innerHTML/eval/DOM HTML** - PASS. The app
    builds all DOM with textContent/createElement only; grep gates in CI
    (semgrep rule no-inner-html) fail on innerHTML, outerHTML,
    insertAdjacentHTML and document.write. The page has no text inputs at
    all - the only interactive data path is clicking buttons - and the CSP
    has no unsafe-inline and no unsafe-eval.
17. **(10) Parameterized queries; no shell strings** - N/A. No SQL, no
    shell execution. The page loads no JSON artifacts at runtime; incident
    data is compiled into the bundle from typed source, and every number
    the page claims is recomputed from source in CI (check-docs).
18. **(11) Validate URLs and file paths** - PASS. The page fetches nothing
    except its own static files; no user input is ever turned into a fetch
    URL (there is no user input).

## Dependencies and supply chain

19. **(12) Every package exists and is the right one** - PASS. Dev
    dependencies are esbuild and typescript only - both long-established,
    verified on npmjs.com before install. package-lock.json pins exact
    versions and integrity hashes.
20. **(13) Commit lockfiles and audit** - PASS. package-lock.json is
    committed; npm audit is clean and runs in CI.
21. **(14) Treat AI config files as code** - PASS. The repo contains no
    AI-assistant instruction files of any kind. No code or README content
    was copied from external repos; everything here is written for this
    project.
22. **(15) Agents never get production access** - N/A. There is no
    production data or environment; the site is static and its content is
    public.

## Config, transport and accounts

23. **(16) HTTPS only** - PASS. Pages serves the site over HTTPS with HSTS
    (curl-verified live after publication); "Enforce HTTPS" is on and
    non-disableable for the default aditya2375.github.io domain. The site
    itself makes no http:// requests (grep-verified).
24. **(17) Security headers** - PASS within Pages' limits. CSP via <meta>:
    default-src 'self'; script-src 'self'; style-src 'self'; font-src
    'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri
    'none'; form-action 'none'. frame-ancestors cannot be set via meta
    (documented Pages limitation).
25. **(18) Debug off, errors quiet, source maps off** - PASS. esbuild runs
    with minify and no sourcemaps; no .map files ship in docs/. There is no
    logging of state (there is no sensitive state).
26. **(19) Login provider, never homemade auth** - N/A. No auth anywhere.
27. **(20) Rate limits and abuse controls** - PASS (client-side). Every
    computation runs locally in the visitor's tab; the minimizer runs are
    bounded (dozens of oracle calls over fixed recorded data). No public
    endpoint exists to abuse.
28. **(21) Fail closed and log the failure** - PASS. A missing asset breaks
    the build (scripts/build-web.mjs verifies every runtime path exists
    before finishing), not the served page; validators return explicit
    fail verdicts with reasons, never silent passes.
29. **(22) Two-factor on accounts** - N/A to this repo's code; account-level
    setting on GitHub is the owner's own checklist item and stays with
    them.

## Static sites, GitHub Pages and Vercel

30. **(23) Everything in the published folder is public** - PASS. docs/
    contains only the built site and self-hosted fonts. Incident content is
    synthetic. Searched for phone, email, address, and personal names:
    none present. Git author identity is the owner's public GitHub noreply
    address only.
31. **(24) No client-side login or hidden admin page** - N/A. No login, no
    admin, no hidden routes.
32. **(25) Vercel secrets** - N/A. Hosted on GitHub Pages, not Vercel; and
    no secrets exist regardless.
33. **(26) Pin or self-host third-party scripts and fonts** - PASS. Zero
    CDN scripts, zero external assets: app.js and the three woff2 fonts
    (Space Grotesk, Instrument Sans, JetBrains Mono, OFL-licensed) are
    self-hosted in docs/. The page works fully offline after first load.
34. **(27) Forms go to a service with spam protection** - N/A. No forms.
35. **(28) Delete old deployments** - N/A to this new repo; owner's standing
    account hygiene item.

## Android apps (items 29-36, 37-39)

36. **(29-39) APK, manifest, keystore, WebView, relay channel, update
    hashes** - N/A. This project ships no Android app and no update
    channel.

## Python tools and the pension monitor (items 40-45)

37. **(40-43) Credentials, read-only monitors, log scrubbing, safe
    parsing** - N/A. No Python, no monitor, no credentials. (Item 44
    applies to this repo's CI and is answered below.)
38. **(44) GitHub Actions least privilege** - PASS. The CI workflow sets
    `permissions: contents: read` at the top level, uses no secrets, and
    pins every third-party action to a full commit SHA.
39. **(45) Alerts to a private channel** - N/A. The project sends no
    alerts.

## Residual risks accepted on purpose

- **Honest-label risk, not security**: the demo replays recorded model
  generations rather than calling a live model. This is stated on the page
  itself ("the model's answers are replayed from the recording... a labeled
  heuristic, not a model") so visitors are never misled about what is live.
- **The injection text in INC-2327 is inert**: the "disregard prior
  instructions" forum post is a synthetic fixture rendered via textContent
  and never executed, eval'd or sent anywhere - it is the subject of the
  demonstration, not a live payload.
- **CI minutes**: the workflow runs on push/PR only; no scheduled runs.
