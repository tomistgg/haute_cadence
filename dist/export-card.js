"use strict";

const cardSaveImage = document.getElementById("card-save-image");
const exportStatus = document.getElementById("export-status");
const exportStatusText = document.getElementById("export-status-text");
const retryExport = document.getElementById("retry-export");
let exportVersion = 0;
let exportTimer;
let exportRunning = false;
const exportFontsReady = Promise.all([...document.fonts].map(font => font.load()))
  .then(() => { fitLastTitleText(); fitCardPlayerNames(); fitTournamentHeadings(); return null; })
  .catch(error => error);
let exportFontCSS;
let exportFontType;

function scheduleCardExport() {
  exportVersion += 1;
  cardSaveImage.hidden = true;
  cardSaveImage.removeAttribute("src");
  exportStatus.hidden = card.hidden;
  exportStatusText.textContent = "Preparing image…";
  retryExport.hidden = true;
  clearTimeout(exportTimer);
  exportTimer = setTimeout(renderCardExport, 150);
}

async function waitForCardImage(image) {
  const portrait = portraitPlayers.get(image);
  if (portrait) await portrait.ready;
  if (image.getAttribute("src") && !image.hidden) await image.decode();
}

async function renderCardExport() {
  if (card.hidden || exportRunning) return;
  exportRunning = true;
  const version = exportVersion;
  let copy;
  try {
    if (await exportFontsReady) {
      exportStatusText.textContent = "A card font could not be loaded. Reload the page to prepare the image.";
      retryExport.hidden = true;
      return;
    }
    await document.fonts.ready;
    await Promise.all([...card.querySelectorAll("img")]
      .filter(image => image !== cardSaveImage && image.getAttribute("src") && image.getClientRects().length)
      .map(waitForCardImage));
    const width = cardDesign.offsetWidth;
    const height = cardDesign.offsetHeight;
    copy = card.cloneNode(true);
    copy.removeAttribute("id");
    copy.classList.add("card-export-copy");
    copy.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;box-shadow:none;margin:0;--card-scale:1;`;
    copy.style.backgroundImage = card.style.backgroundImage;
    copy.querySelectorAll("#card-save-image, .suggestions, .sr-only, .draw-photo-button, .draw-select-player, .multiple-photo-button").forEach(node => node.remove());
    copy.querySelectorAll("[contenteditable]").forEach(node => node.removeAttribute("contenteditable"));
    copy.querySelectorAll("img").forEach(image => {
      if (image.closest("[hidden]") || !image.getAttribute("src")) image.remove();
    });
    const originalInputs = [...card.querySelectorAll("input")];
    copy.querySelectorAll("input").forEach((input, index) => {
      const source = originalInputs[index];
      const text = document.createElement("span");
      const style = getComputedStyle(source);
      for (const property of style) text.style.setProperty(property, style.getPropertyValue(property));
      text.style.display = "flex";
      text.style.alignItems = "center";
      text.style.textDecoration = "none";
      text.textContent = source.value || "\u2014";
      input.replaceWith(text);
    });
    document.body.append(copy);
    if (!exportFontCSS || exportFontType !== card.dataset.type) {
      exportFontCSS = (await htmlToImage.getFontEmbedCSS(copy))
        .replace(/font-display:\s*swap/g, "font-display: block");
      exportFontType = card.dataset.type;
    }
    const png = await htmlToImage.toPng(copy, {
      width, height, canvasWidth: width, canvasHeight: height, pixelRatio: 2,
      fontEmbedCSS: exportFontCSS,
      style: { position: "relative", inset: "0 auto auto 0", insetInline: "0 auto", insetBlock: "0 auto" }
    });
    if (version === exportVersion) {
      cardSaveImage.src = png;
      await cardSaveImage.decode();
      if (version === exportVersion) {
        cardSaveImage.hidden = false;
        exportStatusText.textContent = "Image ready to save.";
      }
    }
  } catch (error) {
    if (version === exportVersion) {
      console.error("Could not prepare the complete card image", error);
      cardSaveImage.hidden = true;
      cardSaveImage.removeAttribute("src");
      exportStatusText.textContent = "The image could not be prepared. Your edits are still here.";
      retryExport.hidden = false;
    }
  } finally {
    if (copy) copy.remove();
    exportRunning = false;
    if (version !== exportVersion) exportTimer = setTimeout(renderCardExport, 150);
  }
}

new MutationObserver(changes => {
  if (changes.some(change => change.target !== cardSaveImage &&
      !change.target.parentElement?.closest("#card-save-image, .suggestions") &&
      !change.attributeName?.startsWith("aria-"))) scheduleCardExport();
}).observe(card, { subtree: true, childList: true, characterData: true, attributes: true });
card.addEventListener("input", event => {
  if (event.target === tourTitleNumber) scheduleCardExport();
});
retryExport.addEventListener("click", scheduleCardExport);
scheduleCardExport();
