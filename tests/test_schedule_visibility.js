"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const elements = new Map();
function element() {
  return {
    hidden: true, open: false, value: "", listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
  };
}
const context = {
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    fonts: { ready: { then() {} } },
  },
  cardType: { ...element(), value: "form" },
};
vm.createContext(context);
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.runInContext(appSource.slice(appSource.indexOf("function getAge("), appSource.indexOf("function tournamentStyle(")), context);
context.snapshotDate = "2026-11-05";
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "schedule-card.js"), "utf8"), context);
for (const [rank, frame] of [[1, "top_1"], [2, "top_10"], [10, "top_10"], [11, "top_20"], [20, "top_20"],
  [21, "top_100"], [100, "top_100"], [101, "top_100+"], [900, "top_100+"], [null, "top_100+"]]) {
  assert.equal(context.schedulePlayerFrame({ rank, dob: "2000-01-01" }), frame);
}
assert.equal(context.schedulePlayerFrame({ rank: 17, dob: "2010-01-01" }), "prospect");
assert.equal(context.schedulePlayerFrame({ rank: 10, dob: "2010-01-01" }), "top_10");
vm.runInContext(`
  renderScheduleCard = () => { scheduleContent.hidden = false; };
  showScheduleTournamentOptions = () => {};
`, context);

const round = elements.get("schedule-round-button");
const tournament = elements.get("schedule-tournament-button");
const roundDialog = context.document.getElementById("schedule-round-dialog");
const tournamentDialog = context.document.getElementById("schedule-tournament-dialog");
const changeType = type => {
  context.cardType.value = type;
  context.cardType.listeners.change();
};

for (const type of ["form", "wta-125", "wta-tour", "result", "tour-result", "instagram-result", "multiple-tour-result", "multiple-photo-result", "draw"]) {
  changeType("schedule");
  assert.equal(elements.get("schedule-options").hidden, false);
  assert.equal(elements.get("schedule-card-content").hidden, false);
  round.listeners.click();
  tournament.listeners.click();
  assert.equal(roundDialog.open, true);
  assert.equal(tournamentDialog.open, true);

  changeType(type);
  assert.equal(elements.get("schedule-options").hidden, true, type);
  assert.equal(elements.get("schedule-card-content").hidden, true, type);
  assert.equal(roundDialog.open, false, type + " must close the Schedule round dialog");
  assert.equal(tournamentDialog.open, false, type + " must close the Schedule tournament dialog");
  round.listeners.click();
  tournament.listeners.click();
  assert.equal(roundDialog.open, false, type + " must not open Schedule dialogs");
  assert.equal(tournamentDialog.open, false, type + " must not open Schedule dialogs");
}

console.log("Schedule controls stay confined to the Schedule card.");
