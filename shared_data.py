"""Read rankings and calendars saved by tenis-fem-arg; never fetch WTA data here."""

from __future__ import annotations

import json
import os
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RANKING_FILES = tuple(f"wta_rankings_{period}.csv" for period in ("83_99", "00_09", "10_19", "20_29"))
CALENDAR_FILES = ("calendar_snapshot.json", "wta_full_calendar_cache.json")


def source_directory():
    directory = Path(os.environ.get("HAUTE_CADENCE_DATA_DIR") or ROOT.parent / "tenis-fem-arg" / "data").resolve()
    for name in (*RANKING_FILES, *CALENDAR_FILES):
        if not (directory / name).is_file():
            raise FileNotFoundError(f"Missing shared data: {directory / name}. Set HAUTE_CADENCE_DATA_DIR if needed.")
    return directory


def ranking_sources():
    return [source_directory() / name for name in RANKING_FILES]


def source_signature():
    directory = source_directory()
    files = [directory / name for name in (*RANKING_FILES, *CALENDAR_FILES)]
    files.append(ROOT / "data" / "wta_champions.json")
    return tuple((str(path), path.stat().st_mtime_ns, path.stat().st_size) for path in files)


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


def calendar_tournaments(start, through):
    """Select overlapping events for the live WTA draw/result readers."""
    return [item for item in read_calendar()["items"] if not cancelled(item)
            and item["startDate"][:10] <= through and item["endDate"][:10] >= start]


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
    fields = list(dict.fromkeys([*shared["fields"], "city", "year"]))
    rows = {row["calendarKey"]: row for row in calendar_rows(prior)}
    for row in calendar_rows(shared):
        key = row["calendarKey"]
        rows[key] = rows.get(key, {}) | row
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
