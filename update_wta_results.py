"""Save completed WTA singles matches from the rolling last 24 hours."""

from __future__ import annotations

import argparse
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

from update_wta_champions import fetch_calendar, fetch_json, save_history

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "recent_results.json"
LEVELS = {"WTA 125", "WTA 250", "WTA 500", "WTA 1000", "Finals", "WTA Finals", "Grand Slam"}
ROUNDS = {
    "1": ("1st Round", "premier"),
    "2": ("2nd Round", "deuxieme"),
    "3": ("3rd Round", "troisieme"),
    "Q": ("Quarterfinals", "quartdefinale"),
    "S": ("Semifinals", "demifinale"),
    "F": ("Final", "finale"),
}
EXTRA_ROUNDS = {"4": "QUATRIÈME TOUR", "5": "CINQUIÈME TOUR", "R": "PHASE DE GROUPES", "RR": "PHASE DE GROUPES"}


def api_time(value):
    if not value:
        return None
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return timestamp.astimezone(UTC) if timestamp.tzinfo else timestamp.replace(tzinfo=UTC)


def completed_at(match):
    # MatchTimeStamp is the start time; LastUpdated can change after a scoring correction.
    start = api_time(match.get("MatchTimeStamp"))
    duration = re.fullmatch(r"(\d+):(\d{2}):(\d{2})", str(match.get("MatchTimeTotal") or ""))
    if start and duration:
        hours, minutes, seconds = map(int, duration.groups())
        if minutes < 60 and seconds < 60:
            return start + timedelta(hours=hours, minutes=minutes, seconds=seconds)
    return api_time(match.get("LastUpdated"))


def match_player(match, side):
    first = str(match.get(f"PlayerNameFirst{side}") or "").strip()
    last = str(match.get(f"PlayerNameLast{side}") or "").strip()
    return {
        "id": str(match.get(f"PlayerID{side}") or ""),
        "first_name": first,
        "last_name": last,
        "name": f"{first} {last}".strip(),
        "country": str(match.get(f"PlayerCountry{side}") or "").upper(),
    }


def parse_match(match, tournament, now):
    winner_code = str(match.get("Winner") or "")
    if match.get("DrawMatchType") != "S" or match.get("MatchState") != "F" or winner_code not in {"2", "3", "4", "5"}:
        return None
    finished = completed_at(match)
    if finished is None or not now - timedelta(hours=24) <= finished <= now:
        return None
    winner_side, loser_side = ("A", "B") if winner_code in {"2", "4"} else ("B", "A")
    winner, loser = match_player(match, winner_side), match_player(match, loser_side)
    if not all(player["id"] and player["name"] for player in (winner, loser)):
        raise ValueError("Completed singles match has missing player identity")
    sets = []
    for number in range(1, 4):
        a, b = match.get(f"ScoreSet{number}{winner_side}"), match.get(f"ScoreSet{number}{loser_side}")
        if a in (None, "") and b in (None, ""):
            continue
        if not str(a).isdigit() or not str(b).isdigit():
            raise ValueError("Completed singles match has an invalid set score")
        tiebreak = match.get(f"ScoreTbSet{number}")
        sets.append({
            "winner": int(a), "loser": int(b), "tiebreak": str(tiebreak) if tiebreak not in (None, "") else "",
        })
    if not sets:
        return None
    round_id = str(match.get("RoundID") or "")
    round_name, artwork = ROUNDS.get(round_id, (EXTRA_ROUNDS.get(round_id, f"Round {round_id}"), "premier"))
    qualifying = match.get("DrawLevelType") == "Q"
    heading = "QUALIFICATIONS" if qualifying else "" if round_id in ROUNDS else round_name.upper()
    group = tournament["tournamentGroup"]
    status = "RET." if winner_code in {"4", "5"} else ""
    if "def" in str(match.get("ScoreString", "")).lower():
        status = "DEF."
    return {
        "id": f"{group['id']}:{tournament['year']}:{match['MatchID']}",
        "completed_at": finished.isoformat(),
        "round": ("Qualifying · " if qualifying else "") + round_name,
        "round_art": artwork,
        "round_heading": heading,
        "tournament": {
            "id": str(group["id"]), "name": tournament.get("title") or group.get("name") or "WTA",
            "city": tournament.get("city") or group.get("name") or "", "category": tournament["level"],
            "surface": tournament.get("surface") or "",
        },
        "winner": winner, "loser": loser, "sets": sets,
        "status": status,
    }


def collect_results(now=None):
    now = now or datetime.now(UTC)
    calendar = fetch_calendar(
        (now - timedelta(days=2)).date().isoformat(), (now + timedelta(days=1)).date().isoformat()
    )
    tournaments = {}
    for tournament in calendar:
        if tournament.get("level") not in LEVELS:
            continue
        group = tournament.get("tournamentGroup") or {}
        cancelled = str((group.get("metadata") or {}).get("cancelledSeasons", ""))
        if not group.get("id") or str(tournament["year"]) in cancelled:
            continue
        tournaments[(str(group["id"]), tournament["year"])] = tournament

    def tournament_matches(tournament):
        group = tournament["tournamentGroup"]
        url = f"https://api.wtatennis.com/tennis/tournaments/{group['id']}/{tournament['year']}/matches?states=C"
        payload = fetch_json(url)
        if not isinstance(payload.get("matches"), list):
            raise ValueError(f"Unexpected WTA matches response for {group['id']}")
        return [result for match in payload["matches"] if (result := parse_match(match, tournament, now))]

    found = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for matches in pool.map(tournament_matches, tournaments.values()):
            for match in matches:
                found[match["id"]] = match
    return {
        "updated_at": now.isoformat(), "window_start": (now - timedelta(hours=24)).isoformat(),
        "matches": sorted(found.values(), key=lambda match: (match["completed_at"], match["id"]), reverse=True),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    payload = collect_results()
    save_history(args.output, payload)
    print(f"Saved {len(payload['matches'])} completed WTA singles matches to {args.output}")


if __name__ == "__main__":
    main()
