"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const context = vm.createContext({ tournaments: [] });
vm.runInContext(source.slice(source.indexOf("const TOURNAMENT_NAME_OVERRIDES"), source.indexOf("const photoByName")), context);
vm.runInContext(source.slice(source.indexOf("function stripAccents("), source.indexOf("function getAge(")), context);
vm.runInContext(source.slice(source.indexOf("function tournamentStyle("), source.indexOf("function tournamentCategoryLabel(")), context);

const fields = ["column", "name", "level", "city", "startDate", "calendarKey", "tournamentId"];
const first = ["wta_125", "Megasaray Hotels Open", "WTA 125", "ANTALYA", "2026-02-24", "wta:1124:2026", "1124"];
const second = ["wta_125", "Megasaray Hotels Open", "WTA 125", "Antalya", "2026-03-03", "wta:1107:2026", "1107"];
const oeiras = ["wta_125", "Oeiras 1 Jamor Indoor", "WTA 125", "OEIRAS", "2026-02-09", "wta:1155:2026", "1155"];
const calendar = { fields, weeks: {
  later: [second, [...second.slice(0, 5), "wta:1107:2026|qualifying", "1107"],
    [...oeiras.slice(0, 1), "Oeiras 2 Jamor Indoor", "WTA 125", "OEIRAS", "2026-02-16", "wta:1156:2026", "1156"]],
  earlier: [first, first, oeiras,
    ["itf", "W35 Antalya", "W35", "ANTALYA", "2026-01-05", "itf:1", "1"],
    ["wta_tour", "Antalya Tour", "WTA 250", "ANTALYA", "2026-01-05", "wta:2:2026", "2"],
    ["wta_125", "Future Antalya", "WTA 125", "ANTALYA", "2027-02-24", "wta:1124:2027", "1124"],
    ["wta_125", "Parma Ladies Open", "WTA 125", "PARMA", "2026-05-11", "wta:2041:2026", "2041"]],
} };
context.tournaments = context.yearTournaments(calendar, 2026);
assert.deepEqual(Array.from(context.tournaments.filter(t => t.category === "WTA 125"), context.tournamentName),
  ["OEIRAS 1", "OEIRAS 2", "ANTALYA 1", "Antalya 2", "Parme"]);
assert.equal(context.tournamentName({ id: "1107", category: "WTA 125", city: "ANTALYA" }), "ANTALYA 2",
  "result feed IDs must resolve to the calendar edition");
assert.equal(context.tournamentName({ id: "1107:2026", wta_id: "1107", category: "WTA 125", city: "ANTALYA" }), "ANTALYA 2",
  "draw feed IDs must resolve to the calendar edition");
assert.equal(context.tournamentName({ category: "WTA 125", city: "ANTALYA", start_date: "2026-03-03" }), "ANTALYA 2");
assert.equal(context.tournamentName({ category: "W35", city: "ANTALYA" }), "ANTALYA");
assert.equal(context.tournamentName({ category: "WTA 125", city: "ANTALYA", id: "unknown" }), "ANTALYA",
  "unknown editions must not receive a guessed number");
assert.equal(context.tournamentName({ category: "WTA 125", city: "ANTALYA", id: "1124:2027", year: 2027 }), "ANTALYA",
  "an event from another year must not match a reused WTA ID in the current calendar");
context.tournaments = context.yearTournaments(calendar, 2027);
assert.equal(context.tournamentName(context.tournaments[0]), "ANTALYA", "edition numbering must reset each calendar year");

assert.equal(context.tournamentName({ category: "WTA 1000", city: "INDIAN WELLS" }), "INDIAN WELLS");
for (const category of ["Finals", "WTA Finals"]) {
  assert.equal(context.tournamentName({ category, city: "INDIAN WELLS" }), "WTA Finals");
}
assert.equal(context.tournamentName({ category: "Grand Slam", city: "PARIS" }), "Roland Garros");
assert.equal(context.tournamentName({ category: "WTA 125", city: "PARIS" }), "PARIS");
assert.equal(context.tournamentName({ category: "WTA 250", city: "'S-HERTOGENBOSCH" }), "Bois-le-duc");
assert.equal(context.tournamentName({ category: "WTA 250", city: "'s hertogenbosch" }), "Bois-le-duc");
console.log("Tournament edition numbering, feed ID matching, yearly isolation and scoped display names passed.");
