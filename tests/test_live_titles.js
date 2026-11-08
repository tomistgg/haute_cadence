"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const claire = { id: "323966", tour_title_count: 0, tour_title_ids: [], latest_title: {
  tournament_id: "2093", year: 2026, category: "WTA 125", start_date: "2026-09-07", end_date: "2026-09-13",
} };
const hongKong = { tournament_id: "1074", year: 2026, category: "WTA 250", start_date: "2026-11-02", end_date: "2026-11-08",
  champion: { id: "323966" } };
let payload = [hongKong], failure = false, now = 1000000, requests = 0, renders = 0, forced;
const elements = new Map(), storage = new Map();
class ClockDate extends Date { static now() { return now; } }
const context = {
  recentChampions: [], recentChampionsLoading: false, nextChampionsRefresh: 0, championsRefreshCooldown: undefined,
  selectedPlayer: claire, players: [claire], cardType: { value: "wta-tour" }, status: {},
  Date: ClockDate, console: { warn() {} }, setInterval() {}, window: { addEventListener() {} },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  isDrawCard: () => false, document: { querySelectorAll: () => [{ dataset: { playerId: claire.id } }],
    getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
  renderTourTitleNumber() { renders++; }, renderPlayerForm() { renders++; },
  getModule: async () => ({ collectChampions: async (date, force) => { requests++; forced = force; if (failure) throw Error("offline"); return payload; } }),
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("function createRefreshCooldown(")), context);
vm.runInContext(source.slice(source.indexOf("function playerTitles("), source.indexOf('document.getElementById("refresh-titles").addEventListener'))
  .replace('import("./wta-live.mjs")', "getModule()"), context);

async function main() {
  await context.refreshRecentChampions();
  assert.equal(context.playerTitles(claire).tour_title_count, 1);
  assert.equal(context.playerTitles(claire).latest_title, hongKong);
  assert.equal(claire.tour_title_count, 0, "live counts must not alter the saved baseline");
  assert.equal(renders, 4, "refresh both title count and last title in the selected card and draw cards");
  await context.refreshRecentChampions();
  assert.equal(requests, 1);
  await context.refreshRecentChampions(true);
  assert.equal(requests, 2, "manual refresh bypasses the five-minute automatic refresh delay");
  assert.equal(forced, true, "manual refresh must bypass the shared draw cache too");
  assert.match(elements.get("title-refresh-status").textContent, /^Updated at /);
  assert.equal(elements.get("refresh-titles").textContent, "Refresh (2:00)");
  await context.refreshRecentChampions(true);
  assert.equal(requests, 2, "the same cooldown as the other refresh buttons prevents duplicate requests");
  context.recentChampions = [hongKong, hongKong];
  assert.equal(context.playerTitles(claire).tour_title_count, 1, "duplicate finals must count once");
  const caughtUp = { ...claire, tour_title_count: 1, tour_title_ids: ["1074:2026"], latest_title: hongKong };
  assert.equal(context.playerTitles(caughtUp).tour_title_count, 1, "weekly JSON catching up must not add another title");
  assert.equal(context.playerTitles({ ...caughtUp, tour_title_ids: undefined }).tour_title_count, 1);
  const previousTour = { ...hongKong, tournament_id: "older", end_date: "2026-09-01" };
  assert.equal(context.playerTitles({ ...claire, tour_title_count: 2, latest_title: previousTour }).tour_title_count, 3);
  context.recentChampions = [{ ...hongKong, category: "WTA 125" }];
  assert.equal(context.playerTitles(claire).tour_title_count, 0, "125 titles must not increment the Tour count");
  assert.equal(context.playerTitles({ ...claire, latest_title: previousTour }).latest_title, previousTour);
  context.recentChampions = [hongKong];
  assert.equal(context.playerTitles({ ...claire, id: "another" }).tour_title_count, 0);
  now += 300001; failure = true;
  await context.refreshRecentChampions(true);
  assert.equal(context.playerTitles(claire).tour_title_count, 1, "a failed refresh must preserve the last live champions");
  assert.equal(context.recentChampionsLoading, false);
  assert.match(context.status.textContent, /saved title history/);
  assert.equal(elements.get("refresh-titles").disabled, false, "failed manual updates can be retried immediately");
  failure = false; payload = [];
  await context.refreshRecentChampions(true);
  assert.equal(context.playerTitles(caughtUp).tour_title_count, 1, "after the live window ends, the saved count remains");
  assert.equal(context.status.textContent, "Recent WTA titles updated.");
  console.log("Live title counts, weekly JSON deduplication, last titles, WTA 125 exclusions and refresh failures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
