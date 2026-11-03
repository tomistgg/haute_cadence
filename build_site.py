from __future__ import annotations

import csv
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "wta_rankings_20_29.csv"
CALENDAR = ROOT / "calendar_snapshot.json"
CAREER_BESTS = ROOT / "career_bests.json"
DIST = ROOT / "dist"

ASSETS = {
    "export-card.js": ROOT / "export-card.js",
    "assets/vendor/html-to-image-1.11.13.js": ROOT / "assets" / "vendor" / "html-to-image-1.11.13.js",
    "assets/vendor/html-to-image-LICENSE": ROOT / "assets" / "vendor" / "html-to-image-LICENSE",
    "assets/flags/LICENSE": ROOT / "assets" / "flags" / "LICENSE",
    "assets/fonts/bebas-neue-regular.ttf": ROOT / "assets" / "Bebas_Neue" / "BebasNeue-Regular.ttf",
    "assets/fonts/bebas-neue-OFL.txt": ROOT / "assets" / "Bebas_Neue" / "OFL.txt",
    "assets/wtatour_title_details.png": ROOT / "assets" / "wtatour_title_details.png",
    "assets/wta125_title_details.png": ROOT / "assets" / "wta125_title_details.png",
    "assets/players/alina-charaeva.jpg": ROOT / "assets" / "Alina Charaeva.jpg",
    "assets/title-court.svg": ROOT / "assets" / "title-court.svg",
    "assets/tour-court.svg": ROOT / "assets" / "tour-court.svg",
    "assets/fonts/tt-bluescreens-extra-bold.ttf": (
        ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial ExtraBold.ttf"
    ),
    "assets/haute-cadence-logo.png": ROOT / "assets" / "Design sans titre (2).png",
    "assets/players/leylah-fernandez.png": ROOT / "assets" / "Fernandez (1).png",
    "assets/players/elsa-jacquemot.png": ROOT / "assets" / "Jacquemot.png",
    "assets/players/diana-shnaider.png": ROOT / "assets" / "Shnaider (2).png",
    "assets/fonts/barriecito-regular.ttf": ROOT / "assets" / "Barriecito" / "Barriecito-Regular.ttf",
    "assets/top_1_card.png": ROOT / "assets" / "top_1_card.png",
    "assets/top_1_details.png": ROOT / "assets" / "top_1_details.png",
    "assets/top_10_card.png": ROOT / "assets" / "top_10_card.png",
    "assets/top_10_details.png": ROOT / "assets" / "top_10_details.png",
    "assets/top_20_card.png": ROOT / "assets" / "top_20_card.png",
    "assets/top_20_details.png": ROOT / "assets" / "top_20_details.png",
    "assets/top_200_card.png": ROOT / "assets" / "top_200_card.png",
    "assets/top_200_details.png": ROOT / "assets" / "top_200_details.png",
    "assets/top_300_card.png": ROOT / "assets" / "top_300_card.png",
    # shortcut: Use the approved beige overlay until top_300_details.png is supplied.
    "assets/top_300_details.png": (
        ROOT / "assets" / "top_300_details.png"
        if (ROOT / "assets" / "top_300_details.png").is_file()
        else ROOT / "assets" / "top_200_details.png"
    ),
    "assets/top_100_card.png": ROOT / "assets" / "top_100_card.png",
    "assets/top_100_details.png": ROOT / "assets" / "top_100_details.png",
    "assets/fonts/tt-condensed-regular.ttf": (
        ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial Condensed Regular.ttf"
    ),
    "assets/fonts/tt-bluescreens-italic.ttf": ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial Italic.ttf",
    "assets/fonts/tt-bluescreens-extra-bold-italic.ttf": (
        ROOT / "assets" / "tt_bluescreens" / "TT Bluescreens Trial ExtraBold Italic.ttf"
    ),
}


ASSETS.update({
    f"assets/flags/{flag.name}": flag
    for flag in sorted((ROOT / "assets" / "flags").glob("*.svg"))
})


def main() -> None:
    if not CALENDAR.is_file():
        raise SystemExit(f"Missing calendar JSON: {CALENDAR}")
    if not SOURCE.is_file():
        raise SystemExit(f"Missing ranking CSV: {SOURCE}")

    latest_date = ""
    previous_date = ""
    latest: dict[str, dict[str, str]] = {}
    previous: dict[str, dict[str, str]] = {}
    historical_bests = json.loads(CAREER_BESTS.read_text(encoding="utf-8"))["players"]
    best_rank = {player_id: int(record["rank"]) for player_id, record in historical_bests.items()}
    best_rank_date = {player_id: record["date"] for player_id, record in historical_bests.items()}

    with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            player_id = row["id"]
            week = row["week_date"]
            rank = int(row["rank"])
            if player_id not in best_rank or (rank, week) < (best_rank[player_id], best_rank_date[player_id]):
                best_rank[player_id] = rank
                best_rank_date[player_id] = week

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
            "best_rank_year": int(best_rank_date[player_id][:4]),
        })
    players.sort(key=lambda player: (player["rank"], player["name"].casefold()))

    for destination, source in ASSETS.items():
        if not source.is_file():
            raise SystemExit(f"Missing site asset: {source}")
        target = DIST / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    page = (ROOT / "index.html").read_text(encoding="utf-8")
    for filename in ("app.js", "cards.css", "export-card.js"):
        version = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()[:12]
        page = page.replace(f'"{filename}"', f'"{filename}?v={version}"')
    (DIST / "index.html").write_text(page, encoding="utf-8")
    shutil.copy2(ROOT / "app.js", DIST / "app.js")
    shutil.copy2(ROOT / "cards.css", DIST / "cards.css")
    data_dir = DIST / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CALENDAR, data_dir / "calendar_snapshot.json")
    payload = {"snapshot_date": latest_date, "players": players}
    (data_dir / "players.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"Prepared {len(players):,} WTA singles players from {latest_date} in {DIST}")


if __name__ == "__main__":
    main()
