import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import update_wta_champions as champions

PLAYER = {"id": 1, "fullName": "Example Champion", "countryCode": "ARM"}


def event(tid=100, year=2026, end="2026-02-08", level="WTA 250", player=PLAYER):
    return {
        "tournamentGroup": {"id": tid, "name": "Example", "metadata": {}},
        "year": year, "title": "Example Open", "city": "Example", "country": "ARM",
        "startDate": end[:8] + "01", "endDate": end, "level": level,
        "winners": [{"singles": {"player": player}}] if player else [],
    }


class ChampionsTest(unittest.TestCase):
    def test_completed_final_match_id_identifies_final_even_when_round_label_is_unreliable(self):
        match = {
            "MatchID": "LS001", "RoundID": "2", "DrawMatchType": "S", "DrawLevelType": "M",
            "MatchState": "F", "Winner": "2", "PlayerIDA": "1", "PlayerNameFirstA": "Example",
            "PlayerNameLastA": "Champion", "PlayerCountryA": "ARG",
        }
        self.assertEqual(champions.final_champion([match])["id"], "1")
        self.assertIsNone(champions.final_champion([match | {"DrawMatchType": "D"}]))

    def test_incremental_champions_are_deduplicated_corrected_and_resolve_missing_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            title = {
                "tournament_id": "1", "year": 2026, "start_date": "2026-11-02", "end_date": "2026-11-08",
                "category": "WTA 125", "champion": {"id": "1", "name": "Example", "country": "ARG"},
            }
            champions.save_history(path, {
                "through": "2026-11-01", "champions": [], "missing_champions": [title],
            })
            now = datetime(2026, 11, 8, tzinfo=UTC)
            self.assertTrue(champions.merge_draw_champions([title, title], path, now))
            first = path.read_bytes()
            self.assertFalse(champions.merge_draw_champions([title], path, now))
            self.assertEqual(path.read_bytes(), first)
            corrected = title | {"champion": {"id": "2", "name": "Corrected", "country": "FRA"}}
            self.assertTrue(champions.merge_draw_champions([corrected], path, now))
            data = champions.read_history(path)
            self.assertEqual(data["champion_count"], 1)
            self.assertEqual(data["champions"][0]["champion"]["id"], "2")
            self.assertEqual(data["missing_champions"], [])
            self.assertEqual(data["through"], "2026-11-08")

    def test_paginates_when_num_pages_is_zero_and_api_caps_page_size(self):
        pages = [
            {"pageInfo": {"page": 0, "numPages": 0, "numEntries": 2}, "content": [event(100)]},
            {"pageInfo": {"page": 1, "numPages": 0, "numEntries": 2}, "content": [event(101)]},
        ]
        with patch.object(champions, "fetch_json", side_effect=pages) as fetch:
            result = champions.fetch_calendar("2000-01-01", "2026-11-04")
        self.assertEqual([row["tournamentGroup"]["id"] for row in result], [100, 101])
        self.assertEqual(fetch.call_count, 2)
        self.assertNotIn("excludeLevels", fetch.call_args.args[0])

    def test_rejects_truncated_calendar(self):
        pages = [
            {"pageInfo": {"page": 0, "numEntries": 2}, "content": [event()]},
            {"pageInfo": {"page": 1, "numEntries": 2}, "content": []},
        ]
        with patch.object(champions, "fetch_json", side_effect=pages), self.assertRaises(ValueError):
            champions.fetch_calendar("2000-01-01", "2026-11-04")

    def test_historical_verification_and_chronology_without_itf_contamination(self):
        older = event(year=2000, end="2000-01-08", level="ITF")
        itf = event(tid=101, year=2000, end="2000-02-08", level="ITF")
        proof = {("100", 2000): [{
            "category": "Tier IV", "champion": {"id": "1", "name": "Example Champion", "country": "ARM"},
            "record_source_url": "https://api.wtatennis.com/tennis/players/1/records?type=S",
        }]}
        result, missing = champions.collect_champions([event(102), itf, older], "2000-01-01", "2026-11-04", proof)
        self.assertEqual([row["year"] for row in result], [2000, 2026])
        self.assertEqual(result[0]["category"], "Tier IV")
        self.assertEqual(missing, [])

    def test_excludes_cancelled_future_team_and_out_of_range_events(self):
        cancelled = event(103)
        cancelled["tournamentGroup"]["metadata"]["cancelledSeasons"] = "2020, 2026"
        result, missing = champions.collect_champions([
            cancelled, event(2084), event(650), event(104, end="2026-12-08"), event(105, year=1999, end="1999-12-08"),
        ], "2000-01-01", "2026-11-04")
        self.assertEqual((result, missing), ([], []))

    def test_missing_winner_is_reported_instead_of_invented(self):
        with patch.object(champions, "fetch_json", return_value={"matches": []}):
            result, missing = champions.collect_champions([event(player=None)], "2000-01-01", "2026-11-04")
        self.assertEqual(result, [])
        self.assertEqual(len(missing), 1)
        self.assertNotIn("champion", missing[0])

    def test_records_exclude_doubles_and_non_wta_titles(self):
        payload = {"byTournament": [{"tournament": {"tournamentGroup": {"id": 100}}, "yearlyResults": [
            {"year": 2000, "resultCode": "W", "tournamentLevel": "Tier III", "eliminationMatchId": "LS001"},
            {"year": 2001, "resultCode": "W", "tournamentLevel": "Tier III", "eliminationMatchId": "LD001"},
            {"year": 2002, "resultCode": "W", "tournamentLevel": "ITF"},
            {"year": 2004, "resultCode": "W", "tournamentLevel": "OLYMPICS"},
            {"year": 2005, "resultCode": "F", "tournamentLevel": "Tier III"},
        ]}]}
        self.assertEqual(champions.record_titles(payload), [("100", 2000, "Tier III")])

    def test_final_requires_completed_main_draw_singles_and_known_winner(self):
        match = {"DrawMatchType": "S", "DrawLevelType": "M", "RoundID": "F", "MatchState": "F",
                 "Winner": "3", "PlayerIDA": "1", "PlayerIDB": "2", "PlayerNameFirstB": "Other",
                 "PlayerNameLastA": "Player", "PlayerNameLastB": "Champion", "PlayerCountryB": "FRA"}
        self.assertEqual(champions.final_champion([match])["id"], "2")
        self.assertIsNone(champions.final_champion([{**match, "DrawLevelType": "Q"}]))
        self.assertIsNone(champions.final_champion([{**match, "MatchState": "P"}]))
        self.assertIsNone(champions.final_champion([{**match, "Winner": "4"}]))
        retired = {**match, "Winner": "4", "Message": "{11|O. Champion} {20}"}
        self.assertEqual(champions.final_champion([retired])["id"], "2")

    def test_conflicting_singles_winners_are_rejected(self):
        tournament = event()
        tournament["winners"].append({"singles": {"player": {"id": 2, "fullName": "Different Player"}}})
        with self.assertRaises(ValueError):
            champions.calendar_champion(tournament)

    def test_write_failure_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champions.json"
            path.write_text('{"previous":true}', encoding="utf-8")
            with patch.object(json, "dump", side_effect=OSError("disk full")), self.assertRaises(OSError):
                champions.save_history(path, {"new": True})
            self.assertEqual(path.read_text(encoding="utf-8"), '{"previous":true}')
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
