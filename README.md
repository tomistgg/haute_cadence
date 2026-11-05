# Haute Cadence player cards

A local, static player card builder using rankings and calendars saved by `tenis-fem-arg`.

## Run locally

From this folder:

```powershell
python build_site.py
python serve_site.py
```

Then open <http://127.0.0.1:8765/>. By default the build reads all four WTA ranking CSVs from
`../tenis-fem-arg/data/`, uses their latest ranking week, and prepares `dist/data/players.json`.
The source files are read only; Haute Cadence does not fetch or update rankings.
For a different checkout location, set `$env:HAUTE_CADENCE_DATA_DIR = 'C:\path\to\tenis-fem-arg\data'` before running.
The source directory must contain the four ranking CSVs, `calendar_snapshot.json`, `wta_full_calendar_cache.json`,
`itf_calendar_cache.json`, and `player_aliases_wta_itf.json`.
Missing or invalid shared files produce an error instead of silently using Haute Cadence's old ranking copies.

Tournament lists merge the shared calendar files. Current WTA dates, categories, cities, cancellations, and new events
come from the shared cache. `data/calendar_snapshot.json` is an accumulated calendar archive: older tournaments remain
searchable after they leave the other project's moving cache window. The build writes the merged calendar to `dist/data/`.
The local server notices changed source files and rebuilds player/calendar data when requested; reload the page to load it.

All player searches include anyone ranked within two calendar years of the latest ranking snapshot. Players absent
from the latest week show NR; their old ranking is retained only as `last_rank` / `last_rank_date` in the data.
Current rank, career-best rank, and last recorded rank remain separate. Country flags cover the expanded list.

All card images use WTARG's player display names from `player_aliases_wta_itf.json`, matched by WTA ID, including
additional WTA IDs. For example, Maaya Rajeshwaran Revathi is shown as Maaya Rajeshwaran. Records with a separate
`presentation_name` use that visible label instead of an internal disambiguation suffix. Both WTA and ITF names,
display names, and aliases remain searchable. The original ranking and match names and IDs remain unchanged.
The complete name index also covers live match players outside the two-year ranking list. Name-only fallback is
used only for unambiguous aliases. Explicit custom names in manual cards take precedence over the shared label.
Portrait uploads remain attached to player IDs, and saved portraits can still match the original name or aliases.
The local server detects changes to the shared name file; reload to rebuild and load the updated labels.
Long player names reduce their font size to fit their space while keeping the letters' natural proportions. This
also applies to both Result Card layouts and WTA 125 draw names; shorter names retain their normal font size.

Draw lists current WTA tournaments (including WTA 125) and FINALE, DEMI-FINALES, and QUARTS DE FINALE.
WTA Tour, Grand Slam, and WTA 125 draws all use the same two, four, or eight Form cards with each player's
ranking/prospect artwork. Draw frames, brackets, placeholders,
VS graphics, and round banners use the supplied PNGs in `assets/draws/`. Player panels follow the positions and angles
of those placeholders; unresolved opponents retain the PNG's image placeholder. Players fill automatically from the official
singles bracket. Click a portrait to upload its photo. Click the ten form results on a
card, or use Player form for larger controls, to cycle blank, win, loss from oldest to newest. Form edits share the
same per-player draft as the main Form card. Final H2H values are edited inside the supplied image's H2H frame.
Photos, form, H2H, background choice, and selected round are included in the saved PNG. Uploads and edits reset
on reload. Draws export at the templates' native sizes: finals 1600 × 900, semifinals 1880 × 1576, and
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

`python update_wta_draws.py` saves current tournaments and their singles brackets to `data/current_draws.json`.
The matches endpoint is requested without a completed-only filter, and `LS` match numbers preserve bracket
positions even when the feed gives a scheduled match an unreliable round label. Missing parent slots are filled
only from confirmed winners of their direct child matches. Doubles, qualifying, and round-robin results never
advance into the knockout bracket. The updater preserves the previous snapshot on failure. The local server and
Draw refresh every five minutes while used. On GitHub Pages, draw refreshes fetch WTA directly through the shared relay.
Result Card and Draw tournament discovery, match states, and scores come directly from WTA, independently of WTARG.
Clicking Refresh on the local server forces a new WTA request, bypassing the five-minute automatic refresh cache.
Confirmed main-draw singles finals update `data/wta_champions.json` using the same draw response. Recently ended events
without a saved champion are checked too; existing titles are merged by tournament ID and season, so refreshes do not
increase title counts twice. Player title counts and DERNIER TITRE are regenerated on the next player-data request or build.

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
the current Monday–Sunday week (Europe/Madrid). The list uses WTARG's full ITF calendar, refreshed when opened;
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

The local server automatically refreshes `data/recent_results.json` from the official WTA completed-match endpoint
every five minutes while used; clicking Refresh forces an immediate update. The page also refreshes while either
result card is selected. The official match start timestamp plus
duration defines the finish time; LastUpdated is the fallback when duration is unavailable. Walkovers are excluded;
retirements/defaults with played sets are marked. Cached matches outside the last 24 hours never appear.
If WTA is unavailable, the last successful feed is retained and the page reports the refresh failure.
For a static build, run `python update_wta_results.py` and `python update_wta_draws.py` before `python build_site.py`.
The Pages workflow refreshes the feed on each deployment and every 30 minutes once this workflow is published.
On GitHub Pages, Result Card and Draw refreshes use `wta-live.mjs` and the shared endpoint at
`https://tennis-wta-api.schiter-tomas.workers.dev`. Clicking Refresh fetches a fresh WTA calendar and match responses;
the browser transforms them into the same singles-result/bracket format without writing repository data files.
Automatic five-minute refreshes use this live path too. A failed or incomplete response retains the current card/feed
and shows an error. Rankings and player display names still use the shared WTARG files. The scheduled Python updaters
continue maintaining the saved feeds and champion history; browser refreshes do not write to that history.
Clicking Refresh shows a small "Updating…" message, followed by "Updated at HH:MM." when it finishes successfully.
Each manual results or draw refresh starts a two-minute button countdown, remembered across reloads and tabs in the
same browser. The two Result Card layouts share one countdown; Draw has its own. Failed refreshes allow an immediate
retry. Automatic five-minute updates still run normally. If browser storage is unavailable, the cooldown lasts only
in the current tab until reload.

Use the selector next to player search to switch between Player Form Card, WTA 125 Title Card, and WTA Tour Title Card. The selected player is preserved when changing card types. The layouts follow the three references in `examples/` using supplied PNG layers and CSS. Title cards layer `assets/details/wta125_title_details.png` or `assets/details/wtatour_title_details.png` over the complete card; the Tour overlay includes its trophy and laurels. No AI image generation is used.

Rank, age, and country come from the latest CSV week. Rank 1 uses `top_1`, ranks 2-10 use `top_10`, ranks 11-20 use `top_20`, ranks 21-100 use `top_100`, ranks 101-200 use `top_200`, ranks 201-300 use `top_300`, ranks 301-400 use `top_400`, ranks 401-500 use `top_500`, and ranks 501-600 use `top_600`. Ranks above 600 use the existing `top_300` fallback. The `top_400`, `top_500`, and `top_600` tiers all use `top_200_details.png`. Players aged 19 or younger outside the top 10 use `prospect_card.png` and `prospect_details.png` instead of their rank tier. Ranks 1-10 retain their existing artwork at any age. Age is calculated on the ranking snapshot date, matching the age printed on the card. These tiers apply to all three card types. The `top_300` tier temporarily uses the beige `top_200_details.png` overlay; adding `assets/details/top_300_details.png` and rebuilding switches to that file automatically. Title cards show a text search for eligible tournaments in the current calendar year/season, using `data/calendar_snapshot.json`. Search matches city, tournament name, category, country, or start date. All matches appear in a scrollable list, with keyboard navigation and dates to distinguish repeat events in the same city. WTA 125 Title Cards list only WTA 125 events. WTA Tour Title Cards list WTA 250, 500, 1000, WTA Finals, and Grand Slams; BJKC and junior events are excluded. The WTA Tour Title Card displays each player's count of recorded WTA Tour singles titles, including Grand Slams and historical Tour categories, while excluding WTA 125 titles. Changing card type clears an incompatible tournament selection. The Form card's DERNIER TITRE is filled automatically from `data/wta_champions.json`, matching the player's WTA ID and preferring the latest WTA Tour, Grand Slam, or United Cup title over WTA 125; when there is no higher-level title, it uses the latest WTA 125 title. Selecting a result updates the tournament city, category, and heading color. Form cards have ten manual result buttons, ordered oldest to newest, that cycle blank -> win (green V) -> loss (red lowercase d). DERNIER TITRE displays the latest recorded title as category, tournament city/name, and season year, using the existing tournament-name overrides. Players with no recorded title show W/O. This field is automatic and is included in the saved card PNG. Desktop cards are capped at 600px wide. Manual form results are separate for each player and survive player/card-type changes in the same tab; reloading the page resets them. Selecting a title layout previews its design without asserting that the player won a tournament.

Portraits are supplied for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Alina Charaeva's portrait is cropped from the provided form-card reference. Other players show initials.

The title layouts, Non-Tour Result Card, and Draw have a Background button above the preview. Choose a thumbnail from
`assets/surfaces/`, or Original to restore that layout's original background. Each layout remembers its selection
until reload, and the selected background is included in the saved PNG. Rebuild after adding PNGs to that folder
to include them in the picker. Tournament, match, photo, and background controls share the preview's width and
stack on smaller screens.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.

Champions history, the accumulated calendar, recent results, and current draws are stored in `data/`. Career-best ranks
use all four shared ranking CSVs (1983 onward). The caption year is the most recent year the player held that exact
career-best position, including later returns to the same rank. The old ranking CSV copies and `data/career_bests.json`
in Haute Cadence are no longer used by the build. The generated site remains static; only builds and the local server
read the other project's files.

The initial calendar archive preserves the previously saved 2026 season, including October 26 and November 2.
Subsequent builds overlay `tenis-fem-arg` calendar data. BJKC, Grand Slams, Finals, WTA 1000/500/250/125, and Grand Slam
Juniors use their specified heading colors. City headings use the bundled Bebas Neue font from
https://github.com/google/fonts/tree/main/ofl/bebasneue, with its OFL license included.

Form cards use locally bundled circular country flags, with the CSV's three-letter country code followed by a dot beside the flag. Flag SVGs are from https://github.com/lipis/flag-icons; their MIT license is included in `assets/flags/LICENSE`. The current ranking countries are covered, including IOC-code aliases. The browser makes no external flag requests. Tournament cities use Bebas Neue; categories use the locally bundled [Chunk Five from The League of Moveable Type](https://github.com/theleagueof/chunk), with its OFL license included in `assets/fonts/Chunk_Five/`. The career-best number has a black outline, a separated ordinal, and a smaller TT Bluescreens year caption.

The 2026 calendar was completed from the official WTA tournaments API for January 1 through December 31 (both API pages), with cancelled tournaments excluded. Search uses each event's season year, so December warm-up events for the following season do not appear in the wrong year. Qualifying rows are not listed as separate title events.

Tournament display-name overrides apply to both search results and card headings: United Cup, Australian Open, Roland Garros, Wimbledon, and US Open. Searches also match the original city and tournament name. Overrides are scoped by category, so the WTA 125 in Paris keeps its city label.

## GitHub Pages

GitHub Pages must publish the generated `dist/` directory. The repository-root HTML is the source template and refers to files that exist only in the build output.

The `Deploy GitHub Pages` workflow runs `python build_site.py` and deploys `dist/` after pushes to `master`, or when run manually from Actions. In repository Settings > Pages, the publishing source is **GitHub Actions**.
It checks out only the required rankings, calendar, and player-name files from `tomistgg/tenis-fem-arg`'s validated
`data-state` branch and keeps the
existing 30-minute WTA results/draw refresh. The generated calendar archive and champion history are retained on a
separate `card-data` branch, so later deployments preserve past tournaments and newly won titles. This requires the
workflow's contents-write permission. No workflow or data in `tenis-fem-arg` is changed.

Right-click the card photo on desktop and choose **Save image as** to save the complete PNG, including all artwork, text and manual edits. Player/title exports are 1440 x 1800, Non-Tour results 1440 x 1600, and Tour results 1600 x 900. The combined image refreshes automatically after edits; wait briefly for it to finish before saving. Export uses the locally bundled MIT-licensed html-to-image 1.11.13 library in `assets/vendor/`, with no CDN requests at runtime.

On a phone, touch and hold the player photo and choose the browser's Save Image / Save to Photos action to save the complete PNG. The saveable image permits native touch callouts; the editing controls remain interactive. Wait briefly after making edits for the combined PNG to refresh.

Each layout uses a fixed design surface at its export dimensions. The responsive preview scales that entire surface as a unit, so text sizes, positions, outlines and spacing keep their proportions at every viewport width. Browser text auto-enlargement is disabled inside the card. The saveable PNG is rendered directly from the same design surface at full size, independently of preview width or device pixel density. Search menus stay sized for readable interaction outside the artwork's typography.

Responsive checks compared six representative cards (Form with history, Form at career best, both title layouts, prospect, and rank 1) at widths 280, 320, 360, 390, 414, 600, 768, 1024, 1440, and 2560 with pixel densities 1-3. Every card kept matching normalized text bounds and generated byte-identical PNGs across the tested viewports in Chrome. Physical-phone browser rendering has not been verified.

The career-best caption uses the Form card's exact font size, line height, kerning, word spacing, letter spacing, and padding in every layout. The rank-1 details use `top_1_details_blank_caption.png`, derived from the original by clearing only its baked caption, so rank 1 also uses the shared live text.

Career-best caption frames, gradients, dimensions, and overlap come directly from the supplied PNG artwork. Only the caption text is overlaid; CSS does not draw or resize its box.

## WTA singles champions

`data/wta_champions.json` stores available singles champions from 2000 through the update date, oldest first by tournament end date. It includes WTA Tour events, historical Tour categories, WTA 125 events, and Grand Slams. Each entry contains the tournament ID, season, dates, category, location, champion's WTA ID/name/country, and official source URLs. Team titles, Olympic medals, and doubles are excluded.

Refresh it locally with:

```powershell
python update_wta_champions.py
```

The updater uses the same official WTA calendar and completed-matches endpoints as `tenis-fem-arg`. It also checks WTA's singles player-record endpoint to recover original categories for older Tour editions incorrectly labelled ITF in the calendar. Explicitly ITF-labelled tournament names are excluded from this historical verification. The file describes source coverage and lists unresolved events in `missing_champions`; unavailable winners are never guessed. Dates used for ordering are the published tournament end dates, which may differ from the actual final match date. A failed update preserves the previous file.

Use `--through YYYY-MM-DD` for a fixed cutoff or `--start-year YYYY` to change the starting year. After refreshing the champions file, run `python build_site.py` to update the automatic DERNIER TITRE values. The builder includes each ranked player's latest matching title in `dist/data/players.json`, so the site needs no live WTA requests.
