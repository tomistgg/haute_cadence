"use strict";

(() => {
  const base = ["localhost", "127.0.0.1", "[::1]"].includes(window.location?.hostname)
    ? "" : "https://tennis-wta-api.schiter-tomas.workers.dev";
  const states = new Map(), saved = new Map(), reads = new Map(), jobs = new Map(), listeners = new Map();
  let sequence = 0;
  const key = feed => ["results", "draws", "champions"].includes(feed) ? "matches" : feed;
  const validFeed = feed => /^(players|calendar|results|draws|champions|players\/[1-9]\d{0,9}\/form)$/.test(feed);
  const failureText = "WTA data could not be refreshed; showing the saved data.";

  function validSnapshot(feed, snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
    if (feed === "players") return Array.isArray(snapshot.players) && typeof snapshot.snapshot_date === "string";
    if (feed === "calendar") return Array.isArray(snapshot.fields) && snapshot.weeks && typeof snapshot.weeks === "object" && !Array.isArray(snapshot.weeks);
    if (feed.startsWith("players/")) return Array.isArray(snapshot.results) && snapshot.results.length === 10 && snapshot.results.every(result => ["", "win", "loss"].includes(result));
    return Array.isArray(snapshot[{ results: "matches", draws: "tournaments", champions: "champions" }[feed]]);
  }

  function stateFor(feed) {
    const state = states.get(key(feed)) || {};
    return { next_refresh_at: state.next_refresh_at || 0, refreshing: !!state.refreshing,
      pending: jobs.has(key(feed)), progress: state.progress || "", error: state.error || null };
  }

  function emit(feed) {
    for (const listener of listeners.get(key(feed)) || []) listener(stateFor(feed));
  }

  async function request(feed, method) {
    const number = ++sequence;
    const response = await fetch(base + "/data/" + feed + (method === "POST" ? "/refresh" : ""), {
      method, cache: "no-store", signal: AbortSignal.timeout(method === "POST" ? 90000 : 20000),
    });
    const state = await response.json();
    if (!state || typeof state !== "object" || !Object.hasOwn(state, "snapshot") ||
        typeof state.refreshing !== "boolean" || !Number.isFinite(state.next_refresh_at) || state.next_refresh_at < 0 ||
        state.snapshot !== null && !validSnapshot(feed, state.snapshot)) {
      throw new Error("Saved WTA data is unavailable. Please try again.");
    }
    if (number >= (states.get(key(feed))?.sequence || 0)) {
      states.set(key(feed), { ...state, sequence: number });
      emit(feed);
    }
    if (state.snapshot !== null && number >= (saved.get(feed)?.sequence || 0)) saved.set(feed, { payload: state.snapshot, sequence: number });
    return { ...state, failed: !response.ok || !!state.error };
  }

  function read(feed) {
    if (!reads.has(feed)) reads.set(feed, request(feed, "GET").finally(() => reads.delete(feed)));
    return reads.get(feed);
  }

  async function refresh(feed) {
    const jobKey = key(feed);
    if (!jobs.has(jobKey)) {
      const promise = (async () => {
        const deadline = Date.now() + 90000;
        let state;
        do {
          if (Date.now() >= deadline) throw new Error("WTA refresh is taking longer than expected. Please try again.");
          state = await request(feed, "POST");
          if (state.failed) return state;
          if (state.refreshing) await new Promise(resolve => window.setTimeout(resolve, 250));
        } while (state.refreshing);
        return state;
      })().finally(() => { jobs.delete(jobKey); emit(feed); });
      jobs.set(jobKey, promise);
      emit(feed);
    }
    return jobs.get(jobKey);
  }

  async function load(feed, { refresh: force = false, onProgress, onState } = {}) {
    if (!validFeed(feed)) throw new Error("Unknown shared data feed.");
    const notify = state => {
      if (state.progress && (state.pending || state.refreshing)) onProgress?.(state.progress);
      onState?.(state);
    };
    const stop = subscribe(feed, notify);
    try {
      let state = await read(feed);
      if ((force || state.refreshing || state.snapshot === null || jobs.has(key(feed))) &&
          (state.refreshing || jobs.has(key(feed)) || state.next_refresh_at <= Date.now())) {
        const refreshed = await refresh(feed);
        state = await request(feed, "GET");
        if (refreshed.failed) state = { ...state, failed: true };
      }
      const payload = saved.get(feed)?.payload || state.snapshot;
      if (!payload) throw new Error("No saved WTA data is available yet. Please try Refresh again.");
      return state.failed ? { ...payload, refresh_error: failureText } : payload;
    } catch (error) {
      const payload = saved.get(feed)?.payload;
      if (payload) return { ...payload, refresh_error: failureText };
      throw error;
    } finally { stop(); }
  }

  function subscribe(feed, callback) {
    const jobKey = key(feed);
    if (!listeners.has(jobKey)) listeners.set(jobKey, new Set());
    listeners.get(jobKey).add(callback);
    callback(stateFor(feed));
    return () => listeners.get(jobKey)?.delete(callback);
  }

  window.HCSharedData = { load, getState: stateFor, subscribe };
})();
