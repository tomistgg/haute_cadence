# Shared Cloudflare data migration

Status: step 1 prepared locally. No database migration, Worker deployment, or website publication has run.

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

## Remaining steps, one at a time

2. Prepare and validate a local import of the existing player profiles, full name index, calendar, and
   champions. Preserve current career bests and title counts before changing any source. The current
   build derives career bests from historical ranking CSVs; `data/career_bests.json` is not its source.
3. Add bounded Worker collection jobs and shared read/refresh routes. Reuse WTA fetches and completed
   caches across both sites, with server-side cooldowns and safe publication of complete updates.
4. Connect Haute Cadence to saved feeds while preserving manual card edits, uploads, and existing photos.
   Keep the current ITF selectors and curated display names working until their replacement source is
   ready; WTA endpoints alone do not provide an ITF calendar or custom name corrections.
5. Validate local loading, updates, failures, expiry, title deduplication, and card exports. Remove the
   scheduled Python data collection only after the replacement works. Website asset builds remain.
6. After an explicit publication request, apply migrations and seed data, deploy the shared Worker,
   publish the website changes, and verify both live sites.

No Cloudflare dashboard action is needed for step 1. The focused schema check runs locally from the
`wta-tracker` directory with `node --test cloudflare/shared-schema.test.mjs` and uses a temporary D1
database to prove repeatability, valid identities, and preservation of existing entry-list data.
