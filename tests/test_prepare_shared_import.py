import csv
import json
import os
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import build_site
import shared_data
from cloudflare import prepare_import


def calendar_snapshot(name="Saved Open", year=2026):
    return {
        "fields": ["column", "name", "level", "startDate", "endDate", "calendarKey", "tournamentId"],
        "weeks": {f"{year}-11-09": [[
            "wta_tour", name, "WTA 250", f"{year}-11-09", f"{year}-11-15", f"wta:100:{year}", 100,
        ]]},
    }


class PrepareSharedImportTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.shared = self.root / "shared"
        self.shared.mkdir()
        self.data = self.root / "data"
        self.data.mkdir()
        self.champions = self.data / "wta_champions.json"
        self.calendar = self.data / "calendar_snapshot.json"
        self.dist = self.root / "dist"
        self.output = self.root / "prepared" / "import-bundle.json"
        for context in [
            patch.dict(os.environ, {"HAUTE_CADENCE_DATA_DIR": str(self.shared)}),
            patch.multiple(build_site, ROOT=self.root, DIST=self.dist, CHAMPIONS=self.champions,
                           CALENDAR=self.calendar),
        ]:
            context.start()
            self.addCleanup(context.stop)
        ranking_rows = [
            [("1999-01-04", "1", 2)], [("2009-01-05", "1", 2)], [("2019-01-07", "1", 8)],
            [("2025-11-03", "2", 300), ("2026-10-26", "1", 11), ("2026-11-02", "1", 10)],
        ]
        for filename, rows in zip(shared_data.RANKING_FILES, ranking_rows, strict=True):
            with (self.shared / filename).open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["week_date", "id", "rank", "points", "player", "country", "dob"])
                for week, player_id, rank in rows:
                    writer.writerow([week, player_id, rank, 100, "Player " + player_id, "ARG", "2000-01-01"])
        self.save(self.shared / shared_data.PLAYER_NAMES_FILE, [
            {"wta_id": "1", "display_name": "Short Player", "wta_name": "Player 1", "aliases": ["Custom Alias"]},
            {"wta_id": "99", "display_name": "Outside Directory", "wta_name": "Unranked Player"},
        ])
        self.save(self.shared / "calendar_snapshot.json", calendar_snapshot())
        self.save(self.calendar, calendar_snapshot())
        self.save(self.shared / "wta_full_calendar_cache.json", {
            "from": "2026-10-07", "to": "2027-12-31", "items": [{
                "tournamentGroup": {"id": 100, "name": "CITY"}, "year": 2026, "title": "Current Open",
                "city": "City", "level": "WTA 250", "startDate": "2026-11-09", "endDate": "2026-11-15",
            }],
        })
        self.save(self.shared / "itf_calendar_cache.json", {"year": 2026, "count": 0, "items": []})
        self.title = {
            "tournament_id": "101", "year": 2026, "start_date": "2026-10-26", "end_date": "2026-11-01",
            "name": "Title Open", "city": "Title City", "category": "WTA 250", "surface": "Hard",
            "champion": {"id": "1", "name": "Player 1", "country": "ARG"},
        }
        self.save(self.champions, {
            "updated_at": "2026-11-02T10:00:00Z", "coverage_note": "Preserve incomplete historical coverage.",
            "champion_count": 1, "champions": [self.title], "missing_champions": [{"tournament_id": "102"}],
        })

    @staticmethod
    def save(path, payload):
        path.write_text(json.dumps(payload), encoding="utf-8")

    def source_bytes(self):
        return {path: path.read_bytes() for directory in [self.shared, self.data] for path in directory.iterdir()}

    def test_preparation_reuses_current_business_rules_without_building_or_modifying_sources(self):
        original = self.source_bytes()
        result = prepare_import.prepare_import(self.output, now=datetime(2026, 11, 12, 10, tzinfo=UTC))
        self.assertEqual(result["prepared_at"], "2026-11-12T10:00:00+00:00")
        self.assertEqual(json.loads(self.output.read_text(encoding="utf-8")), result)
        self.assertEqual(self.source_bytes(), original)
        self.assertFalse(self.dist.exists(), "preparing data must not rebuild or replace the website")
        self.assertEqual(result["players"], build_site.build_player_payload())
        ranked, former = result["players"]["players"]
        self.assertEqual((ranked["rank"], ranked["previous_rank"], ranked["best_rank"], ranked["best_rank_year"]),
                         (10, 11, 2, 2009))
        self.assertEqual(ranked["display_name"], "Short Player")
        self.assertIn("Custom Alias", ranked["aliases"])
        self.assertEqual(ranked["tour_title_count"], 1)
        self.assertEqual(ranked["latest_title"], self.title)
        self.assertIsNone(former["rank"])
        self.assertEqual(former["last_rank"], 300)
        self.assertEqual(result["players"]["player_names"]["by_wta_id"]["99"], "Outside Directory")
        self.assertEqual(result["champions"]["coverage_note"], "Preserve incomplete historical coverage.")
        self.assertEqual(result["champions"]["missing_champions"], [{"tournament_id": "102"}])
        self.assertEqual(len(result["sources"]), len(shared_data.SHARED_FILES) + 2)
        self.assertTrue(all(len(row["sha256"]) == 64 and row["bytes"] > 0 for row in result["sources"]))

    def test_separately_staged_archives_are_used_without_replacing_the_tracked_sources(self):
        original = self.source_bytes()
        stage = self.root / "stage"
        stage.mkdir()
        champions = stage / "champions.json"
        calendar = stage / "calendar.json"
        title = self.title | {"city": "Published Archive"}
        self.save(champions, {"champions": [title], "coverage_note": "Staged coverage"})
        self.save(calendar, calendar_snapshot("Past Archived Event", 2025))
        result = prepare_import.prepare_import(self.output, champions_path=champions, calendar_path=calendar)
        self.assertEqual(result["players"]["players"][0]["latest_title"], title)
        self.assertEqual(result["champions"]["coverage_note"], "Staged coverage")
        names = [row[result["calendar"]["fields"].index("name")]
                 for rows in result["calendar"]["weeks"].values() for row in rows]
        self.assertIn("Past Archived Event", names)
        self.assertEqual(self.source_bytes(), original)

    def test_unsafe_destinations_and_unstable_sources_do_not_replace_existing_data(self):
        original = self.source_bytes()
        for output in [self.champions, self.calendar, self.shared / "new.json", self.dist / "data.json"]:
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, "must not overwrite"):
                prepare_import.prepare_import(output)
        self.assertEqual(self.source_bytes(), original)
        self.output.parent.mkdir()
        self.output.write_text("Keep existing prepared output", encoding="utf-8")
        before = [{"path": "source", "sha256": "a" * 64, "bytes": 1}]
        after = [{"path": "source", "sha256": "b" * 64, "bytes": 1}]
        with patch.object(prepare_import, "fingerprints", side_effect=[before, after]), \
                self.assertRaisesRegex(ValueError, "Source data changed"):
            prepare_import.prepare_import(self.output)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "Keep existing prepared output")
        self.assertEqual(self.source_bytes(), original)


if __name__ == "__main__":
    unittest.main()
