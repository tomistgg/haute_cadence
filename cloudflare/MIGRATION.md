# Shared Cloudflare data migration

Status: steps 1 through 5 are complete. Step 6 was approved on 2026-11-12. The production schema,
baseline import, and Worker deployment are verified; the dependent website release is in progress.

Haute Cadence and WTA Tracker will use the existing `tennis-wta-api` Worker and the existing
`wta-entry-lists` D1 database. The resource's current name does not limit its contents. Both sites
will read common WTA data from shared tables, with app-specific display formats built from those records.

The shared backend currently lives in the sibling `wta-tracker/cloudflare` directory. Its new additive
`shared-schema.sql` is the single schema source for these tables; Haute Cadence does not create a
second database or maintain a second copy of the backend schema.

## Step 1: shared tables

| Table | Contents | Lifetime |
| --- | --- | --- |
| `wta_players` | One profile per WTA ID, including current/previous rankings, career bests, DOB, country, and aliases. | Persistent player statistics; directory visibility can be filtered separately. |
| `wta_titles` | One singles champion per tournament ID/year, with title details. | Retained for title counts and latest titles. |
| `wta_snapshots` | JSON feeds keyed by kind/scope: calendars, results, draws, ranking dates, player form, and the curated name index. | Explicit expiry for temporary feeds; long-lived feeds can have no expiry. |
| `wta_refresh_state` | Per-feed jobs, progress in job JSON, leases, cooldowns, last success, and errors. | Current coordination state. |

Profile and title payloads preserve the existing field shapes during import. Singles champions can
exist outside the searchable two-year player directory, so title records do not require a matching
current player row. A unique tournament/year prevents repeated final fetches from duplicating titles.
The full curated name index has its own scoped snapshot, including players outside the directory.
`wta_titles` is authoritative for title counts and latest titles. Later player responses will derive
those fields from it rather than keep using title summaries copied into the initial profile import.

`updated_at`, `fetched_at`, and `last_success_at` use UTC ISO timestamps. Expiry, cooldown, and lease
values use Unix milliseconds, matching the existing Worker. The application will validate feed-specific
payloads before writing them; SQL also rejects invalid JSON and duplicate identities.

The existing `entry_list_state`, `entry_ranking_cache`, and `entry_legacy_history` tables remain intact.
This step does not connect the sites to the new tables or change current entry-list refresh behavior.
Later, entry-list collection will reuse shared calendars and date-scoped rankings instead of maintaining
duplicate WTA source feeds. Its four-week view is a selection from the common calendar, not the entire
calendar Haute Cadence needs for its season-wide tournament selectors.

Retiring an entry-list tournament only deletes entry-list data. It must not delete shared career bests,
title statistics, or calendar rows still needed by another view. Result feeds retain the rolling 24-hour
window; current draws and player-form caches will get their own expiry rules when their collectors move.

## Step 2: prepare the existing baseline locally

`cloudflare/prepare_import.py` reuses the site's existing player-building logic instead of creating
a second implementation of career bests or title counts. It reads the historical ranking CSVs,
curated names, saved champion history, and merged calendar without rebuilding or changing `dist`.
Source fingerprints before and after preparation reject a concurrent data change.

Run from the Haute Cadence directory:

```powershell
..\tenis-fem-arg\.venv\Scripts\python.exe -m cloudflare.prepare_import
```

The output is `cloudflare/.local/import-bundle.json`, ignored by Git. Optional `--champions` and
`--calendar` paths select separately staged saved archives; they do not replace tracked data files.
The current trial uses the latest saved `origin/card-data` archives staged under `.local/source`,
while player rankings, names, and live calendar caches come from the existing shared source directory.

Then, from the `wta-tracker` directory:

```powershell
node cloudflare/prepare-shared-import.mjs ../haute_cadence/cloudflare/.local/import-bundle.json .wrangler/shared-import
```

This prepares a parameterized import plan, applies it to a temporary local D1 database, and verifies
the stored profiles, titles, names, calendar, and title summaries. Large name/calendar JSON travels
as bound parameters rather than oversized SQL statements. Generated plans and reports are ignored
by Git. Neither command has a remote deployment or live-import mode.

The completed rehearsal contains 2,179 players from the 2026-11-09 ranking snapshot, 1,800 title
editions, 12,767 player-name IDs, 14,642 aliases, and 870 calendar rows. All profiles and title
records round-trip unchanged, including historical champions outside the current player directory.
Title counts and latest titles also match independent SQL queries. Existing title-coverage notes
and unresolved champion records remain intact. The report is
`wta-tracker/.wrangler/shared-import/verification-report.json`; the parameterized plan sits beside it.
The rehearsal leaves existing entry-list data unchanged and refuses to replace different shared
data or run with existing shared refresh state. The step 2 code remains local for review.

The baseline preserves ranking dates, NR players, historical bests, the full name index, existing title
coverage notes, and the mixed WTA/ITF calendar, including existing cancellation labels and custom rows.
Import preparation time is recorded separately from the ranking snapshot date and saved champion
update time. Current results, draws, and player-form caches will be filled by the collectors in step 3.

## Step 3: shared collection jobs and endpoints

The shared backend has saved-data routes for players, calendar, results, draws, champions, and
individual player form. Each read route has an empty-POST refresh route and returns a saved snapshot
plus progress, error, and shared cooldown state. Results, draws, and champions share one match
collection job. Calendar and ranking caches are also reused by Entry Lists.

Collection resumes in bounded stages with leases and atomic publication of complete updates.
Known career bests and curated names survive ranking updates, while title counts/latest titles are
derived from the authoritative edition records. Current result/draw/form data expires independently
of lifetime statistics. Calendar merging preserves existing ITF and custom rows.

Details and route names are in the sibling backend's `wta-tracker/cloudflare/SHARED_DATA.md`.
The full local baseline was read through the new Worker routes and a mocked 1,557-row ranking update
completed in four bounded steps, preserving profiles, names, career bests, titles, and entry-list data.
The local report is `wta-tracker/.wrangler/shared-backend-rehearsal.json`.
A separate check completed the same collector types against real WTA GET responses, with every
snapshot and job write confined to temporary local D1. Its report is
`wta-tracker/.wrangler/shared-public-source-check.json`. The complete backend regression suite passes.

Haute Cadence's local client now uses these routes as described in step 4. WTA Tracker's existing
entry-list pages retain their own routes while sharing calendar and ranking sources in the backend.

## Step 4: connect the local editor

`shared-data.js` loads saved player, calendar, result, draw, champion, and player-form snapshots.
Refresh sends an empty POST to the corresponding `/refresh` route and follows the saved job's progress.
The Worker validates and saves the completed update before the client displays it. Reloading the page
reads that saved snapshot, so updates survive reloads and are shared with other visitors.

Results, Draw, and Title Refresh controls share the same match job and server-enforced two-minute
cooldown. Progress text appears while updating, followed by the saved update time. Other visitors,
tabs, and reloads observe the same cooldown. Failed updates show the error and retain the last usable
snapshot. Manual scores, form overrides, H2H, uploaded photos, backgrounds, and current selections
remain editable and survive in-tab feed refreshes; those editing drafts still reset on full reload.

The imported name index and ITF/custom calendar rows remain available. WTA collection preserves them;
it does not claim to refresh ITF events. Career bests and historical titles remain lifetime statistics.
The existing Google Drive photo relay and manual portrait uploads are unchanged.

### Open the actual website locally

The local rehearsal uses a temporary D1 database, seeded with the step 2 import plan. The prepared
review-only launcher is ignored by Git and requires that import plan plus the step 3 Worker build.
For this prepared checkout, start it from the `wta-tracker` directory in one terminal:

```powershell
node .wrangler/review-shared-backend.mjs
```

If that backend is already running, leave it running. Its diagnostics are at
<http://127.0.0.1:8787/data/players>; this is JSON, not the card editor. The launcher can read public
WTA responses through the existing relay, but all refresh state and database writes remain local.
Its temporary database is recreated on restart; production D1 persistence does not depend on this launcher.

From the `haute_cadence` directory in a second terminal:

```powershell
python serve_site.py --port 8765
```

Open **<http://127.0.0.1:8765/>** for the actual website. The server builds the editor assets and
proxies `/data/*` to the backend at port 8787. Local photo reads still use the existing photo relay.
An assets-only build can also be prepared with `python build_site.py --shared-data`; it needs no
WTARG data directory or generated players/results/draws JSON. Serving those assets without the
local proxy does not provide the local shared-data API.

## Step 5: validate locally and retire scheduled file generation

Local review covers saved loading and reloads; Refresh progress, persistence, and the shared cooldown;
failed or incomplete updates; rolling result/draw expiry; title deduplication; and PNG exports.
Check Form and both Title layouts, automatic and manual Results/Draw, and Schedule. In-tab refreshes
must preserve manual edits, photo uploads, and selections. Imported names, known career bests,
title totals, and ITF selectors must remain available.

Validation passed: 45 Python tests, all 13 JavaScript checks, Ruff, and real Chrome checks on the
actual editor. A real local refresh saved a newer results timestamp; a full reload read the identical
saved timestamp and retained the cooldown. Manual scores and an uploaded match photo survived both
refresh and simulated network failure. Form edits, Tour/125 title selectors, Drive portraits, and
missing player metadata were checked. Form/Schedule PNGs exported at 2880 by 3600, Tour Result at
3200 by 1800, and quarterfinal Draw at 6400 by 3600. Backend checks also cover expiry and title deduplication.

The prepared Pages workflow now runs only `python build_site.py --shared-data` and deploys `dist`.
It retains push-to-`master` and manual Pages deployment with the existing pinned actions. The local
workflow no longer schedules Python collection, checks out WTARG data, restores saved calendar/title
files, or writes the `card-data` branch. Contents permission is now read-only. Shared collection belongs
to the Worker's existing background trigger and Refresh endpoints; Pages remains the static asset host.

Historical JSON files and CSV-based import utilities remain available for baseline preparation.
The shared-data client and assets-only build do not depend on their ongoing updates. These edits
were kept local during review; step 6 publishes the workflow and website together.

## Step 6: approved publication

6. After an explicit publication request, apply the shared schema and approved baseline, deploy the
   shared Worker, publish the website and workflow changes, and verify both live sites. The Worker
   and baseline must be ready before publishing a website that depends on the new shared routes.

The schema and approved baseline were imported on 2026-11-12, preserving the entry-list tables.
All imported records and title statistics round-trip correctly. Shared Worker version
`9f96cd79-e5e7-4727-8b6b-2ee653f980df` is deployed with the existing D1 binding, photo secrets,
and one-minute trigger. Live calendar, results, and player-form refreshes saved successfully;
saved player/champion feeds, all four active entry lists, and the 126-photo index were checked.

No Cloudflare dashboard action is needed for step 1. The focused schema check runs locally from the
`wta-tracker` directory with `node --test cloudflare/shared-schema.test.mjs` and uses a temporary D1
database to prove repeatability, valid identities, and preservation of existing entry-list data.
The import builder derives career bests from historical ranking CSVs; `data/career_bests.json` is not
its source and is not substituted for those statistics during preparation. The assets-only website
build does not recompute those statistics.
