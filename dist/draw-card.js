"use strict";

const drawContent = document.getElementById("draw-card-content");
const drawTournament = document.getElementById("draw-tournament");
const drawRound = document.getElementById("draw-round");
const drawStatus = document.getElementById("draw-status");
const drawMatches = document.getElementById("draw-matches");
const drawPortraitInput = document.getElementById("draw-portrait-upload");
const drawPhotos = new Map();
const drawH2h = new Map();
let drawFeed = null;
let drawsLoading = false;
let drawLastRefresh = 0;
let drawPortraitPlayer = "";
let visibleDrawPlayers = [];

function currentDrawTournaments() {
  const today = new Date().toISOString().slice(0, 10);
  return (drawFeed?.tournaments || []).filter(t => t.start_date.slice(0, 10) <= today && today <= t.end_date.slice(0, 10));
}

function drawPlayer(person) {
  if (!person) return null;
  const known = players.find(player => player.id === person.id);
  return known ? { ...known, name: person.name, country: person.country || known.country } : {
    ...person, rank: null, dob: "", best_rank: null, best_rank_year: null, latest_title: null, tour_title_count: 0,
  };
}

function drawPlayerSlot(person, x, y, width, tilt) {
  const slot = document.createElement("div");
  slot.className = "draw-slot";
  slot.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${width * 1.25}px;transform:rotate(${tilt}deg);`;
  const player = drawPlayer(person);
  if (!player) {
    slot.classList.add("draw-tbd");
    slot.textContent = "TBD";
    slot.setAttribute("aria-label", "Opponent not yet confirmed");
    return slot;
  }
  const artwork = document.createElement("div");
  artwork.className = "player-card draw-player-card";
  artwork.dataset.playerId = player.id;
  artwork.style.setProperty("--draw-player-scale", width / 1440);
  for (const selector of [".title-event", ".card-content", "#card-title-details", ".tour-title-number"]) {
    artwork.append(cardDesign.querySelector(selector).cloneNode(true));
  }
  artwork.querySelector(".card-content").hidden = false;
  renderPlayerArtwork(artwork, player, "form");
  const photo = drawPhotos.get(player.id);
  if (photo) {
    artwork.querySelector("#card-photo").src = photo;
    artwork.querySelector("#card-photo").style.display = "block";
    artwork.querySelector("#card-initials").style.display = "none";
  }
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "draw-photo-button";
  upload.setAttribute("aria-label", "Upload " + player.name + " portrait");
  upload.title = "Click to upload a portrait";
  artwork.append(upload);
  slot.append(artwork);
  return slot;
}

function drawVersus(x, y, small = false) {
  const versus = document.createElement("span");
  versus.className = "draw-vs" + (small ? " draw-vs-small" : "");
  versus.textContent = "VS";
  versus.style.cssText = `left:${x}px;top:${y}px;`;
  drawMatches.append(versus);
}

function renderDrawCard() {
  if (cardType.value !== "draw") return;
  const tournament = currentDrawTournaments().find(t => t.id === drawTournament.value);
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
  drawMatches.replaceChildren();
  setTourArtwork("draw-round-art", { F: "finale", S: "demifinale", Q: "quartdefinale" }[round], 88);
  const name = tournamentName(tournament).toLocaleUpperCase();
  document.getElementById("draw-event-name").textContent = name;
  document.getElementById("draw-event-name").style.fontSize = "78px";
  document.getElementById("draw-event-category").textContent = tournament.category === "Finals" ? "WTA FINALS" : tournament.category.toLocaleUpperCase();
  drawContent.querySelector(".draw-event").style.backgroundColor = tournamentStyle({ level: tournament.category, name })?.color || "#699694";
  for (let i = 0; i < (round === "F" ? 1 : round === "S" ? 2 : 4); i++) {
    const match = matches[i] || { id: "pending-" + i, players: [null, null] };
    const [a, b] = match.players;
    if (round === "F") {
      drawMatches.append(drawPlayerSlot(a, 35, 80, 640, -1), drawPlayerSlot(b, 925, 80, 640, 1));
      drawVersus(800, 310);
      const key = tournament.id + ":" + match.id;
      if (!drawH2h.has(key)) drawH2h.set(key, ["", ""]);
      const h2h = document.createElement("div");
      h2h.className = "draw-h2h";
      const label = document.createElement("strong");
      label.textContent = "H2H";
      h2h.append(label);
      for (let side = 0; side < 2; side++) {
        if (side) h2h.append(document.createTextNode("–"));
        const value = document.createElement("span");
        value.contentEditable = "plaintext-only";
        value.inputMode = "numeric";
        value.setAttribute("role", "textbox");
        value.setAttribute("aria-label", "Player " + (side + 1) + " H2H wins");
        value.dataset.h2hKey = key;
        value.dataset.h2hSide = side;
        value.dataset.placeholder = "—";
        value.textContent = drawH2h.get(key)[side];
        h2h.append(value);
      }
      drawMatches.append(h2h);
    } else if (round === "S") {
      const x = i ? 1045 : 75;
      drawMatches.append(drawPlayerSlot(a, x, 105, 480, i ? 1 : -1), drawPlayerSlot(b, x, 735, 480, i ? 1 : -1));
    } else {
      const x = i % 2 ? 985 : 35;
      const y = i < 2 ? 125 : 530;
      drawMatches.append(drawPlayerSlot(a, x, y, 280, -1), drawPlayerSlot(b, x + 300, y, 280, 1));
      drawVersus(x + 290, y + 140, true);
    }
  }
  if (round !== "F") {
    for (const side of ["left", "right"]) {
      const brace = round === "Q" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement("span");
      brace.setAttribute("class", "draw-brace draw-brace-" + side);
      brace.setAttribute("aria-hidden", "true");
      if (round === "Q") {
        brace.setAttribute("viewBox", "0 0 100 400");
        brace.setAttribute("preserveAspectRatio", "none");
        for (const [color, width] of [["#ccffee", 9], ["#00cba8", 5]]) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "M4 0C58 0 60 32 60 76V145C60 180 68 194 96 200C68 206 60 220 60 255V324C60 368 58 400 4 400");
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", color);
          path.setAttribute("stroke-width", width);
          path.setAttribute("stroke-linecap", "round");
          brace.append(path);
        }
      } else brace.textContent = side === "left" ? "}" : "{";
      drawMatches.append(brace);
    }
    const logo = document.createElement("img");
    logo.className = "draw-center-logo";
    logo.src = "assets/haute-cadence-logo.png";
    logo.alt = "";
    drawMatches.append(logo);
  }
  document.getElementById("svg-title").textContent = drawRound.selectedOptions[0].textContent + " · " + name;
  document.getElementById("svg-description").textContent = "WTA singles draw. TBD means an opponent is not yet confirmed.";
  card.hidden = false;
  scaleCardDesign();
  fitTournamentName(document.getElementById("draw-event-name"), "78px");
  drawMatches.querySelectorAll("#last-title-value").forEach(fitLastTitleValue);
  visibleDrawPlayers = [...new Map(matches.flatMap(match => match.players).filter(Boolean).map(person => {
    const player = drawPlayer(person); return [player.id, player];
  })).values()];
  const formPlayer = document.getElementById("draw-form-player");
  const previous = formPlayer.value;
  formPlayer.replaceChildren();
  visibleDrawPlayers.forEach(player => {
    const option = document.createElement("option"); option.value = player.id; option.textContent = player.name;
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

async function refreshDraws() {
  if (drawsLoading) return;
  drawsLoading = true;
  drawLastRefresh = Date.now();
  document.getElementById("refresh-draws").disabled = true;
  if (!drawFeed) drawStatus.textContent = "Loading current WTA draws...";
  try {
    const response = await fetch("data/current_draws.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Current WTA draws could not be loaded. Try Refresh again.");
    const data = await response.json();
    if (!Array.isArray(data.tournaments)) throw new Error("The WTA draw feed is invalid.");
    const changed = JSON.stringify(drawFeed?.tournaments) !== JSON.stringify(data.tournaments);
    drawFeed = data;
    const current = currentDrawTournaments();
    const previous = drawTournament.value;
    drawTournament.replaceChildren();
    const categories = ["Grand Slam", "Finals", "WTA Finals", "WTA 1000", "WTA 500", "WTA 250", "WTA 125"];
    current.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || tournamentName(a).localeCompare(tournamentName(b)));
    for (const tournament of current) {
      const option = document.createElement("option");
      option.value = tournament.id;
      option.textContent = tournament.category + " " + tournamentName(tournament);
      drawTournament.append(option);
    }
    if (current.some(t => t.id === previous)) drawTournament.value = previous;
    drawTournament.disabled = !current.length;
    drawStatus.textContent = data.refresh_error || (!current.length ? "No current WTA tournaments available." : "");
    if (changed || !current.some(t => t.id === previous)) renderDrawCard();
  } catch (error) {
    drawStatus.textContent = error.message;
  } finally {
    drawsLoading = false;
    document.getElementById("refresh-draws").disabled = false;
  }
}

cardType.addEventListener("change", () => {
  const active = cardType.value === "draw";
  for (const id of ["draw-tournament-picker", "draw-options", "draw-status"]) document.getElementById(id).hidden = !active;
  drawContent.hidden = !active;
  if (active) {
    renderDrawCard();
    if (!drawFeed || Date.now() - drawLastRefresh >= 300000) refreshDraws();
  }
});
drawTournament.addEventListener("change", renderDrawCard);
drawRound.addEventListener("change", renderDrawCard);
document.getElementById("refresh-draws").addEventListener("click", refreshDraws);
function refreshDrawsIfStale() {
  if (cardType.value === "draw" && Date.now() - drawLastRefresh >= 300000) refreshDraws();
}
window.addEventListener("focus", refreshDrawsIfStale);
setInterval(refreshDrawsIfStale, 300000);
drawMatches.addEventListener("click", event => {
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
document.fonts.ready.then(() => { if (cardType.value === "draw") renderDrawCard(); });
