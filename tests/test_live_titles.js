"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const claire = { id: "323966", tour_title_count: 0, latest_title: {
  tournament_id: "2093", year: 2026, category: "WTA 125", start_date: "2026-09-07", end_date: "2026-09-13",
} };
const hongKong = { tournament_id: "1074", year: 2026, category: "WTA 250", start_date: "2026-11-02", end_date: "2026-11-08",
  champion: { id: "323966" } };
let payload = [hongKong], failure = false, now = 1000000, requests = 0, renders = 0, forced;
const state = { next_refresh_at: 0, pending: false, refreshing: false };
const elements = new Map();
class ClockDate extends Date { static now() { return now; } }
const context = {
  recentChampions: null, recentChampionsLoading: false, nextChampionsRefresh: 0, championsRefreshCooldown: undefined,
  selectedPlayer: claire, players: [claire], cardType: { value: "wta-tour" }, status: {},
  Date: ClockDate, console: { warn() {} }, setInterval() {},
  window: { addEventListener() {}, HCSharedData: { getState: () => state, subscribe: () => {} } },
  isDrawCard: () => false, document: { querySelectorAll: () => [{ dataset: { playerId: claire.id } }],
    getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
  renderTourTitleNumber() { renders++; }, renderPlayerForm() { renders++; },
  loadSharedFeed: async (feed, force) => {
    assert.equal(feed, "champions"); requests++; forced = force;
    if (failure) throw Error("offline");
    if (force) state.next_refresh_at = now + 120000;
    return { updated_at: "2026-11-12T10:00:00Z", champions: payload };
  },
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("function createRefreshCooldown(")), context);
vm.runInContext(source.slice(source.indexOf("function playerTitles("), source.indexOf('document.getElementById("refresh-titles").addEventListener')), context);

async function main() {
  assert.equal(context.playerTitles(claire).latest_title, claire.latest_title, "saved profile is available before shared title data arrives");
  await context.refreshRecentChampions();
  assert.equal(context.playerTitles(claire).tour_title_count, 1);
  assert.equal(context.playerTitles(claire).latest_title, hongKong);
  assert.equal(claire.tour_title_count, 0, "updates preserve the original profile object");
  assert.equal(renders, 4);
  await context.refreshRecentChampions();
  assert.equal(requests, 1);
  await context.refreshRecentChampions(true);
  assert.equal(requests, 2);
  assert.equal(forced, true);
  assert.match(elements.get("title-refresh-status").textContent, /^Updated and saved at /);
  assert.equal(elements.get("refresh-titles").textContent, "Refresh (2:00)");
  await context.refreshRecentChampions(true);
  assert.equal(requests, 2);
  context.recentChampions = [hongKong, hongKong];
  assert.equal(context.playerTitles(claire).tour_title_count, 1);
  const stale = { ...claire, tour_title_count: 99, latest_title: { ...hongKong, tournament_id: "incorrect" } };
  assert.equal(context.playerTitles(stale).tour_title_count, 1, "the full D1 history overrides stale profile summaries");
  context.recentChampions = [{ ...hongKong, champion: { id: "someone-else" } }];
  assert.equal(context.playerTitles(stale).tour_title_count, 0, "correcting a winner removes an incorrectly attributed title");
  context.recentChampions = [{ ...hongKong, category: "WTA 125" }];
  assert.equal(context.playerTitles(claire).tour_title_count, 0);
  context.recentChampions = [hongKong];
  now += 300001; failure = true;
  await context.refreshRecentChampions(true);
  assert.equal(context.playerTitles(claire).tour_title_count, 1);
  assert.equal(context.recentChampionsLoading, false);
  assert.match(context.status.textContent, /saved title history/);
  assert.equal(elements.get("refresh-titles").disabled, false);
  failure = false; payload = [];
  await context.refreshRecentChampions(true);
  assert.equal(context.playerTitles(stale).tour_title_count, 0, "an explicit empty authoritative history clears stale counts");
  assert.equal(context.status.textContent, "Recent WTA titles updated.");
  console.log("Shared title authority, corrected winners, title deduplication, WTA125 exclusions and failure retention passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
