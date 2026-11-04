"""Save current WTA singles brackets, including scheduled matches and unresolved slots."""

from __future__ import annotations

import argparse
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

from update_wta_champions import fetch_calendar, fetch_json, save_history
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
    for tournament in calendar:
        group = tournament.get("tournamentGroup") or {}
        year = tournament.get("year")
        cancelled = str((group.get("metadata") or {}).get("cancelledSeasons", ""))
        if tournament.get("level") not in LEVELS or not group.get("id") or str(year) in cancelled:
            continue
        if str(tournament.get("startDate", ""))[:10] <= today <= str(tournament.get("endDate", ""))[:10]:
            active[(str(group["id"]), year)] = tournament

    def load(tournament):
        group = tournament["tournamentGroup"]
        url = f"https://api.wtatennis.com/tennis/tournaments/{group['id']}/{tournament['year']}/matches"
        payload = fetch_json(url)
        return {
            "id": f"{group['id']}:{tournament['year']}", "wta_id": str(group["id"]), "year": tournament["year"],
            "name": tournament.get("title") or group.get("name") or "WTA",
            "city": tournament.get("city") or group.get("name") or "WTA",
            "category": tournament["level"], "surface": tournament.get("surface", ""),
            "start_date": tournament["startDate"], "end_date": tournament["endDate"], "source_url": url,
            "rounds": bracket_rounds(payload.get("matches")),
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        tournaments = list(pool.map(load, active.values()))
    tournaments.sort(key=lambda item: (item["category"], item["city"], item["id"]))
    return {"updated_at": now.isoformat(), "date": today, "tournaments": tournaments}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    payload = collect_draws()
    save_history(args.output, payload)
    print(f"Saved {len(payload['tournaments'])} current WTA singles draws to {args.output}")


if __name__ == "__main__":
    main()
