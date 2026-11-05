"use strict";

const drawContent = document.getElementById("draw-card-content");
const drawTournament = document.getElementById("draw-tournament");
const drawRound = document.getElementById("draw-round");
const drawStatus = document.getElementById("draw-status");
const drawMatches = document.getElementById("draw-matches");
const drawPortraitInput = document.getElementById("draw-portrait-upload");
const drawPhotos = new Map();
const drawH2h = new Map();
const manualDraws = new Map();
// Slot edges follow the placeholder corners in the supplied PNGs: x, y, width, height, top slope, left slope.
const drawLayouts = {
  F: { width: 1600, height: 900, artwork: "finale", slots: [
    [85, 87, 617, 782, 14, -17], [915, 103, 617, 782, -14, 18],
  ] },
  S: { width: 1880, height: 1576, artwork: "semifinals", slots: [
    [79, 137, 550, 698, -16, 21], [114, 843, 550, 698, 15, -20],
    [1229, 124, 550, 698, 0, -2], [1229, 844, 550, 698, 16, -19],
  ] },
  Q: { width: 3200, height: 1800, artwork: "quarters", slots: [
    [138, 252, 553, 701, 16, -20], [731, 260, 553, 701, 1, -2],
    [1870, 229, 551, 700, -33, 42], [2495, 211, 553, 701, 2, -3],
    [148, 1045, 553, 701, 16, -20], [729, 1062, 553, 700, -17, 17],
    [1929, 1043, 553, 700, 1, 0], [2540, 1035, 553, 700, 16, -20],
  ] },
};
let drawFeed = null;
let drawsLoading = false;
let drawLastRefresh = 0;
let drawPortraitPlayer = "";
let visibleDrawPlayers = [];

function isManualDraw() { return cardType.value === "draw" && drawTournament.value === "manual"; }

function manualDraw(round = drawRound.value) {
  if (!["F", "S", "Q"].includes(round)) return null;
  if (!manualDraws.has(round)) {
    manualDraws.set(round, {
      id: "manual-draw-" + round, name: "", city: "", category: "",
      header: { F: "FINALE", S: "DEMI-FINALES", Q: "QUARTS DE FINALE" }[round],
      rounds: { [round]: Array.from({ length: { F: 1, S: 2, Q: 4 }[round] }, (_, index) => ({
        id: "match-" + index, players: [null, null],
      })) },
    });
  }
  return manualDraws.get(round);
}

function selectManualDrawPlayer(index) {
  if (!isManualDraw()) return;
  const round = drawRound.value, draft = manualDraw(round);
  const match = draft.rounds[round][Math.floor(index / 2)];
  if (!match || ![0, 1].includes(index % 2)) return;
  const side = index % 2;
  const previous = drawPlayer(match.players[side]) || {
    id: draft.id + "-player-" + index, name: "", country: "", placeholder: true,
  };
  openPlayerPicker(previous, "Select Player " + (index + 1), player => {
    if (!isManualDraw() || drawRound.value !== round) return;
    match.players[side] = { ...player, manual: true, rank: typeof player.rank === "number" ? player.rank : null };
    renderDrawCard();
  }, previous.placeholder ? null : () => {
    if (!isManualDraw() || drawRound.value !== round) return;
    drawPortraitPlayer = previous.id;
    itfPlayerDialog.close();
    drawPortraitInput.click();
  });
}

function currentDrawTournaments() {
  const today = new Date().toISOString().slice(0, 10);
  return (drawFeed?.tournaments || []).filter(t => t.start_date.slice(0, 10) <= today && today <= t.end_date.slice(0, 10));
}

function drawPlayer(person) {
  if (!person) return null;
  const known = players.find(player => player.id === person.id);
  if (person.manual) return { ...(known || { dob: "", best_rank: null, best_rank_year: null, latest_title: null, tour_title_count: 0 }), ...person };
  return known ? { ...known, name: person.name, country: person.country || known.country } : {
    ...person, rank: null, dob: "", best_rank: null, best_rank_year: null, latest_title: null, tour_title_count: 0,
  };
}

function positionDrawSlot(slot, geometry) {
  const [x, y, width, height, topSlope, leftSlope] = geometry;
  slot.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;transform:matrix(1,${topSlope / width},${leftSlope / height},1,0,0);`;
}

function drawPlayerSlot(person, geometry, index) {
  const manual = isManualDraw();
  const slot = document.createElement(manual && !person ? "button" : "div");
  slot.className = "draw-slot";
  positionDrawSlot(slot, geometry);
  const player = drawPlayer(person);
  if (!player) {
    slot.classList.add("draw-tbd");
    slot.setAttribute("aria-label", "Opponent not yet confirmed");
    if (manual) {
      slot.type = "button"; slot.dataset.drawSlot = index;
      slot.classList.add("draw-player-choice");
      slot.setAttribute("aria-label", "Select Player " + (index + 1));
    }
    return slot;
  }
  const artwork = document.createElement("div");
  artwork.className = "player-card draw-player-card";
  artwork.dataset.playerId = player.id;
  // Cover the template's colored edge strips with the card artwork itself.
  artwork.style.setProperty("--draw-player-scale-x", (geometry[2] + 8) / 1440);
  artwork.style.setProperty("--draw-player-scale-y", (geometry[3] + 8) / 1800);
  for (const selector of [".title-event", ".card-content", "#card-title-details", ".tour-title-number"]) {
    artwork.append(cardDesign.querySelector(selector).cloneNode(true));
  }
  artwork.querySelector(".card-content").hidden = false;
  renderPlayerArtwork(artwork, player, "form");
  const photo = drawPhotos.get(player.id);
  if (photo) {
    setPlayerPortrait(artwork.querySelector("#card-photo"), artwork.querySelector("#card-initials"), player, photo);
  }
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "draw-photo-button";
  upload.setAttribute("aria-label", "Upload " + player.name + " portrait");
  upload.title = "Click to upload a portrait";
  if (manual) {
    upload.dataset.drawSlot = index;
    upload.setAttribute("aria-label", "Select Player " + (index + 1) + ": " + player.name);
    upload.title = "Click to select a player or upload a portrait";
  }
  artwork.append(upload);
  if (manual) {
    const choose = document.createElement("button");
    choose.type = "button"; choose.className = "draw-select-player"; choose.dataset.drawSlot = index;
    choose.setAttribute("aria-label", "Change Player " + (index + 1) + ": " + player.name);
    artwork.append(choose);
  }
  slot.append(artwork);
  return slot;
}

function updateDrawH2hColors(h2h) {
  const values = [...h2h.querySelectorAll("[data-h2h-side]")];
  const scores = values.map(value => value.textContent.trim());
  values.forEach((value, side) => {
    const difference = scores.every(score => score !== "") ? Number(scores[side]) - Number(scores[1 - side]) : 0;
    value.style.color = difference > 0 ? "#00c87d" : difference < 0 ? "#ff3131" : "#b8b8b8";
  });
}

function renderDrawHeading(tournament) {
  const manual = isManualDraw();
  document.getElementById("draw-round-art").dataset.manual = String(manual);
  document.getElementById("manual-draw-logo").hidden = false;
  document.getElementById("manual-draw-round-text").hidden = false;
  const roundLabel = document.getElementById("manual-draw-round-label");
  roundLabel.textContent = (manual ? tournament.header : {
    F: "FINALE", S: "DEMI-FINALES", Q: "QUARTS DE FINALE",
  }[drawRound.value]).toLocaleUpperCase();
  roundLabel.dataset.placeholder = "ROUND";
  const name = manual ? tournament.name.toLocaleUpperCase() : tournamentName(tournament).toLocaleUpperCase();
  const nameNode = document.getElementById("draw-event-name");
  nameNode.textContent = name;
  nameNode.dataset.placeholder = "TOURNAMENT";
  const headingScale = drawLayouts[drawRound.value].width / 1600;
  nameNode.style.fontSize = 78 * headingScale + "px";
  const category = document.getElementById("draw-event-category");
  category.textContent = tournament.category === "Finals" ? "WTA FINALS" : tournament.category.toLocaleUpperCase();
  category.dataset.placeholder = "CATEGORY";
  for (const [node, field] of [[nameNode, "name"], [category, "category"], [roundLabel, "header"]]) {
    if (manual) {
      node.dataset.drawField = field;
      if (field === "category") {
        node.removeAttribute("contenteditable");
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", "Select tournament category");
        node.setAttribute("aria-haspopup", "dialog");
        node.setAttribute("aria-controls", "result-category-dialog");
      } else {
        node.contentEditable = "plaintext-only";
        node.spellcheck = false;
        node.setAttribute("role", "textbox");
        node.setAttribute("aria-label", field === "name" ? "Tournament name" : "Round header");
      }
    } else {
      for (const attribute of ["contenteditable", "data-draw-field", "tabindex", "role", "aria-label", "aria-haspopup", "aria-controls"]) node.removeAttribute(attribute);
    }
  }
  drawContent.querySelector(".draw-event").style.backgroundColor = tournamentStyle({ level: tournament.category, name })?.color || "#699694";
  fitTournamentName(nameNode, 78 * headingScale + "px");
  fitTournamentName(roundLabel, 80 * headingScale + "px");
}

function renderDrawCard() {
  if (!isDrawCard()) return;
  const manual = isManualDraw();
  const tournament = manual ? manualDraw() : currentDrawTournaments().find(t => t.id === drawTournament.value);
  if (!tournament) { card.hidden = true; return; }
  const round = drawRound.value;
  const matches = tournament.rounds[round] || [];
  card.dataset.type = "draw";
  card.dataset.drawRound = round;
  card.removeAttribute("data-tier");
  cardDesign.querySelector(".card-content").hidden = true;
  document.getElementById("card-title-details").hidden = true;
  resultContent.hidden = true;
  drawContent.hidden = false;
  drawContent.dataset.manual = String(manual);
  drawMatches.replaceChildren();
  const layout = drawLayouts[round];
  const headingScale = layout.width / 1600;
  for (const root of [card, cardDesign]) {
    root.style.setProperty("--draw-width", layout.width);
    root.style.setProperty("--draw-height", layout.height);
    root.style.setProperty("--draw-heading-scale", headingScale);
  }
  document.getElementById("draw-layout-art").src = "assets/draws/" + layout.artwork + ".png";
  const versus = document.getElementById("draw-versus-art");
  versus.hidden = round !== "Q";
  if (round === "Q") versus.src = "assets/draws/vs-quarters.png";
  else versus.removeAttribute("src");
  const artwork = { F: "finale", S: "demifinale", Q: "quartdefinale" }[round];
  setTourArtwork("draw-round-art", artwork, 88 * headingScale, "assets/draws", round === "F" ? "finale-title" : artwork);
  layout.slots.forEach((geometry, index) => {
    const person = matches[Math.floor(index / 2)]?.players[index % 2] || null;
    drawMatches.append(drawPlayerSlot(person, geometry, index));
  });
  if (round === "F") {
    const key = tournament.id + ":" + (matches[0]?.id || "pending-0");
    if (!drawH2h.has(key)) drawH2h.set(key, ["", ""]);
    const h2h = document.createElement("div");
    h2h.className = "draw-h2h";
    h2h.setAttribute("role", "group");
    h2h.setAttribute("aria-label", "Head-to-head wins");
    for (let side = 0; side < 2; side++) {
      const value = document.createElement("span");
      value.contentEditable = "plaintext-only";
      value.inputMode = "numeric";
      value.setAttribute("role", "textbox");
      value.setAttribute("aria-label", "Player " + (side + 1) + " H2H wins");
      value.dataset.h2hKey = key;
      value.dataset.h2hSide = side;
      value.dataset.placeholder = "\u2014";
      value.textContent = drawH2h.get(key)[side];
      h2h.append(value);
    }
    updateDrawH2hColors(h2h);
    drawMatches.append(h2h);
  }
  document.getElementById("svg-title").textContent = (manual ? tournament.header : drawRound.selectedOptions[0].textContent) + " · " + tournament.name;
  document.getElementById("svg-description").textContent = manual ? "Manually composed draw." : "WTA singles draw. Unfilled image placeholders indicate opponents not yet confirmed.";
  card.hidden = false;
  scaleCardDesign();
  renderDrawHeading(tournament);
  fitCardPlayerNames(drawMatches);
  drawMatches.querySelectorAll("#last-title-value").forEach(fitLastTitleValue);
  visibleDrawPlayers = [...new Map(matches.flatMap(match => match.players).filter(Boolean).map(person => {
    const player = drawPlayer(person); return [player.id, player];
  })).values()];
  const formPlayer = document.getElementById("draw-form-player");
  const previous = formPlayer.value;
  formPlayer.replaceChildren();
  visibleDrawPlayers.forEach(player => {
    const option = document.createElement("option"); option.value = player.id; option.textContent = playerDisplayName(player);
    formPlayer.append(option);
  });
  if (visibleDrawPlayers.some(player => player.id === previous)) formPlayer.value = previous;
  document.getElementById("edit-draw-form").disabled = !visibleDrawPlayers.length;
  if (document.getElementById("draw-form-dialog").open) renderDrawFormEditor();
}

function renderDrawFormEditor() {
  const player = visibleDrawPlayers.find(p => p.id === document.getElementById("draw-form-player").value);
  const buttons = document.getElementById("draw-form-buttons");
  buttons.replaceChildren();
  if (!player) return;
  playerForm(player).results.forEach((result, index) => {
    const button = document.createElement("button"); button.type = "button";
    button.dataset.index = index; button.dataset.result = result;
    button.textContent = result === "win" ? "V" : result === "loss" ? "d" : "·";
    button.setAttribute("aria-label", "Match " + (index + 1) + ": " + (result || "blank"));
    buttons.append(button);
  });
}
document.getElementById("edit-draw-form").addEventListener("click", () => {
  renderDrawFormEditor(); document.getElementById("draw-form-dialog").showModal();
});
document.getElementById("draw-form-player").addEventListener("change", renderDrawFormEditor);
document.getElementById("draw-form-buttons").addEventListener("click", event => {
  const button = event.target.closest("button[data-index]");
  const player = visibleDrawPlayers.find(p => p.id === document.getElementById("draw-form-player").value);
  if (!button || !player) return;
  const index = Number(button.dataset.index), form = playerForm(player), states = ["", "win", "loss"];
  form.results[index] = states[(states.indexOf(form.results[index]) + 1) % 3];
  renderDrawCard();
  document.querySelector('#draw-form-buttons [data-index="' + index + '"]').focus();
});

let drawRefreshCooldown;
async function refreshDraws(force = false) {
  if (drawsLoading) return;
  drawRefreshCooldown ||= createRefreshCooldown("refresh-draws");
  if (!drawRefreshCooldown.begin(force)) return;
  drawsLoading = true;
  drawLastRefresh = Date.now();
  let refreshed = false;
  if (force) drawStatus.textContent = "Updating…";
  else if (!drawFeed) drawStatus.textContent = "Loading current WTA draws...";
  try {
    let data;
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
      const url = "data/current_draws.json" + (force ? "?refresh=1&t=" + Date.now() : "");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Current WTA draws could not be loaded. Try Refresh again.");
      data = await response.json();
    } else {
      const live = await import("./wta-live.mjs");
      data = await live.collectDraws();
    }
    if (!Array.isArray(data.tournaments)) throw new Error("The WTA draw feed is invalid.");
    const changed = JSON.stringify(drawFeed?.tournaments) !== JSON.stringify(data.tournaments);
    drawFeed = data;
    const current = currentDrawTournaments();
    const previous = drawTournament.value;
    const wasManual = isManualDraw();
    drawTournament.replaceChildren();
    const categories = ["Grand Slam", "Finals", "WTA Finals", "WTA 1000", "WTA 500", "WTA 250", "WTA 125"];
    current.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || tournamentName(a).localeCompare(tournamentName(b)));
    for (const tournament of current) {
      const option = document.createElement("option");
      option.value = tournament.id;
      option.textContent = tournament.category + " " + tournamentName(tournament);
      drawTournament.append(option);
    }
    const manualOption = document.createElement("option");
    manualOption.value = "manual"; manualOption.textContent = "MANUAL";
    drawTournament.append(manualOption);
    if (previous === "manual" || current.some(t => t.id === previous)) drawTournament.value = previous;
    drawTournament.disabled = false;
    if (wasManual !== isManualDraw() && isDrawCard()) {
      updateDrawModeControls();
      renderDrawCard();
    }
    if (!isManualDraw()) {
      const updated = force && !data.refresh_error
        ? "Updated at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "." : "";
      drawStatus.textContent = [updated, data.refresh_error || (!current.length ? "No current WTA tournaments available." : "")]
        .filter(Boolean).join(" ");
      if (isDrawCard() && (changed || !current.some(t => t.id === previous))) renderDrawCard();
    }
    refreshed = !data.refresh_error;
  } catch (error) {
    if (!isManualDraw()) drawStatus.textContent = error.message;
  } finally {
    drawsLoading = false;
    drawRefreshCooldown.finish(refreshed);
  }
}

function updateDrawModeControls() {
  const active = isDrawCard(), manual = isManualDraw();
  document.getElementById("draw-tournament-picker").hidden = !active;
  for (const id of ["draw-options", "draw-status"]) document.getElementById(id).hidden = !active;
  document.getElementById("refresh-draws").hidden = manual;
  for (const option of drawRound.options) {
    const label = { F: "FINALE", S: "DEMI-FINALES", Q: "QUARTS DE FINALE" }[option.value];
    option.textContent = label + (manual ? " · " + { F: 2, S: 4, Q: 8 }[option.value] + " players" : "");
  }
  drawContent.hidden = !active;
  if (manual) drawStatus.textContent = "";
}
cardType.addEventListener("change", () => {
  updateDrawModeControls();
  const active = isDrawCard(), manual = isManualDraw();
  if (active) {
    renderDrawCard();
    if (!manual && (!drawFeed || Date.now() - drawLastRefresh >= 300000)) refreshDraws();
  }
});
drawTournament.addEventListener("change", () => {
  updateDrawModeControls();
  renderDrawCard();
  if (isDrawCard() && !isManualDraw() && (!drawFeed || Date.now() - drawLastRefresh >= 300000)) refreshDraws();
});
drawRound.addEventListener("change", renderDrawCard);
function openDrawCategoryPicker() {
  if (!isManualDraw()) return;
  const round = drawRound.value, draft = manualDraw();
  openTournamentCategoryPicker(draft.category, category => {
    if (!isManualDraw() || drawRound.value !== round) return;
    draft.category = category;
    renderDrawHeading(draft);
  });
}
drawContent.addEventListener("click", event => {
  if (event.target.closest('[data-draw-field="category"]')) openDrawCategoryPicker();
});

drawContent.addEventListener("input", event => {
  if (!isManualDraw()) return;
  const node = event.target;
  const field = node.dataset.drawField;
  if (!["header", "name"].includes(field)) return;
  const draft = manualDraw();
  draft[field] = node.textContent.replace(/[\r\n]/g, " ").slice(0, 80);
  if (node.textContent !== draft[field]) node.textContent = draft[field];
  if (field === "name") draft.city = draft.name;
  fitTournamentName(node, (node.id === "draw-event-name" ? 78 : 80) * drawLayouts[drawRound.value].width / 1600 + "px");
  drawContent.querySelector(".draw-event").style.backgroundColor = tournamentStyle({ level: draft.category, name: draft.name })?.color || "#699694";
});
drawContent.addEventListener("keydown", event => {
  if (event.target.matches('[data-draw-field="category"]') && ["Enter", " "].includes(event.key)) {
    event.preventDefault(); openDrawCategoryPicker();
  } else if (event.target.matches("[data-draw-field]") && ["Enter", "Escape"].includes(event.key)) {
    event.preventDefault(); event.target.blur();
  }
});
document.getElementById("refresh-draws").addEventListener("click", () => refreshDraws(true));
function refreshDrawsIfStale() {
  if (isDrawCard() && !isManualDraw() && Date.now() - drawLastRefresh >= 300000) refreshDraws();
}
window.addEventListener("focus", refreshDrawsIfStale);
setInterval(refreshDrawsIfStale, 300000);
drawMatches.addEventListener("click", event => {
  const choice = event.target.closest("[data-draw-slot]");
  if (choice && isManualDraw()) { selectManualDrawPlayer(Number(choice.dataset.drawSlot)); return; }
  const artwork = event.target.closest(".draw-player-card");
  if (!artwork) return;
  const id = artwork.dataset.playerId;
  const button = event.target.closest(".form-result");
  if (button) {
    const index = [...artwork.querySelectorAll(".form-result")].indexOf(button);
    const player = players.find(p => p.id === id) || { id };
    const form = playerForm(player);
    const states = ["", "win", "loss"];
    form.results[index] = states[(states.indexOf(form.results[index]) + 1) % 3];
    renderPlayerForm(player, artwork);
  } else if (event.target.closest(".draw-photo-button")) {
    drawPortraitPlayer = id;
    drawPortraitInput.click();
  }
});
drawMatches.addEventListener("input", event => {
  const value = event.target.closest("[data-h2h-key]");
  if (!value) return;
  const text = value.textContent.replace(/\D/g, "").slice(0, 3);
  if (value.textContent !== text) value.textContent = text;
  drawH2h.get(value.dataset.h2hKey)[Number(value.dataset.h2hSide)] = text;
  updateDrawH2hColors(value.closest(".draw-h2h"));
});
drawMatches.addEventListener("keydown", event => {
  if (event.target.matches("[data-h2h-key]") && ["Enter", "Escape"].includes(event.key)) {
    event.preventDefault(); event.target.blur();
  }
});
drawPortraitInput.addEventListener("change", async () => {
  const file = drawPortraitInput.files[0];
  const id = drawPortraitPlayer;
  if (!file) return;
  if (!file.type.startsWith("image/")) { drawStatus.textContent = "Choose an image file for the portrait."; return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const previous = drawPhotos.get(id);
    drawPhotos.set(id, url);
    if (previous) URL.revokeObjectURL(previous);
    renderDrawCard();
  } catch { URL.revokeObjectURL(url); drawStatus.textContent = "That portrait could not be opened."; }
  drawPortraitInput.value = "";
});
document.fonts.ready.then(() => { if (isDrawCard()) renderDrawCard(); });
