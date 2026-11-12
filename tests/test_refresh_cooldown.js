"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
let now = 1000000;
const shared = { next_refresh_at: 0, pending: false, refreshing: false };
const subscribers = [];
const notify = () => subscribers.forEach(callback => callback());
function tab() {
  const buttons = new Map(), timers = [];
  const context = { Date: { now: () => now }, setInterval: update => timers.push(update),
    document: { getElementById(id) { if (!buttons.has(id)) buttons.set(id, {}); return buttons.get(id); } },
    window: { HCSharedData: { getState: () => shared, subscribe(feed, callback) { subscribers.push(callback); callback(); } } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("function createRefreshCooldown(")), context);
  return { create: context.createRefreshCooldown, buttons, tick: () => timers.forEach(update => update()) };
}
const first = tab(), results = first.create("refresh-results"), draws = first.create("refresh-draws");
assert.equal(results.begin(true), true);
assert.equal(results.begin(true), false);
shared.pending = true; notify();
assert.equal(draws.begin(true), false, "match-view controls share the same pending job");
shared.pending = false; shared.next_refresh_at = now + 120000; notify();
results.finish(true);
assert.equal(first.buttons.get("refresh-results").textContent, "Refresh (2:00)");
assert.equal(first.buttons.get("refresh-draws").disabled, true);
const reloaded = tab(), titles = reloaded.create("refresh-titles");
assert.equal(reloaded.buttons.get("refresh-titles").disabled, true, "a freshly loaded server state restores the shared cooldown");
assert.equal(titles.begin(true), false);
assert.equal(titles.begin(false), true, "background saved-data reads remain available during cooldown");
titles.finish(false);
assert.equal(shared.next_refresh_at, now + 120000, "background failure must not clear the server cooldown");
now += 121000; first.tick(); reloaded.tick();
assert.equal(results.begin(true), true);
shared.next_refresh_at = now + 15000; notify(); results.finish(false);
assert.equal(first.buttons.get("refresh-results").textContent, "Refresh (0:15)", "retry delay comes from D1");
now += 16000; first.tick();
assert.equal(first.buttons.get("refresh-results").disabled, false);
assert.equal(results.begin(true), true); results.finish(true);
assert.equal(first.buttons.get("refresh-results").disabled, false, "client completion must not invent a local cooldown");
console.log("D1 cooldowns, cross-view pending jobs, reload state, retry delays and background reads passed.");
