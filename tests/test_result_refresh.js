"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = new Map();
function element() {
  return { textContent: "", listeners: {}, addEventListener(event, listener) { this.listeners[event] = listener; },
    querySelector() { return this; }, append() {}, replaceChildren() {} };
}
let renders = 0;
let requests = 0;
let requestedUrl;
let changeCard;
let payload = { updated_at: new Date().toISOString(), matches: [] };
const context = {
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    fonts: { ready: { then() {} } },
  },
  window: { location: { hostname: "localhost" }, addEventListener() {} },
  cardType: { value: "result", addEventListener(event, listener) { changeCard = listener; } },
  isResultCard: () => ["result", "tour-result"].includes(context.cardType.value),
  tournamentName: tournament => tournament.name,
  countRender: () => { renders += 1; },
  setInterval() {},
  fetch: async url => { requestedUrl = url; requests += 1; return { ok: true, json: async () => payload }; },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);
vm.runInContext("renderResultCard = countRender", context);

async function main() {
  await context.refreshResults();
  assert.equal(renders, 1);
  assert.equal(elements.get("result-status").textContent, "");
  context.refreshResultsIfStale();
  assert.equal(requests, 1, "refocusing a recently refreshed page must not fetch again");
  assert.equal(requestedUrl, "data/recent_results.json");
  await elements.get("refresh-results").listeners.click();
  assert.match(requestedUrl, /^data\/recent_results\.json\?refresh=1&t=\d+$/,
    "the Refresh button must bypass the server's fresh cache");
  assert.equal(renders, 1, "manual refresh must preserve an unchanged card");

  let finishFetch;
  context.fetch = () => new Promise(resolve => { finishFetch = resolve; });
  const refresh = context.refreshResults();
  assert.equal(elements.get("result-status").textContent, "", "background loading must not insert a line above the card");
  finishFetch({ ok: true, json: async () => ({ ...payload, updated_at: new Date().toISOString() }) });
  await refresh;
  assert.equal(renders, 1, "an unchanged feed must not rebuild the card");

  payload.matches = [{
    id: "tour", completed_at: new Date(Date.now() - 3600000).toISOString(), round: "Final",
    tournament: { id: "event", name: "Test event", category: "WTA 250" },
    winner: { name: "Player 1" }, loser: { name: "Player 2" },
  }];
  context.fetch = async () => ({ ok: true, json: async () => payload });
  await context.refreshResults();
  assert.equal(renders, 2, "new matches must still update the card");
  payload.matches[0].completed_at = new Date(Date.now() - 90000000).toISOString();
  await context.refreshResults();
  assert.equal(renders, 3, "expired matches must disappear even when the feed object is reused");
  context.cardType.value = "tour-result";
  context.updateResultOptions();
  assert.equal(renders, 4, "changing layout must redraw even with the same match list");
  context.fetch = async () => { throw new Error("Refresh failed"); };
  await context.refreshResults();
  assert.equal(elements.get("result-status").textContent, "Refresh failed");
  assert.equal(renders, 4);
  assert.equal(elements.get("refresh-results").disabled, false);
  vm.runInContext("refreshResults = async () => {}", context);
  context.cardType.value = "form";
  changeCard();
  context.cardType.value = "tour-result";
  changeCard();
  assert.equal(renders, 5, "returning from Form must restore the result card even when its feed is unchanged");
  console.log("Quiet background refresh, focus throttling, unchanged feeds, expiry, layout changes, and error recovery passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
