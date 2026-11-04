import assert from "node:assert/strict";
import test from "node:test";
import { bracketRounds, collectResults, completedAt, parseMatch, requestJson } from "../wta-live.mjs";

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
