"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const elements = new Map();
let choose;
const context = {
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: "F", addEventListener() {} });
      return elements.get(id);
    },
    fonts: { ready: { then() {} } },
  },
  window: { addEventListener() {} },
  cardType: { value: "draw", addEventListener() {} },
  players: [{ id: "1", name: "Ranked player", rank: 10, best_rank: 5, dob: "2000-01-01", country: "FRA" }],
  openPlayerPicker(player, label, onChoose) { choose = onChoose; },
  setInterval() {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "draw-card.js"), "utf8"), context);
vm.runInContext("renderDrawCard = () => {}", context);
elements.get("draw-tournament").value = "manual";
assert.equal(context.isManualDraw(), true);

const final = context.manualDraw("F");
const semi = context.manualDraw("S");
const quarter = context.manualDraw("Q");
assert.equal(final.rounds.F.length, 1);
assert.equal(semi.rounds.S.length, 2);
assert.equal(quarter.rounds.Q.length, 4);
final.name = "Saved final";
final.header = "My round";
assert.equal(context.manualDraw("F"), final);
assert.equal(context.manualDraw("F").header, "My round");
assert.equal(semi.name, "");
assert.equal(quarter.name, "");
assert.equal(context.manualDraw("bad"), null);
elements.get("draw-tournament").value = "event";
assert.equal(context.isManualDraw(), false);
elements.get("draw-tournament").value = "manual";
assert.equal(final.name, "Saved final");
assert.equal(final.header, "My round");

context.selectManualDrawPlayer(1);
choose(context.players[0]);
assert.equal(final.rounds.F[0].players[1].id, "1");
assert.equal(final.rounds.F[0].players[1].rank, 10);
context.selectManualDrawPlayer(0);
elements.get("draw-tournament").value = "event";
choose(context.players[0]);
assert.equal(final.rounds.F[0].players[0], null, "a stale picker must not edit a live tournament");
elements.get("draw-tournament").value = "manual";
context.selectManualDrawPlayer(0);
elements.get("draw-round").value = "S";
choose(context.players[0]);
assert.equal(final.rounds.F[0].players[0], null, "a stale picker must not change a different layout");
elements.get("draw-round").value = "F";
context.selectManualDrawPlayer(0);
choose({ ...context.players[0], rank: "NR", country: "" });
const edited = context.drawPlayer(final.rounds.F[0].players[0]);
assert.equal(edited.rank, null, "an explicit NR override must not fall back to the current ranking");
assert.equal(edited.country, "");
assert.equal(edited.best_rank, 5);
assert.equal(edited.dob, "2000-01-01");
assert.equal(context.players[0].rank, 10, "manual edits must not mutate the shared player directory");
assert.equal(context.players[0].country, "FRA");
context.selectManualDrawPlayer(99);
assert.equal(final.rounds.F[0].players[0].rank, null);
console.log("Manual round drafts, slot selection, stale-picker guards, NR and directory isolation passed.");
