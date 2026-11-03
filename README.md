# Haute Cadence player cards

A local, static player card builder using the copied WTA rankings CSV in this project.

## Run locally

From this folder:

```powershell
python build_site.py
python -m http.server 8765 --directory dist
```

Then open <http://127.0.0.1:8765/>. The build reads the latest ranking week from `wta_rankings_20_29.csv` and prepares the searchable player list in `dist/data/players.json`.

Use the selector next to player search to switch between Player Form Card, WTA 125 Title Card, and WTA Tour Title Card. The selected player is preserved when changing card types. The layouts follow the three references in `examples/` using supplied PNG layers and CSS. Title cards layer `wta125_title_details.png` or `wtatour_title_details.png` over the complete card; the Tour overlay includes its trophy and laurels. No AI image generation is used.

Rank, age, and country come from the latest CSV week. Rank 1 uses `top_1`, ranks 2-10 use `top_10`, ranks 11-20 use `top_20`, ranks 21-100 use `top_100`, ranks 101-200 use `top_200`, and ranks 201 onward use `top_300`. These tiers apply to all three card types. The `top_300` tier temporarily uses the beige `top_200_details.png` overlay; adding `assets/top_300_details.png` and rebuilding switches to that file automatically. Title cards show a text search for all tournaments in the current calendar year/season, using `calendar_snapshot.json`. Search matches city, tournament name, category, country, or start date. All matches appear in a scrollable list, with keyboard navigation and dates to distinguish repeat events in the same city. Both Title card types search the same complete current-year event list, including all supported categories; the card type selects the artwork independently of the tournament category. Selecting a result updates the tournament city, category, and heading color. Title counts and match form are not in the data and appear as dashes. Selecting a title layout previews its design without asserting that the player won a tournament.

Portraits are supplied for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Alina Charaeva's portrait is cropped from the provided form-card reference. Other players show initials.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.

Career-best ranks and the year first achieved combine the local 2020-onward CSV with `career_bests.json`, a compact copy derived from the existing 1983-2019 ranking files in tenis-fem-arg. The site remains independent of that other project at runtime and build time.

The copied calendar was supplemented with the missing weeks of October 26 and November 2, 2026, and city metadata from the local `wta_full_calendar_cache.json`; cancelled events were excluded. BJKC, Grand Slams, Finals, WTA 1000/500/250/125, and Grand Slam Juniors use their specified heading colors. City headings use the bundled Bebas Neue font from https://github.com/google/fonts/tree/main/ofl/bebasneue, with its OFL license included.

Form cards use locally bundled circular country flags, with the CSV's three-letter country code beside the flag. Flag SVGs are from https://github.com/lipis/flag-icons; their MIT license is included in `assets/flags/LICENSE`. The current ranking countries are covered, including IOC-code aliases. The browser makes no external flag requests. Both the tournament city and category use Bebas Neue. The career-best number has a black outline, a separated ordinal, and a smaller TT Bluescreens year caption.

The 2026 calendar was completed from the official WTA tournaments API for January 1 through December 31 (both API pages), with cancelled tournaments excluded. Search uses each event's season year, so December warm-up events for the following season do not appear in the wrong year. Qualifying rows are not listed as separate title events.

Tournament display-name overrides apply to both search results and card headings: United Cup, Australian Open, Roland Garros, Wimbledon, and US Open. Searches also match the original city and tournament name. Overrides are scoped by category, so the WTA 125 in Paris keeps its city label.

## GitHub Pages

GitHub Pages must publish the generated `dist/` directory. The repository-root HTML is the source template and refers to files that exist only in the build output.

The `Deploy GitHub Pages` workflow runs `python build_site.py` and deploys `dist/` after pushes to `master`, or when run manually from Actions. In repository Settings > Pages, the publishing source is **GitHub Actions**.
