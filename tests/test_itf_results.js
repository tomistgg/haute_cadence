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
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);

const set = (winner, loser) => ({ winner, loser, tiebreak: "" });
const manual = sets => ({ manual: true, sets });

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

console.log("ITF winner calculation, incomplete scores, draft retention, and Non-Tour scope passed.");
