import assert from "node:assert/strict";
import test from "node:test";
import { bracketRounds, collectPlayerForm, collectResults, completedAt, mergePlayerForm, parseMatch, requestJson } from "../wta-live.mjs";

const now = Date.parse("2026-11-05T12:00:00Z");
const tournament = { tournamentGroup: { id: 1110, name: "Cali" }, year: 2026,
    level: "WTA 125", startDate: "2026-11-02", endDate: "2026-11-08", city: "CALI" };
const match = (changes = {}) => ({
    MatchID: "LS015", DrawMatchType: "S", DrawLevelType: "M", MatchState: "F", Winner: "2", RoundID: "2",
    MatchTimeStamp: "2026-11-05T09:00:00Z", MatchTimeTotal: "01:30:00", LastUpdated: "2026-11-05T11:00:00Z",
    PlayerIDA: 1, PlayerIDB: 2, PlayerNameFirstA: "Player", PlayerNameLastA: "One",
    PlayerNameFirstB: "Player", PlayerNameLastB: "Two", PlayerCountryA: "ARG", PlayerCountryB: "FRA",
    ScoreSet1A: 7, ScoreSet1B: 6, ScoreTbSet1: 4, ScoreSet2A: 6, ScoreSet2B: 2, ...changes,
});

test("completed singles preserve identities, scores, tiebreaks, qualifying and retirements", () => {
    const result = parseMatch(match(), tournament, now);
    assert.equal(result.id, "1110:2026:LS015");
    assert.equal(result.completed_at, "2026-11-05T10:30:00.000Z");
    assert.deepEqual(result.sets, [{ winner: 7, loser: 6, tiebreak: "4" }, { winner: 6, loser: 2, tiebreak: "" }]);
    assert.equal(result.winner.country, "ARG");
    const retired = parseMatch(match({ Winner: "5", DrawLevelType: "Q" }), tournament, now);
    assert.equal(retired.winner.id, "2");
    assert.equal(retired.status, "RET.");
    assert.equal(retired.round_heading, "QUALIFICATIONS");
    assert.equal(retired.round, "Qualifying · 2nd Round");
});

test("doubles, walkovers, future matches and old matches corrected today are excluded", () => {
    assert.equal(parseMatch(match({ DrawMatchType: "D" }), tournament, now), null);
    assert.equal(parseMatch(match({ Winner: "6" }), tournament, now), null);
    assert.equal(parseMatch(match({ MatchTimeStamp: "2026-11-06T09:00:00Z" }), tournament, now), null);
    assert.equal(parseMatch(match({ MatchTimeStamp: "2026-11-03T09:00:00Z" }), tournament, now), null);
    assert.equal(completedAt(match({ MatchTimeTotal: "unknown" })), Date.parse("2026-11-05T11:00:00Z"));
    assert.throws(() => parseMatch(match({ ScoreSet1A: "bad" }), tournament, now), /invalid set score/);
    assert.throws(() => parseMatch(match({ PlayerIDA: null }), tournament, now), /missing player/);
});

test("brackets fill only direct-child confirmed singles winners and respect LS positions", () => {
    const rows = [
        match({ MatchID: "LS004", RoundID: "1" }),
        match({ MatchID: "LS005", Winner: "3", PlayerIDA: 3, PlayerIDB: 4 }),
        match({ MatchID: "LS002", MatchState: "U", Winner: "", PlayerIDA: null, PlayerIDB: null }),
        match({ MatchID: "LS006", DrawMatchType: "D" }),
        match({ MatchID: "LS007", DrawLevelType: "Q" }),
        match({ MatchID: "LS001", RoundID: "RR" }),
    ];
    const rounds = bracketRounds(rows);
    assert.deepEqual(rounds.S[0].players.map(p => p?.id), ["1", "4"]);
    assert.deepEqual(rounds.S[1].players, [null, null]);
    assert.deepEqual(rounds.F[0].players, [null, null]);
    assert.equal(rounds.Q[0].players[0].id, "1");
});

test("live collection paginates the relay calendar and excludes non-WTA events", async t => {
    const other = { ...tournament, level: "ITF", tournamentGroup: { id: 999 } };
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        url = new URL(url);
        requests.push(url);
        assert.equal(url.origin, "https://tennis-wta-api.schiter-tomas.workers.dev");
        assert.equal(options.cache, "no-store");
        if (url.pathname.endsWith("/matches")) return Response.json({ matches: [match(), match({ DrawMatchType: "D" })] });
        const page = Number(url.searchParams.get("page"));
        return Response.json({ pageInfo: { page, numEntries: 2 }, content: [page ? other : tournament] });
    });
    const result = await collectResults(now);
    assert.equal(result.matches.length, 1);
    assert.equal(result.updated_at, "2026-11-05T12:00:00.000Z");
    assert.equal(requests.length, 3);
    assert.equal(requests[2].searchParams.get("states"), "C");
});

test("partial calendars and failed match requests fail the whole refresh", async t => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ pageInfo: { page: 0, numEntries: 2 }, content: [] }));
    await assert.rejects(collectResults(now), /incomplete/);
    globalThis.fetch = async url => String(url).includes("/matches") ? new Response(null, { status: 502 })
        : Response.json({ pageInfo: { page: 0, numEntries: 1 }, content: [tournament] });
    await assert.rejects(collectResults(now), /could not be refreshed/);
});

test("non-UTF8 WTA text is decoded without losing player names", async t => {
    t.mock.method(globalThis, "fetch", async () => new Response(Uint8Array.from([...Buffer.from('{"name":"'), 233, ...Buffer.from('"}')])));
    assert.deepEqual(await requestJson("tournaments/"), { name: "é" });
});

const historyMatch = (changes = {}) => ({
    player_1: "1", player_2: "2", winner: 1, s_d_flag: "S", scores: "6-3 6-2", reason_code: "W",
    StartDate: "2026-10-26T00:00:00Z", tourn_nbr: "1180", tourn_year: "2026", qpm_flag: "M",
    round_name: "R32", tourn_round: "1", ...changes,
});

test("Form orders history by tournament and round, takes ten, and leaves older-than-year results out", () => {
    const history = Array.from({ length: 12 }, (_, index) => historyMatch({
        StartDate: new Date(now - (15 - index) * 86400000).toISOString(),
        tourn_nbr: String(index), winner: index % 2 + 1,
    }));
    const expected = history.slice(-10).map(m => m.winner === 1 ? "win" : "loss");
    assert.deepEqual(mergePlayerForm("1", history.reverse(), [], now), expected);
    assert.deepEqual(mergePlayerForm("1", [
        historyMatch({ round_name: "Q", tourn_round: "3", winner: 2 }), historyMatch(),
        historyMatch({ round_name: "R16", tourn_round: "2" }), historyMatch(),
        historyMatch({ StartDate: "2025-11-04", tourn_nbr: "old" }),
        historyMatch({ StartDate: "2027-01-01", tourn_nbr: "future" }),
        historyMatch({ s_d_flag: "D" }), historyMatch({ winner: 0 }),
        historyMatch({ scores: "W/O" }), historyMatch({ scores: "" }),
        historyMatch({ player_1: "999", player_2: "998" }),
    ], [], now), [...Array(7).fill(""), "win", "win", "loss"]);
    assert.equal(mergePlayerForm("2", [historyMatch()], [], now)[9], "loss");
});

test("active draws replace the same event's history and include this week's singles and retirements only", () => {
    const history = [historyMatch(), historyMatch({ tourn_nbr: "1110" })];
    const rows = [
        match({ MatchID: "LS032", MatchTimeStamp: "2026-11-02T09:00:00Z" }),
        match({ Winner: "5", DrawLevelType: "Q" }),
        match({ Winner: "5", DrawLevelType: "Q" }),
        match({ MatchID: "LS001", MatchState: "U" }),
        match({ MatchID: "LS002", Winner: "6" }),
        match({ MatchID: "LD001", DrawMatchType: "D" }),
        match({ MatchID: "LS003", MatchTimeStamp: "2026-11-06T09:00:00Z" }),
        match({ MatchID: "LS004", MatchTimeStamp: "2025-10-01T09:00:00Z" }),
    ];
    assert.deepEqual(mergePlayerForm("1", history, [{ tournament, matches: rows }], now),
        [...Array(7).fill(""), "win", "win", "loss"]);
    assert.deepEqual(mergePlayerForm("2", [], [{ tournament, matches: rows }], now),
        [...Array(8).fill(""), "loss", "win"]);
});

test("Form fetches both calendar years, paginates history, and shares active draws across players", async t => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async url => {
        url = new URL(url); calls.push(url);
        if (url.pathname.includes("/players/")) {
            assert.equal(url.searchParams.get("type"), "S");
            if (url.searchParams.get("year") === "2025") return Response.json({ matches: [] });
            const rows = url.searchParams.get("page") === "0" ? Array(1000).fill(historyMatch())
                : [historyMatch({ round_name: "Q", tourn_round: "3", winner: 2 })];
            return Response.json({ matches: rows });
        }
        if (url.pathname.endsWith("/matches")) return Response.json({ matches: [match()] });
        const other = { ...tournament, level: "ITF", tournamentGroup: { id: 999 } };
        return Response.json({ pageInfo: { page: 0, numEntries: 3 }, content: [tournament, tournament, other] });
    });
    const [first, second] = await Promise.all([collectPlayerForm("1", now), collectPlayerForm("2", now)]);
    assert.deepEqual(first.slice(-3), ["win", "loss", "win"]);
    assert.equal(second[9], "loss");
    assert.equal(calls.filter(url => url.pathname.endsWith("/tournaments/")).length, 1);
    assert.equal(calls.filter(url => /tournaments\/1110\/2026\/matches/.test(url.pathname)).length, 1);
    assert.equal(calls.filter(url => url.pathname.includes("/players/")).length, 6);
    await assert.rejects(collectPlayerForm("manual:1", now), /WTA player ID/);
});

test("Form rejects incomplete player histories instead of erasing the existing draft", async t => {
    t.mock.method(globalThis, "fetch", async () => Response.json({}));
    await assert.rejects(collectPlayerForm("1", now), /history response is incomplete/);
});

test("Sunday Form still fetches Saturday's finished tournament and next week's qualifying draw", async t => {
    const sunday = Date.parse("2026-11-08T12:00:00Z"), events = [];
    t.mock.method(globalThis, "fetch", async url => {
        url = new URL(url);
        if (url.pathname.includes("/players/")) return Response.json({ matches: [] });
        if (url.pathname.endsWith("/matches")) {
            events.push(url.pathname);
            return Response.json({ matches: [match({ MatchTimeStamp: "2026-11-07T09:00:00Z" })] });
        }
        assert.equal(url.searchParams.get("to"), "2026-11-10");
        return Response.json({ pageInfo: { page: 0, numEntries: 3 }, content: [
            { ...tournament, endDate: "2026-11-07" },
            { ...tournament, startDate: "2026-11-09", endDate: "2026-11-14", tournamentGroup: { id: 1181 } },
            { ...tournament, endDate: "2026-11-01", tournamentGroup: { id: 1180 } },
        ] });
    });
    assert.deepEqual((await collectPlayerForm("1", sunday)).slice(-2), ["win", "win"]);
    assert.deepEqual(events.sort(), ["/api/tennis/tournaments/1110/2026/matches", "/api/tennis/tournaments/1181/2026/matches"]);
});
