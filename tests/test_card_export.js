"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "export-card.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

function element() {
  return { hidden: false, textContent: "", style: {}, classList: { add() {} },
    addEventListener(name, listener) { this[name] = listener; },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    querySelectorAll() { return []; }, remove() {}, decode: async () => {},
  };
}

async function main() {
  const saved = element(); saved.src = "data:image/png;old";
  const elements = new Map([["card-save-image", saved], ...["export-status", "export-status-text", "retry-export"].map(id => [id, element()])]);
  const card = { ...element(), hidden: false, dataset: { type: "form" },
    cloneNode: () => element() };
  const fonts = []; fonts.ready = Promise.resolve();
  let failure = false, png = "data:image/png;current", options;
  const context = {
    card, cardDesign: { offsetWidth: 1440, offsetHeight: 1800 }, portraitPlayers: new Map(), tourTitleNumber: {},
    fitLastTitleText() {}, fitCardPlayerNames() {}, fitTournamentHeadings() {},
    document: { fonts, getElementById: id => elements.get(id), body: { append() {} } },
    htmlToImage: { getFontEmbedCSS: async () => "", async toPng(_, value) {
      options = value; if (failure) throw new Error("image failed"); return png;
    } },
    setTimeout: () => 1, clearTimeout() {},
    MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
    console: { error() {} },
  };
  vm.createContext(context); vm.runInContext(source, context);
  assert.equal(saved.hidden, true);
  assert.equal(saved.src, "", "the previous downloadable image is invalidated immediately");
  await context.renderCardExport();
  assert.equal(saved.hidden, false);
  assert.equal(saved.src, png);
  assert.equal(elements.get("export-status-text").textContent, "Image ready to save.");
  assert.equal(options.pixelRatio, 2);
  assert.equal(options.canvasWidth, 1440);
  assert.equal(options.canvasHeight, 1800);

  context.scheduleCardExport();
  assert.equal(saved.hidden, true);
  assert.equal(saved.src, "");
  assert.equal(elements.get("export-status").hidden, false);
  assert.match(elements.get("export-status-text").textContent, /Preparing/);
  failure = true;
  await context.renderCardExport();
  assert.equal(saved.src, "", "a failed export must not leave the preceding PNG saveable");
  assert.equal(saved.hidden, true);
  assert.equal(elements.get("retry-export").hidden, false);
  assert.match(elements.get("export-status-text").textContent, /could not be prepared/);
  failure = false; png = "data:image/png;recovered";
  elements.get("retry-export").click();
  await context.renderCardExport();
  assert.equal(saved.src, png);
  assert.equal(saved.hidden, false);
  assert.equal(elements.get("retry-export").hidden, true);

  let completeDecode;
  saved.decode = () => new Promise(resolve => { completeDecode = resolve; });
  context.scheduleCardExport();
  const decoding = context.renderCardExport();
  await tick();
  assert.equal(typeof completeDecode, "function");
  context.scheduleCardExport();
  completeDecode();
  await decoding;
  assert.equal(saved.hidden, true, "an edit while decoding cannot expose the stale image afterward");
  assert.equal(saved.src, "");
  saved.decode = async () => {};
  await context.renderCardExport();
  assert.equal(saved.hidden, false);

  const failedFonts = [{ load: () => Promise.reject(new Error("Font download failed")) }];
  failedFonts.ready = Promise.resolve();
  const fontContext = { ...context, document: { ...context.document, fonts: failedFonts } };
  vm.createContext(fontContext); vm.runInContext(source, fontContext);
  await tick(); // A font rejection before rendering must already be handled.
  await fontContext.renderCardExport();
  assert.equal(saved.hidden, true);
  assert.equal(saved.src, "");
  assert.match(elements.get("export-status-text").textContent, /font.*Reload/);
  assert.equal(elements.get("retry-export").hidden, true, "failed browser FontFaces need a reload, not a misleading Retry");
  console.log("Export invalidation, visible failure/retry, dimensions and edits during image decoding passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
