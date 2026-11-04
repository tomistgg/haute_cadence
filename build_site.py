from __future__ import annotations

import csv
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SOURCES = [DATA / f"wta_rankings_{period}.csv" for period in ("83_99", "00_09", "10_19", "20_29")]
CALENDAR = DATA / "calendar_snapshot.json"
CHAMPIONS = DATA / "wta_champions.json"
DIST = ROOT / "dist"

ASSETS = {
    "assets/cards/prospect_card.png": ROOT / "assets" / "cards" / "prospect_card.png",
    "assets/details/prospect_details.png": ROOT / "assets" / "details" / "prospect_details.png",
    "assets/fonts/chunk-five-regular.otf": ROOT / "assets" / "fonts" / "Chunk_Five" / "ChunkFive-Regular.otf",
    "assets/fonts/chunk-five-OFL.markdown": ROOT / "assets" / "fonts" / "Chunk_Five" / "OFL.markdown",
    "export-card.js": ROOT / "export-card.js",
    "assets/vendor/html-to-image-1.11.13.js": ROOT / "assets" / "vendor" / "html-to-image-1.11.13.js",
    "assets/vendor/html-to-image-LICENSE": ROOT / "assets" / "vendor" / "html-to-image-LICENSE",
    "assets/flags/LICENSE": ROOT / "assets" / "flags" / "LICENSE",
    "assets/fonts/bebas-neue-regular.ttf": ROOT / "assets" / "fonts" / "Bebas_Neue" / "BebasNeue-Regular.ttf",
    "assets/fonts/bebas-neue-OFL.txt": ROOT / "assets" / "fonts" / "Bebas_Neue" / "OFL.txt",
    "assets/details/wtatour_title_details.png": ROOT / "assets" / "details" / "wtatour_title_details.png",
    "assets/details/wta125_title_details.png": ROOT / "assets" / "details" / "wta125_title_details.png",
    "assets/players/alina-charaeva.jpg": ROOT / "assets" / "Alina Charaeva.jpg",
    "assets/title-court.svg": ROOT / "assets" / "title-court.svg",
    "assets/tour-court.svg": ROOT / "assets" / "tour-court.svg",
    "assets/fonts/tt-bluescreens-extra-bold.ttf": (
        ROOT / "assets" / "fonts" / "tt_bluescreens" / "TT Bluescreens Trial ExtraBold.ttf"
    ),
    "assets/haute-cadence-logo.png": ROOT / "assets" / "Design sans titre (2).png",
    "assets/players/leylah-fernandez.png": ROOT / "assets" / "Fernandez (1).png",
    "assets/players/elsa-jacquemot.png": ROOT / "assets" / "Jacquemot.png",
    "assets/players/diana-shnaider.png": ROOT / "assets" / "Shnaider (2).png",
    "assets/fonts/barriecito-regular.ttf": ROOT / "assets" / "fonts" / "Barriecito" / "Barriecito-Regular.ttf",
    "assets/cards/top_1_card.png": ROOT / "assets" / "cards" / "top_1_card.png",
    "assets/details/top_1_details.png": ROOT / "assets" / "details" / "top_1_details_blank_caption.png",
    "assets/cards/top_10_card.png": ROOT / "assets" / "cards" / "top_10_card.png",
    "assets/details/top_10_details.png": ROOT / "assets" / "details" / "top_10_details.png",
    "assets/cards/top_20_card.png": ROOT / "assets" / "cards" / "top_20_card.png",
    "assets/details/top_20_details.png": ROOT / "assets" / "details" / "top_20_details.png",
    "assets/cards/top_200_card.png": ROOT / "assets" / "cards" / "top_200_card.png",
    "assets/details/top_200_details.png": ROOT / "assets" / "details" / "top_200_details.png",
    "assets/cards/top_300_card.png": ROOT / "assets" / "cards" / "top_300_card.png",
    "assets/cards/top_400_card.png": ROOT / "assets" / "cards" / "top_400_card.png",
    "assets/cards/top_500_card.png": ROOT / "assets" / "cards" / "top_500_card.png",
    "assets/cards/top_600_card.png": ROOT / "assets" / "cards" / "top_600_card.png",
    # shortcut: Use the approved beige overlay until top_300_details.png is supplied.
    "assets/details/top_300_details.png": (
        ROOT / "assets" / "details" / "top_300_details.png"
        if (ROOT / "assets" / "details" / "top_300_details.png").is_file()
        else ROOT / "assets" / "details" / "top_200_details.png"
    ),
    "assets/cards/top_100_card.png": ROOT / "assets" / "cards" / "top_100_card.png",
    "assets/details/top_100_details.png": ROOT / "assets" / "details" / "top_100_details.png",
    "assets/fonts/tt-condensed-regular.ttf": (
        ROOT / "assets" / "fonts" / "tt_bluescreens" / "TT Bluescreens Trial Condensed Regular.ttf"
    ),
    "assets/fonts/tt-bluescreens-italic.ttf": ROOT / "assets" / "fonts" / "tt_bluescreens" / "TT Bluescreens Trial Italic.ttf",
    "assets/fonts/tt-bluescreens-bold-italic.ttf": (
        ROOT / "assets" / "fonts" / "tt_bluescreens" / "TT Bluescreens Trial Bold Italic.ttf"
    ),
    "assets/fonts/tt-bluescreens-extra-bold-italic.ttf": (
        ROOT / "assets" / "fonts" / "tt_bluescreens" / "TT Bluescreens Trial ExtraBold Italic.ttf"
    ),
}


ASSETS.update({
    f"assets/flags/{flag.name}": flag
    for flag in sorted((ROOT / "assets" / "flags").glob("*.svg"))
})


def main() -> None:
    if not CALENDAR.is_file():
        raise SystemExit(f"Missing calendar JSON: {CALENDAR}")
    for source in SOURCES:
        if not source.is_file():
            raise SystemExit(f"Missing ranking CSV: {source}")

    latest_date = ""
    previous_date = ""
    latest: dict[str, dict[str, str]] = {}
    previous: dict[str, dict[str, str]] = {}
    best_rank: dict[str, int] = {}
    best_rank_date: dict[str, str] = {}

    for source in SOURCES:
        with source.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                player_id = row["id"]
                week = row["week_date"]
                rank = int(row["rank"])
                if (
                    player_id not in best_rank
                    or rank < best_rank[player_id]
                    or (rank == best_rank[player_id] and week > best_rank_date[player_id])
                ):
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

    latest_titles = {}
    latest_125_titles = {}
    tour_title_counts = {}
    champions = json.loads(CHAMPIONS.read_text(encoding="utf-8"))["champions"]
    for title in champions:
        champion_id = str(title["champion"]["id"])
        is_125_title = title["category"] in {"WTA 125", "125K"}
        if not is_125_title:
            tour_title_counts[champion_id] = tour_title_counts.get(champion_id, 0) + 1
        player_titles = latest_125_titles if is_125_title else latest_titles
        prior_title = player_titles.get(champion_id)
        title_date = (title["end_date"], title["start_date"], str(title["tournament_id"]))
        if prior_title is None or title_date > (
            prior_title["end_date"], prior_title["start_date"], str(prior_title["tournament_id"])
        ):
            player_titles[champion_id] = title

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
            "latest_title": latest_titles.get(player_id) or latest_125_titles.get(player_id),
            "tour_title_count": tour_title_counts.get(player_id, 0),
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
