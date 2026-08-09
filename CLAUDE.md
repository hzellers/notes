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
- **Service worker cache:** bump `CACHE_NAME` in `sw.js` on every PR that changes a precached file (`index.html`, anything under `src/`, `vendor/`, `assets/icons/`) — the service worker only re-installs when its own script bytes change; a stale `CACHE_NAME` means already-installed clients serve the old file forever, regardless of query params on the shared link. The install handler fetches each asset with `{ cache: "reload" }`, not a plain `fetch()` — without that, precaching can silently pull a stale copy out of the browser's own HTTP cache rather than the network, poisoning the *new* versioned cache with old content (found and fixed 2026-08-09; validated by simulating an already-installed client against a live file swap). `app.js` also calls `registration.update()` proactively on load rather than waiting on the browser's own update-check timing. Even with all of this, **the reload that triggers the update isn't the one that shows it** — that reload's own resources already loaded under the old worker. Expect to reload (or fully close and reopen the PWA) twice after a deploy before a change is visible; this is a structural property of the service worker lifecycle, not a bug to keep chasing.
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
