"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("function createRefreshCooldown(");
assert.ok(start >= 0);
const storage = new Map();
let now = 1000000;

function tab(blockStorage = false) {
  const buttons = new Map();
  const timers = [];
  let onStorage;
  const context = {
    Date: { now: () => now },
    document: { getElementById(id) { if (!buttons.has(id)) buttons.set(id, {}); return buttons.get(id); } },
    localStorage: {
      getItem(key) { if (blockStorage) throw new Error("Storage blocked"); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockStorage) throw new Error("Storage blocked"); storage.set(key, value); },
    },
    setInterval(update) { timers.push(update); },
    window: { addEventListener(event, listener) { onStorage = listener; } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start), context);
  return { create: context.createRefreshCooldown, buttons, tick: () => timers.forEach(update => update()),
    sync: key => onStorage({ key }) };
}

const first = tab();
const results = first.create("refresh-results");
assert.equal(results.begin(true), true);
assert.equal(results.begin(true), false, "an in-flight update cannot start again");
results.finish(true);
assert.equal(first.buttons.get("refresh-results").textContent, "Refresh (2:00)");
assert.equal(results.begin(true), false);

const second = tab();
const reloaded = second.create("refresh-results");
assert.equal(second.buttons.get("refresh-results").disabled, true, "reloads and tabs retain the countdown");
assert.equal(reloaded.begin(true), false);
const draws = second.create("refresh-draws");
assert.equal(draws.begin(true), true, "draws have a separate countdown");
draws.finish(false);
assert.equal(second.buttons.get("refresh-draws").disabled, false, "failed updates can be retried");

assert.equal(reloaded.begin(false), true, "automatic updates are not blocked by a manual countdown");
reloaded.finish(true);
assert.equal(second.buttons.get("refresh-results").disabled, true, "automatic completion cannot clear a manual cooldown");
now += 121000;
first.tick();
second.tick();
assert.equal(first.buttons.get("refresh-results").disabled, false);
assert.equal(reloaded.begin(true), true);
first.sync("haute-cadence:refresh-results:next-refresh");
assert.equal(first.buttons.get("refresh-results").disabled, true, "other tabs pick up a new countdown");
reloaded.finish(false);
first.sync("haute-cadence:refresh-results:next-refresh");
assert.equal(first.buttons.get("refresh-results").disabled, false);

const privateTab = tab(true);
const privateRefresh = privateTab.create("refresh-results");
assert.equal(privateRefresh.begin(true), true);
privateRefresh.finish(true);
assert.equal(privateRefresh.begin(true), false, "blocked storage still keeps an in-memory cooldown");
now += 121000;
privateTab.tick();
assert.equal(privateTab.buttons.get("refresh-results").disabled, false);
console.log("Cooldown expiry, request guards, persistence, tab sync, failures, automatic updates and blocked storage passed.");
