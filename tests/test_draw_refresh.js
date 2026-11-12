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
let requestedFeed;
let renders = 0;
let payload = { tournaments: [] };
let requestImplementation = async () => payload;
const finished = [];
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
  cardType: { value: "draw", addEventListener() {} },
  isDrawCard: () => context.cardType.value === "draw",
  tournamentName: tournament => tournament.name,
  countRender: () => { renders += 1; },
  createRefreshCooldown: () => ({ begin: () => true, finish: success => finished.push(success) }),
  loadSharedFeed: async (feed, force, progress) => {
    requestedFeed = { feed, force };
    return requestImplementation(force, progress);
  },
  setInterval() {},
};
vm.createContext(context);
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.runInContext(appSource.slice(appSource.indexOf("function tournamentCategoryLabel("), appSource.indexOf("function tournamentLabel(")), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "draw-card.js"), "utf8"), context);
vm.runInContext("renderDrawCard = countRender", context);

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  payload = { updated_at: new Date().toISOString(), tournaments: [{ id: "event", name: "New event", category: "WTA 250",
    start_date: today, end_date: today }] };
  elements.get("draw-tournament").value = "event";
  await context.refreshDraws();
  assert.deepEqual(requestedFeed, { feed: "draws", force: false });
  assert.equal(renders, 1);
  const originalRequest = requestImplementation;
  let finishFetch;
  let reportProgress;
  requestImplementation = (_, progress) => new Promise(resolve => { finishFetch = resolve; reportProgress = progress; });
  const manualRefresh = elements.get("refresh-draws").listeners.click();
  assert.equal(elements.get("draw-status").textContent, "Updating…");
  reportProgress("Loading shared singles matches (1/2)…");
  assert.equal(elements.get("draw-status").textContent, "Loading shared singles matches (1/2)…");
  context.cardType.value = "form";
  finishFetch(payload);
  await manualRefresh;
  requestImplementation = originalRequest;
  assert.match(elements.get("draw-status").textContent, /^Updated and saved at /);
  assert.equal(finished.at(-1), true);
  context.cardType.value = "draw";
  assert.deepEqual(requestedFeed, { feed: "draws", force: true });
  assert.equal(renders, 1, "unchanged brackets must not rebuild the card");
  elements.get("draw-tournament").value = "manual";
  const draft = context.manualDraw("F");
  draft.name = "My event";
  payload = { ...payload, tournaments: [{ ...payload.tournaments[0], id: "new-event", name: "Changed saved event" }] };
  await context.refreshDraws();
  assert.equal(elements.get("draw-tournament").value, "manual");
  assert.equal(context.manualDraw("F").name, "My event");
  assert.equal(renders, 1, "automatic refresh must preserve the manual draft");
  elements.get("draw-tournament").value = "new-event";
  requestImplementation = () => new Promise(resolve => { finishFetch = resolve; });
  const pending = context.refreshDraws();
  elements.get("draw-tournament").value = "manual";
  finishFetch(payload);
  await pending;
  assert.equal(elements.get("draw-tournament").value, "manual", "a saved-feed response must keep a manual selection made while loading");
  assert.equal(context.manualDraw("F").name, "My event");
  assert.equal(renders, 1);
  elements.get("draw-tournament").value = "new-event";
  requestImplementation = async () => { throw new Error("Shared data unavailable"); };
  await context.refreshDraws(true);
  assert.equal(elements.get("draw-status").textContent, "Shared data unavailable");
  assert.equal(finished.at(-1), false);
  assert.equal(renders, 1, "failed refreshes must keep the saved card and draft");
  requestImplementation = async () => ({ ...payload, refresh_error: "WTA unavailable; showing the saved draw." });
  await context.refreshDraws(true);
  assert.equal(elements.get("draw-status").textContent, "WTA unavailable; showing the saved draw.");
  assert.equal(finished.at(-1), false);
  assert.equal(renders, 1);
  console.log("Shared draw refresh, progress, unchanged brackets, failures, and manual draft preservation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
