"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const portrait = source.slice(source.indexOf("const photoByName ="), source.indexOf("function playerForm("));
const saved = source.slice(source.indexOf("function savedPlayerPhoto("), source.indexOf("function getAge("));
const bindings = [];
let payload = { photos: [] };
let now = 1000000;
let fail = false;
const context = {
  Date: { now: () => now }, AbortSignal,
  normalize: name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  playerDisplayName: player => player.display_name || player.name,
  card: { querySelectorAll: () => bindings.map(binding => binding.image) },
  window: { addEventListener() {} }, setInterval() {}, console: { warn() {} },
  fetch: async () => ({ ok: !fail, json: async () => payload }),
};
vm.createContext(context);
vm.runInContext(portrait + saved, context);
const exportsSource = fs.readFileSync(path.join(__dirname, "..", "export-card.js"), "utf8");
vm.runInContext(exportsSource.slice(exportsSource.indexOf("async function waitForCardImage("),
  exportsSource.indexOf("async function renderCardExport(")), context);

function render(player, override) {
  const image = { dataset: {}, style: {}, getAttribute(name) { return this[name]; },
    removeAttribute(name) { delete this[name]; } };
  const initials = { style: {} };
  context.setPlayerPortrait(image, initials, player, override);
  bindings.push({ image, initials });
  return { image, initials };
}

async function main() {
  await new Promise(resolve => setImmediate(resolve));
  const leylah = { id: "320718", name: "Leylah Fernandez" };
  const eala = { id: "330332", name: "Alexandra Eala" };
  const leylahPortrait = render(leylah);
  const manual = render(eala, "blob:manual-upload");
  const missing = render({ id: "missing", name: "No Photo" });
  assert.equal(leylahPortrait.image.src, "assets/players/leylah-fernandez.png");
  assert.equal(missing.image.hidden, true);
  assert.equal(missing.initials.textContent, "NP");
  const remote = (name, id = name) => ({ name, path: "/photos/" + id + "?v=2026-11-05" });
  payload = { photos: [remote("leylah_fernandez.png", "leylah"), remote("330332.png", "eala"),
    remote("alexandra_eala.png", "eala-name"), remote("jessica_bouzas.png", "bouzas"),
    remote("leylah_fernandez.jpg", "older-duplicate"), remote("diana_shnaider.png", "shnaider")] };
  now += 300001;
  await context.refreshPlayerPhotos();
  assert.match(leylahPortrait.image.src, /\/photos\/leylah\?/);
  assert.equal(leylahPortrait.image.crossOrigin, "anonymous");
  assert.equal(manual.image.src, "blob:manual-upload", "late indexes must preserve manual uploads");
  assert.match(context.savedPlayerPhoto(eala), /\/photos\/eala\?/, "WTA ID must beat a name match");
  assert.match(context.savedPlayerPhoto({ id: "other", name: "Leylah-Annie Fernandez", aliases: ["Leylah Fernandez"] }),
    /\/photos\/leylah\?/);
  assert.match(context.savedPlayerPhoto({ id: "jessica", name: "Jessica Bouzas Maneiro" }), /\/photos\/bouzas\?/);
  assert.match(context.savedPlayerPhoto({ id: "diana", name: "Diana Shnaider", display_name: "DIANA SHNAIDER" }),
    /\/photos\/shnaider\?/);
  const unavailable = render(eala);
  let decoded = false, finished = false;
  unavailable.image.decode = async () => { decoded = true; throw new Error("Broken image"); };
  const prepared = context.waitForCardImage(unavailable.image).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false, "exports must wait for the portrait's load/error handler");
  unavailable.image.onerror();
  await prepared;
  assert.equal(decoded, false, "failed portraits must fall back before export tries to decode them");
  const available = render(eala);
  available.image.decode = async () => { decoded = true; };
  const success = context.waitForCardImage(available.image);
  available.image.onload();
  await success;
  assert.equal(decoded, true);
  leylahPortrait.image.onerror();
  assert.equal(leylahPortrait.image.src, "assets/players/leylah-fernandez.png");
  leylahPortrait.image.onerror();
  assert.equal(leylahPortrait.image.hidden, true);
  assert.equal(leylahPortrait.initials.hidden, false);
  fail = true;
  now += 300001;
  await context.refreshPlayerPhotos();
  assert.match(context.savedPlayerPhoto(eala), /\/photos\/eala\?/, "outages must retain the last valid index");
  fail = false;
  payload = { photos: [remote("330332.png", "eala"), { name: "bad.png", path: "https://other.example/private" }] };
  await context.refreshPlayerPhotos();
  assert.match(context.savedPlayerPhoto(leylah), /\/photos\/leylah\?/, "invalid indexes must be rejected atomically");
  payload = { photos: [] };
  await context.refreshPlayerPhotos();
  assert.equal(context.savedPlayerPhoto(eala), undefined, "removed photos must return to initials");
  assert.equal(manual.image.src, "blob:manual-upload");
  console.log("Drive IDs, aliases, duplicate filenames, manual uploads, failures, CORS and removals passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
