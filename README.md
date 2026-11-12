# Haute Cadence player cards

A static player card editor using shared WTA data saved in Cloudflare D1 by the existing `tennis-wta-api` Worker.
The shared database and Worker are deployed; the website is published through the assets-only Pages workflow.

The **Instagram Result** card uses the shared last-24-hours WTA match picker and exports a 2160×3840 PNG from its 1080×1920 design.

The **Multiple Results Screenshot** card exports four matches as a 3200×1800 PNG from its 1600×900 two-by-two layout using the Tour Result
artwork. Choose each match with its own selector from the same last-24-hours Tour feed, then click each empty photo
to upload it. Photos and selections remain independent; hover or focus its Change photo button to replace an upload.
The shared round and tournament header follows the first selected match. Use Background to change the surface around
and between the photos. The completed PNG includes that background and excludes upload buttons.

Tour Result uses `assets/wtatour_result/2 sets match frame.png` and
`3 sets match frame.png` for their scoreboards, with a matching green photo outline. The opaque white photo area
in these PNGs is cropped out so uploaded match photos remain visible. Names, flags, rankings, and set scores follow
the new boxes. Multiple Results Screenshot uses the separate `match result 2 sets.png` and
`match result 3 sets.png` scoreboard artwork.

The **Multiple Results Photo** card offers 4-match and 5-match buttons with independent Tour match selectors and a
1440×1800 portrait layout. The five-match version scales the rows to fit; switching back to four retains the fifth selection.
Each row has a colour winner portrait, a grayscale opponent portrait, their names, and vertical set scores using the
existing scoreboard PNGs. Player photos load from the shared photo collection; click a missing photo or use Change photo
to upload one. Its selections and portrait uploads are separate from Multiple Results Screenshot. Background changes
and full-size PNG export use the same controls as the other cards.
It combines the existing round and scoreboard artwork with a tournament badge and one large winner portrait.
Winner-photo uploads, background selection, scores, rankings, set highlighting, and tiebreaks use the existing result workflow.
Manual two- and three-set matches have their own saved drafts within the current tab.

## Run locally

Start the prepared local shared backend on <http://127.0.0.1:8787/> first, then run from this folder:

```powershell
python serve_site.py --port 8765
```

Then open <http://127.0.0.1:8765/> to use the actual card editor. The server builds the static assets and proxies
`/data/*` reads and refreshes to the local backend on port 8787. Its database writes stay local. A different local
backend can be selected with `--shared-backend http://127.0.0.1:8787`. See
[the migration guide](cloudflare/MIGRATION.md) for the baseline and backend preparation.
The existing photo library still uses the Worker's read-only photo relay.

For an assets-only build, run `python build_site.py --shared-data`. This build needs no ranking CSVs or saved
results/draws JSON. Hosted pages read the shared Worker directly; local previews use the proxy above.
Opening the root HTML or serving `dist` without this proxy does not provide the local shared backend.

Player, calendar, result, draw, champion, and form feeds come from saved shared snapshots. Clicking Refresh asks
the Worker to fetch WTA data, validate it, and save the completed update before displaying it. The saved update
survives a page reload and is shared with other visitors. Progress and completion text appear beside Refresh.
Results, Draw, and Title Refresh buttons share one server-enforced two-minute cooldown across browsers and reloads.
An unsuccessful update retains the last usable saved feed and shows the error; incomplete jobs display their progress.

Tournament selectors use the merged shared calendar. WTA dates, categories, cities, cancellations, and new events
are collected by the Worker. The imported ITF calendar and custom rows remain available, but WTA refreshes do not
update those ITF records. Lifetime title history, curated names, and known career bests are retained separately
from expiring recent results, active draws, and player-form caches.

All player searches include anyone ranked within two calendar years of the latest ranking snapshot. Players absent
from the latest week show NR; their old ranking is retained only as `last_rank` / `last_rank_date` in the data.
Current rank, career-best rank, and last recorded rank remain separate. Country flags cover the expanded list.

All card images use the shared curated player display names imported from `player_aliases_wta_itf.json`, matched by WTA ID, including
additional WTA IDs. For example, Maaya Rajeshwaran Revathi is shown as Maaya Rajeshwaran. Records with a separate
`presentation_name` use that visible label instead of an internal disambiguation suffix. Both WTA and ITF names,
display names, and aliases remain searchable. The original ranking and match names and IDs remain unchanged.
The complete name index also covers live match players outside the two-year ranking list. Name-only fallback is
used only for unambiguous aliases. Explicit custom names in manual cards take precedence over the shared label.
Portrait uploads remain attached to player IDs, and saved portraits can still match the original name or aliases.
Player portraits also load automatically from the Google Drive photo folder through the existing Cloudflare Worker.
Name files by WTA ID (`330332.png`) or full player name (`leylah_fernandez.png`); JPG, PNG and WebP are supported.
ID matches take priority, followed by player names and aliases, then the bundled portraits or initials.
Manual uploads keep priority when the library updates. Only portrait images are changed, preserving card edits;
the Tour Result match-background photo remains separate. Drive images are included in PNG exports.
The library checks on page load and every five minutes, including when a stale tab regains focus.
Local previews use the server's `/photos` relay; hosted pages contact the Worker directly.
With the Worker's five-minute cache, folder changes can take up to ten minutes in an open tab.
Google credentials stay in the Worker's secrets. Deployment and folder-sharing instructions are in
`../wta-tracker/cloudflare/SETUP.md`. Check the client with `node tests/test_player_photos.js`.
Ranking refreshes preserve these curated names and aliases in the shared database.
Long player names reduce their font size to fit their space while keeping the letters' natural proportions. This
also applies to both Result Card layouts and WTA 125 draw names; shorter names retain their normal font size.
Long tournament names also reduce their font size to fit, preserving the letters' natural proportions.

Draw lists current WTA tournaments (including WTA 125) and FINALE, DEMI-FINALES, and QUARTS DE FINALE.
WTA Tour, Grand Slam, and WTA 125 draws all use the same two, four, or eight Form cards with each player's
ranking/prospect artwork. Draw frames, brackets, placeholders,
VS graphics, and round banners use the supplied PNGs in `assets/draws/`. Player panels follow the positions and angles
of those placeholders; unresolved opponents retain the PNG's image placeholder. Players fill automatically from the official
singles bracket. Click a portrait to upload its photo. Click the ten form results on a
card, or use Player form for larger controls, to cycle blank, win, loss from oldest to newest. Form edits share the
same per-player draft as the main Form card. Final H2H values are edited inside the supplied image's H2H frame.
Photos, form, H2H, background choice, and selected round are included in the saved PNG. Uploads and edits reset
on reload. Draws use the templates' native design sizes: finals 1600 × 900, semifinals 1880 × 1576, and
quarterfinals 3200 × 1800. All categories use the same supplied layout artwork and editable final H2H frame.
The quarterfinal preview uses the full available page width (up to 1120px) so all eight player cards are easier to read.
The tournament box leaves a small background gap above it; overlapping player cards appear in front of the box.

Choose Draw, then MANUAL at the bottom of its tournament selector to build a draw without the WTA feed. Choose FINALE (2 players),
DEMI-FINALES (4), or QUARTS DE FINALE (8), then click the round header or tournament name on the image to type.
Click the category to choose from the same ten categories as manual Result Cards. All categories share one draw design.
Click an empty player space, portrait,
or player name to search the full two-year directory or use custom names, rankings and flags. For a selected player,
click the portrait and choose Upload portrait in the dialog. The Player form editor, backgrounds, and final H2H editing
work as in Draw. Each layout keeps its own manual draft until reload; automatic draw updates do not change it.

Choose Schedule to make a four- or five-match image. Choose a court background, then click the round banner to select
the round or the tournament heading to search the current WTA Calendar. Click either player slot in a match to select
a player; their photo, ranking frame, ranking, and name load automatically. Click each time/court line to edit it.
Round banners, rank frames, and match layouts come from `assets/schedule/`; the completed image is included in PNG export.

The shared Worker saves current tournaments and their singles brackets. Its matches endpoint is requested
without a completed-only filter, and `LS` match numbers preserve bracket
positions even when the feed gives a scheduled match an unreliable round label. Missing parent slots are filled
only from confirmed winners of their direct child matches. Doubles, qualifying, and round-robin results never
advance into the knockout bracket. Failed updates preserve the last usable bracket. The Worker refreshes match
feeds in the background; the page checks for updates every five minutes while used. Result Card and Draw use the
same saved match collection, independently of WTARG. Confirmed main-draw singles finals update shared title records
using the same match response. Recently ended events without a saved champion are checked too. Titles are keyed by
tournament ID and season, so refreshes do not increase title counts twice. Title counts and DERNIER TITRE use those records.

Non-Tour Result Card lists completed WTA singles matches from the rolling last 24 hours, including WTA 125 and qualifying.
Select a match to load its round artwork, tournament heading, flags, current ranking snapshot, names, and set scores.
The supplied result layers in `assets/results cards/` are composed at 1440 × 1600, following `preview.png`.
Non-Tour round headers use the supplied PNGs in `assets/match_types/`, including all three qualifying rounds.
Their transparent padding is cropped in the browser; the original assets are copied unchanged.
Winner names are yellow; opponent names are white; the higher score in each set is yellow.
Result cards use #ffd400 for winner highlights, Chunk Five for names, Poppins Bold Italic for scores,
and TT Bluescreens Italic for player rankings. Poppins is bundled from
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/poppins), with its OFL license in `assets/fonts/Poppins/`.
Existing portraits are reused, and the winner/opponent upload controls let you supply missing photos.
Uploads stay in the current tab, are remembered per player, and are included in the saved PNG. Reloading clears uploads.
Players without a portrait show initials; players absent from the ranking snapshot show NR.

Non-Tour Result Card also includes ITF MATCH 2 SETS and ITF MATCH 3 SETS at the bottom of the match selector.
Click the tournament name or a score on the card to edit it directly; click the category to select GRAND SLAM,
WTA 1000, WTA 500, WTA 250, WTA 125, W100, W75, W50, W35, or W15. Click a player name to search and
select from the two-year player list. Flags, current rankings, and saved portraits load with that selection.
The player dialog also lets you override the name, ranking, and flag using Use these details, just like the Tour
manual match. Ranking/flag edits keep the player's uploaded portrait.
Click the ITF MATCH heading to choose the first, second, or third round, quarterfinals, semifinals, final, or qualifying round.
The heading uses that round's supplied artwork and stays clickable to change the round again.
Each ITF option keeps a separate draft in the current tab. Player rows stay in place, and a player becomes yellow
after winning two completed sets; incomplete or tied scores do not declare a winner. The winner's portrait moves
to the large frame. The photo upload controls correspond to Player 1 and Player 2 in manual ITF mode.
These drafts and uploaded photos clear on reload. ITF editing is available even if the live WTA feed is unavailable.
For ITF MATCH 2 SETS and ITF MATCH 3 SETS, click the tournament name in the image to choose an ITF event from
the current Monday–Sunday week (Europe/Madrid). The list uses the preserved ITF rows in the shared calendar;
choosing an event fills its city and category automatically. The Tour Result Card's MANUAL MATCH uses the same
picker for current-week WTA Tour events, Finals and senior Grand Slams, including their explicitly dated qualifying weeks.
Grand Slams retain their standard tournament names when selected during qualifying; WTA 125 and ITF events are excluded.

Tour Result Card uses a separate 1600 × 900 landscape layout and the supplied PNGs in `assets/wtatour_result/`.
Its match list includes only WTA Tour categories (including Grand Slams and Finals) from the last 24 hours, excluding
WTA 125. Upload a single Match photo to fill the background; each match keeps its own uploaded photo in this tab.
The round badge sits at the top, tournament and category at the top right, and scoreboard at the bottom left.
There is no surface-background picker or automatic player portrait in this layout.
The final MANUAL MATCH option lets you choose a round, tournament and category, select players or enter their names,
rankings and flags in the player dialog, and edit scores. A Sets selector switches between two and three sets;
switching back restores a previously entered third set. The missing third-round badge uses the supplied first-round
banner with a live third-round label. All manual edits and the uploaded match photo are included in PNG export.

The shared results feed uses the official WTA completed-match endpoint. The official match start timestamp plus
duration defines the finish time; LastUpdated is the fallback when duration is unavailable. Walkovers are excluded;
retirements/defaults with played sets are marked. Cached matches outside the last 24 hours never appear.
If WTA is unavailable, the last successful feed is retained and the page reports the refresh failure.
The browser reads `/data/results` and `/data/draws`; Refresh uses their empty-POST `/refresh` routes.
Collection and transformation run in the Worker, and complete snapshots publish atomically to D1. The public
endpoint remains `https://tennis-wta-api.schiter-tomas.workers.dev`. This replaces browser WTA collection and
scheduled Python feed generation. Background Worker jobs keep shared data fresh independently of Pages builds.
Selections, manual scores, form edits, H2H values, uploaded photos, and backgrounds survive in-tab data refreshes.
These editing drafts still reset on full page reload; the shared WTA data remains saved.

Use the selector next to player search to switch between Player Form Card, WTA 125 Title Card, and WTA Tour Title Card. The selected player is preserved when changing card types. The layouts follow the three references in `examples/` using supplied PNG layers and CSS. Title cards layer `assets/details/wta125_title_details.png` or `assets/details/wtatour_title_details.png` over the complete card; the Tour overlay includes its trophy and laurels. No AI image generation is used.

Rank, age, and country come from the shared player snapshot. Rank 1 uses `top_1`, ranks 2-10 use `top_10`,
ranks 11-20 use `top_20`, ranks 21-100 use `top_100`, ranks 101-200 use `top_200`, ranks 201-300 use `top_300`,
ranks 301-400 use `top_400`, ranks 401-500 use `top_500`, and ranks 501-600 use `top_600`. Ranks above 600 use
the existing `top_300` fallback. The `top_400`, `top_500`, and `top_600` tiers all use `top_200_details.png`.
Players aged 19 or younger outside the top 10 use `prospect_card.png` and `prospect_details.png` instead of their
rank tier. Ranks 1-10 retain their existing artwork at any age. Age is calculated on the ranking snapshot date,
matching the age printed on the card. These tiers apply to all three card types. The `top_300` tier temporarily
uses the beige `top_200_details.png` overlay; adding `assets/details/top_300_details.png` and rebuilding switches
to that file automatically.

Title cards search eligible tournaments in the current calendar year/season using the shared calendar.
Search matches city, tournament name, category, country, or start date. All matches appear in a scrollable list,
with keyboard navigation and dates to distinguish repeat events in the same city. WTA 125 Title Cards list only
WTA 125 events. WTA Tour Title Cards list WTA 250, 500, 1000, WTA Finals, and Grand Slams; BJKC and junior events
are excluded. The WTA Tour Title Card displays each player's recorded WTA Tour singles title count, including
Grand Slams and historical Tour categories, while excluding WTA 125 titles. Changing card type clears an
incompatible tournament selection. Selecting a result updates the tournament city, category, and heading color.
Selecting a title layout previews its design without asserting that the player won a tournament.

The Form card's DERNIER TITRE comes from shared title records, matching the player's WTA ID and preferring
the latest WTA Tour, Grand Slam, or United Cup title over WTA 125; when there is no higher-level title, it uses
the latest WTA 125 title. It displays category, tournament city/name, and season year with the existing
tournament-name overrides. Players with no recorded title show W/O. This automatic field is included in PNG export.

Form cards pre-fill ten results from shared WTA singles history and completed matches in this week's draws
(including qualifying), ordered oldest to newest. Only results within the past year are used; unused boxes
remain blank on the left. The Worker paginates and sorts history, replacing matches from the same current-week
tournament to avoid duplicates. Click a box to cycle blank -> win (green V) -> loss (red lowercase d).
Each edited box stays as you set it, including when a request finishes or data refreshes. The same pre-fill and
per-player manual draft apply inside Draw layouts. Local previews use the local backend; hosted pages use the
shared Worker. Failed requests leave existing results editable. Manual form results survive player/card-type
changes in the same tab; reloading resets them. Desktop player cards are capped at 600px wide.

Portraits are supplied for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Alina Charaeva's portrait is cropped from the provided form-card reference. Other players show initials.

The title layouts, Non-Tour Result Card, and Draw have a Background button above the preview. Choose a thumbnail from
`assets/surfaces/`, or Original to restore that layout's original background. Each layout remembers its selection
until reload, and the selected background is included in the saved PNG. Rebuild after adding PNGs to that folder
to include them in the picker. Tournament, match, photo, and background controls share the preview's width and
stack on smaller screens.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.

The shared database stores champion history, calendar, player profiles, and current feeds. The initial import derives
career-best ranks from all four historical ranking CSVs (1983 onward), then ranking refreshes preserve known bests.
The caption year is the most recent year the player held that exact career-best position, including later returns
to the same rank. Newly discovered players can have an unknown career best; their current rank is not invented
as a historical best. The CSV-based builder and `data/` archives remain migration inputs, rather than runtime
data sources. The shared-data site build copies only the editor assets.

The initial calendar archive preserves the previously saved 2026 season, including October 26 and November 2.
Shared WTA collection overlays current and following seasons while preserving other calendar records.
BJKC, Grand Slams, Finals, WTA 1000/500/250/125, and Grand Slam
Juniors use their specified heading colors. City headings use the bundled Bebas Neue font from
https://github.com/google/fonts/tree/main/ofl/bebasneue, with its OFL license included.

Form cards use locally bundled circular country flags, with the player's three-letter country code followed by a dot beside the flag. Flag SVGs are from https://github.com/lipis/flag-icons; their MIT license is included in `assets/flags/LICENSE`. The current ranking countries are covered, including IOC-code aliases. The browser makes no external flag requests. Tournament cities use Bebas Neue; categories use the locally bundled [Chunk Five from The League of Moveable Type](https://github.com/theleagueof/chunk), with its OFL license included in `assets/fonts/Chunk_Five/`. The career-best number has a black outline, a separated ordinal, and a smaller TT Bluescreens year caption.

The 2026 calendar was completed from the official WTA tournaments API for January 1 through December 31 (both API pages), with cancelled tournaments excluded. Search uses each event's season year, so December warm-up events for the following season do not appear in the wrong year. Qualifying rows are not listed as separate title events.

Tournament display-name overrides apply to search results and card headings, including French city names, Queen's, Open d'Australie, and WTA Finals. Repeat WTA 125 events in the same city are numbered in calendar date order within each year, such as Antalya 1–4 and Oeiras 1–4. Searches also match the original city and tournament name. Grand Slam overrides are scoped by category, so the WTA 125 in Paris keeps its city label.

## GitHub Pages

GitHub Pages must publish the generated `dist/` directory. The repository-root HTML is the source template and refers to files that exist only in the build output.

The prepared `Deploy GitHub Pages` workflow runs `python build_site.py --shared-data` and deploys `dist/` after
pushes to `master`, or when run manually from Actions. In repository Settings > Pages, the publishing source is
**GitHub Actions**. It only builds website assets: there is no scheduled collection, WTARG checkout, saved-feed
restoration, or `card-data` branch write. Repository contents permission is read-only; Pages deployment permissions
remain. Data updates belong to the shared Worker and D1. This workflow change is local until explicitly published;
no live schedule or deployment has been changed during review.

Right-click the card photo on desktop and choose **Save image as** to save the complete PNG, including all artwork, text and manual edits. All cards export at twice their design width and height for sharper text, outlines, and flags. Player/title exports are 2880 x 3600, Non-Tour results 2880 x 3200, and Tour results 3200 x 1800. Layout and font proportions stay the same. The combined image refreshes automatically after edits; wait briefly for it to finish before saving. Export uses the locally bundled MIT-licensed html-to-image 1.11.13 library in `assets/vendor/`, with no CDN requests at runtime. Photo detail still depends on the resolution and quality of the uploaded source.

On a phone, touch and hold the player photo and choose the browser's Save Image / Save to Photos action to save the complete PNG. The saveable image permits native touch callouts; the editing controls remain interactive. Wait briefly after making edits for the combined PNG to refresh.

Each layout uses a fixed design surface. The responsive preview scales that entire surface as a unit, so text sizes, positions, outlines and spacing keep their proportions at every viewport width. Browser text auto-enlargement is disabled inside the card. The saveable PNG is rendered from the same design surface at 2× pixel density, independently of preview width or device pixel density. Search menus stay sized for readable interaction outside the artwork's typography.

Responsive checks compared six representative cards (Form with history, Form at career best, both title layouts, prospect, and rank 1) at widths 280, 320, 360, 390, 414, 600, 768, 1024, 1440, and 2560 with pixel densities 1-3. Every card kept matching normalized text bounds and generated byte-identical PNGs across the tested viewports in Chrome. Physical-phone browser rendering has not been verified.

The career-best caption uses the Form card's exact font size, line height, kerning, word spacing, letter spacing, and padding in every layout. The rank-1 details use `top_1_details_blank_caption.png`, derived from the original by clearing only its baked caption, so rank 1 also uses the shared live text.

Career-best caption frames, gradients, dimensions, and overlap come directly from the supplied PNG artwork. Only the caption text is overlaid; CSS does not draw or resize its box.

## WTA singles champions

`wta_titles` retains available singles champions imported from the saved history, including WTA Tour events,
historical Tour categories, WTA 125 events, and Grand Slams. Records include tournament ID, season, dates, category,
location, champion ID/name/country, and official source URLs. Team titles, Olympic medals, and doubles are excluded.
Coverage notes and unresolved editions are preserved; unavailable winners are never guessed. Ordering uses published
tournament end dates, which may differ from the actual final match date.

The shared match collector records confirmed main-draw singles finals and upserts by tournament ID plus season.
Refreshing an edition twice does not duplicate a title, and corrected winners update the saved edition. Player
responses derive title totals and DERNIER TITRE from these authoritative records, without rebuilding the website.
WTA 125 titles do not increase the Tour count and supply DERNIER TITRE only when the player has no higher-level title.

Both Title Card types have a Refresh button beside Background. It shares the saved match job and two-minute cooldown
with Results and Draw, displays progress, and leaves the current title data intact if the update fails.
The old champions JSON and Python updater remain historical import tools; normal website updates use D1.
