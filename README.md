# Haute Cadence player cards

A local, static player card builder using the copied WTA rankings CSV in this project.

## Run locally

From this folder:

```powershell
python build_site.py
python -m http.server 8765 --directory dist
```

Then open <http://127.0.0.1:8765/>. The build reads all four copied WTA ranking CSVs and uses their latest ranking week and prepares the searchable player list in `dist/data/players.json`.

Use the selector next to player search to switch between Player Form Card, WTA 125 Title Card, and WTA Tour Title Card. The selected player is preserved when changing card types. The layouts follow the three references in `examples/` using supplied PNG layers and CSS. Title cards layer `wta125_title_details.png` or `wtatour_title_details.png` over the complete card; the Tour overlay includes its trophy and laurels. No AI image generation is used.

Rank, age, and country come from the latest CSV week. Rank 1 uses `top_1`, ranks 2-10 use `top_10`, ranks 11-20 use `top_20`, ranks 21-100 use `top_100`, ranks 101-200 use `top_200`, ranks 201-300 use `top_300`, ranks 301-400 use `top_400`, ranks 401-500 use `top_500`, and ranks 501-600 use `top_600`. Ranks above 600 use the existing `top_300` fallback. The `top_400`, `top_500`, and `top_600` tiers all use `top_200_details.png`. Players aged 19 or younger outside the top 10 use `prospect_card.png` and `prospect_details.png` instead of their rank tier. Ranks 1-10 retain their existing artwork at any age. Age is calculated on the ranking snapshot date, matching the age printed on the card. These tiers apply to all three card types. The `top_300` tier temporarily uses the beige `top_200_details.png` overlay; adding `assets/top_300_details.png` and rebuilding switches to that file automatically. Title cards show a text search for eligible tournaments in the current calendar year/season, using `calendar_snapshot.json`. Search matches city, tournament name, category, country, or start date. All matches appear in a scrollable list, with keyboard navigation and dates to distinguish repeat events in the same city. WTA 125 Title Cards list only WTA 125 events. WTA Tour Title Cards list WTA 250, 500, 1000, WTA Finals, and Grand Slams; BJKC and junior events are excluded. Changing card type clears an incompatible tournament selection. The Form card's DERNIER TITRE search keeps the complete calendar. Selecting a result updates the tournament city, category, and heading color. On WTA Tour title cards, click above TITRE and type a title number (1-999); the E ordinal appears automatically. This manual number is stored separately for each player in the current tab, alongside form and last-title choices. Form cards have ten manual result buttons, ordered oldest to newest, that cycle blank -> win (green tick) -> loss (red cross). The searchable dropdown on the DERNIER TITRE line lets you type a tournament name, city, category, country, or date from the current-year calendar. Use the arrow keys and Enter or click a result; choose No title to clear it. Desktop cards are capped at 600px wide. Manual choices are separate for each player and survive player/card-type changes in the same tab; reloading the page resets them. Selecting a title layout previews its design without asserting that the player won a tournament.

Portraits are supplied for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Alina Charaeva's portrait is cropped from the provided form-card reference. Other players show initials.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.

Career-best ranks use all four local ranking CSVs (1983 onward). The caption year is the most recent year the player held that exact career-best position, including later returns to the same rank. The older `career_bests.json` cache is no longer used by the build. The site remains independent of that other project at runtime and build time.

The copied calendar was supplemented with the missing weeks of October 26 and November 2, 2026, and city metadata from the local `wta_full_calendar_cache.json`; cancelled events were excluded. BJKC, Grand Slams, Finals, WTA 1000/500/250/125, and Grand Slam Juniors use their specified heading colors. City headings use the bundled Bebas Neue font from https://github.com/google/fonts/tree/main/ofl/bebasneue, with its OFL license included.

Form cards use locally bundled circular country flags, with the CSV's three-letter country code followed by a dot beside the flag. Flag SVGs are from https://github.com/lipis/flag-icons; their MIT license is included in `assets/flags/LICENSE`. The current ranking countries are covered, including IOC-code aliases. The browser makes no external flag requests. Tournament cities use Bebas Neue; categories use the locally bundled [Chunk Five from The League of Moveable Type](https://github.com/theleagueof/chunk), with its OFL license included in `assets/Chunk_Five/`. The career-best number has a black outline, a separated ordinal, and a smaller TT Bluescreens year caption.

The 2026 calendar was completed from the official WTA tournaments API for January 1 through December 31 (both API pages), with cancelled tournaments excluded. Search uses each event's season year, so December warm-up events for the following season do not appear in the wrong year. Qualifying rows are not listed as separate title events.

Tournament display-name overrides apply to both search results and card headings: United Cup, Australian Open, Roland Garros, Wimbledon, and US Open. Searches also match the original city and tournament name. Overrides are scoped by category, so the WTA 125 in Paris keeps its city label.

## GitHub Pages

GitHub Pages must publish the generated `dist/` directory. The repository-root HTML is the source template and refers to files that exist only in the build output.

The `Deploy GitHub Pages` workflow runs `python build_site.py` and deploys `dist/` after pushes to `master`, or when run manually from Actions. In repository Settings > Pages, the publishing source is **GitHub Actions**.

Right-click the card photo on desktop and choose **Save image as** to save the complete 1440 x 1800 PNG, including all artwork, text and manual edits. The combined image refreshes automatically after edits; wait briefly for it to finish before saving. Export uses the locally bundled MIT-licensed html-to-image 1.11.13 library in `assets/vendor/`, with no CDN requests at runtime.

On a phone, touch and hold the player photo and choose the browser's Save Image / Save to Photos action to save the complete PNG. The saveable image permits native touch callouts; the editing controls remain interactive. Wait briefly after making edits for the combined PNG to refresh.
