"""Save current WTA singles brackets, including scheduled matches and unresolved slots."""

from __future__ import annotations

import argparse
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

from shared_data import calendar_tournaments as fetch_calendar
from update_wta_champions import fetch_json, final_champion, merge_draw_champions, read_history, save_history
from update_wta_results import LEVELS, match_player

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "current_draws.json"
ROUND_SLOTS = {"F": range(1, 2), "S": range(2, 4), "Q": range(4, 8)}


def bracket_rounds(matches):
    if not isinstance(matches, list):
        raise ValueError("WTA draw response has no matches list")
    nodes = {}
    for match in matches:
        if match.get("DrawMatchType") != "S" or match.get("DrawLevelType") != "M":
            continue
        if str(match.get("RoundID")) in {"R", "RR"}:
            continue
        number = re.fullmatch(r"LS0*([1-9]\d*)", str(match.get("MatchID", "")))
        if number:
            nodes[int(number[1])] = match

    def player(match, side):
        item = match_player(match, side)
        if not item["id"] or item["id"] == "0" or not item["name"] or item["name"].upper() in {"BYE", "TBD"}:
            return None
        return item

    def winner(number):
        match = nodes.get(number, {})
        code = str(match.get("Winner", ""))
        if match.get("MatchState") != "F" or code not in {"2", "3", "4", "5"}:
            return None
        return player(match, "A" if code in {"2", "4"} else "B")

    rounds = {}
    for code, slots in ROUND_SLOTS.items():
        rounds[code] = []
        for number in slots:
            match = nodes.get(number, {})
            rounds[code].append({
                "id": f"LS{number:03d}", "position": number - slots.start,
                "players": [player(match, "A") or winner(number * 2),
                            player(match, "B") or winner(number * 2 + 1)],
                "state": match.get("MatchState", "U"),
            })
    return rounds


def collect_draws(now=None):
    now = now or datetime.now(UTC)
    today = now.date().isoformat()
    calendar = fetch_calendar((now - timedelta(days=30)).date().isoformat(), today)
    active = {}
    history = read_history()
    known = {(str(row["tournament_id"]), int(row["year"])) for row in history["champions"]}
    for tournament in calendar:
        group = tournament.get("tournamentGroup") or {}
        year = tournament.get("year")
        cancelled = str((group.get("metadata") or {}).get("cancelledSeasons", ""))
        if tournament.get("level") not in LEVELS or not group.get("id") or str(year) in cancelled:
            continue
        start, end = str(tournament.get("startDate", ""))[:10], str(tournament.get("endDate", ""))[:10]
        if start <= end and start <= today and (end >= today or (str(group["id"]), int(year)) not in known):
            active[(str(group["id"]), year)] = tournament

    def load(tournament):
        group = tournament["tournamentGroup"]
        url = f"https://api.wtatennis.com/tennis/tournaments/{group['id']}/{tournament['year']}/matches"
        payload = fetch_json(url)
        matches = payload.get("matches")
        rounds = bracket_rounds(matches)
        champion = final_champion(matches)
        title = {
            "end_date": tournament["endDate"][:10], "start_date": tournament["startDate"][:10],
            "year": int(tournament["year"]), "tournament_id": str(group["id"]),
            "name": tournament.get("title") or group.get("name") or "WTA",
            "city": tournament.get("city") or group.get("name") or "WTA",
            "category": tournament["level"], "country": tournament.get("country", ""),
            "surface": tournament.get("surface", ""), "source_url": url, "champion": champion,
        } if champion else None
        return {
            "id": f"{group['id']}:{tournament['year']}", "wta_id": str(group["id"]), "year": tournament["year"],
            "name": tournament.get("title") or group.get("name") or "WTA",
            "city": tournament.get("city") or group.get("name") or "WTA",
            "category": tournament["level"], "surface": tournament.get("surface", ""),
            "start_date": tournament["startDate"], "end_date": tournament["endDate"], "source_url": url,
            "rounds": rounds,
        }, title

    with ThreadPoolExecutor(max_workers=4) as pool:
        fetched = list(pool.map(load, active.values()))
    tournaments = [item for item, _ in fetched if item["start_date"][:10] <= today <= item["end_date"][:10]]
    tournaments.sort(key=lambda item: (item["category"], item["city"], item["id"]))
    return {"updated_at": now.isoformat(), "date": today, "tournaments": tournaments,
            "champions": [title for _, title in fetched if title]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    payload = collect_draws()
    merge_draw_champions(payload["champions"])
    save_history(args.output, payload)
    print(f"Saved {len(payload['tournaments'])} current WTA singles draws to {args.output}")


if __name__ == "__main__":
    main()
