import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_site


class CareerBestYearTest(unittest.TestCase):
    def test_uses_last_year_at_career_best_across_ranking_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / "dist"
            dist.mkdir()
            for name in ("index.html", "app.js", "cards.css", "export-card.js"):
                (root / name).write_text("", encoding="utf-8")
            calendar = root / "calendar_snapshot.json"
            calendar.write_text("{}", encoding="utf-8")
            history = [
                ("2010-01-04", "1", 5), ("2019-01-07", "1", 5),
                ("2016-01-04", "2", 20), ("2018-01-01", "2", 20),
                ("2019-12-30", "3", 2),
            ]
            current = [
                ("2020-01-06", "1", 15), ("2020-01-06", "2", 20), ("2020-01-06", "3", 5),
                ("2025-11-03", "1", 15), ("2025-11-03", "2", 20), ("2025-11-03", "3", 1),
                ("2026-11-02", "1", 12), ("2026-11-02", "2", 30), ("2026-11-02", "3", 4),
            ]
            sources = []
            for index, rows in enumerate((history, current)):
                source = root / f"rankings_{index}.csv"
                with source.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.writer(handle)
                    writer.writerow(("week_date", "id", "rank", "points", "player", "country", "dob"))
                    for week, player_id, rank in rows:
                        writer.writerow((week, player_id, rank, 100, f"Player {player_id}", "ARM", "2000-01-01"))
                sources.append(source)
            with patch.multiple(build_site, ROOT=root, DIST=dist, CALENDAR=calendar, SOURCES=sources, ASSETS={}):
                build_site.main()
            data = json.loads((dist / "data" / "players.json").read_text(encoding="utf-8"))
            players = {player["id"]: player for player in data["players"]}
            self.assertEqual(data["snapshot_date"], "2026-11-02")
            self.assertEqual({key: (row["best_rank"], row["best_rank_year"]) for key, row in players.items()}, {
                "1": (5, 2019), "2": (20, 2025), "3": (1, 2025),
            })
            self.assertEqual({key: row["previous_rank"] for key, row in players.items()}, {"1": 15, "2": 20, "3": 1})


if __name__ == "__main__":
    unittest.main()
