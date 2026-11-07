"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  return {
    children: [], listeners: {}, value: "", textContent: "",
    addEventListener(type, listener) { this.listeners[type] = listener; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    cloneNode() { return { ...this, children: this.children.map(node => node.cloneNode()) }; },
    querySelector() { return this; },
    querySelectorAll() { return []; },
    closest() { return this; },
    click() { this.clicked = true; },
  };
}
const nodes = new Map();
const selectors = Array.from({ length: 5 }, (_, index) => ({ ...element(), dataset: { matchSlot: String(index) } }));
const visibleSelectors = () => selectors.filter(select => !select.hidden);
const revoked = [];
let renders = 0;
let nextUrl = 0;
let rejectImage = false;
const context = {
  document: {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    createElement: element,
    fonts: { ready: { then() {} } },
  },
  window: { addEventListener() {} },
  cardType: { value: "multiple-tour-result", addEventListener() {} },
  setInterval() {},
  URL: { createObjectURL() { return "blob:photo-" + ++nextUrl; }, revokeObjectURL(url) { revoked.push(url); } },
  Image: class { async decode() { if (rejectImage) throw new Error("Invalid image"); } },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);
context.renderResultCard = () => { renders += 1; };
nodes.get("multiple-result-controls").querySelectorAll = () => selectors;
const matches = [{ id: "one" }, { id: "two" }, { id: "three" }, { id: "four" }];
nodes.get("result-match").children = matches.map(match => ({ ...element(), value: match.id }));
context.updateMultipleResultOptions(matches);
assert.equal(visibleSelectors().length, 4);
assert.equal(selectors[4].hidden, true);
for (const select of visibleSelectors()) {
  assert.equal(select.children.length, 5);
  assert.equal(select.value, "");
  assert.equal(select.disabled, false);
}

function choose(index, id) {
  selectors[index].value = id;
  nodes.get("multiple-result-controls").listeners.change({ target: selectors[index] });
}
function photo(index, side) {
  nodes.get("multiple-results-grid").listeners.click({ target: { closest: () => ({ dataset: { photoSlot: String(index), photoSide: side } }) } });
}
async function upload(type = "image/png") {
  const input = nodes.get("multiple-result-photo-upload");
  input.files = [{ type }];
  await input.listeners.change({ target: input });
}
async function main() {
  matches.forEach((match, index) => choose(index, match.id));
  assert.equal(renders, 4);
  assert.equal(vm.runInContext("multipleResultIds.join(',')", context), "one,two,three,four");
  context.updateMultipleResultOptions(matches);
  assert.equal(visibleSelectors().map(select => select.value).join(","), "one,two,three,four", "refresh must preserve all four selections");

  photo(0);
  assert.equal(nodes.get("multiple-result-photo-upload").clicked, true);
  await upload();
  photo(1);
  await upload();
  assert.equal(vm.runInContext("multipleResultPhotos[0].get('one')", context), "blob:photo-1");
  assert.equal(vm.runInContext("multipleResultPhotos[1].get('two')", context), "blob:photo-2");
  assert.equal(vm.runInContext("multipleResultPhotos[2].size", context), 0, "upload must only affect the clicked slot");
  choose(0, "two");
  assert.equal(vm.runInContext("multipleResultPhotos[0].get(multipleResultIds[0])", context), undefined,
    "changing match must not attach another match's photo");
  choose(0, "one");
  photo(0);
  await upload();
  assert.deepEqual(revoked, ["blob:photo-1"], "replacing a photo must release its old object URL");
  rejectImage = true;
  await upload();
  assert.equal(vm.runInContext("multipleResultPhotos[0].get('one')", context), "blob:photo-3", "invalid upload must preserve the working photo");
  assert.equal(revoked.at(-1), "blob:photo-4");
  const created = nextUrl;
  await upload("text/plain");
  assert.equal(nextUrl, created, "non-images must be rejected before creating an object URL");

  context.updateMultipleResultOptions(matches.slice(1));
  assert.equal(visibleSelectors().map(select => select.value).join(","), ",two,three,four", "only the expired match should be cleared");
  context.updateMultipleResultOptions([]);
  assert.ok(selectors.every(select => select.disabled));
  context.cardType.value = "tour-result";
  choose(0, "four");
  assert.equal(vm.runInContext("multipleResultIds.join(',')", context), ",,,", "selectors must not mutate another card type");
  context.cardType.value = "multiple-photo-result";
  context.updateMultipleResultOptions(matches);
  choose(0, "one");
  choose(1, "two");
  assert.equal(vm.runInContext("multiplePhotoResultIds.join(',')", context), "one,two,,,");
  assert.equal(vm.runInContext("multipleResultIds.join(',')", context), ",,,", "Photo selections must be separate from Screenshot selections");
  context.feedMatches = matches.map(match => ({ ...match, completed_at: new Date().toISOString(),
    tournament: { category: "WTA 250" }, winner: { id: match.id + "-winner" }, loser: { id: match.id + "-loser" } }));
  vm.runInContext("resultFeed = { matches: feedMatches }", context);
  rejectImage = false;
  photo(0, "winner");
  choose(0, "three");
  await upload();
  assert.equal(vm.runInContext("multiplePlayerPhotos.get('one-winner')", context), "blob:photo-5",
    "a portrait upload must stay bound to the player chosen when the upload opened");
  assert.equal(vm.runInContext("multiplePlayerPhotos.has('three-winner')", context), false);
  photo(1, "loser");
  await upload();
  assert.equal(vm.runInContext("multiplePlayerPhotos.get('two-loser')", context), "blob:photo-6");
  assert.equal(vm.runInContext("multipleResultPhotos[0].get('one')", context), "blob:photo-3", "portrait uploads must not replace Screenshot images");
  context.updateMultipleResultOptions(matches.slice(1));
  assert.equal(visibleSelectors().map(select => select.value).join(","), "three,two,,");
  context.setMultiplePhotoCount(5);
  assert.equal(visibleSelectors().length, 5);
  choose(4, "four");
  photo(4, "winner");
  await upload();
  assert.equal(vm.runInContext("multiplePlayerPhotos.get('four-winner')", context), "blob:photo-7");
  context.setMultiplePhotoCount(4);
  assert.equal(visibleSelectors().length, 4);
  assert.equal(vm.runInContext("multiplePhotoResultIds[4]", context), "four", "four-match mode must retain the hidden fifth match");
  context.setMultiplePhotoCount(5);
  assert.equal(selectors[4].value, "four");
  context.setMultiplePhotoCount(6);
  assert.equal(vm.runInContext("multiplePhotoCount", context), 5, "unsupported counts must be ignored");
  context.cardType.value = "multiple-tour-result";
  context.setMultiplePhotoCount(4);
  assert.equal(vm.runInContext("multiplePhotoCount", context), 5, "Screenshot must not change the Photo match count");
  context.updateMultipleResultOptions(matches);
  assert.equal(visibleSelectors().length, 4, "Screenshot must keep exactly four selectors");
  console.log("Independent 4/5-match selections, hidden fifth-match retention, portrait uploads, expiry, and Screenshot isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
