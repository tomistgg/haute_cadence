const BASE = ["127.0.0.1", "localhost"].includes(globalThis.location?.hostname)
    ? globalThis.location.origin : "https://tennis-wta-api.schiter-tomas.workers.dev";
const DAY = 86400000;
const LEVELS = new Set(["WTA 125", "WTA 250", "WTA 500", "WTA 1000", "Finals", "WTA Finals", "Grand Slam"]);
const ROUNDS = {
    "1": ["1st Round", "premier"], "2": ["2nd Round", "deuxieme"], "3": ["3rd Round", "troisieme"],
    Q: ["Quarterfinals", "quartdefinale"], S: ["Semifinals", "demifinale"], F: ["Final", "finale"],
};
const EXTRA = { "4": "QUATRIÈME TOUR", "5": "CINQUIÈME TOUR", R: "PHASE DE GROUPES", RR: "PHASE DE GROUPES" };

export async function requestJson(path, params = {}) {
    const url = new URL(BASE + "/api/tennis/" + path);
    url.search = new URLSearchParams(params);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("WTA could not be refreshed. Your current data is still shown. Please try again.");
    const bytes = await response.arrayBuffer();
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
    return JSON.parse(text);
}

export async function calendar(from, to) {
    const items = [];
    let total;
    for (let page = 0; ; page += 1) {
        const data = await requestJson("tournaments/", { from, to, page, pageSize: 100 });
        const count = data.pageInfo?.numEntries;
        if (!Array.isArray(data.content) || !Number.isInteger(count) || count < 0 ||
            Number(data.pageInfo.page) !== page || (total !== undefined && count !== total)) {
            throw new Error("The WTA calendar response is incomplete. Please try again.");
        }
        total = count;
        items.push(...data.content);
        if (items.length === total) return items;
        if (!data.content.length || items.length > total) throw new Error("The WTA calendar response is incomplete.");
    }
}

function eligible(tournament) {
    const group = tournament.tournamentGroup;
    return LEVELS.has(tournament.level) && group?.id &&
        !String(group.metadata?.cancelledSeasons || "").includes(String(tournament.year));
}

function person(match, side) {
    const first = String(match["PlayerNameFirst" + side] || "").trim();
    const last = String(match["PlayerNameLast" + side] || "").trim();
    return {
        id: String(match["PlayerID" + side] || ""), first_name: first, last_name: last,
        name: [first, last].filter(Boolean).join(" "), country: String(match["PlayerCountry" + side] || "").toUpperCase(),
    };
}

export function completedAt(match) {
    // WTA's LastUpdated can move after a score correction, without another match being played.
    const duration = /^(\d+):(\d{2}):(\d{2})$/.exec(String(match.MatchTimeTotal || ""));
    const start = Date.parse(match.MatchTimeStamp);
    if (Number.isFinite(start) && duration && Number(duration[2]) < 60 && Number(duration[3]) < 60) {
        return start + (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000;
    }
    return Date.parse(match.LastUpdated);
}

export function parseMatch(match, tournament, now) {
    const code = String(match.Winner || "");
    if (match.DrawMatchType !== "S" || match.MatchState !== "F" || !["2", "3", "4", "5"].includes(code)) return null;
    const finished = completedAt(match);
    if (!Number.isFinite(finished) || finished < now - DAY || finished > now) return null;
    const [a, b] = ["2", "4"].includes(code) ? ["A", "B"] : ["B", "A"];
    const winner = person(match, a), loser = person(match, b);
    if (!winner.id || !winner.name || !loser.id || !loser.name || !match.MatchID) {
        throw new Error("A completed WTA singles match has missing player or match details.");
    }
    const sets = [];
    for (let n = 1; n <= 3; n += 1) {
        const x = match["ScoreSet" + n + a], y = match["ScoreSet" + n + b];
        if ([null, undefined, ""].includes(x) && [null, undefined, ""].includes(y)) continue;
        if (!/^\d+$/.test(String(x)) || !/^\d+$/.test(String(y))) throw new Error("WTA returned an invalid set score.");
        sets.push({ winner: Number(x), loser: Number(y), tiebreak: String(match["ScoreTbSet" + n] ?? "") });
    }
    if (!sets.length) return null;
    const round = String(match.RoundID || ""), qualifying = match.DrawLevelType === "Q";
    const [name, art] = ROUNDS[round] || [EXTRA[round] || "Round " + round, "premier"];
    const group = tournament.tournamentGroup;
    return {
        id: `${group.id}:${tournament.year}:${match.MatchID}`, completed_at: new Date(finished).toISOString(),
        round: (qualifying ? "Qualifying · " : "") + name, round_art: art,
        round_heading: qualifying ? "QUALIFICATIONS" : ROUNDS[round] ? "" : name.toUpperCase(),
        tournament: {
            id: String(group.id), name: tournament.title || group.name || "WTA",
            city: tournament.city || group.name || "", category: tournament.level, surface: tournament.surface || "",
        },
        winner, loser, sets,
        status: /def/i.test(String(match.ScoreString || "")) ? "DEF." : ["4", "5"].includes(code) ? "RET." : "",
    };
}

export async function collectResults(now = Date.now()) {
    const date = ms => new Date(ms).toISOString().slice(0, 10);
    const tournaments = (await calendar(date(now - 30 * DAY), date(now + DAY))).filter(t =>
        eligible(t) && t.startDate <= t.endDate && t.startDate.slice(0, 10) <= date(now) &&
        t.endDate.slice(0, 10) >= date(now - 2 * DAY));
    const unique = [...new Map(tournaments.map(t => [t.tournamentGroup.id + ":" + t.year, t])).values()];
    const batches = await Promise.all(unique.map(async tournament => {
        const data = await requestJson(`tournaments/${tournament.tournamentGroup.id}/${tournament.year}/matches`, { states: "C" });
        if (!Array.isArray(data.matches)) throw new Error("The WTA match response is incomplete.");
        return data.matches.map(match => parseMatch(match, tournament, now)).filter(Boolean);
    }));
    const matches = [...new Map(batches.flat().map(match => [match.id, match])).values()];
    matches.sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.id.localeCompare(a.id));
    return { updated_at: new Date(now).toISOString(), window_start: new Date(now - DAY).toISOString(), matches };
}

export function bracketRounds(matches) {
    if (!Array.isArray(matches)) throw new Error("The WTA bracket response is incomplete.");
    const nodes = new Map();
    for (const match of matches) {
        if (match.DrawMatchType !== "S" || match.DrawLevelType !== "M" || ["R", "RR"].includes(String(match.RoundID))) continue;
        const number = /^LS0*([1-9]\d*)$/.exec(String(match.MatchID || ""));
        if (number) nodes.set(Number(number[1]), match);
    }
    const player = (match, side) => {
        const value = person(match, side);
        return value.id && value.id !== "0" && value.name && !["BYE", "TBD"].includes(value.name.toUpperCase()) ? value : null;
    };
    const winner = number => {
        const match = nodes.get(number) || {}, code = String(match.Winner || "");
        return match.MatchState === "F" && ["2", "3", "4", "5"].includes(code)
            ? player(match, ["2", "4"].includes(code) ? "A" : "B") : null;
    };
    const rounds = {};
    for (const [round, start, end] of [["F", 1, 2], ["S", 2, 4], ["Q", 4, 8]]) {
        rounds[round] = [];
        for (let n = start; n < end; n += 1) {
            const match = nodes.get(n) || {};
            rounds[round].push({
                id: "LS" + String(n).padStart(3, "0"), position: n - start,
                players: [player(match, "A") || winner(n * 2), player(match, "B") || winner(n * 2 + 1)],
                state: match.MatchState || "U",
            });
        }
    }
    return rounds;
}

export async function collectDraws(now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const calendarRows = await calendar(new Date(now - 30 * DAY).toISOString().slice(0, 10), today);
    const active = calendarRows.filter(t => eligible(t) && t.startDate.slice(0, 10) <= today && t.endDate.slice(0, 10) >= today);
    const unique = [...new Map(active.map(t => [t.tournamentGroup.id + ":" + t.year, t])).values()];
    const tournaments = await Promise.all(unique.map(async t => {
        const data = await requestJson(`tournaments/${t.tournamentGroup.id}/${t.year}/matches`);
        return {
            id: t.tournamentGroup.id + ":" + t.year, wta_id: String(t.tournamentGroup.id), year: t.year,
            name: t.title || t.tournamentGroup.name || "WTA", city: t.city || t.tournamentGroup.name || "WTA",
            category: t.level, surface: t.surface || "", start_date: t.startDate, end_date: t.endDate,
            rounds: bracketRounds(data.matches),
        };
    }));
    tournaments.sort((a, b) => a.category.localeCompare(b.category) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
    return { updated_at: new Date(now).toISOString(), date: today, tournaments };
}

let weekDraws;
function currentWeekDraws(now, force = false) {
    const today = new Date(now).toISOString().slice(0, 10);
    if (!force && weekDraws?.day === today && Date.now() < weekDraws.expires) return weekDraws.promise;
    const session = { day: today, expires: Date.now() + 300000 };
    session.promise = (async () => {
        const monday = new Date(now);
        monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
        const weekStart = monday.toISOString().slice(0, 10);
        const qualifyingEnd = new Date(now + 2 * DAY).toISOString().slice(0, 10);
        const rows = await calendar(new Date(now - 30 * DAY).toISOString().slice(0, 10), qualifyingEnd);
        // Keep events that ended earlier this week, and next week's draws already playing qualifying.
        const active = rows.filter(t => eligible(t) && t.startDate.slice(0, 10) <= qualifyingEnd && t.endDate.slice(0, 10) >= weekStart);
        const unique = [...new Map(active.map(t => [t.tournamentGroup.id + ":" + t.year, t])).values()];
        return Promise.all(unique.map(async tournament => {
            const data = await requestJson(`tournaments/${tournament.tournamentGroup.id}/${tournament.year}/matches`);
            if (!Array.isArray(data.matches)) throw new Error("The WTA match response is incomplete.");
            return { tournament, matches: data.matches };
        }));
    })().catch(error => { session.expires = 0; throw error; });
    weekDraws = session;
    return session.promise;
}

export function mergePlayerForm(playerId, history, draws, now = Date.now()) {
    playerId = String(playerId);
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    cutoff.setUTCHours(0, 0, 0, 0);
    const activeEvents = new Set(draws.map(({ tournament: t }) => t.tournamentGroup.id + ":" + t.year));
    const matches = new Map();
    for (const match of history) {
        const event = match.tourn_nbr + ":" + match.tourn_year;
        const side = String(match.player_1) === playerId ? 1 : String(match.player_2) === playerId ? 2 : 0;
        const time = Date.parse(match.StartDate);
        // History dates are tournament start dates; active draws supply actual completion times.
        if (activeEvents.has(event) || match.s_d_flag !== "S" || !side || ![1, 2].includes(Number(match.winner)) ||
            !Number.isFinite(time) || time < cutoff.getTime() || time > now ||
            !/\d/.test(match.scores || "") || /w\s*\/\s*o|walkover|bye/i.test(match.scores || "")) continue;
        const round = Number(match.tourn_round) || ({ Q: 90, S: 91, F: 92 }[match.round_name] || 0);
        const order = (match.qpm_flag === "Q" ? 0 : 100) + round;
        const key = [event, match.qpm_flag, match.round_name, match.tourn_round, match.player_1, match.player_2].join(":");
        matches.set(key, { time, order, result: Number(match.winner) === side ? "win" : "loss" });
    }
    for (const { tournament, matches: rows } of draws) {
        for (const match of rows) {
            const side = String(match.PlayerIDA) === playerId ? "A" : String(match.PlayerIDB) === playerId ? "B" : "";
            const code = String(match.Winner || ""), time = completedAt(match);
            if (!side || match.DrawMatchType !== "S" || match.MatchState !== "F" ||
                !["2", "3", "4", "5"].includes(code) || !match.MatchID ||
                !Number.isFinite(time) || time < cutoff.getTime() || time > now) continue;
            const key = tournament.tournamentGroup.id + ":" + tournament.year + ":" + match.MatchID;
            matches.set(key, { time, order: 0, result: (["2", "4"].includes(code) ? "A" : "B") === side ? "win" : "loss" });
        }
    }
    const results = [...matches.values()].sort((a, b) => a.time - b.time || a.order - b.order)
        .slice(-10).map(match => match.result);
    return [...Array(10 - results.length).fill(""), ...results];
}

export async function collectPlayerForm(playerId, now = Date.now()) {
    if (!/^[1-9]\d*$/.test(String(playerId))) throw new Error("A WTA player ID is required for Form.");
    const year = new Date(now).getUTCFullYear();
    const historyForYear = async year => {
        const matches = [];
        for (let page = 0; ; page += 1) {
            const data = await requestJson(`players/${playerId}/matches`, { year, type: "S", page, pageSize: 1000 });
            if (!Array.isArray(data.matches)) throw new Error("The WTA player history response is incomplete.");
            matches.push(...data.matches);
            if (data.matches.length < 1000) return matches;
        }
    };
    const [current, previous, draws] = await Promise.all([historyForYear(year), historyForYear(year - 1), currentWeekDraws(now)]);
    return mergePlayerForm(playerId, [...previous, ...current], draws, now);
}

export function drawChampion(tournament, matches, now = Date.now()) {
    const finals = matches.filter(match => match.DrawMatchType === "S" && match.DrawLevelType === "M" &&
        !["R", "RR"].includes(String(match.RoundID)) &&
        (String(match.RoundID) === "F" || /^LS0*1$/.test(String(match.MatchID))) && match.MatchState === "F");
    if (!finals.length) return null;
    if (finals.length !== 1) throw new Error("WTA returned multiple completed singles finals.");
    const match = finals[0], code = String(match.Winner || "");
    if (completedAt(match) > now) return null;
    let side = { "2": "A", "3": "B", "6": "A", "7": "B" }[code];
    if (["4", "5"].includes(code)) {
        // Match the saved champions collector: retired finals require an explicit winner message.
        const message = /\{11\|([^}]+)\}/.exec(match.Message || "");
        const sides = message ? ["A", "B"].filter(s => match["PlayerNameLast" + s] &&
            message[1].toLocaleLowerCase().endsWith(match["PlayerNameLast" + s].toLocaleLowerCase())) : [];
        if (sides.length === 1) side = sides[0];
    }
    if (!side) return null;
    const player = person(match, side);
    if (!player.id || player.id === "0" || !player.name) throw new Error("A WTA singles champion has missing player details.");
    const group = tournament.tournamentGroup;
    return {
        tournament_id: String(group.id), year: tournament.year,
        start_date: tournament.startDate.slice(0, 10), end_date: tournament.endDate.slice(0, 10),
        name: tournament.title || group.name || "WTA", city: tournament.city || group.name || "WTA",
        category: tournament.level, surface: tournament.surface || "",
        champion: { id: player.id, name: player.name, country: player.country },
    };
}

export async function collectChampions(now = Date.now(), force = false) {
    const draws = await currentWeekDraws(now, force);
    return draws.map(({ tournament, matches }) => drawChampion(tournament, matches, now)).filter(Boolean);
}
