import unittest
from datetime import UTC, datetime
from unittest.mock import patch

import update_wta_draws as draws


def match(number, **changes):
    return {
        "MatchID": f"LS{number:03d}", "DrawMatchType": "S", "DrawLevelType": "M", "RoundID": "2",
        "MatchState": "F", "Winner": "2", "PlayerIDA": str(number * 2), "PlayerNameFirstA": "Player",
        "PlayerNameLastA": str(number * 2), "PlayerCountryA": "FRA", "PlayerIDB": str(number * 2 + 1),
        "PlayerNameFirstB": "Player", "PlayerNameLastB": str(number * 2 + 1), "PlayerCountryB": "ITA",
    } | changes


class DrawTest(unittest.TestCase):
    def test_bracket_positions_use_match_ids_and_only_advance_confirmed_singles_winners(self):
        rounds = draws.bracket_rounds([
            match(8), match(9, Winner="3"), match(10, MatchState="P"), match(11, DrawMatchType="D"),
            match(12, DrawLevelType="Q"), match(13, RoundID="RR"), match(14, Winner="4"),
            match(15, Winner="0"),
        ])
        self.assertEqual([p["id"] for p in rounds["Q"][0]["players"]], ["16", "19"])
        self.assertEqual(rounds["Q"][1]["players"], [None, None])
        self.assertEqual(rounds["Q"][2]["players"], [None, None])
        self.assertEqual(rounds["Q"][3]["players"][0]["id"], "28")
        self.assertIsNone(rounds["Q"][3]["players"][1])
        self.assertEqual(rounds["S"][0]["players"], [None, None])
        self.assertEqual(rounds["F"][0]["id"], "LS001")

    def test_scheduled_players_win_over_inference_even_with_unreliable_round_id(self):
        rounds = draws.bracket_rounds([match(4, MatchState="U", RoundID=4), match(8)])
        self.assertEqual(rounds["Q"][0]["players"][0]["id"], "8")
        self.assertEqual(rounds["Q"][0]["state"], "U")
        with self.assertRaises(ValueError):
            draws.bracket_rounds(None)

    def test_collects_active_events_and_all_match_states(self):
        tournament = {
            "tournamentGroup": {"id": 1, "name": "City"}, "year": 2026, "level": "WTA 250",
            "startDate": "2026-11-02", "endDate": "2026-11-08", "city": "City",
        }
        with patch.object(draws, "fetch_calendar", return_value=[
            tournament, tournament | {"level": "ITF"}, tournament | {"endDate": "2026-11-01"},
        ]), patch.object(draws, "fetch_json", return_value={"matches": [match(2)]}) as fetch:
            result = draws.collect_draws(datetime(2026, 11, 4, tzinfo=UTC))
        self.assertEqual(len(result["tournaments"]), 1)
        self.assertNotIn("states=C", fetch.call_args.args[0])
        self.assertEqual(result["tournaments"][0]["rounds"]["S"][0]["players"][0]["id"], "4")

    def test_finished_tournament_final_updates_champions_without_appearing_as_an_active_draw(self):
        tournament = {
            "tournamentGroup": {"id": 1, "name": "City"}, "year": 2026, "level": "WTA 125",
            "startDate": "2026-10-26", "endDate": "2026-11-01", "city": "City",
        }
        with patch.object(draws, "fetch_calendar", return_value=[tournament]), \
                patch.object(draws, "read_history", return_value={"champions": []}), \
                patch.object(draws, "fetch_json", return_value={"matches": [match(1)]}) as fetch:
            result = draws.collect_draws(datetime(2026, 11, 4, tzinfo=UTC))
        self.assertEqual(result["tournaments"], [])
        self.assertEqual(result["champions"][0]["champion"]["id"], "2")
        self.assertEqual(result["champions"][0]["category"], "WTA 125")
        self.assertEqual(fetch.call_count, 1)
        with patch.object(draws, "fetch_calendar", return_value=[tournament]), \
                patch.object(draws, "read_history", return_value={"champions": result["champions"]}), \
                patch.object(draws, "fetch_json") as fetch:
            draws.collect_draws(datetime(2026, 11, 4, tzinfo=UTC))
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
