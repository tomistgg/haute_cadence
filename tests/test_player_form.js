"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
const pending = new Map(), rendered = [];
let requests = 0, now = 1000000;
const context = {
  manualForms: new Map(), selectedPlayer: { id: "1" }, cardType: { value: "form" }, status: {},
  Date: { now: () => now }, console: { warn() {} },
  document: { querySelectorAll: () => [{ dataset: { playerId: "1" } }, { dataset: { playerId: "2" } }],
    getElementById: () => ({ open: true }) },
  renderPlayerForm: player => rendered.push(player.id), renderDrawFormEditor() {},
  loadSharedFeed: feed => {
    requests++;
    const id = feed.split("/")[1];
    return new Promise((resolve, reject) => pending.set(id, { resolve: results => resolve({ results }), reject }));
  },
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("function playerForm("), source.indexOf("function renderTourTitleNumber(")), context);

async function main() {
  const one = { id: "1" }, two = { id: "2" };
  const first = context.loadPlayerForm(one);
  await context.loadPlayerForm(one);
  context.cyclePlayerForm(one, 3);
  context.cyclePlayerForm(one, 4); context.cyclePlayerForm(one, 4); context.cyclePlayerForm(one, 4);
  context.selectedPlayer = two;
  const second = context.loadPlayerForm(two);
  await new Promise(resolve => setImmediate(resolve));
  pending.get("2").resolve(Array(10).fill("win"));
  await second;
  assert.equal(context.playerForm(two).results[3], "win");
  const before = rendered.length;
  pending.get("1").resolve(Array(10).fill("loss"));
  await first;
  assert.deepEqual(rendered.slice(before), ["1"]); // Only its draw card; the main card still shows player two.
  assert.equal(context.playerForm(one).results[3], "win");
  assert.equal(context.playerForm(one).results[4], ""); // A manual clear is also preserved.
  assert.equal(context.playerForm(one).results[9], "loss");
  await context.loadPlayerForm(one);
  assert.equal(requests, 2);
  now += 300001;
  const refresh = context.loadPlayerForm(one);
  await new Promise(resolve => setImmediate(resolve));
  pending.get("1").reject(Error("offline"));
  await refresh;
  assert.equal(context.playerForm(one).results[9], "loss");
  assert.match(context.playerForm(one).error, /manually/);
  assert.equal(context.playerForm(one).loading, false);
  await context.loadPlayerForm({ id: "manual-player" });
  assert.equal(requests, 3);
  console.log("Player Form pre-fill preserves manual edits, player switching, cached results and failed refreshes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
