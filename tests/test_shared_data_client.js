"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "shared-data.js"), "utf8");

function browser(service) {
  let now = 1000000;
  const requests = [];
  class Clock extends Date { static now() { return now; } }
  const context = { AbortSignal, Date: Clock,
    window: { location: { hostname: "127.0.0.1" }, setTimeout: callback => setImmediate(callback) },
    fetch: async (url, options) => { requests.push({ url, method: options.method }); return service(url, options.method); },
  };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: context.window.HCSharedData, requests, advance: milliseconds => { now += milliseconds; }, now: () => now };
}
const state = (snapshot, extra = {}) => ({ snapshot, refreshing: false, next_refresh_at: 0, progress: "", error: null, ...extra });

async function main() {
  let posts = 0, saved = { matches: [{ id: "saved" }] };
  const ordinary = browser((url, method) => {
    if (method === "POST") posts++;
    return Response.json(state(saved));
  });
  assert.equal((await ordinary.api.load("results")).matches[0].id, "saved");
  assert.equal(posts, 0, "opening saved feeds only reads data");
  assert.equal(ordinary.requests[0].url, "/data/results");

  let phase = 0, until = 0;
  const payload = feed => feed === "results" ? { matches: [{ id: phase === 2 ? "new" : "old" }] }
    : { tournaments: [{ id: phase === 2 ? "new-draw" : "old-draw" }] };
  const shared = browser((url, method) => {
    const feed = url.includes("results") ? "results" : "draws";
    if (method === "POST") { phase++; if (phase === 2) until = shared.now() + 120000; }
    return Response.json(state(payload(feed), { refreshing: phase === 1, next_refresh_at: until,
      progress: phase === 1 ? "Loading matches…" : "" }), { status: method === "POST" && phase === 1 ? 202 : 200 });
  });
  const progress = [];
  const [results, draws] = await Promise.all([
    shared.api.load("results", { refresh: true, onProgress: message => progress.push(message) }),
    shared.api.load("draws", { refresh: true }),
  ]);
  assert.equal(results.matches[0].id, "new");
  assert.equal(draws.tournaments[0].id, "new-draw");
  assert.equal(phase, 2, "concurrent views advance one match job, not separate jobs");
  assert.ok(progress.includes("Loading matches…"));
  assert.equal(shared.api.getState("champions").next_refresh_at, until);
  assert.equal(shared.api.getState("draws").pending, false);
  await shared.api.load("draws", { refresh: true });
  assert.equal(phase, 2, "server cooldown prevents a second manual collection");

  let failing = false, attempts = 0, error = null, retry = 0;
  const recovery = browser((url, method) => {
    if (method === "POST") {
      attempts++;
      error = failing ? "Provider unavailable" : null;
      retry = recovery.now() + (failing ? 15000 : 120000);
    }
    return Response.json(state({ matches: [{ id: attempts > 1 ? "recovered" : "saved" }] },
      { error, next_refresh_at: retry }), { status: method === "POST" && failing ? 502 : 200 });
  });
  await recovery.api.load("results");
  failing = true;
  assert.match((await recovery.api.load("results", { refresh: true })).refresh_error, /saved data/);
  assert.equal(recovery.api.getState("results").next_refresh_at, retry);
  recovery.advance(16000); failing = false;
  assert.equal((await recovery.api.load("results", { refresh: true })).matches[0].id, "recovered",
    "a previous error must not block a manual retry after the server backoff");
  assert.equal(attempts, 2);

  let formReady = false;
  const form = browser((url, method) => {
    if (method === "POST") formReady = true;
    return Response.json(state(formReady ? { player_id: "1", results: Array(10).fill("win") } : null));
  });
  assert.equal((await form.api.load("players/1/form")).results.length, 10);
  assert.equal(form.requests.filter(request => request.method === "POST").length, 1);
  await assert.rejects(form.api.load("players/../secret/form"), /Unknown/);

  let invalid = false;
  const unavailable = browser(() => invalid ? Response.json({ error: "Unavailable" }, { status: 503 })
    : Response.json(state({ matches: [{ id: "keep" }] })));
  await unavailable.api.load("results"); invalid = true;
  const retained = await unavailable.api.load("results");
  assert.equal(retained.matches[0].id, "keep");
  assert.match(retained.refresh_error, /saved data/);
  let malformed = false;
  const integrity = browser(() => Response.json(state(malformed ? { matches: null } : { matches: [{ id: "valid" }] })));
  await integrity.api.load("results"); malformed = true;
  assert.equal((await integrity.api.load("results")).matches[0].id, "valid", "malformed payloads never replace a usable saved snapshot");

  let running = false, completed = false;
  const bounded = browser((url, method) => {
    if (method === "POST") { running = !completed; bounded.advance(30000); }
    return Response.json(state({ matches: [{ id: completed ? "finished" : "previous" }] }, { refreshing: running }));
  });
  const timedOut = await bounded.api.load("results", { refresh: true });
  assert.equal(timedOut.matches[0].id, "previous");
  assert.match(timedOut.refresh_error, /saved data/);
  assert.equal(bounded.api.getState("results").pending, false, "the browser releases its local pending state at the bounded wait");
  assert.equal(bounded.api.getState("results").refreshing, true, "the saved server job survives a browser timeout");
  completed = true;
  assert.equal((await bounded.api.load("results")).matches[0].id, "finished", "the next load joins and completes an existing server job");
  console.log("Shared reads, bounded refresh joins, global cooldown, failure recovery, missing form caches and saved-data retention passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
