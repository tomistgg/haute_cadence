# Haute Cadence player cards

A local, static player card builder using the copied WTA rankings CSV in this project.

## Run locally

From this folder:

```powershell
python build_site.py
python -m http.server 8765 --directory dist
```

Then open <http://127.0.0.1:8765/>. The build reads the latest ranking week from `wta_rankings_20_29.csv` and prepares the searchable player list in `dist/data/players.json`.

Cards are composed in the browser from the supplied card and transparent detail PNG layers, with each player's current rank, name, and portrait placed programmatically. Players ranked 1?20 in the latest CSV week use the `top_20` artwork; all others use `top_100`. Supplied portraits are available for Leylah Fernandez, Elsa Jacquemot, and Diana Shnaider. Other players show initials because no portrait for them is included. Form and title history are not in the rankings CSV, so those values are left blank. No AI image generation is used.

The supplied TT Bluescreens font is a trial font. Keep this site local/private for evaluation unless you obtain the appropriate license.