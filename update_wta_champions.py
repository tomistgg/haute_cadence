"""Save chronologically ordered singles champions from the official WTA API."""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
API = "https://api.wtatennis.com/tennis/tournaments/"
HEADERS = {
    "account": "wta",
    "accept": "application/json",
    "origin": "https://www.wtatennis.com",
    "referer": "https://www.wtatennis.com/",
    "user-agent": "Mozilla/5.0",
}


def fetch_json(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=30) as response:
                raw = response.read()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("latin-1")
            return json.loads(text)
        except (HTTPError, URLError, TimeoutError) as exc:
            if isinstance(exc, HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                raise
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    raise AssertionError("Unreachable retry state")


def fetch_calendar(start, through):
    def page_payload(page):
        url = API + "?" + urlencode({"page": page, "pageSize": 100, "from": start, "to": through})
        payload = fetch_json(url)
        if int(payload["pageInfo"]["page"]) != page or not isinstance(payload["content"], list):
            raise ValueError("Unexpected WTA calendar page")
        return payload

    first = page_payload(0)
    total = int(first["pageInfo"]["numEntries"])
    items = first["content"]
    if total == 0 and not items:
        return []
    if not items:
        raise ValueError("Incomplete WTA calendar response")
    page_count = (total + len(items) - 1) // len(items)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for payload in pool.map(page_payload, range(1, page_count)):
            if int(payload["pageInfo"]["numEntries"]) != total:
                raise ValueError("WTA calendar changed during pagination; rerun the update")
            items.extend(payload["content"])
    if len(items) != total:
        raise ValueError("Incomplete WTA calendar response")
    return items


def calendar_champion(tournament):
    players = {}
    for winner in tournament.get("winners") or []:
        player = (winner.get("singles") or {}).get("player") or {}
        if not player.get("id"):
            continue
        name = player.get("fullName") or " ".join(
            str(player.get(key) or "") for key in ("firstName", "lastName")
        ).strip()
        if not name:
            raise ValueError("WTA singles champion has an ID but no name")
        player_id = str(player["id"])
        players[player_id] = {
            "id": player_id, "name": name, "country": player.get("countryCode") or "",
        }
    if len(players) > 1:
        raise ValueError("Conflicting WTA singles champions for the same tournament")
    return next(iter(players.values()), None)


def record_titles(payload):
    """Read season-specific WTA title categories from the singles record endpoint."""
    titles = []
    for entry in payload.get("byTournament") or []:
        tournament_id = str(entry["tournament"]["tournamentGroup"]["id"])
        if tournament_id in ("2084", "650"):
            continue
        for result in entry.get("yearlyResults") or []:
            if result.get("resultCode") != "W":
                continue
            level = result.get("tournamentLevel") or "Historical WTA"
            if level.upper() in ("ITF", "OLYMPICS", "OLYMPIC GAMES"):
                continue
            details = result.get("matchDetails") or {}
            match_id = result.get("eliminationMatchId") or ""
            if details.get("partner") or (match_id and not match_id.startswith("LS")):
                continue
            titles.append((tournament_id, int(result["year"]), level))
    return titles


def fetch_title_records(tournaments):
    # Old Tour editions are labelled ITF in the calendar. Verify their real level in WTA singles records.
    players = {}
    for tournament in tournaments:
        if tournament.get("level") == "ITF" and "ITF" in (tournament.get("title") or "").upper():
            continue
        champion = calendar_champion(tournament)
        if champion:
            players[champion["id"]] = champion

    def player_titles(player):
        url = f"https://api.wtatennis.com/tennis/players/{player['id']}/records?type=S"
        try:
            payload = fetch_json(url)
        except HTTPError as exc:
            if exc.code != 404:
                raise
            return []
        return [{"tournament_id": tid, "year": year, "category": level,
                 "champion": player, "record_source_url": url}
                for tid, year, level in record_titles(payload)]

    index = {}
    print(f"Verifying historical WTA titles against {len(players)} singles player records", flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for number, titles in enumerate(pool.map(player_titles, players.values()), start=1):
            for title in titles:
                index.setdefault((title["tournament_id"], title["year"]), []).append(title)
            if number % 50 == 0:
                print(f"Checked {number}/{len(players)} player records", flush=True)
    return index


def final_champion(matches):
    finals = [match for match in matches if match.get("DrawMatchType") == "S"
              and match.get("DrawLevelType") == "M" and str(match.get("RoundID")) == "F"
              and match.get("MatchState") == "F"]
    if not finals:
        return None
    if len(finals) != 1:
        raise ValueError("Multiple completed main-draw singles finals")
    match = finals[0]
    winner = str(match.get("Winner") or "")
    side = {"2": "A", "3": "B", "6": "A", "7": "B"}.get(winner)
    if winner in ("4", "5"):
        # Retirements must identify the winner explicitly; do not infer from the score.
        message = re.search(r"\{11\|([^}]+)\}", match.get("Message") or "")
        if message:
            candidates = [s for s in ("A", "B") if match.get(f"PlayerNameLast{s}")
                          and message[1].casefold().endswith(match[f"PlayerNameLast{s}"].casefold())]
            if len(candidates) == 1:
                side = candidates[0]
    if side is None:
        return None
    name = " ".join(str(match.get(f"PlayerName{part}{side}") or "") for part in ("First", "Last")).strip()
    player_id = match.get(f"PlayerID{side}")
    if not player_id or not name:
        raise ValueError("Completed singles final has incomplete winner identity")
    return {"id": str(player_id), "name": name, "country": match.get(f"PlayerCountry{side}") or ""}


def collect_champions(tournaments, start, through, title_records=None):
    title_records = title_records or {}
    champions, missing = [], []
    seen = set()
    for tournament in tournaments:
        group = tournament["tournamentGroup"]
        tournament_id, year = str(group["id"]), int(tournament["year"])
        start_date = date.fromisoformat(tournament["startDate"]).isoformat()
        end_date = date.fromisoformat(tournament["endDate"]).isoformat()
        key = (tournament_id, year, start_date)
        if key in seen:
            raise ValueError(f"Duplicate WTA tournament: {key}")
        seen.add(key)
        if end_date < start or end_date > through:
            continue
        # United Cup is a team title; Olympic medals are outside this Tour/125/Grand Slam file.
        if tournament_id in ("2084", "650"):
            continue
        metadata = group.get("metadata") or {}
        if str(year) in re.findall(r"\b\d{4}\b", str(metadata.get("cancelledSeasons") or "")):
            continue
        champion = calendar_champion(tournament)
        records = title_records.get((tournament_id, year), [])
        verified = [record for record in records if not champion or record["champion"]["id"] == champion["id"]]
        unique = {record["champion"]["id"]: record for record in verified}
        verified_record = next(iter(unique.values())) if len(unique) == 1 else None
        if tournament.get("level") == "ITF" and verified_record is None:
            continue
        if verified_record and champion is None:
            champion = verified_record["champion"]
        row = {
            "end_date": end_date, "start_date": start_date, "year": year,
            "tournament_id": tournament_id, "name": tournament.get("title") or group["name"],
            "city": tournament.get("city") or group["name"],
            "category": tournament.get("level") or group.get("level") or "",
            "country": tournament.get("country") or "", "surface": tournament.get("surface") or "",
            "source_url": f"{API}{tournament_id}/{year}",
        }
        if verified_record:
            if tournament.get("level") == "ITF":
                row["category"] = verified_record["category"]
            row["record_source_url"] = verified_record["record_source_url"]
        if champion is None:
            match_url = row["source_url"] + "/matches?states=C"
            try:
                champion = final_champion(fetch_json(match_url)["matches"])
            except HTTPError as exc:
                if exc.code != 404:
                    raise
            if champion:
                row["source_url"] = match_url
        if champion:
            champions.append({**row, "champion": champion})
        else:
            missing.append({**row, "reason": "No singles champion or identifiable completed final in the WTA API"})
    def sort_key(row):
        return row["end_date"], row["start_date"], row["tournament_id"], row["year"]

    champions.sort(key=sort_key)
    missing.sort(key=sort_key)
    return champions, missing


def save_history(path, payload):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-year", type=int, default=2000)
    parser.add_argument("--through", type=date.fromisoformat,
                        default=datetime.now(ZoneInfo("Europe/Madrid")).date())
    parser.add_argument("--output", type=Path, default=ROOT / "wta_champions.json")
    args = parser.parse_args()
    start = date(args.start_year, 1, 1).isoformat()
    through = args.through.isoformat()
    if start > through:
        parser.error("--start-year must not be later than --through")
    print(f"Reading official WTA calendar: {start} through {through}", flush=True)
    tournaments = fetch_calendar(start, through)
    print(f"Checking singles champions for {len(tournaments)} calendar entries", flush=True)
    title_records = fetch_title_records(tournaments)
    champions, missing = collect_champions(tournaments, start, through, title_records)
    payload = {
        "updated_at": datetime.now(UTC).isoformat(), "from": start, "through": through,
        "scope": "Individual singles champions; WTA Tour, historical Tour levels, WTA 125 and Grand Slams",
        "order": "Tournament end date, oldest first; this is not necessarily the actual final match date",
        "coverage_note": (
            "Available records within the requested date range. Historical events labelled ITF in the WTA calendar "
            "are included only when the official WTA singles player records verify a Tour title in that season. "
            "Records marked explicitly ITF are excluded from historical candidate discovery. "
            "Coverage depends on WTA's published records; this does not assert a complete history of every title. "
            "Cancelled, unfinished, team and Olympic events are excluded. Unavailable champions are listed separately."
        ),
        "champion_count": len(champions), "missing_champion_count": len(missing),
        "champions": champions, "missing_champions": missing,
    }
    save_history(args.output, payload)
    print(f"Saved {len(champions)} singles champions; {len(missing)} unresolved events: {args.output}")


if __name__ == "__main__":
    main()
