# Haute Cadence player cards

A local, static player card builder using the copied WTA rankings CSV in this project.

## Run locally

From this folder:

```powershell
python build_site.py
python -m http.server 8765 --directory dist
```

Then open <http://127.0.0.1:8765/>. The build reads the latest ranking week from `wta_rankings_20_29.csv` and prepares the searchable player list in `dist/data/players.json`.

Use the selector next to player search to switch between Player Form Card, WTA 125 Title Card, and WTA Tour Title Card. The selected player is preserved when changing card types. The layouts follow the three references in `examples/` using supplied PNG layers, CSS, and SVG decorations. No AI image generation is used.

Rank, age, and country come from the latest CSV week. Players ranked 1-20 use `top_20` artwork; all others use `top_100`. Tournament names, title counts, and match form are not in the CSV and appear as dashes. Selecting a title layout previews its design without asserting that the player won a tournament.

Portraits are supplied for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Alina Charaeva's portrait is cropped from the provided form-card reference. Other players show initials.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.
