"use strict";

const drawContent = document.getElementById("draw-card-content");
const drawTournament = document.getElementById("draw-tournament");
const drawRound = document.getElementById("draw-round");
const drawDesign = document.getElementById("draw-design");
const drawStatus = document.getElementById("draw-status");
const drawMatches = document.getElementById("draw-matches");
const drawPortraitInput = document.getElementById("draw-portrait-upload");
const drawPhotos = new Map();
const drawH2h = new Map();
const manualDraws = new Map();
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
      design: ["tour", "125"].includes(drawDesign.value) ? drawDesign.value : "tour",
      header: { F: "FINALE", S: "DEMI-FINALES", Q: "QUARTS DE FINALE" }[round],
      rounds: { [round]: Array.from({ length: { F: 1, S: 2, Q: 4 }[round] }, (_, index) => ({
        id: "match-" + index, players: [null, null],
      })) },
    });
  }
  return manualDraws.get(round);
}

function updateManualDrawControls() {
  if (isManualDraw()) drawDesign.value = manualDraw().design;
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
    updateManualDrawControls();
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

function drawDesignFor(tournament) {
  if (isManualDraw()) return tournament.design === "125" ? "125" : "tour";
  return tournament.category === "WTA 125" ? "125" : "tour";
}

function drawPlayer(person) {
  if (!person) return null;
  const known = players.find(player => player.id === person.id);
  if (person.manual) return { ...(known || { dob: "", best_rank: null, best_rank_year: null, latest_title: null, tour_title_count: 0 }), ...person };
  return known ? { ...known, name: person.name, country: person.country || known.country } : {
    ...person, rank: null, dob: "", best_rank: null, best_rank_year: null, latest_title: null, tour_title_count: 0,
  };
}

function drawPlayerSlot(person, x, y, width, tilt, index) {
  const manual = isManualDraw();
  const slot = document.createElement(manual && !person ? "button" : "div");
  slot.className = "draw-slot";
  slot.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${width * 1.25}px;transform:rotate(${tilt}deg);`;
  const player = drawPlayer(person);
  if (!player) {
    slot.classList.add("draw-tbd");
    slot.textContent = "TBD";
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

function draw125PlayerSlot(person, x, y, width, photoHeight, nameAbove, index) {
  const manual = isManualDraw();
  const player = drawPlayer(person);
  const panel = document.createElement(manual && !player ? "button" : "div");
  panel.className = "draw-slot draw-125-player";
  panel.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${photoHeight}px;`;
  if (!player) {
    panel.classList.add("draw-tbd");
    panel.textContent = "TBD";
    if (manual) {
      panel.type = "button"; panel.dataset.drawSlot = index; panel.classList.add("draw-player-choice");
      panel.setAttribute("aria-label", "Select Player " + (index + 1));
    }
    return panel;
  }
  panel.dataset.playerId = player.id;
  const frame = document.createElement("div");
  frame.className = "draw-125-photo";
  const photo = drawPhotos.get(player.id) || photoByName.get(normalize(player.name));
  if (photo) {
    const image = document.createElement("img"); image.src = photo; image.alt = player.name;
    frame.append(image);
  } else {
    const initials = document.createElement("span");
    initials.textContent = player.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("");
    frame.append(initials);
  }
  const upload = document.createElement("button");
  upload.type = "button"; upload.className = "draw-photo-button";
  upload.setAttribute("aria-label", "Upload " + player.name + " portrait");
  upload.title = "Click to upload a portrait";
  if (manual) {
    upload.dataset.drawSlot = index;
    upload.setAttribute("aria-label", "Select Player " + (index + 1) + ": " + player.name);
    upload.title = "Click to select a player or upload a portrait";
  }
  frame.append(upload); panel.append(frame);
  const name = document.createElement("div");
  name.className = "draw-125-name";
  name.style.top = nameAbove ? "-90px" : photoHeight + 14 + "px";
  const text = document.createElement("div"); text.className = "draw-125-name-text";
  const label = document.createElement("span"); label.textContent = player.name.toLocaleUpperCase();
  text.append(label); name.append(text);
  if (player.country) {
    const flag = document.createElement("img"); flag.className = "draw-125-flag";
    flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg"; flag.alt = player.country + " flag";
    name.append(flag);
  }
  if (manual) {
    const choose = document.createElement("button");
    choose.type = "button"; choose.className = "draw-select-player"; choose.dataset.drawSlot = index;
    choose.setAttribute("aria-label", "Change Player " + (index + 1) + ": " + player.name);
    name.append(choose);
  }
  panel.append(name);
  const badge = document.createElement("div"); badge.className = "draw-125-rank";
  const rank = document.createElement("span"); rank.textContent = player.rank ?? "NR";
  badge.append(rank);
  if (typeof player.rank === "number") {
    const ordinal = document.createElement("sup"); ordinal.textContent = player.rank === 1 ? "er" : "ème";
    badge.append(ordinal);
  }
  panel.append(badge);
  return panel;
}

function fit125PlayerNames() {
  const measure = document.createElement("canvas").getContext("2d");
  drawMatches.querySelectorAll(".draw-125-name-text").forEach(box => {
    const label = box.firstElementChild;
    measure.font = getComputedStyle(label).font;
    const width = measure.measureText(label.textContent).width + 4;
    const flag = box.parentElement.querySelector(".draw-125-flag");
    const available = box.parentElement.clientWidth - 12 - (flag ? flag.offsetWidth + 16 : 0);
    if (available <= 0) return;
    box.style.width = Math.min(width, available) + "px";
    label.style.width = width + "px";
    label.style.transform = "scaleX(" + Math.min(1, available / width) + ")";
  });
}

function drawVersus(x, y, small = false) {
  const versus = document.createElement("span");
  versus.className = "draw-vs" + (small ? " draw-vs-small" : "");
  versus.textContent = "VS";
  versus.style.cssText = `left:${x}px;top:${y}px;`;
  drawMatches.append(versus);
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
  document.getElementById("manual-draw-logo").hidden = !manual;
  document.getElementById("manual-draw-round-text").hidden = !manual;
  const roundLabel = document.getElementById("manual-draw-round-label");
  roundLabel.textContent = manual ? tournament.header.toLocaleUpperCase() : "";
  roundLabel.dataset.placeholder = "ROUND";
  const finalRound = document.getElementById("draw-125-final-round");
  finalRound.textContent = manual ? tournament.header.toLocaleUpperCase() : "FINALE";
  finalRound.dataset.placeholder = "ROUND";
  const name = manual ? tournament.name.toLocaleUpperCase() : tournamentName(tournament).toLocaleUpperCase();
  const nameNode = document.getElementById("draw-event-name");
  nameNode.textContent = name;
  nameNode.dataset.placeholder = "TOURNAMENT";
  nameNode.style.fontSize = "78px";
  const category = document.getElementById("draw-event-category");
  category.textContent = tournament.category === "Finals" ? "WTA FINALS" : tournament.category.toLocaleUpperCase();
  category.dataset.placeholder = "CATEGORY";
  for (const [node, field] of [[nameNode, "name"], [category, "category"], [roundLabel, "header"], [finalRound, "header"]]) {
    if (manual) {
      node.contentEditable = "plaintext-only";
      node.spellcheck = false;
      node.dataset.drawField = field;
      node.setAttribute("role", "textbox");
      node.setAttribute("aria-label", { name: "Tournament name", category: "Tournament category", header: "Round header" }[field]);
    } else {
      for (const attribute of ["contenteditable", "data-draw-field", "role", "aria-label"]) node.removeAttribute(attribute);
    }
  }
  drawContent.querySelector(".draw-event").style.backgroundColor = tournamentStyle({ level: tournament.category, name })?.color || (drawDesignFor(tournament) === "125" ? "#7ed957" : "#699694");
  fitTournamentName(nameNode, "78px");
  if (manual) fitTournamentName(roundLabel, "80px");
  fitTournamentName(finalRound, "110px");
}

function renderDrawCard() {
  if (!isDrawCard()) return;
  const manual = isManualDraw();
  const tournament = manual ? manualDraw() : currentDrawTournaments().find(t => t.id === drawTournament.value);
  if (!tournament) { card.hidden = true; return; }
  const round = drawRound.value;
  const design = drawDesignFor(tournament);
  const matches = tournament.rounds[round] || [];
  card.dataset.type = "draw";
  card.dataset.drawRound = round;
  card.dataset.drawStyle = design;
  card.removeAttribute("data-tier");
  cardDesign.querySelector(".card-content").hidden = true;
  document.getElementById("card-title-details").hidden = true;
  resultContent.hidden = true;
  drawContent.hidden = false;
  drawContent.dataset.manual = String(manual);
  drawMatches.replaceChildren();
  setTourArtwork("draw-round-art", { F: "finale", S: "demifinale", Q: "quartdefinale" }[round], design === "125" && round !== "F" ? 112 : 88);
  for (let i = 0; i < (round === "F" ? 1 : round === "S" ? 2 : 4); i++) {
    const match = matches[i] || { id: "pending-" + i, players: [null, null] };
    const [a, b] = match.players;
    if (design === "125") {
      if (round === "F") {
        drawMatches.append(draw125PlayerSlot(a, 64, 240, 720, 920, false, 0), draw125PlayerSlot(b, 808, 240, 720, 920, false, 1));
        drawVersus(800, 580, true);
      } else if (round === "S") {
        const x = i ? 1044 : 76;
        drawMatches.append(draw125PlayerSlot(a, x, 210, 480, 480, true, i * 2), draw125PlayerSlot(b, x, 1010, 480, 480, false, i * 2 + 1));
        drawVersus(x + 240, 650, true);
      } else {
        const x = i % 2 ? 985 : 35, y = i < 2 ? 200 : 780;
        drawMatches.append(draw125PlayerSlot(a, x, y, 280, 420, false, i * 2), draw125PlayerSlot(b, x + 300, y, 280, 420, false, i * 2 + 1));
        drawVersus(x + 290, y + 140, true);
      }
      continue;
    }
    if (round === "F") {
      drawMatches.append(drawPlayerSlot(a, 35, 80, 640, -1, 0), drawPlayerSlot(b, 925, 80, 640, 1, 1));
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
      updateDrawH2hColors(h2h);
      drawMatches.append(h2h);
    } else if (round === "S") {
      const x = i ? 1045 : 75;
      drawMatches.append(drawPlayerSlot(a, x, 105, 480, i ? 1 : -1, i * 2), drawPlayerSlot(b, x, 735, 480, i ? 1 : -1, i * 2 + 1));
    } else {
      const x = i % 2 ? 985 : 35;
      const y = i < 2 ? 125 : 530;
      drawMatches.append(drawPlayerSlot(a, x, y, 280, -1, i * 2), drawPlayerSlot(b, x + 300, y, 280, 1, i * 2 + 1));
      drawVersus(x + 290, y + 140, true);
    }
  }
  if (round !== "F") {
    for (const side of ["left", "right"]) {
      const svg = round === "Q" || design === "125";
      const brace = svg ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement("span");
      brace.setAttribute("class", "draw-brace draw-brace-" + side);
      brace.setAttribute("aria-hidden", "true");
      if (svg) {
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
    if (design === "tour") {
      const logo = document.createElement("img");
      logo.className = "draw-center-logo";
      logo.src = "assets/haute-cadence-logo.png";
      logo.alt = "";
      drawMatches.append(logo);
    }
  }
  document.getElementById("svg-title").textContent = (manual ? tournament.header : drawRound.selectedOptions[0].textContent) + " · " + tournament.name;
  document.getElementById("svg-description").textContent = manual ? "Manually composed draw." : "WTA singles draw. TBD means an opponent is not yet confirmed.";
  card.hidden = false;
  scaleCardDesign();
  renderDrawHeading(tournament);
  fit125PlayerNames();
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
  document.getElementById("edit-draw-form").hidden = design === "125";
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
    if (isDrawCard() && !isManualDraw()) {
      drawStatus.textContent = data.refresh_error || (!current.length ? "No current WTA tournaments available." : "");
      if (changed || !current.some(t => t.id === previous)) renderDrawCard();
    }
  } catch (error) {
    if (isDrawCard() && !isManualDraw()) drawStatus.textContent = error.message;
  } finally {
    drawsLoading = false;
    document.getElementById("refresh-draws").disabled = false;
  }
}

function updateDrawModeControls() {
  const active = isDrawCard(), manual = isManualDraw();
  document.getElementById("draw-design-picker").hidden = !manual;
  document.getElementById("draw-tournament-picker").hidden = !active;
  for (const id of ["draw-options", "draw-status"]) document.getElementById(id).hidden = !active;
  document.getElementById("refresh-draws").hidden = manual;
  updateManualDrawControls();
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
drawRound.addEventListener("change", () => { updateManualDrawControls(); renderDrawCard(); });
drawDesign.addEventListener("change", () => {
  if (!isManualDraw() || !["tour", "125"].includes(drawDesign.value)) return;
  manualDraw().design = drawDesign.value;
  renderDrawCard();
});
drawContent.addEventListener("input", event => {
  if (!isManualDraw()) return;
  const node = event.target;
  const field = node.dataset.drawField;
  if (!["header", "name", "category"].includes(field)) return;
  const draft = manualDraw();
  draft[field] = node.textContent.replace(/[\r\n]/g, " ").slice(0, field === "category" ? 30 : 80);
  if (node.textContent !== draft[field]) node.textContent = draft[field];
  if (field === "name") draft.city = draft.name;
  if (field !== "category") fitTournamentName(node, node.id === "draw-event-name" ? "78px" : node.id === "draw-125-final-round" ? "110px" : "80px");
  drawContent.querySelector(".draw-event").style.backgroundColor = tournamentStyle({ level: draft.category, name: draft.name })?.color || (draft.design === "125" ? "#7ed957" : "#699694");
});
drawContent.addEventListener("keydown", event => {
  if (event.target.matches("[data-draw-field]") && ["Enter", "Escape"].includes(event.key)) {
    event.preventDefault(); event.target.blur();
  }
});
document.getElementById("refresh-draws").addEventListener("click", refreshDraws);
function refreshDrawsIfStale() {
  if (isDrawCard() && !isManualDraw() && Date.now() - drawLastRefresh >= 300000) refreshDraws();
}
window.addEventListener("focus", refreshDrawsIfStale);
setInterval(refreshDrawsIfStale, 300000);
drawMatches.addEventListener("click", event => {
  const choice = event.target.closest("[data-draw-slot]");
  if (choice && isManualDraw()) { selectManualDrawPlayer(Number(choice.dataset.drawSlot)); return; }
  const artwork = event.target.closest(".draw-player-card, .draw-125-player");
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
