import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_site


class SiteBuildTest(unittest.TestCase):
    def test_builds_latest_rankings_with_last_career_best_year_and_latest_titles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / "dist"
            dist.mkdir()
            data_dir = root / "data"
            data_dir.mkdir()
            for name in (
                "index.html", "app.js", "cards.css", "export-card.js", "result-card.js", "draw-card.js",
                "schedule-card.js",
            ):
                (root / name).write_text("", encoding="utf-8")
            calendar = data_dir / "calendar_snapshot.json"
            calendar.write_text("{}", encoding="utf-8")
            titles = [
                {"champion": {"id": 1, "name": "Different spelling"}, "end_date": "2026-10-25",
                 "start_date": "2026-10-19", "tournament_id": "100", "year": 2026,
                 "category": "WTA 500", "name": "Latest Open", "city": "Tokyo"},
                {"champion": {"id": "1"}, "end_date": "2025-11-02", "start_date": "2025-10-27",
                 "tournament_id": "101", "year": 2025, "category": "WTA 250", "name": "Older Open"},
                {"champion": {"id": "2"}, "end_date": "2024-10-20", "start_date": "2024-10-14",
                 "tournament_id": "102", "year": 2024, "category": "WTA 125", "name": "Past Season Open"},
                {"champion": {"id": "99", "name": "Player 3"}, "end_date": "2026-11-01",
                 "start_date": "2026-10-26", "tournament_id": "103", "year": 2026,
                 "category": "WTA 125", "name": "Same Name Different Player"},
                {"champion": {"id": "1"}, "end_date": "2026-11-01", "start_date": "2026-10-26",
                 "tournament_id": "104", "year": 2026, "category": "WTA 125", "name": "Latest 125 Open"},
            ]
            champions = data_dir / "wta_champions.json"
            champions.write_text(json.dumps({"champions": titles}), encoding="utf-8")
            history = [
                ("2010-01-04", "1", 5), ("2019-01-07", "1", 5),
                ("2016-01-04", "2", 20), ("2018-01-01", "2", 20),
                ("2019-12-30", "3", 2),
            ]
            current = [
                ("2024-11-02", "4", 100), ("2024-11-01", "5", 200), ("2025-11-03", "6", 900),
                ("2020-01-06", "1", 15), ("2020-01-06", "2", 20), ("2020-01-06", "3", 5),
                ("2025-11-03", "1", 15), ("2025-11-03", "2", 20), ("2025-11-03", "3", 1),
                ("2026-11-02", "1", 12), ("2026-11-02", "2", 30), ("2026-11-02", "3", 4),
            ]
            sources = []
            for index, rows in enumerate((history, current)):
                source = data_dir / f"rankings_{index}.csv"
                with source.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.writer(handle)
                    writer.writerow(("week_date", "id", "rank", "points", "player", "country", "dob"))
                    for week, player_id, rank in rows:
                        writer.writerow((week, player_id, rank, 100, f"Player {player_id}", "ARM", "2000-01-01"))
                sources.append(source)
            with (
                patch.multiple(build_site, ROOT=root, DIST=dist, CALENDAR=calendar, CHAMPIONS=champions, ASSETS={}),
                patch.object(build_site, "ranking_sources", return_value=sources),
                patch.object(build_site, "load_player_names", return_value=({}, {})),
                patch.object(build_site, "merged_calendar", return_value={}),
            ):
                with (
                    patch.object(build_site, "ASSETS", {"missing.png": root / "missing.png"}),
                    self.assertRaisesRegex(FileNotFoundError, "Missing site asset"),
                ):
                    build_site.main()
                build_site.main()
            data = json.loads((dist / "data" / "players.json").read_text(encoding="utf-8"))
            players = {player["id"]: player for player in data["players"]}
            self.assertEqual(data["snapshot_date"], "2026-11-02")
            self.assertEqual({key: (row["best_rank"], row["best_rank_year"]) for key, row in players.items()}, {
                "1": (5, 2019), "2": (20, 2025), "3": (1, 2025), "4": (100, 2024), "6": (900, 2025),
            })
            self.assertEqual({key: row["previous_rank"] for key, row in players.items()}, {
                "1": 15, "2": 20, "3": 1, "4": None, "6": None,
            })
            self.assertIsNone(players["4"]["rank"])
            self.assertIsNone(players["6"]["rank"])
            self.assertEqual(players["4"]["last_rank"], 100)
            self.assertEqual(players["4"]["last_rank_date"], "2024-11-02")
            self.assertNotIn("5", players)
            self.assertEqual(players["1"]["latest_title"], titles[0])
            self.assertEqual(players["2"]["latest_title"], titles[2])
            self.assertIsNone(players["3"]["latest_title"])
            self.assertEqual({key: row["tour_title_count"] for key, row in players.items()}, {
                "1": 2, "2": 0, "3": 0, "4": 0, "6": 0,
            })



if __name__ == "__main__":
    unittest.main()
