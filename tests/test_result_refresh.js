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
let requestedFeed;
let requestImplementation = async () => payload;
let manualAllowed = true;
const finished = [];
let changeCard;
let timeOffset = 0;
let payload = { updated_at: new Date().toISOString(), matches: [] };
const context = {
  Date: class extends Date { static now() { return Date.now() + timeOffset; } },
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
  tournamentName: tournament => tournament.name,
  countRender: () => { renders += 1; },
  setInterval() {},
  createRefreshCooldown: () => ({ begin: force => !force || manualAllowed, finish: success => finished.push(success) }),
  loadSharedFeed: async (feed, force, progress) => {
    requestedFeed = { feed, force };
    requests += 1;
    return requestImplementation(force, progress);
  },
};
vm.createContext(context);
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.runInContext(appSource.slice(appSource.indexOf("function isResultCard("), appSource.indexOf("function isDrawCard(")), context);
vm.runInContext(appSource.slice(appSource.indexOf("function tournamentCategoryLabel("), appSource.indexOf("function tournamentLabel(")), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);
vm.runInContext("const originalRefreshResults = refreshResults; renderResultCard = countRender", context);

async function main() {
  await context.refreshResults();
  assert.equal(renders, 1);
  assert.equal(elements.get("result-status").textContent, "");
  context.refreshResultsIfStale();
  assert.equal(requests, 1, "refocusing a recently refreshed page must not fetch again");
  assert.deepEqual(requestedFeed, { feed: "results", force: false });
  await elements.get("refresh-results").listeners.click();
  assert.deepEqual(requestedFeed, { feed: "results", force: true }, "the Refresh button must request a saved backend update");
  assert.equal(renders, 1, "manual refresh must preserve an unchanged card");
  assert.match(elements.get("result-status").textContent, /^Updated and saved at /);
  const completedStatus = elements.get("result-status").textContent;
  manualAllowed = false;
  const completedRequests = requests;
  await context.refreshResults(true);
  assert.equal(requests, completedRequests, "manual clicks during cooldown must not fetch");

  let finishFetch;
  requestImplementation = (_, progress) => new Promise(resolve => {
    finishFetch = resolve;
    progress("Loading shared WTA matches…");
  });
  const refresh = context.refreshResults();
  assert.equal(elements.get("result-status").textContent, completedStatus, "background loading must preserve the current status");
  finishFetch({ ...payload, updated_at: new Date().toISOString() });
  await refresh;
  assert.equal(renders, 1, "an unchanged feed must not rebuild the card");

  timeOffset += 121000;
  manualAllowed = true;
  let reportProgress;
  requestImplementation = (_, progress) => new Promise(resolve => { finishFetch = resolve; reportProgress = progress; });
  const manualRefresh = context.refreshResults(true);
  assert.equal(elements.get("result-status").textContent, "Updating…");
  reportProgress("Loading shared WTA matches (1/2)…");
  assert.equal(elements.get("result-status").textContent, "Loading shared WTA matches (1/2)…");
  finishFetch(payload);
  await manualRefresh;
  assert.match(elements.get("result-status").textContent, /^Updated and saved at /);

  payload.matches = [{
    id: "tour", completed_at: new Date(Date.now() - 3600000).toISOString(), round: "Final",
    tournament: { id: "event", name: "Test event", category: "WTA 250" },
    winner: { name: "Player 1" }, loser: { name: "Player 2" },
  }];
  requestImplementation = async () => payload;
  await context.refreshResults();
  assert.equal(renders, 2, "new matches must still update the card");
  payload.matches[0].completed_at = new Date(Date.now() - 90000000).toISOString();
  await context.refreshResults();
  assert.equal(renders, 3, "expired matches must disappear even when the feed object is reused");
  context.cardType.value = "tour-result";
  context.updateResultOptions();
  assert.equal(renders, 4, "changing layout must redraw even with the same match list");
  requestImplementation = async () => { throw new Error("Refresh failed"); };
  timeOffset += 121000;
  await context.refreshResults(true);
  assert.equal(elements.get("result-status").textContent, "Refresh failed");
  assert.equal(renders, 4);
  assert.equal(finished.at(-1), false);
  requestImplementation = async () => ({ ...payload, refresh_error: "WTA unavailable; showing the saved feed." });
  await context.refreshResults(true);
  assert.equal(elements.get("result-status").textContent, "WTA unavailable; showing the saved feed.");
  assert.equal(renders, 4);
  assert.equal(finished.at(-1), false, "a retained snapshot must not be reported as a successful refresh");
  vm.runInContext("refreshResults = async () => {}", context);
  context.cardType.value = "form";
  changeCard();
  context.cardType.value = "tour-result";
  changeCard();
  assert.equal(renders, 5, "returning from Form must restore the result card even when its feed is unchanged");
  context.cardType.value = "instagram-result";
  changeCard();
  assert.equal(renders, 6, "Instagram must use the same result refresh and layout-change handler");
  assert.equal(elements.get("result-controls").hidden, false);
  const instagramDraft = vm.runInContext("selectedResultId = 'instagram-3'; selectedResultMatch()", context);
  instagramDraft.sets[0].winner = 7;
  context.cardType.value = "form";
  changeCard();
  context.cardType.value = "instagram-result";
  changeCard();
  assert.equal(context.selectedResultMatch(), instagramDraft, "returning to Instagram must preserve its manual draft");
  assert.equal(instagramDraft.sets[0].winner, 7);
  requestImplementation = async () => ({ ...payload, matches: [{ ...payload.matches[0], id: "new-match", completed_at: new Date().toISOString() }] });
  vm.runInContext("refreshResults = originalRefreshResults", context);
  await context.refreshResults();
  assert.equal(context.selectedResultMatch(), instagramDraft, "new saved matches must not replace the selected manual draft");
  assert.equal(instagramDraft.sets[0].winner, 7);
  console.log("Shared saved-feed refresh, progress, unchanged cards, expiry, manual drafts, and error recovery passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
