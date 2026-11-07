"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const element = { addEventListener() {}, querySelector() { return this; } };
const context = {
  document: { getElementById: () => element, fonts: { ready: { then() {} } } },
  window: { addEventListener() {} },
  cardType: { value: "result", addEventListener() {} },
  setInterval() {},
};
vm.createContext(context);
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.runInContext(appSource.slice(appSource.indexOf("function stripAccents("), appSource.indexOf("function getAge(")), context);
context.playerNameIndex = { by_wta_id: { "1": "Lourdes Carl\u00e9", "2": "Maaya Rajeshwaran" }, by_name: {} };
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);

const carle = { id: "1", name: "Maria Lourdes Carle", display_name: "Lourdes Carl\u00e9", manual: true };
const original = { ...carle };
assert.equal(context.playerDisplayName(carle), "Lourdes Carle");
assert.equal(context.resultPlayerName(carle), "Lourdes CARLE");
assert.deepEqual(carle, original, "display formatting must not modify source player names");
assert.equal(context.resultPlayerName({ id: "2", name: "Maaya Rajeshwaran Revathi" }), "Maaya RAJESHWARAN");
assert.equal(context.resultPlayerName({ name: "Mar\u00eda Jos\u00e9 Mart\u00ednez S\u00e1nchez", first_name: "Mar\u00eda Jos\u00e9" }),
  "Maria Jose MARTINEZ SANCHEZ");
assert.equal(context.resultPlayerName({ id: "1", name: "Chlo\u00e9 Paquet", name_override: true }), "Chloe PAQUET");
assert.equal(context.resultPlayerName({ name: "Carl\u0065\u0301", manual: true }), "Carle");

const set = (winner, loser) => ({ winner, loser, tiebreak: "" });
const manual = sets => ({ manual: true, sets });

for (const [round, file] of Object.entries({ premier: "1", deuxieme: "2", quartdefinale: "3", demifinale: "4", finale: "5",
  qualifications1: "6", qualifications2: "7", qualifications3: "8" })) {
  assert.equal(context.nonTourHeader({ round_art: round, round }).file, file);
  assert.equal(context.nonTourHeader({ round_art: round, round, manual: true }).label, "");
}
for (const [round, file] of Object.entries({ premier: "6", deuxieme: "7", troisieme: "8" })) {
  const header = context.nonTourHeader({ round_art: round, round_heading: "QUALIFICATIONS" });
  assert.equal(header.file, file);
  assert.equal(header.label, "", "qualifying must use its supplied PNG text");
}
assert.equal(context.nonTourHeader({ round_art: "premier", round: "ITF MATCH", manual: true }).label, "ITF MATCH");
assert.equal(context.nonTourHeader({ round_art: "troisieme", round: "3rd Round" }).label, "TROISIÈMES TOURS");

assert.equal(context.resultWinningSide(manual([set("", ""), set("", "")])), "");
assert.equal(context.resultWinningSide(manual([set(6, 4), set("", "")])), "");
assert.equal(context.resultWinningSide(manual([set(6, 4), set(2, 0)])), "");
assert.equal(context.resultWinningSide(manual([set(6, 4), set(6, 6)])), "");
assert.equal(context.resultWinningSide(manual([set(6, 4), set(7, 6)])), "winner");
assert.equal(context.resultWinningSide(manual([set(4, 6), set(3, 6)])), "loser");
assert.equal(context.resultWinningSide(manual([set(6, 4), set(4, 6), set(6, 7)])), "loser");
assert.equal(context.resultWinningSide(manual([set(6, 4), set(4, 6), set(10, 7)])), "winner");
assert.equal(context.resultSetWinner(set(8, 6), 0), "winner");
assert.equal(context.resultSetWinner(set(-1, 6), 0), "");
assert.equal(context.resultSetWinner(set("6", 4), 0), "");
assert.equal(context.resultSetWinner(set(7, 4), 0), "");
assert.equal(context.resultWinningSide({ sets: [set(3, 6), set(7, 6), set(7, 6)] }), "winner");

const twoSets = vm.runInContext("selectedResultId = 'itf-2'; selectedResultMatch()", context);
assert.equal(twoSets.sets.length, 2);
twoSets.tournament.name = "Saved tournament";
twoSets.sets[0].winner = 6;
const threeSets = vm.runInContext("selectedResultId = 'itf-3'; selectedResultMatch()", context);
assert.equal(threeSets.sets.length, 3);
assert.equal(threeSets.tournament.name, "");
assert.equal(threeSets.sets[0].winner, "");
const restored = vm.runInContext("selectedResultId = 'itf-2'; selectedResultMatch()", context);
assert.equal(restored, twoSets);
assert.equal(restored.tournament.name, "Saved tournament");
assert.equal(restored.sets[0].winner, 6);
context.cardType.value = "tour-result";
assert.equal(context.isManualResultId("itf-2"), false);
assert.equal(context.isManualResultId("itf-3"), false);
assert.equal(context.isManualResultId("tour-manual"), true);
const tourManual = vm.runInContext("selectedResultId = 'tour-manual'; selectedResultMatch()", context);
assert.equal(tourManual.sets.length, 2);
assert.equal(tourManual.round_heading, "MANUAL MATCH");
vm.runInContext("renderResultCard = () => {}", context);
context.setManualTourSets(3);
tourManual.sets[2].winner = 7;
tourManual.sets[2].loser = 6;
context.setManualTourSets(2);
assert.equal(tourManual.sets.length, 2);
context.setManualTourSets(3);
assert.equal(tourManual.sets[2].winner, 7);
assert.equal(tourManual.sets[2].loser, 6);
context.setManualTourSets(4);
assert.equal(tourManual.sets.length, 3);
context.cardType.value = "result";
context.setManualTourSets(2);
assert.equal(tourManual.sets.length, 3);
assert.equal(context.isManualResultId("tour-manual"), false);

const now = Date.now();
context.feedMatches = [
  { id: "tour", completed_at: new Date(now - 3600000).toISOString(), tournament: { category: "WTA 250" } },
  { id: "125", completed_at: new Date(now - 3600000).toISOString(), tournament: { category: "WTA 125" } },
  { id: "slam", completed_at: new Date(now - 3600000).toISOString(), tournament: { category: "Grand Slam" } },
  { id: "stale", completed_at: new Date(now - 90000000).toISOString(), tournament: { category: "WTA 500" } },
  { id: "future", completed_at: new Date(now + 3600000).toISOString(), tournament: { category: "WTA 500" } },
  { id: "invalid", completed_at: "bad date", tournament: { category: "WTA 500" } },
];
vm.runInContext("resultFeed = { matches: feedMatches }", context);
assert.equal(context.currentResults().map(match => match.id).join(","), "tour,125,slam");
context.cardType.value = "tour-result";
assert.equal(context.currentResults().map(match => match.id).join(","), "tour,slam");

context.cardType.value = "instagram-result";
assert.equal(context.currentResults().map(match => match.id).join(","), "tour,125,slam",
  "Instagram must include both Tour and WTA 125 matches, using the same last-24-hours window");
assert.equal(context.isManualResultId("tour-manual"), false);
assert.equal(context.isManualResultId("itf-2"), false);
for (const sets of [2, 3]) {
  const draft = vm.runInContext(`selectedResultId = 'instagram-${sets}'; selectedResultMatch()`, context);
  assert.equal(draft.sets.length, sets);
  assert.equal(draft.round_heading, "MANUAL MATCH");
  draft.sets[0].winner = 7;
  assert.equal(context.selectedResultMatch().sets[0].winner, 7, "Instagram draft edits must persist");
}
context.cardType.value = "result";
assert.equal(context.isManualResultId("instagram-2"), false, "Instagram drafts must not leak into other result types");
vm.runInContext(appSource.slice(appSource.indexOf("function isResultCard("), appSource.indexOf("function isDrawCard(")), context);
for (const type of ["result", "tour-result", "instagram-result"]) {
  context.cardType.value = type;
  assert.equal(context.isResultCard(), true, type + " must use the shared result controls");
}

console.log("Winner calculation, draft and third-set retention, manual scope, and Tour/24-hour filtering passed.");
