"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const elements = new Map();
function element() {
  return { value: "", textContent: "", listeners: {},
    addEventListener(event, listener) { this.listeners[event] = listener; },
    replaceChildren() {}, append() {} };
}
let requestedUrl;
let renders = 0;
let payload = { tournaments: [] };
const context = {
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    fonts: { ready: { then() {} } },
  },
  window: { addEventListener() {} },
  cardType: { value: "draw", addEventListener() {} },
  isDrawCard: () => context.cardType.value === "draw",
  tournamentName: tournament => tournament.name,
  countRender: () => { renders += 1; },
  fetch: async url => { requestedUrl = url; return { ok: true, json: async () => payload }; },
  setInterval() {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "draw-card.js"), "utf8"), context);
vm.runInContext("renderDrawCard = countRender", context);

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  payload = { tournaments: [{ id: "event", name: "New event", category: "WTA 250",
    start_date: today, end_date: today }] };
  elements.get("draw-tournament").value = "event";
  await context.refreshDraws();
  assert.equal(requestedUrl, "data/current_draws.json");
  assert.equal(renders, 1);
  await elements.get("refresh-draws").listeners.click();
  assert.match(requestedUrl, /^data\/current_draws\.json\?refresh=1&t=\d+$/);
  assert.equal(renders, 1, "unchanged brackets must not rebuild the card");
  elements.get("draw-tournament").value = "manual";
  const draft = context.manualDraw("F");
  draft.name = "My event";
  await context.refreshDraws();
  assert.equal(elements.get("draw-tournament").value, "manual");
  assert.equal(context.manualDraw("F").name, "My event");
  assert.equal(renders, 1, "automatic refresh must preserve the manual draft");
  console.log("Draw refresh bypass, unchanged brackets and manual draft preservation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
