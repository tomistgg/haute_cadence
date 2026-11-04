import csv
import io
import json
import os
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock, patch

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
        self.save("itf_calendar_cache.json", {"year": 2026, "count": 0, "items": []})
        self.save(shared_data.PLAYER_NAMES_FILE, [])
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

    def test_player_names_use_ids_keep_all_source_aliases_and_ignore_ambiguous_name_fallbacks(self):
        rows = [
            {"wta_id": "334512", "display_name": "Maaya Rajeshwaran", "wta_name": "Maaya Rajeshwaran Revathi",
             "itf_name": "Maaya Rajeshwaran Revathi", "aliases": ["Shared alias"], "additional_wta_ids": ["334513"]},
            {"wta_id": "2", "display_name": "Other Player", "aliases": ["Shared alias"]},
            {"wta_id": "3", "display_name": "Duplicate Name (CZE)", "presentation_name": "Duplicate Name"},
        ]
        path = self.save(shared_data.PLAYER_NAMES_FILE, rows)
        original = path.read_bytes()
        by_id, index = shared_data.load_player_names()
        self.assertEqual(by_id["334512"]["display_name"], "Maaya Rajeshwaran")
        self.assertEqual(index["by_wta_id"]["334513"], "Maaya Rajeshwaran")
        self.assertIn("Maaya Rajeshwaran Revathi", by_id["334512"]["aliases"])
        self.assertEqual(index["by_name"]["maaya rajeshwaran revathi"], "Maaya Rajeshwaran")
        self.assertNotIn("shared alias", index["by_name"])
        self.assertEqual(index["by_wta_id"]["3"], "Duplicate Name")
        self.assertEqual(path.read_bytes(), original)

    def test_conflicting_wta_ids_and_invalid_player_name_records_are_rejected(self):
        for rows in [
            [{"wta_id": "1", "display_name": "One"}, {"wta_id": "1", "display_name": "Another"}],
            [{"wta_id": "1", "display_name": ""}],
            [{"wta_id": "1", "display_name": "One", "aliases": "Not a list"}],
        ]:
            with self.subTest(rows=rows):
                self.save(shared_data.PLAYER_NAMES_FILE, rows)
                with self.assertRaises(ValueError):
                    shared_data.load_player_names()

    def test_alias_file_changes_invalidate_the_local_server_data_signature(self):
        before = shared_data.source_signature()
        self.save(shared_data.PLAYER_NAMES_FILE, [{"wta_id": "1", "display_name": "Changed"}])
        self.assertNotEqual(shared_data.source_signature(), before)

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

    def test_full_itf_calendar_adds_current_events_and_replaces_reschedules_and_removals(self):
        item = {
            "name": "W50 Huamantla", "location": "Huamantla", "category": "W50",
            "startDate": "2026-11-02T00:00:00", "endDate": "2026-11-08T00:00:00",
            "tournamentKey": "W-ITF-MEX-2026-010", "hostNationCode": "MEX", "surfaceDesc": "Hard",
        }
        path = self.save("itf_calendar_cache.json", {"year": 2026, "count": 1, "items": [item]})
        original = path.read_bytes()
        archive = self.directory / "archive.json"
        merged = shared_data.merged_calendar(archive)
        rows = {row["calendarKey"]: row for row in shared_data.calendar_rows(merged)}
        tournament = rows["itf:w-itf-mex-2026-010"]
        self.assertEqual((tournament["city"], tournament["level"], tournament["country"]), ("Huamantla", "W50", "MEX"))
        self.assertEqual((tournament["startDate"], tournament["endDate"]), ("2026-11-02", "2026-11-08"))
        self.assertEqual(path.read_bytes(), original)
        self.save("archive.json", merged)
        self.save("itf_calendar_cache.json", {"year": 2026, "count": 1, "items": [
            item | {"startDate": "2026-11-09", "endDate": "2026-11-15"},
        ]})
        rows = {row["calendarKey"]: row for row in shared_data.calendar_rows(shared_data.merged_calendar(archive))}
        self.assertEqual(rows["itf:w-itf-mex-2026-010"]["startDate"], "2026-11-09")
        self.save("itf_calendar_cache.json", {"year": 2026, "count": 0, "items": []})
        self.assertNotIn("itf:w-itf-mex-2026-010", {
            row["calendarKey"] for row in shared_data.calendar_rows(shared_data.merged_calendar(archive))
        })

    def test_invalid_itf_calendar_is_rejected_before_replacing_saved_data(self):
        item = {"name": "W15 City", "category": "W15", "tournamentKey": "W-ITF-FRA-2026-001",
                "startDate": "2026-11-02", "endDate": "2026-11-08"}
        archive = self.save("archive.json", snapshot([event()]))
        original = archive.read_bytes()
        for changes, count in [({}, 2), ({"tournamentKey": ""}, 1), ({"endDate": "2026-11-01"}, 1)]:
            with self.subTest(changes=changes, count=count):
                self.save("itf_calendar_cache.json", {"year": 2026, "count": count, "items": [item | changes]})
                with self.assertRaises(ValueError):
                    shared_data.merged_calendar(archive)
                self.assertEqual(archive.read_bytes(), original)

    def test_build_uses_all_four_shared_ranking_files_for_current_former_and_career_best(self):
        self.save(shared_data.PLAYER_NAMES_FILE, [
            {"wta_id": "1", "display_name": "Short Player", "itf_name": "ITF Example Fullname"},
            {"wta_id": "99", "display_name": "Unranked Display", "wta_name": "Unranked Fullname"},
        ])
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
        self.assertEqual(ranked["name"], "Example Player")
        self.assertEqual(ranked["display_name"], "Short Player")
        self.assertIn("ITF Example Fullname", ranked["aliases"])
        self.assertEqual(payload["player_names"]["by_wta_id"]["99"], "Unranked Display")
        self.assertEqual((ranked["rank"], ranked["previous_rank"], ranked["best_rank"], ranked["best_rank_year"]),
                         (10, 11, 2, 2009))
        self.assertIsNone(former["rank"])
        self.assertEqual(former["last_rank"], 300)


class FeedRefreshTest(unittest.TestCase):
    def test_manual_refresh_bypasses_fresh_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feed.json"
            previous = {"updated_at": datetime.now(UTC).isoformat(), "matches": []}
            path.write_text(json.dumps(previous), encoding="utf-8")
            fresh = previous | {"matches": ["new match"]}
            collect = Mock(return_value=fresh)
            self.assertEqual(serve_site.refresh_feed(path, collect), previous)
            collect.assert_not_called()
            with patch.object(serve_site, "merge_draw_champions"):
                self.assertEqual(serve_site.refresh_feed(path, collect, force=True), fresh)
            collect.assert_called_once_with()
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), fresh)

    def test_feed_endpoints_force_refresh_without_reading_shared_data(self):
        for filename, output, collect in [
            ("recent_results", serve_site.OUTPUT, serve_site.collect_results),
            ("current_draws", serve_site.DRAW_OUTPUT, serve_site.collect_draws),
        ]:
            with self.subTest(feed=filename):
                handler = object.__new__(serve_site.CardHandler)
                handler.path = f"/data/{filename}.json?refresh=1&t=123"
                handler.wfile = io.BytesIO()
                handler.send_response = Mock()
                handler.send_header = Mock()
                handler.end_headers = Mock()
                with patch.object(serve_site, "refresh_feed", return_value={"updated_at": "now"}) as refresh, \
                        patch.object(serve_site, "refresh_site_data", side_effect=OSError("WTARG")) as shared:
                    handler.do_GET()
                refresh.assert_called_once_with(output, collect, force=True)
                shared.assert_not_called()
                handler.send_response.assert_called_once_with(200)

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
