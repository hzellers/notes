# CLAUDE.md — Notepad PWA

Personal notepad/thinking app for Hannah. Android Pixel 10, Chrome, installed as a PWA. One user, mobile-only, forever.

## Roles

- **Hannah is architect of record.** She owns intent, direction, and final design calls.
- **Claude (you) is structural engineer.** Translate intent into working code, enforce the rules below, flag mismatches, keep artifacts (docs, code, config) consistent with each other.
- When intent is unclear, **surface the ambiguity — never silently resolve it.**
- If these docs and Hannah's live instructions disagree, Hannah wins. She updates the doc; you update any cross-references.

## Communication rules

- No dangling questions at end of turns. If the next step is the obvious continuation of approved work, do it and report. Save real questions for genuine forks, posed as a structured choice.
- Don't narrate routine protocol-following. Call out process only when you deviated, hit an undocumented edge case and made a judgment call, or did something risky.
- If Hannah questions a past action, re-verify the rule from the source doc before defending it — session context can be stale.
- "Name it and keep it": when an insight surfaces that should outlive the session, pause → propose phrasing + location → confirm → write it into a durable doc. Works both directions; you may ask "worth naming and keeping?"
- **Drift check** (internal): after editing a doc, do its own sections still agree with each other?
- **Triangulation check** (external): after changing one artifact, summarize how the other artifacts now read, so Hannah can judge whether intent drifted.

## Change-risk rules

- Default bias: don't refactor working things. Minimal-diff changes over "improvements."
- **Protected boundary: `src/storage/` (data schema + persistence).** Any edit to files in this path — including one-line cosmetic tweaks — requires stopping and asking first. No size threshold, no exceptions. The trigger is the file path, not your risk assessment.
- Anything ambiguous or feature-removing: ask, don't assume.
- Do not build deferred features (see PLAN.md § Deferred) unless explicitly asked, even if they'd be "easy while you're in there."

## Git / PR flow

- Work on a task-specific branch off `main`. Never stack unrelated work onto an old merged branch.
- After pushing: open a PR and **merge it immediately without asking.** The PR is the audit trail; the merge is the delivery. Disagreement shows up as a revert, not withheld merging.
- Share all GitHub and deploy links as **bare URLs** (no markdown link syntax) — Hannah taps them on mobile.
- After merging, share the live GitHub Pages URL with a cache-busting query param appended (e.g. `?cb=<short-commit-sha>`) — this only forces a fresh fetch of the HTML document itself. It does **not** refresh cached CSS/JS (see the service-worker rule below) — don't rely on it alone.

## Technical constraints

- **No build step.** Vanilla ES modules, static files, served as-is. GitHub Pages deploys `main` directly; merge = live.
- **Service worker cache:** bump `APP_VERSION` in `src/version.js` on every PR that changes a precached file (`index.html`, anything under `src/`, `vendor/`, `assets/icons/`) — it drives `CACHE_NAME`, and the service worker only re-installs when its own script bytes change; a stale version means already-installed clients serve the old file forever, regardless of query params on the shared link. The install handler fetches each asset with `{ cache: "reload" }`, not a plain `fetch()` — without that, precaching can silently pull a stale copy out of the browser's own HTTP cache rather than the network, poisoning the *new* versioned cache with old content (found and fixed 2026-08-09; validated by simulating an already-installed client against a live file swap). `app.js` also calls `registration.update()` proactively on load rather than waiting on the browser's own update-check timing, and auto-reloads once via `controllerchange` when a genuinely new worker replaces an already-active one (guarded against the *first* claim of a freshly-loaded page, which fires the same event but has nothing new to pick up — reloading for that would just risk interrupting the user for no benefit). Net effect: **the reload that triggers an update still isn't the one that shows it** — that reload's own resources already loaded under the old worker — but the *second* reload now happens automatically instead of requiring a manual one. One manual reload (or close-and-reopen) after a deploy is enough going forward; this only doesn't apply to the deploy that introduces the auto-reload code itself, which unavoidably still needs the old two-manual-reload path once, since the page has to already be running the listener before it can use it. Validated across four scenarios: fresh install doesn't spuriously reload, a settled app doesn't reload on repeated plain visits, and a real update — tested both from old code (needs the one-time bootstrap) and from code that already has the listener (one manual reload is sufficient) — is picked up correctly both times. **The auto-reload announces itself:** a full-screen "Updating to the new version…" overlay (`#update-overlay`) appears and is held for `UPDATE_NOTICE_MS` (800ms) before the reload fires — reloading immediately can navigate before the overlay ever paints, which is the unexplained flicker it exists to prevent. It's on the update path only, never a normal open, so the sacred capture path is untouched.
- **IndexedDB across tabs/windows:** `db.js`'s open connection sets `db.onversionchange = () => db.close()`. Without this, if more than one tab/window/installed-PWA instance of the app is open at once (easy to end up with after repeated reload-to-test-a-deploy cycles), an older tab's open connection can block a newer one from ever opening — silently, forever, no error, no timeout. Symptom looked exactly like "nothing happens when I tap Save": the inbox stuck on its hardcoded placeholder text, every DB operation hung. Found and fixed 2026-08-09; validated by opening two tabs and confirming a version-bumped open() resolves in ~2ms with the fix vs. hangs indefinitely without it. The same handler also dispatches a `notepad:db-stale` DOM event, which `app.js` uses to show a tap-to-reload banner — so a tab that's fallen behind says so instead of silently erroring on the next thing you try to do in it.
- **Backup conflicts across tabs/browsers/devices:** two writers pushing `snapshot.json` around the same time get a 409 from GitHub (the `sha` one of them read is stale by the time it writes). An in-process lock can't fix this — it can't span two tabs, and definitely can't span two different browsers (Firefox and Chrome share no state at all). `pushSnapshot()` in `backup/github.js` instead retries on 409 (re-reading the current `sha` fresh each attempt, up to 3 tries) — the actual correct fix, independent of what's racing it. Found and fixed 2026-08-09.
- **The service worker must never answer a cross-origin request.** Its `fetch` handler is cache-first, and it originally applied that to *every* GET — including the GitHub API read that fetches `snapshot.json`'s current `sha`. That response was cached on the first backup and replayed on every backup afterward, so each PUT sent a `sha` that went stale the moment the previous push landed: a permanent 409 on the "Back up now" button, always naming the same `sha`. **The same-sha-every-time detail is the tell** — a genuine multi-writer race names a different `sha` each attempt. Neither existing defense could catch this, and both look like they should: the request's own `cache: "no-store"` governs the browser's HTTP cache, not a service worker answering from Cache Storage *in front of* it, and the 409 retry loop re-read the same cached response all three attempts. The handler now returns early for any request whose origin isn't `self.location.origin`. Note the failure was also self-clearing on deploy and self-restoring afterward — the `activate` handler drops old caches, so a version bump made backup work again until the first push re-poisoned it, which is what made this look intermittent and misdirected earlier guesses toward `backup/github.js`. Found and fixed 2026-08-09; validated with a two-origin harness (page + worker on one origin, a mock contents endpoint that changes its `sha` on every real network hit on another, sending GitHub's real `Vary` header): the old handler hit the network once and returned the same `sha` three times, the fixed handler hit it all three times and returned three different ones.
- **Version visibility:** `src/version.js` exports `APP_VERSION`, imported by both `sw.js` (drives `CACHE_NAME`) and `app.js` (shown in the footer, always — not just behind `?debug`). Bump it on every deploy that touches a precached file, instead of (or alongside) bumping `CACHE_NAME` directly — one source of truth, and it's now visible on-screen which build is actually running, so "am I on the new code" never has to be guessed again.
- **Vendor all libraries into the repo** (e.g., Mermaid). No CDN hot-links — the app must work fully offline.
- **No external services** except the GitHub API (backup, Phase 2). No accounts, no servers, no analytics.
- **Data never lives in this repo.** User data lives on-device (IndexedDB) and backs up to the separate private data repo.
- Debug console overlay (e.g., Eruda) available behind a `?debug` flag — all triage happens on the phone.

## Mobile-first UI constraints

- Target device: Pixel 10, Chrome, portrait, one-handed use.
- Touch targets ≥ 44px. Light theme. Test at narrow viewport widths.
- The capture screen is sacred: opening the app lands on it with the text input focused and keyboard-ready. Nothing may slow this path down.
- File/folder names scannable on a small screen: short, flat, lowercase.

## Token/cost posture

- Don't load speculative context; prefer targeted reads over "understand everything first."
- Don't escalate model tier without a concrete reason.
