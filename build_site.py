from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "wta_rankings_20_29.csv"
DIST = ROOT / "dist"

ASSETS = {
    "assets/haute-cadence-logo.png": ROOT / "assets" / "Design sans titre (2).png",
    "assets/players/leylah-fernandez.png": ROOT / "assets" / "Fernandez (1).png",
    "assets/players/elsa-jacquemot.png": ROOT / "assets" / "Jacquemot.png",
    "assets/players/diana-shnaider.png": ROOT / "assets" / "Shnaider (2).png",
    "assets/fonts/barriecito-regular.ttf": ROOT / "assets" / "Barriecito" / "Barriecito-Regular.ttf",
    "assets/top_20_card.png": ROOT / "assets" / "top_20_card.png",
    "assets/top_20_details.png": ROOT / "assets" / "top_20_details.png",
    "assets/top_100_card.png": ROOT / "assets" / "top_100_card.png",
    "assets/top_100_details.png": ROOT / "assets" / "top_100_details.png",
    "assets/fonts/tt-condensed-regular.ttf": ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial Condensed Regular.ttf",
    "assets/fonts/tt-bluescreens-italic.ttf": ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial Italic.ttf",
    "assets/fonts/tt-bluescreens-extra-bold-italic.ttf": ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial ExtraBold Italic.ttf",
}


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing ranking CSV: {SOURCE}")

    latest_date = ""
    previous_date = ""
    latest: dict[str, dict[str, str]] = {}
    previous: dict[str, dict[str, str]] = {}
    best_rank: dict[str, int] = {}

    with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            player_id = row["id"]
            week = row["week_date"]
            rank = int(row["rank"])
            best_rank[player_id] = min(rank, best_rank.get(player_id, rank))

            if week > latest_date:
                previous_date, previous = latest_date, latest
                latest_date, latest = week, {}
            elif latest_date and previous_date < week < latest_date:
                previous_date, previous = week, {}

            if week == latest_date:
                latest[player_id] = row
            elif week == previous_date:
                previous[player_id] = row

    if not latest:
        raise SystemExit("The ranking CSV contains no ranking rows.")

    players = []
    for player_id, row in latest.items():
        prior = previous.get(player_id)
        players.append({
            "id": player_id,
            "name": row["player"],
            "country": row["country"],
            "dob": row["dob"],
            "rank": int(row["rank"]),
            "points": int(row["points"]),
            "previous_rank": int(prior["rank"]) if prior else None,
            "best_rank": best_rank[player_id],
        })
    players.sort(key=lambda player: (player["rank"], player["name"].casefold()))

    for destination, source in ASSETS.items():
        if not source.is_file():
            raise SystemExit(f"Missing site asset: {source}")
        target = DIST / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    shutil.copy2(ROOT / "index.html", DIST / "index.html")
    shutil.copy2(ROOT / "app.js", DIST / "app.js")
    data_dir = DIST / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {"snapshot_date": latest_date, "players": players}
    (data_dir / "players.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Prepared {len(players):,} WTA singles players from {latest_date} in {DIST}")


if __name__ == "__main__":
    main()