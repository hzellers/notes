# PLAN.md — Notepad PWA

Concept decisions were made deliberately, in sequence, before this plan. Do not re-litigate them inside a build task; if implementation reveals a genuine conflict with a decision, stop and flag it.

## Concept decisions (settled)

1. **Scope:** capture inbox is the spine; thinking canvas is layered on. Capture speed and trustworthy retrieval outrank everything else.
2. **Interaction model:** two-phase. Messy capture (text or finger-ink), then a deliberate **formalize** step later. The original sketch stays attached to the formalized artifact.
3. **Platform:** installable PWA. Static, offline-capable, deploys on merge. (Capacitor wrapper is a possible future retrofit if native notifications/widgets ever become core — out of scope now.)
4. **Formalize mechanics:** Mermaid text-to-diagram for flow charts; manual promote flow (no AI interpretation); hybrid table editing — text source rendered as a table, tap-to-jump added later.
5. **Retrieval:** recognition over recall. Inbox-as-queue, recency list with sketch thumbnails, full-text search across everything, pinned workbench. No feature may let an item silently disappear.
6. **Backup:** auto-push JSON snapshots to a separate **private** GitHub data repo via a fine-grained token; visible "last backed up" indicator that goes loud when stale; manual export/import as backstop.

## Architecture

- Static site, vanilla ES modules, **no build step**. Repo root is the deployed site (GitHub Pages from `main`).
- Storage: IndexedDB, with `navigator.storage.persist()` requested on first run (surface the result in settings).
- Libraries vendored into `/vendor/` (Mermaid; Eruda for `?debug`). Nothing loaded from CDNs.
- Two-repo layout: this repo = code (public, Pages); `<name>-data` repo = private, receives backup snapshots only.

## Data model (v1)

Single `items` store:

```
{
  id, createdAt, updatedAt,
  kind: "capture" | "note" | "table" | "diagram",
  title,            // short text, always searchable
  body,             // text notes; table source text; mermaid source
  ink,              // sketch data (strokes or PNG blob), nullable
  sketchOf,         // on formalized items: id of the originating capture's ink
  pinned: bool, pinnedAt,
  archived: bool
}
```

Promote = create the formalized item, attach the sketch, archive the capture. Nothing is deleted by promotion.

Schema lives in `src/storage/` — protected path, see CLAUDE.md.

## Phases

One phase = one or a few PRs. Branch → PR → merge immediately. Each phase ends with a report containing the live URL (bare) and the acceptance checklist below, verified.

### Phase 0 — Scaffold & deploy loop
Prove the iteration loop before building features.
- App shell: manifest, service worker (offline-capable shell), light theme, placeholder capture screen.
- Eruda behind `?debug`.
- Commit structure: `index.html`, `src/`, `vendor/`, `assets/`.
- **Accept when:** Hannah merges a PR from her phone, refreshes, sees the change live; installs to home screen; airplane-mode relaunch still loads; `?debug` shows the console.

### Phase 1 — Capture spine
- Open app → capture screen, text input **focused, keyboard up**. Save on one tap; input clears for the next thought.
- Ink capture: full-width canvas, finger drawing, save as a capture.
- Inbox list: unprocessed captures, newest first, sketch thumbnails, visible count. Archive and delete per item.
- IndexedDB persistence + `persist()` request.
- **Accept when:** thought → saved in under ~3 seconds from home-screen tap; a finger sketch round-trips to a thumbnail; force-closing the app loses nothing.

### Phase 2 — Backup (before the corpus grows)
- Settings: paste fine-grained PAT + data-repo name (stored locally only), plus the token's expiry date. The app surfaces a "renew token soon" warning ahead of expiry — renewal must be app-prompted, never memory-dependent.
- Auto-push: debounced JSON snapshot committed to the data repo after changes.
- Header indicator: "backed up Xm ago" → loud/red state when stale or failing.
- Manual export (JSON via share sheet) and import/restore, including first-run restore on a fresh device.
- **Accept when:** Hannah makes an edit, sees the indicator go green, sees the commit in the data repo; deletes site data in Chrome, restores from backup, everything is back.

### Phase 3 — Formalize
- Promote flow on any capture: choose note / table / diagram → editor with the original sketch collapsible above.
- Table editor: text source (one row per line, comma-separated) live-rendered as a table. No tap-to-jump yet.
- Diagram editor: Mermaid source live-rendered. Render errors shown inline, never a blank panel.
- Promoting archives the capture (inbox drains); artifact appears in the everything list.
- **Accept when:** a messy sketch becomes a real table with its sketch attached; inbox count went down by one; the table's cells are findable via search (Phase 4 pre-check: cell text is stored searchable now).

### Phase 4 — Retrieval
- Everything list: all non-archived items, recency-ordered, thumbnails.
- Full-text search: titles, note bodies, table cells, Mermaid source. Results tappable.
- Pinned workbench: star any item → small section at top of everything list, showing "pinned N days ago"; one-tap unpin.
- **Accept when:** a word typed weeks ago inside a table cell is findable in under 5 seconds; the workbench shows current work and nothing stale-by-default.

## Deferred (do not build unless asked)

- Tap-a-cell-to-jump table editing layer
- Tags
- Snooze / Today view — and only ever in float-up form (overdue items surface loudly on next open; nothing time-based may fail silently)
- Capacitor wrapper, widgets, notifications
- Any AI/interpretation features
