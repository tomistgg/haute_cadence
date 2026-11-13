"""Read rankings and calendars saved by tenis-fem-arg; never fetch WTA data here."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RANKING_FILES = tuple(f"wta_rankings_{period}.csv" for period in ("83_99", "00_09", "10_19", "20_29"))
CALENDAR_FILES = ("calendar_snapshot.json", "wta_full_calendar_cache.json", "itf_calendar_cache.json")
PLAYER_NAMES_FILE = "player_aliases_wta_itf.json"
SHARED_FILES = (*RANKING_FILES, *CALENDAR_FILES, PLAYER_NAMES_FILE)


def source_directory():
    directory = Path(os.environ.get("HAUTE_CADENCE_DATA_DIR") or ROOT.parent / "tenis-fem-arg" / "data").resolve()
    for name in SHARED_FILES:
        if not (directory / name).is_file():
            raise FileNotFoundError(f"Missing shared data: {directory / name}. Set HAUTE_CADENCE_DATA_DIR if needed.")
    return directory


def ranking_sources():
    return [source_directory() / name for name in RANKING_FILES]


def normalized_player_name(name):
    return "".join(char for char in unicodedata.normalize("NFD", name)
                   if not "\u0300" <= char <= "\u036f").lower()


def load_player_names():
    path = source_directory() / PLAYER_NAMES_FILE
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"Player names must be a list: {path}")
    by_wta_id, by_name = {}, {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("display_name"), str) or not row["display_name"].strip():
            raise ValueError(f"Player name record is missing display_name: {path}")
        if any(not isinstance(row.get(field, []), list) for field in ("aliases", "additional_wta_ids")):
            raise ValueError(f"Player aliases and additional WTA IDs must be lists: {path}")
        if row.get("presentation_name") and not isinstance(row["presentation_name"], str):
            raise ValueError(f"Player presentation_name must be text: {path}")
        display = (row.get("presentation_name") or row["display_name"]).strip()
        aliases = list(dict.fromkeys(name.strip() for name in (
            display, row["display_name"], row.get("wta_name"), row.get("itf_name"), row.get("bjkc_name"),
            *row.get("aliases", []),
        ) if isinstance(name, str) and name.strip()))
        record = {"display_name": display, "aliases": aliases}
        for value in (row.get("wta_id"), *row.get("additional_wta_ids", [])):
            player_id = str(value or "").strip()
            if not player_id:
                continue
            if player_id in by_wta_id and by_wta_id[player_id] != record:
                raise ValueError(f"Conflicting player names for WTA ID {player_id}: {path}")
            by_wta_id[player_id] = record
        for alias in aliases:
            key = normalized_player_name(alias)
            by_name.setdefault(key, set()).add(display)
    # Name-only fallback is safe only when the source does not assign that alias to different display names.
    index = {"by_wta_id": {key: row["display_name"] for key, row in by_wta_id.items()},
             "by_name": {key: next(iter(names)) for key, names in by_name.items() if len(names) == 1}}
    return by_wta_id, index


def read_calendar():
    path = source_directory() / "wta_full_calendar_cache.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload.get("items"), list) or not payload["items"]:
        raise ValueError(f"Shared WTA calendar has no tournaments: {path}")
    for item in payload["items"]:
        if not isinstance(item, dict) or not (item.get("tournamentGroup") or {}).get("id"):
            raise ValueError(f"Shared WTA calendar contains an invalid tournament: {path}")
        date.fromisoformat(item["startDate"][:10])
        date.fromisoformat(item["endDate"][:10])
        if item["endDate"][:10] < item["startDate"][:10]:
            raise ValueError(f"Shared WTA tournament ends before it starts: {path}")
    return payload


def cancelled(item):
    group = item.get("tournamentGroup") or {}
    seasons = str((group.get("metadata") or {}).get("cancelledSeasons") or "")
    return str(item["year"]) in re.findall(r"\b\d{4}\b", seasons)


def calendar_rows(payload):
    if not isinstance(payload.get("fields"), list) or not isinstance(payload.get("weeks"), dict):
        raise ValueError("Calendar snapshot must contain fields and weeks")
    required = {"column", "name", "level", "startDate", "endDate", "calendarKey"}
    if not required.issubset(payload["fields"]):
        raise ValueError("Calendar snapshot is missing required fields")
    for rows in payload["weeks"].values():
        for row in rows:
            if not isinstance(row, list) or len(row) != len(payload["fields"]):
                raise ValueError("Calendar snapshot contains an invalid row")
            item = dict(zip(payload["fields"], row, strict=True))
            date.fromisoformat(item["startDate"][:10])
            yield item


def merged_calendar(archive):
    """Keep past events outside the shared cache's window; shared data owns current entries."""
    directory = source_directory()
    live = read_calendar()
    shared = json.loads((directory / "calendar_snapshot.json").read_text(encoding="utf-8"))
    prior = json.loads(archive.read_text(encoding="utf-8")) if archive.is_file() else shared
    fields = list(dict.fromkeys([*shared["fields"], "city", "year", "source", "surface", "country", "tournamentKey"]))
    rows = {row["calendarKey"]: row for row in calendar_rows(prior)}
    for row in calendar_rows(shared):
        key = row["calendarKey"]
        rows[key] = rows.get(key, {}) | row
    itf = json.loads((directory / "itf_calendar_cache.json").read_text(encoding="utf-8"))
    if not isinstance(itf.get("items"), list) or itf.get("count") != len(itf["items"]):
        raise ValueError("Shared ITF calendar has an incomplete tournament list")
    itf_rows = {}
    for item in itf["items"]:
        category = item.get("category")
        if category not in {"W100", "W75", "W50", "W35", "W15"}:
            continue
        tournament_key = str(item.get("tournamentKey", "")).lower()
        if not re.fullmatch(r"w-itf-[a-z]{3}-\d{4}-\d+", tournament_key) or not item.get("name"):
            raise ValueError("Shared ITF calendar contains an invalid tournament")
        start, end = date.fromisoformat(item["startDate"][:10]), date.fromisoformat(item["endDate"][:10])
        if end < start:
            raise ValueError("Shared ITF tournament ends before it starts")
        key = "itf:" + tournament_key
        itf_rows[key] = {
            "column": "itf", "name": item["name"], "level": category, "source": "ITF",
            "city": item.get("location") or re.sub(r"^W\d+\s+", "", item["name"]),
            "country": item.get("hostNationCode", ""), "surface": item.get("surfaceDesc", ""),
            "startDate": start.isoformat(), "endDate": end.isoformat(),
            "calendarKey": key, "tournamentKey": tournament_key, "year": int(tournament_key.split("-")[3]),
        }
    for key in list(rows):
        if str(key).startswith("itf:") and f"-{itf['year']}-" in str(key) and key not in itf_rows:
            del rows[key]
    for key, item in itf_rows.items():
        rows[key] = rows.get(key, {}) | item
    # Removed or cancelled WTA events within the authoritative cache window must disappear.
    live_keys = {f"wta:{item['tournamentGroup']['id']}:{item['year']}" for item in live["items"]
                 if not cancelled(item)}
    for key, row in list(rows.items()):
        if (str(key).startswith("wta:") and "|qualifying" not in str(key)
                and live["from"] <= row["startDate"][:10] <= live["to"] and key not in live_keys):
            del rows[key]
    for item in live["items"]:
        key = f"wta:{item['tournamentGroup']['id']}:{item['year']}"
        if cancelled(item):
            rows.pop(key, None)
            rows.pop(key + "|qualifying", None)
            continue
        level = item.get("level") or item["tournamentGroup"].get("level") or ""
        if level == "ITF":
            continue
        column = "wta_125" if level == "WTA 125" else "gs" if "Grand Slam" in level else "wta_tour"
        rows[key] = rows.get(key, {}) | {
            "column": column, "name": item.get("title") or item["tournamentGroup"].get("name") or "WTA",
            "level": level, "surface": item.get("surface", ""), "country": item.get("country", ""),
            "startDate": item["startDate"], "endDate": item["endDate"], "source": "WTA",
            "tournamentId": item["tournamentGroup"]["id"], "calendarKey": key,
            "city": item.get("city") or item["tournamentGroup"].get("name") or "", "year": item["year"],
        }
    weeks = {}
    for row in sorted(rows.values(), key=lambda item: (item["startDate"], item["calendarKey"])):
        week = row["startDate"][:10]
        weeks.setdefault(week, []).append([row.get(field, "") for field in fields])
    return {"fields": fields, "weeks": weeks}
