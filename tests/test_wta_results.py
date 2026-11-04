import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import update_wta_champions as champions
import update_wta_results as results

NOW = datetime(2026, 11, 4, 12, tzinfo=UTC)
TOURNAMENT = {
    "year": 2026, "level": "WTA 125", "title": "Example Open", "city": "Example",
    "surface": "Clay", "tournamentGroup": {"id": 1180, "name": "EXAMPLE", "metadata": {}},
    "startDate": "2026-10-26", "endDate": "2026-11-08",
}


def raw_match(**changes):
    match = {
        "MatchID": "LS016", "DrawMatchType": "S", "DrawLevelType": "M", "MatchState": "F",
        "Winner": "3", "RoundID": "1", "MatchTimeStamp": "2026-11-04T09:00:00+00:00",
        "MatchTimeTotal": "02:00:00", "LastUpdated": "2026-11-04T11:15:00+00:00",
        "PlayerIDA": "1", "PlayerNameFirstA": "Alice", "PlayerNameLastA": "One", "PlayerCountryA": "FRA",
        "PlayerIDB": "2", "PlayerNameFirstB": "Julia", "PlayerNameLastB": "Two", "PlayerCountryB": "AUT",
        "ScoreSet1A": "6", "ScoreSet1B": "3", "ScoreSet2A": "6", "ScoreSet2B": "7",
        "ScoreSet3A": "6", "ScoreSet3B": "7", "ScoreTbSet2": "4", "ScoreTbSet3": "5",
    }
    return match | changes


class ResultsTest(unittest.TestCase):
    def test_score_columns_follow_winner_side_and_preserve_tiebreaks(self):
        match = results.parse_match(raw_match(), TOURNAMENT, NOW)
        self.assertEqual(match["winner"]["id"], "2")
        self.assertEqual(match["loser"]["id"], "1")
        self.assertEqual(match["sets"], [
            {"winner": 3, "loser": 6, "tiebreak": ""},
            {"winner": 7, "loser": 6, "tiebreak": "4"},
            {"winner": 7, "loser": 6, "tiebreak": "5"},
        ])
        self.assertEqual(match["round_art"], "premier")

    def test_last_24_hours_uses_finish_not_start_or_later_correction(self):
        match = raw_match(MatchTimeStamp=(NOW - timedelta(hours=25)).isoformat())
        self.assertIsNotNone(results.parse_match(match, TOURNAMENT, NOW))
        match["MatchTimeStamp"] = (NOW - timedelta(hours=27)).isoformat()
        self.assertIsNone(results.parse_match(match, TOURNAMENT, NOW))
        match["MatchTimeStamp"] = NOW.isoformat()
        self.assertIsNone(results.parse_match(match, TOURNAMENT, NOW))

    def test_last_updated_fallback_when_no_duration(self):
        match = raw_match(MatchTimeTotal="")
        self.assertEqual(results.completed_at(match), datetime(2026, 11, 4, 11, 15, tzinfo=UTC))

    def test_all_six_supplied_rounds_and_qualifying(self):
        for round_id, (_, art) in results.ROUNDS.items():
            with self.subTest(round_id=round_id):
                match = results.parse_match(raw_match(RoundID=round_id), TOURNAMENT, NOW)
                self.assertEqual(match["round_art"], art)
        match = results.parse_match(raw_match(DrawLevelType="Q"), TOURNAMENT, NOW)
        self.assertEqual(match["round_heading"], "QUALIFICATIONS")
        self.assertTrue(match["round"].startswith("Qualifying"))

    def test_doubles_live_matches_and_walkovers_are_excluded(self):
        for changes in ({"DrawMatchType": "D"}, {"MatchState": "P"}, {"Winner": "6"}, {"Winner": "7"}):
            with self.subTest(changes=changes):
                self.assertIsNone(results.parse_match(raw_match(**changes), TOURNAMENT, NOW))

    def test_retirement_with_one_played_set(self):
        match = raw_match(Winner="4", ScoreSet2A="", ScoreSet2B="", ScoreSet3A="", ScoreSet3B="")
        result = results.parse_match(match, TOURNAMENT, NOW)
        self.assertEqual(result["status"], "RET.")
        self.assertEqual(len(result["sets"]), 1)

    def test_collection_excludes_itf_cancelled_events_and_deduplicates(self):
        cancelled = TOURNAMENT | {"tournamentGroup": {"id": 2, "metadata": {"cancelledSeasons": "2026"}}}
        events = [TOURNAMENT, TOURNAMENT, TOURNAMENT | {"level": "ITF"}, cancelled,
                  TOURNAMENT | {"endDate": "2026-10-29"}, TOURNAMENT | {"startDate": "2026-11-05"}]
        calendar = {"pageInfo": {"page": 0, "numEntries": len(events)}, "content": events}
        with patch.dict("os.environ", {"HAUTE_CADENCE_DATA_DIR": "nonexistent-shared-data"}), patch.object(
            champions, "fetch_json", return_value=calendar
        ) as discovery, patch.object(
            results, "fetch_json", return_value={"matches": [raw_match(), raw_match()]}
        ) as fetch:
            payload = results.collect_results(NOW)
        self.assertEqual(len(payload["matches"]), 1)
        fetch.assert_called_once_with("https://api.wtatennis.com/tennis/tournaments/1180/2026/matches?states=C")
        self.assertIn("from=2026-10-05", discovery.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
