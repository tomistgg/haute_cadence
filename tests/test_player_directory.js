"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

function element() {
  const classes = new Set();
  return {
    hidden: false, disabled: false, textContent: "", value: "", children: [], attributes: {},
    classList: { remove: name => classes.delete(name), toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren() { this.children = []; }, append(child) { this.children.push(child); },
    querySelector() { return element(); }, addEventListener(name, listener) { this[name] = listener; },
  };
}

async function main() {
  const pending = [], rendered = [];
  const listeners = new Map(), timers = [], forms = [];
  let now = 1000000;
  const searchInput = element(); searchInput.value = "Sabalenka";
  const originalDraft = { results: ["win"], edited: new Set([0]) };
  const context = {
    players: [], playersReady: false, playersLoading: false, playerDirectoryError: "", nextPlayersRefresh: 0,
    selectedPlayer: { id: "1", name: "Old name" }, snapshotDate: "", playerNameIndex: {},
    manualForms: new Map([["1", originalDraft]]),
    searchInput, options: element(), status: element(), card: { hidden: false },
    playerLoadState: element(), playerLoadMessage: element(), retryPlayers: element(),
    activeIndex: -1, visiblePlayers: [], normalize: value => value.toLowerCase(),
    playerMatchesSearch: (player, needle) => player.name.toLowerCase().includes(needle),
    playerDisplayName: player => player.name, renderCard: player => rendered.push(player),
    cardType: { value: "form" }, isDrawCard: () => context.cardType.value === "draw",
    loadPlayerForm: player => forms.push(player.id), Date: { now: () => now },
    window: { addEventListener: (event, callback) => listeners.set(event, callback) },
    setInterval: callback => timers.push(callback),
    document: { activeElement: searchInput, createElement: element,
      querySelectorAll: () => [{ dataset: { playerId: "1" } }, { dataset: { playerId: "unknown" } }] },
    loadSharedFeed(feed) {
      assert.equal(feed, "players");
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("function showOptions("), source.indexOf("function selectPlayer(")), context);
  vm.runInContext(source.slice(source.indexOf("async function loadPlayerDirectory("), source.indexOf("function refreshCalendar(")), context);
  assert.equal(pending.length, 1);
  pending[0].reject(new Error("offline"));
  await tick();
  assert.equal(context.playersReady, false);
  assert.equal(context.playerLoadState.hidden, false);
  assert.equal(context.retryPlayers.hidden, false);
  assert.match(context.playerLoadMessage.textContent, /could not be loaded/);
  context.showOptions(searchInput.value);
  assert.match(context.status.textContent, /could not be loaded/, "a failed directory is not a search with no matches");
  assert.equal(context.options.children.length, 0);

  const retried = context.retryPlayers.click();
  await context.loadPlayerDirectory();
  assert.equal(pending.length, 2, "concurrent retry clicks share the in-progress load");
  assert.equal(context.retryPlayers.disabled, true);
  const player = { id: "1", name: "Aryna Sabalenka", country: "BLR", rank: 1 };
  pending[1].resolve({ players: [player], snapshot_date: "2026-11-09", player_names: { by_wta_id: { "1": player.name } } });
  await retried;
  assert.equal(context.playersReady, true);
  assert.equal(context.playerLoadState.hidden, true);
  assert.equal(context.retryPlayers.hidden, true);
  assert.equal(context.retryPlayers.disabled, false);
  assert.equal(context.options.children.length, 1, "the typed query works after recovery without reloading");
  assert.equal(context.options.attributes["aria-expanded"], undefined);
  assert.equal(searchInput.attributes["aria-expanded"], "true");
  assert.equal(searchInput.value, "Sabalenka");
  assert.equal(context.selectedPlayer, player);
  assert.equal(rendered.at(-1), player);
  assert.equal(context.manualForms.get("1"), originalDraft, "retrying never resets card drafts");

  const invalid = context.loadPlayerDirectory();
  pending[2].resolve({ players: null, snapshot_date: "2026-11-09" });
  await invalid;
  assert.equal(context.players[0], player, "an invalid response must not replace a usable directory");
  assert.equal(context.playerLoadState.hidden, false);
  assert.equal(context.retryPlayers.hidden, false);

  await context.loadPlayerDirectory({ quiet: true });
  assert.equal(pending.length, 3, "background checks respect the failure backoff");
  now += 60001;
  context.status.textContent = "Editing a card";
  context.document.activeElement = null;
  listeners.get("focus")();
  assert.equal(pending.length, 4);
  const updated = { ...player, rank: 2, tour_title_count: 24 };
  pending[3].resolve({ players: [updated], snapshot_date: "2026-11-16" });
  await tick();
  assert.equal(context.selectedPlayer, updated);
  assert.equal(rendered.at(-1), updated);
  assert.equal(context.snapshotDate, "2026-11-16");
  assert.equal(context.manualForms.get("1"), originalDraft);
  assert.equal(context.status.textContent, "Editing a card", "background reads do not overwrite editor feedback");
  assert.deepEqual(forms, ["1"], "focus also rechecks the visible player's independently expiring form");
  listeners.get("focus")();
  assert.equal(pending.length, 4, "focus within five minutes does not reread the directory");
  now += 300001;
  const rendersBefore = rendered.length;
  timers[0]();
  pending[4].resolve({ players: [{ ...updated }], snapshot_date: "2026-11-16" });
  await tick();
  assert.equal(rendered.length, rendersBefore, "unchanged profiles do not rebuild the card and its PNG");
  context.cardType.value = "draw";
  forms.length = 0;
  context.refreshVisiblePlayerData();
  assert.deepEqual(forms, ["1"], "draw rechecks only known visible players");
  console.log("Directory recovery, quiet focus/timer updates, visible form rechecks and draft preservation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
