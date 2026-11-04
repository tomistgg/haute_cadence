import csv
import json
import os
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import build_site
import serve_site
import shared_data


def event(tid=1, start="2026-11-02", end="2026-11-08", **changes):
    return {
        "tournamentGroup": {"id": tid, "name": "CITY"}, "year": 2026,
        "title": "Example Open", "city": "City", "level": "WTA 250",
        "startDate": start, "endDate": end,
    } | changes


def snapshot(items):
    fields = ["column", "name", "level", "startDate", "endDate", "calendarKey", "tournamentId"]
    return {"fields": fields, "weeks": {"week": [
        ["wta_tour", item["title"], item["level"], item["startDate"], item["endDate"],
         f"wta:{item['tournamentGroup']['id']}:{item['year']}", item["tournamentGroup"]["id"]]
        for item in items
    ]}}


class SharedDataTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.environment = patch.dict(os.environ, {"HAUTE_CADENCE_DATA_DIR": str(self.directory)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        for name in shared_data.RANKING_FILES:
            (self.directory / name).write_text("week_date,id,rank,points,player,country,dob\n", encoding="utf-8")
        self.save("calendar_snapshot.json", snapshot([event()]))
        self.save("wta_full_calendar_cache.json", {
            "from": "2026-10-07", "to": "2027-12-31", "items": [event()],
        })

    def save(self, name, payload):
        path = self.directory / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_shared_sources_are_required_and_never_fall_back_to_the_copied_csvs(self):
        self.assertEqual(shared_data.ranking_sources(), [self.directory / name for name in shared_data.RANKING_FILES])
        (self.directory / shared_data.RANKING_FILES[-1]).unlink()
        with self.assertRaisesRegex(FileNotFoundError, "HAUTE_CADENCE_DATA_DIR"):
            shared_data.ranking_sources()

    def test_live_discovery_includes_whole_overlapping_tournament_not_just_its_start_day(self):
        cancelled = event(2, tournamentGroup={"id": 2, "metadata": {"cancelledSeasons": "2026"}})
        self.save("wta_full_calendar_cache.json", {"items": [
            event(), cancelled, event(3, start="2026-11-09", end="2026-11-15"),
        ]})
        self.assertEqual([row["tournamentGroup"]["id"] for row in
                          shared_data.calendar_tournaments("2026-11-04", "2026-11-05")], [1])

    def test_calendar_keeps_past_entries_but_replaces_reschedules_removes_cancelled_and_adds_future(self):
        past = event(5, start="2026-01-01", end="2026-01-08")
        removed = event(6)
        cancelled = event(7, tournamentGroup={"id": 7, "metadata": {"cancelledSeasons": "2026"}})
        archive = self.save("archive.json", snapshot([past, event(), removed, cancelled]))
        moved = event(start="2026-11-09", end="2026-11-15", city="New City")
        future = event(8, start="2027-01-04", end="2027-01-10", year=2027)
        self.save("wta_full_calendar_cache.json", {
            "from": "2026-10-07", "to": "2027-12-31", "items": [moved, cancelled, future],
        })
        rows = {row["calendarKey"]: row for row in shared_data.calendar_rows(shared_data.merged_calendar(archive))}
        self.assertEqual(set(rows), {"wta:5:2026", "wta:1:2026", "wta:8:2027"})
        self.assertEqual(rows["wta:1:2026"]["startDate"], "2026-11-09")
        self.assertEqual(rows["wta:1:2026"]["city"], "New City")
        self.assertEqual(rows["wta:8:2027"]["year"], 2027)

    def test_invalid_shared_calendar_fails_before_replacing_the_archive(self):
        archive = self.save("archive.json", snapshot([event()]))
        original = archive.read_bytes()
        self.save("calendar_snapshot.json", {"fields": [], "weeks": {}})
        with self.assertRaises(ValueError):
            shared_data.merged_calendar(archive)
        self.assertEqual(archive.read_bytes(), original)

    def test_build_uses_all_four_shared_ranking_files_for_current_former_and_career_best(self):
        for filename, rows in zip(shared_data.RANKING_FILES, [
            [["1999-01-04", "1", 2, 100, "Example Player", "FRA", "1980-01-01"]],
            [["2009-01-05", "1", 2, 100, "Example Player", "FRA", "1980-01-01"]],
            [["2019-01-07", "1", 8, 100, "Example Player", "FRA", "1980-01-01"]],
            [["2025-11-03", "2", 300, 50, "Former Player", "ARG", "2000-01-01"],
             ["2026-10-26", "1", 11, 100, "Example Player", "FRA", "1980-01-01"],
             ["2026-11-02", "1", 10, 100, "Example Player", "FRA", "1980-01-01"]],
        ], strict=True):
            with (self.directory / filename).open("a", encoding="utf-8", newline="") as handle:
                csv.writer(handle).writerows(rows)
        history = self.save("champions.json", {"champions": []})
        archive = self.directory / "archive.json"
        output = self.directory / "site"
        output.mkdir()
        with patch.object(build_site, "DIST", output), patch.object(build_site, "CALENDAR", archive), \
                patch.object(build_site, "CHAMPIONS", history), patch.object(build_site, "ASSETS", {}):
            build_site.main()
        payload = json.loads((output / "data" / "players.json").read_text(encoding="utf-8"))
        self.assertEqual(payload["snapshot_date"], "2026-11-02")
        ranked, former = payload["players"]
        self.assertEqual((ranked["rank"], ranked["previous_rank"], ranked["best_rank"], ranked["best_rank_year"]),
                         (10, 11, 2, 2009))
        self.assertIsNone(former["rank"])
        self.assertEqual(former["last_rank"], 300)


class FeedRefreshTest(unittest.TestCase):
    def test_failed_live_refresh_preserves_the_last_successful_feed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feed.json"
            previous = {"updated_at": "2026-01-01T00:00:00Z", "tournaments": ["saved"]}
            path.write_text(json.dumps(previous), encoding="utf-8")
            with patch.object(serve_site, "merge_draw_champions", side_effect=OSError("disk full")):
                result = serve_site.refresh_feed(path, lambda: {"updated_at": datetime.now(UTC).isoformat()})
            self.assertEqual(result["tournaments"], ["saved"])
            self.assertIn("refresh_error", result)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), previous)

    def test_shared_changes_rebuild_once_and_unchanged_requests_do_not(self):
        with patch.object(serve_site, "_site_signature", None), \
                patch.object(serve_site, "source_signature", side_effect=[1, 1, 2]), \
                patch.object(serve_site, "build_site") as build:
            serve_site.refresh_site_data()
            serve_site.refresh_site_data()
            serve_site.refresh_site_data()
            self.assertEqual(build.call_count, 2)


if __name__ == "__main__":
    unittest.main()
