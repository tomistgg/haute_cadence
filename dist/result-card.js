"use strict";

const resultControls = document.getElementById("result-controls");
const resultSelect = document.getElementById("result-match");
const resultStatus = document.getElementById("result-status");
const resultContent = document.getElementById("result-card-content");
const uploadedResultPhotos = new Map();
const uploadedTourPhotos = new Map();
// PNGs include transparent padding; position their visible artwork without changing the supplied files.
const tourArtwork = {
  premier: [3200, 1800, 690, 391, 1734, 304],
  deuxieme: [1880, 1576, 265, 364, 1323, 223],
  quartdefinale: [1880, 1576, 91, 86, 1294, 218],
  demifinale: [1880, 1576, 91, 90, 1698, 340],
  finale: [1880, 1576, 91, 86, 719, 218],
  deux_sets: [3200, 1800, 414, 607, 2429, 476],
  trois_sets: [3200, 1800, 355, 577, 2307, 423],
};
const nonTourArtwork = {
  "1": [1600, 900, 160, 327, 1178, 167],
  "2": [1600, 900, 120, 304, 1228, 167],
  "3": [1600, 900, 158, 341, 1223, 167],
  "4": [1600, 900, 209, 366, 1060, 168],
  "5": [1600, 900, 354, 342, 798, 167],
  "6": [1600, 900, 90, 335, 1284, 167],
  "7": [1600, 900, 98, 373, 1284, 168],
  "8": [1600, 900, 135, 366, 1284, 168],
};
const nonTourRoundFiles = { premier: "1", deuxieme: "2", quartdefinale: "3", demifinale: "4", finale: "5",
  qualifications1: "6", qualifications2: "7", qualifications3: "8" };
const itfMatches = new Map();
const itfRoundDialog = document.getElementById("itf-round-dialog");
const resultCategoryDialog = document.getElementById("result-category-dialog");
const itfTournamentDialog = document.getElementById("itf-tournament-dialog");
const itfTournamentOptions = document.getElementById("itf-tournament-options");
const itfTournamentStatus = document.getElementById("itf-tournament-status");
let itfTournamentMatchId = "";
let categoryPickerSelection = null;
const itfPlayerDialog = document.getElementById("itf-player-dialog");
const itfPlayerInput = document.getElementById("itf-player-search");
const itfPlayerOptions = document.getElementById("itf-player-options");
let itfPlayerSide = "winner";
let itfPlayerMatchId = "";
let itfPlayerChoices = [];
let itfPlayerActiveIndex = -1;
let playerPickerSelection = null;
let playerPickerPlayer = null;
let resultFeed = null;
let selectedResultId = "";
let resultsLoading = false;
let lastResultsRefresh = 0;
let resultOptionsSignature = "";

function currentResults() {
  const now = Date.now();
  return (resultFeed?.matches || []).filter(match => {
    const finished = Date.parse(match.completed_at);
    const tour = ["Grand Slam", "WTA Finals", "Finals", "WTA 1000", "WTA 500", "WTA 250"];
    return Number.isFinite(finished) && now - 86400000 <= finished && finished <= now
      && (cardType.value !== "tour-result" || tour.includes(match.tournament.category));
  });
}

function isManualResultId(id) {
  return cardType.value === "tour-result" ? id === "tour-manual"
    : cardType.value === "result" && ["itf-2", "itf-3"].includes(id);
}

function selectedResultMatch() {
  if (!isManualResultId(selectedResultId)) return currentResults().find(item => item.id === selectedResultId);
  if (!itfMatches.has(selectedResultId)) {
    const tour = selectedResultId === "tour-manual";
    const player = number => ({ id: selectedResultId + "-player-" + number, name: "PLAYER " + number, country: "", placeholder: true });
    itfMatches.set(selectedResultId, {
      id: selectedResultId, manual: true, round: tour ? "MANUAL MATCH" : "ITF MATCH", round_art: "premier",
      round_heading: tour ? "MANUAL MATCH" : "ITF MATCH",
      tournament: { id: selectedResultId, name: "", city: "", category: "" },
      winner: player(1), loser: player(2), status: "",
      sets: Array.from({ length: tour ? 2 : Number(selectedResultId.at(-1)) }, () => ({ winner: "", loser: "", tiebreak: "" })),
    });
  }
  return itfMatches.get(selectedResultId);
}

function resultSetWinner(set, index) {
  if (!set || !Number.isInteger(set.winner) || !Number.isInteger(set.loser) || set.winner < 0 || set.loser < 0) return "";
  const high = Math.max(set.winner, set.loser);
  const low = Math.min(set.winner, set.loser);
  const complete = (high === 6 && low <= 4) || (high === 7 && [5, 6].includes(low))
    || (high >= 8 && high - low === 2) || (index === 2 && high >= 10 && high - low >= 2);
  return complete ? set.winner > set.loser ? "winner" : "loser" : "";
}

function resultWinningSide(match) {
  if (!match.manual) return "winner";
  const wins = { winner: 0, loser: 0 };
  match.sets.forEach((set, index) => {
    const side = resultSetWinner(set, index);
    if (side) wins[side] += 1;
  });
  return wins.winner >= 2 ? "winner" : wins.loser >= 2 ? "loser" : "";
}

function makeResultEditable(node, manual, field, side = "", index = "") {
  node.classList.toggle("itf-editable", !!manual);
  if (!manual) {
    for (const attribute of ["contenteditable", "tabindex", "role", "aria-label", "aria-haspopup", "aria-controls", "data-itf-field", "data-itf-side", "data-itf-index", "data-placeholder"]) node.removeAttribute(attribute);
    return;
  }
  node.dataset.itfField = field;
  node.dataset.itfSide = side;
  node.dataset.itfIndex = String(index);
  node.tabIndex = 0;
  node.setAttribute("role", ["player", "category", "tournament"].includes(field) ? "button" : "textbox");
  const playerLabel = side === "winner" ? "Player 1" : "Player 2";
  node.setAttribute("aria-label", field === "player" ? "Select " + playerLabel : field === "category" ? "Select tournament category" : field === "tournament" ? "Select this week's tournament" : field === "score" ? playerLabel + ", set " + (index + 1) + " score" : "Edit tournament " + field);
  if (["category", "tournament"].includes(field)) {
    node.removeAttribute("contenteditable");
    node.dataset.placeholder = field === "category" ? "CATEGORY" : "TOURNAMENT";
    node.setAttribute("aria-haspopup", "dialog");
    node.setAttribute("aria-controls", field === "category" ? "result-category-dialog" : "itf-tournament-dialog");
  } else if (field !== "player") {
    node.contentEditable = "plaintext-only";
    node.spellcheck = false;
    node.inputMode = field === "score" ? "numeric" : "text";
    node.dataset.placeholder = field === "name" ? "TOURNAMENT" : field === "category" ? "CATEGORY" : "—";
  }
}

function updateResultOutcome(match) {
  const winningSide = resultWinningSide(match);
  const photoSide = winningSide || "winner";
  if (cardType.value !== "tour-result") {
    setResultPhoto("winner", match[photoSide]);
    setResultPhoto("loser", match[photoSide === "winner" ? "loser" : "winner"]);
  }
  for (const side of ["winner", "loser"]) {
    const row = resultContent.querySelector('[data-side="' + side + '"]');
    row.classList.toggle("is-match-winner", winningSide === side);
    [...row.querySelector(".result-score-sets").children].forEach((score, index) => {
      const set = match.sets[index];
      const won = match.manual ? resultSetWinner(set, index) === side
        : set && set[side] > set[side === "winner" ? "loser" : "winner"];
      score.classList.toggle("set-won", !!won);
    });
  }
  const description = winningSide
    ? match[winningSide].name + " defeated " + match[winningSide === "winner" ? "loser" : "winner"].name
    : match.winner.name + " vs " + match.loser.name;
  document.getElementById("svg-title").textContent = cardType.selectedOptions[0].textContent + " · " + description;
  document.getElementById("svg-description").textContent = match.tournament.name + ", " + match.round + ", " + match.sets.map(set => set.winner + "-" + set.loser).join(" ");
}

function resultPhoto(player) {
  return uploadedResultPhotos.get(player.id) || savedPlayerPhoto(player);
}

function resultPlayerName(player) {
  const name = playerDisplayName(player);
  const given = stripAccents(player.first_name || "");
  const first = given && name.startsWith(given + " ") ? given : name.split(/\s+/)[0];
  const last = name.slice(first.length).trim();
  return last ? first + " " + last.toLocaleUpperCase() : name;
}

function resultRank(player) {
  if (player.manual) return player.rank ?? "NR";
  return player.placeholder ? "—" : player.rank ?? players.find(row => row.id === player.id)?.rank ?? "NR";
}

function fitResultNames() {
  resultContent.querySelectorAll(".result-score-name > span").forEach(name => {
    fitPlayerName(name, name.parentElement.clientWidth);
  });
}

function setResultPhoto(side, player) {
  const image = document.getElementById("result-" + side + "-photo");
  const initials = document.getElementById("result-" + side + "-initials");
  const photo = resultPhoto(player);
  image.hidden = !photo;
  initials.hidden = !!photo;
  if (photo) {
    if (image.getAttribute("src") !== photo) image.src = photo;
    image.alt = player.name;
  } else {
    image.removeAttribute("src");
    initials.textContent = playerDisplayName(player).split(/\s+/).map(part => part[0]).slice(0, 2).join("");
  }
}

function setTourArtwork(id, artwork, height, directory = "assets/wtatour_result", filename = artwork, artworkBounds = tourArtwork) {
  const [width, imageHeight, x, y, cropWidth, cropHeight] = artworkBounds[artwork];
  const scale = height / cropHeight;
  const frame = document.getElementById(id);
  frame.hidden = false;
  frame.style.width = cropWidth * scale + "px";
  frame.style.height = height + "px";
  const image = frame.querySelector("img");
  image.src = directory + "/" + filename + ".png";
  image.style.cssText = `width:${width * scale}px;height:${imageHeight * scale}px;left:${-x * scale}px;top:${-y * scale}px;`;
  return cropWidth * scale;
}

function nonTourHeader(match) {
  const qualifying = match.round_heading === "QUALIFICATIONS";
  const file = qualifying ? { premier: "6", deuxieme: "7", troisieme: "8" }[match.round_art]
    : nonTourRoundFiles[match.round_art];
  const label = file ? match.round_heading && !qualifying ? match.round_heading : ""
    : match.round_heading || (match.round_art === "troisieme" ? "TROISIÈMES TOURS" : match.round);
  return { file: file || "1", label: match.manual && match.round === "ITF MATCH" ? "ITF MATCH" : label };
}

function renderNonTourHeader(match) {
  const { file, label } = nonTourHeader(match);
  const width = setTourArtwork("non-tour-round-art", file, 178, "assets/match_types", file, nonTourArtwork);
  const left = (1440 - width) / 2;
  const eventLeft = left + width - 302;
  document.getElementById("result-event").style.left = eventLeft + "px";
  const heading = document.getElementById("result-round-heading");
  const textLeft = left + 200 * 178 / nonTourArtwork[file][5];
  heading.hidden = !match.manual && !label;
  heading.textContent = label || match.round;
  heading.classList.toggle("has-round-art", !label);
  heading.classList.toggle("centered-itf-round", !!label);
  heading.style.left = textLeft + "px";
  heading.style.width = eventLeft - textLeft - 16 + "px";
  heading.style.backgroundImage = label ? "linear-gradient(90deg, #20bca3, #a9e2d7)" : "";
  heading.style.fontSize = label === "ITF MATCH" ? "110px" : "70px";
}

function renderTourResult(match) {
  const tour = cardType.value === "tour-result";
  document.getElementById("tour-round-art").hidden = !tour;
  document.getElementById("tour-score-art").hidden = !tour;
  const photo = document.getElementById("tour-match-photo");
  photo.hidden = !tour || !uploadedTourPhotos.has(match.id);
  if (!tour) return;
  if (!photo.hidden) photo.src = uploadedTourPhotos.get(match.id);
  else photo.removeAttribute("src");
  document.getElementById("tour-set-count").value = String(match.sets.length);
  const artwork = match.round_art === "troisieme" ? "premier" : match.round_art;
  const width = setTourArtwork("tour-round-art", artwork, 80);
  setTourArtwork("tour-score-art", match.sets.length === 3 ? "trois_sets" : "deux_sets", 120);
  const heading = document.getElementById("result-round-heading");
  const label = match.round_heading || (match.round_art === "troisieme" ? "TROISIÈMES TOURS" : "");
  heading.hidden = !match.manual && !label;
  heading.textContent = label || match.round;
  heading.classList.toggle("has-round-art", !label);
  heading.style.left = (1600 - width) / 2 + 100 + "px";
  heading.style.width = width - 106 + "px";
  document.getElementById("result-event").style.left = "auto";
  const eventName = document.getElementById("result-event-name");
  eventName.style.fontSize = "78px";
}

function renderResultCard() {
  if (!isResultCard()) return;
  document.getElementById("draw-card-content").hidden = true;
  const match = selectedResultMatch();
  const tour = cardType.value === "tour-result";
  document.getElementById("non-tour-photo-controls").hidden = tour;
  document.getElementById("tour-photo-controls").hidden = !tour;
  document.getElementById("tour-set-controls").hidden = !tour || !match?.manual;
  if (!match) {
    card.hidden = true;
    return;
  }
  document.getElementById("result-winner-upload").disabled = false;
  document.getElementById("result-loser-upload").disabled = false;
  document.getElementById("tour-photo-upload").disabled = false;
  card.dataset.type = cardType.value;
  card.removeAttribute("data-tier");
  document.querySelector(".card-content").hidden = true;
  document.getElementById("card-title-details").hidden = true;
  resultContent.hidden = false;
  resultContent.dataset.manual = String(!!match.manual);
  document.getElementById("result-winner-upload-label").textContent = match.manual ? "Player 1 photo" : "Winner photo";
  document.getElementById("result-loser-upload-label").textContent = match.manual ? "Player 2 photo" : "Opponent photo";
  resultContent.dataset.sets = String(Math.max(2, match.sets.length));
  document.getElementById("result-round-art").src = "assets/results/premier.png";
  document.getElementById("non-tour-round-art").hidden = tour;
  document.getElementById("result-score-art").src = "assets/results/" + (match.sets.length === 3 ? "trois_sets" : "deux_sets") + ".png";
  const heading = document.getElementById("result-round-heading");
  heading.hidden = !match.manual && !match.round_heading;
  heading.textContent = match.round_heading || match.round;
  heading.disabled = !match.manual;
  heading.classList.toggle("itf-editable", !!match.manual);
  heading.classList.toggle("has-round-art", !match.round_heading);
  heading.classList.remove("centered-itf-round");
  heading.setAttribute("aria-label", "Select round. Current: " + (match.round_heading || match.round));
  heading.style.left = "395px";
  const event = document.getElementById("result-event");
  heading.style.backgroundImage = "";
  heading.style.fontSize = "";
  if (!tour) renderNonTourHeader(match);
  event.style.backgroundColor = tournamentStyle({ level: match.tournament.category, name: match.tournament.name })?.color || "#7ed957";
  const eventName = document.getElementById("result-event-name");
  eventName.textContent = match.manual ? match.tournament.name : tournamentName(match.tournament).toLocaleUpperCase();
  eventName.style.fontSize = "84px";
  makeResultEditable(eventName, match.manual, "tournament");
  const eventCategory = document.getElementById("result-event-category");
  eventCategory.textContent = match.tournament.category === "Finals" ? "WTA FINALS" : match.tournament.category.toLocaleUpperCase();
  eventCategory.style.fontSize = match.manual ? Math.min(tour ? 20 : 22, 320 / Math.max(1, eventCategory.textContent.length || 8)) + "px" : "";
  makeResultEditable(eventCategory, match.manual, "category");
  document.getElementById("result-retired").hidden = !match.status;
  document.getElementById("result-retired").textContent = match.status;
  for (const side of ["winner", "loser"]) {
    const player = match[side];
    const row = resultContent.querySelector('[data-side="' + side + '"]');
    const flag = row.querySelector(".result-score-flag");
    const fallback = row.querySelector(".result-flag-fallback");
    fallback.textContent = player.country || "—";
    fallback.hidden = !!player.country;
    flag.hidden = !player.country;
    flag.onerror = () => { flag.hidden = true; fallback.hidden = false; };
    if (player.country) flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg";
    else flag.removeAttribute("src");
    flag.alt = player.country + " flag";
    const rank = row.querySelector(".result-score-rank");
    rank.textContent = resultRank(player);
    rank.style.fontSize = cardType.value === "tour-result"
      ? String(rank.textContent).length > 3 ? "28px" : "36px"
      : String(rank.textContent).length > 3 ? "62px" : "82px";
    row.querySelector(".result-score-name > span").textContent = resultPlayerName(player);
    makeResultEditable(row.querySelector(".result-score-name"), match.manual, "player", side);
    const scores = row.querySelector(".result-score-sets");
    scores.replaceChildren();
    for (let index = 0; index < Math.max(2, match.sets.length); index += 1) {
      const set = match.sets[index];
      const score = document.createElement("span");
      if (set) {
        score.textContent = set[side];
        if (set.tiebreak && set[side] < set[side === "winner" ? "loser" : "winner"]) {
          const tiebreak = document.createElement("sup");
          tiebreak.textContent = set.tiebreak;
          score.append(tiebreak);
        }
      }
      score.classList.toggle("two-digit-score", String(score.textContent).length > 1 && !score.querySelector("sup"));
      makeResultEditable(score, match.manual, "score", side, index);
      scores.append(score);
    }
  }
  renderTourResult(match);
  updateResultOutcome(match);
  card.hidden = false;
  scaleCardDesign();
  fitTournamentName(eventName, tour ? "78px" : "84px");
  fitResultNames();
}

function resultRoundOrder(match) {
  const rounds = ["PHASE DE GROUPES", "1st Round", "2nd Round", "3rd Round", "QUATRIÈME TOUR", "CINQUIÈME TOUR", "Quarterfinals", "Semifinals", "Final"];
  const round = match.round.split(" · ").at(-1);
  const order = rounds.indexOf(round);
  return (match.round.startsWith("Qualifying") ? 0 : 100) + (order < 0 ? 99 : order);
}

function updateResultOptions() {
  const matches = currentResults();
  if (!matches.some(match => match.id === selectedResultId) && !isManualResultId(selectedResultId)) selectedResultId = matches[0]?.id || "";
  const stale = resultFeed?.updated_at && Date.now() - Date.parse(resultFeed.updated_at) > 3600000
    ? "The saved feed is more than an hour old; recent matches may be missing." : "";
  resultStatus.textContent = [stale, resultFeed?.refresh_error].filter(Boolean).join(" ");
  const signature = JSON.stringify([cardType.value, matches]);
  if (signature === resultOptionsSignature) return;
  resultOptionsSignature = signature;
  resultSelect.replaceChildren();
  const categories = ["Grand Slam", "WTA Finals", "Finals", "WTA 1000", "WTA 500", "WTA 250", "WTA 125"];
  const groups = new Map();
  for (const match of matches) {
    const key = [match.tournament.category, match.tournament.id, match.tournament.city].join("|");
    if (!groups.has(key)) groups.set(key, { tournament: match.tournament, matches: [] });
    groups.get(key).matches.push(match);
  }
  const categoryOrder = category => categories.includes(category) ? categories.indexOf(category) : categories.length;
  const orderedGroups = [...groups.values()].sort((a, b) =>
    categoryOrder(a.tournament.category) - categoryOrder(b.tournament.category)
    || tournamentName(a.tournament).localeCompare(tournamentName(b.tournament))
  );
  for (const group of orderedGroups) {
    const optgroup = document.createElement("optgroup");
    const category = group.tournament.category === "Finals" ? "WTA Finals" : group.tournament.category;
    optgroup.label = category + " " + tournamentName(group.tournament);
    group.matches.sort((a, b) => resultRoundOrder(a) - resultRoundOrder(b)
      || Date.parse(a.completed_at) - Date.parse(b.completed_at) || a.id.localeCompare(b.id));
    for (const match of group.matches) {
      const option = document.createElement("option");
      option.value = match.id;
      option.textContent = match.round + " - " + match.winner.name + " vs " + match.loser.name;
      optgroup.append(option);
    }
    resultSelect.append(optgroup);
  }
  if (!matches.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No completed singles matches in the last 24 hours";
    resultSelect.append(empty);
  }
  if (cardType.value === "result") {
    const manual = document.createElement("optgroup");
    manual.label = "ITF";
    for (const sets of [2, 3]) {
      const option = document.createElement("option");
      option.value = "itf-" + sets;
      option.textContent = "ITF MATCH " + sets + " SETS";
      manual.append(option);
    }
    resultSelect.append(manual);
  } else if (cardType.value === "tour-result") {
    const manual = document.createElement("option");
    manual.value = "tour-manual";
    manual.textContent = "MANUAL MATCH";
    resultSelect.append(manual);
  }
  resultSelect.disabled = false;
  const hasMatch = !!selectedResultMatch();
  document.getElementById("result-winner-upload").disabled = !hasMatch;
  document.getElementById("result-loser-upload").disabled = !hasMatch;
  document.getElementById("tour-photo-upload").disabled = !hasMatch;
  resultSelect.value = selectedResultId;
  renderResultCard();
}

async function refreshResults(force = false) {
  if (resultsLoading) return;
  resultsLoading = true;
  lastResultsRefresh = Date.now();
  const button = document.getElementById("refresh-results");
  button.disabled = true;
  if (!resultFeed) resultStatus.textContent = "Loading completed WTA singles matches…";
  try {
    let data;
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
      const url = "data/recent_results.json" + (force ? "?refresh=1&t=" + Date.now() : "");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Completed WTA matches are temporarily unavailable. Try Refresh again.");
      data = await response.json();
    } else {
      const live = await import("./wta-live.mjs");
      data = await live.collectResults();
    }
    if (!Array.isArray(data.matches)) throw new Error("The completed-match feed is invalid.");
    resultFeed = data;
    updateResultOptions();
  } catch (error) {
    updateResultOptions();
    resultStatus.textContent = error.message;
  } finally {
    resultsLoading = false;
    button.disabled = false;
  }
}

resultSelect.addEventListener("change", () => {
  selectedResultId = resultSelect.value;
  renderResultCard();
});
document.getElementById("refresh-results").addEventListener("click", () => refreshResults(true));

function setManualTourSets(count) {
  const match = selectedResultMatch();
  if (cardType.value !== "tour-result" || !match?.manual || ![2, 3].includes(count)) return;
  if (count === 2 && match.sets.length === 3) match.third_set = match.sets.pop();
  if (count === 3 && match.sets.length === 2) {
    match.sets.push(match.third_set || { winner: "", loser: "", tiebreak: "" });
  }
  renderResultCard();
}
document.getElementById("tour-set-count").addEventListener("change", event => setManualTourSets(Number(event.target.value)));
document.getElementById("tour-photo-upload").addEventListener("change", async event => {
  const input = event.target;
  const match = selectedResultMatch();
  const file = input.files[0];
  if (cardType.value !== "tour-result" || !match || !file) return;
  if (!file.type.startsWith("image/")) { resultStatus.textContent = "Choose an image file for the match photo."; return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const previous = uploadedTourPhotos.get(match.id);
    uploadedTourPhotos.set(match.id, url);
    if (previous) URL.revokeObjectURL(previous);
    renderResultCard();
  } catch {
    URL.revokeObjectURL(url);
    resultStatus.textContent = "That photo could not be opened. Choose another image.";
  }
  input.value = "";
});
document.getElementById("result-round-heading").addEventListener("click", () => {
  const match = selectedResultMatch();
  if (!match?.manual) return;
  itfRoundDialog.querySelectorAll("[data-round]").forEach(button => {
    button.hidden = cardType.value === "tour-result" && button.dataset.nonTour === "true";
    button.setAttribute("aria-pressed", String(!match.round_heading && button.dataset.round === match.round_art));
  });
  itfRoundDialog.showModal();
});
itfRoundDialog.addEventListener("click", event => {
  const button = event.target.closest("button[data-round]");
  const match = selectedResultMatch();
  if (!button || !match?.manual || (cardType.value === "tour-result" && button.dataset.nonTour === "true")) return;
  match.round = button.textContent;
  match.round_art = button.dataset.round;
  match.round_heading = "";
  renderResultCard();
  itfRoundDialog.close();
});
function openTournamentCategoryPicker(category, onSelect) {
  categoryPickerSelection = onSelect;
  resultCategoryDialog.querySelectorAll("[data-category]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.category === category));
  });
  resultCategoryDialog.showModal();
}
function openResultCategoryPicker() {
  const match = selectedResultMatch();
  if (!isResultCard() || !match?.manual) return;
  openTournamentCategoryPicker(match.tournament.category, category => {
    if (!isResultCard() || selectedResultMatch()?.id !== match.id) return;
    match.tournament.category = category;
    renderResultCard();
  });
}

function currentWeekResultTournaments(data, tour, today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date())) {
  if (!data) return [];
  const monday = new Date(today + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const start = monday.toISOString().slice(0, 10), end = sunday.toISOString().slice(0, 10);
  const found = new Map();
  const items = Object.values(data.weeks).flat().map(row =>
    Object.fromEntries(data.fields.map((field, index) => [field, row[index]])));
  const parents = new Map(items.map(item => [String(item.calendarKey), item]));
  const tourCategories = ["Grand Slam", "WTA Finals", "WTA 1000", "WTA 500", "WTA 250"];
  for (const item of items) {
    const category = tour ? tournamentStyle(item)?.label : item.level;
    if (tour ? !tourCategories.includes(category) : item.column !== "itf" || !/^W(100|75|50|35|15)$/.test(category)) continue;
    const first = String(item.startDate || "").slice(0, 10), last = String(item.endDate || "").slice(0, 10);
    if (!Number.isFinite(Date.parse(first)) || !Number.isFinite(Date.parse(last)) || first > last) continue;
    const qualifying = String(item.calendarKey).includes("|qualifying");
    if (first > end || last < start || (qualifying && (!tour || category !== "Grand Slam"))) continue;
    const id = String(item.calendarKey || [item.level, item.name, first].join("|")).replace(/\|qualifying$/, "");
    const parent = qualifying ? parents.get(id) : null;
    const nameSource = parent || { ...item, name: item.name.replace(/\s+Qualifying\b/i, "") };
    const city = tour ? tournamentName({ ...nameSource, category }) : item.city || item.name.replace(/^W\d+\s+/i, "");
    if (!found.has(id) || !qualifying) found.set(id, { ...item, id, category, city, qualifying });
  }
  return [...found.values()].sort((a, b) => (tour
    ? tourCategories.indexOf(a.category) - tourCategories.indexOf(b.category)
    : Number(b.category.slice(1)) - Number(a.category.slice(1)))
    || a.city.localeCompare(b.city) || a.startDate.localeCompare(b.startDate));
}

async function openResultTournamentPicker() {
  const match = selectedResultMatch();
  if (!match?.manual || !isManualResultId(match.id)) return;
  const tour = cardType.value === "tour-result", circuit = tour ? "WTA" : "ITF";
  itfTournamentMatchId = match.id;
  itfTournamentOptions.replaceChildren();
  document.getElementById("itf-tournament-heading").textContent = "This week's " + circuit + " tournaments";
  itfTournamentOptions.setAttribute("aria-label", "Current-week " + circuit + " tournaments");
  itfTournamentStatus.textContent = "Loading this week's " + circuit + " tournaments...";
  itfTournamentDialog.showModal();
  await refreshCalendar();
  if (itfTournamentMatchId !== match.id || selectedResultMatch() !== match || !isManualResultId(match.id)) return;
  if (!calendar) {
    itfTournamentStatus.textContent = "The " + circuit + " calendar could not be loaded. Close and try again.";
    return;
  }
  const choices = currentWeekResultTournaments(calendar, tour);
  for (const item of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = item.category + " " + item.city + (item.qualifying ? " · Qualifying" : "")
      + (item.country ? " · " + item.country : "");
    button.setAttribute("aria-pressed", String(match.tournament.id === item.id));
    button.addEventListener("click", () => selectResultTournament(item));
    itfTournamentOptions.append(button);
  }
  itfTournamentStatus.textContent = choices.length ? "" : "No " + circuit + " tournaments are listed for this week.";
}

function selectResultTournament(item) {
  const match = selectedResultMatch();
  if (!match?.manual || !isManualResultId(match.id) || match.id !== itfTournamentMatchId
      || !currentWeekResultTournaments(calendar, cardType.value === "tour-result").some(event => event.id === item.id)) return;
  match.tournament = { ...match.tournament, id: item.id, name: item.city, city: item.city,
    category: item.category, surface: item.surface };
  renderResultCard();
  itfTournamentDialog.close();
}
itfTournamentDialog.addEventListener("close", () => { itfTournamentMatchId = ""; });

resultCategoryDialog.addEventListener("click", event => {
  const button = event.target.closest("button[data-category]");
  if (!button || !categoryPickerSelection) return;
  categoryPickerSelection(button.dataset.category);
  resultCategoryDialog.close();
});
resultCategoryDialog.addEventListener("close", () => { categoryPickerSelection = null; });
cardType.addEventListener("change", () => {
  resultOptionsSignature = "";
  resultControls.hidden = !isResultCard();
  if (isResultCard()) {
    updateResultOptions();
    refreshResults();
  }
});
function refreshResultsIfStale() {
  if (isResultCard() && Date.now() - lastResultsRefresh >= 300000) refreshResults();
}
window.addEventListener("focus", refreshResultsIfStale);
setInterval(refreshResultsIfStale, 300000);
document.fonts.ready.then(fitResultNames);

resultContent.addEventListener("input", event => {
  const field = event.target.closest("[data-itf-field]");
  const match = selectedResultMatch();
  if (!field || !match?.manual) return;
  const kind = field.dataset.itfField;
  if (kind === "score") {
    const value = field.textContent.replace(/\D/g, "").slice(0, 2);
    if (field.textContent !== value) {
      field.textContent = value;
      const range = document.createRange();
      range.selectNodeContents(field);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    match.sets[Number(field.dataset.itfIndex)][field.dataset.itfSide] = value === "" ? "" : Number(value);
    field.classList.toggle("two-digit-score", value.length > 1);
  } else if (kind === "name") {
    const value = field.textContent.replace(/[\r\n]/g, " ").slice(0, 80);
    if (field.textContent !== value) field.textContent = value;
    match.tournament.name = value;
    match.tournament.city = value;
    fitTournamentName(field, cardType.value === "tour-result" ? "78px" : "84px");
  }
  updateResultOutcome(match);
});

document.getElementById("card-design").addEventListener("focusin", event => {
  const field = event.target.closest("[data-itf-field][contenteditable], [data-draw-field][contenteditable]");
  if (!field) return;
  setTimeout(() => {
    if (document.activeElement !== field) return;
    const range = document.createRange();
    range.selectNodeContents(field);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, 0);
});

function openItfPlayerSearch(side) {
  const match = selectedResultMatch();
  if (!match?.manual) return;
  itfPlayerSide = side;
  itfPlayerMatchId = match.id;
  openPlayerPicker(match[side], "Select Player " + (side === "winner" ? "1" : "2"));
}

function openPlayerPicker(player, label, onSelect = null, onPortrait = null) {
  playerPickerSelection = onSelect;
  playerPickerPlayer = player;
  const portrait = document.getElementById("draw-player-portrait");
  portrait.hidden = !onPortrait;
  portrait.onclick = onPortrait;
  document.getElementById("itf-player-label").textContent = label;
  itfPlayerInput.value = player.placeholder ? "" : playerDisplayName(player);
  document.getElementById("tour-player-details").hidden = false;
  document.getElementById("tour-player-rank").value = player.placeholder ? "" : String(resultRank(player));
  const country = document.getElementById("tour-player-country");
  country.replaceChildren();
  const countries = [...new Set(["", ...players.map(player => player.country), player.country])].sort();
  countries.forEach(code => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code || "No flag";
    country.append(option);
  });
  country.value = player.country;
  itfPlayerDialog.showModal();
  showItfPlayerOptions();
  itfPlayerInput.focus();
  itfPlayerInput.select();
}

resultContent.addEventListener("click", event => {
  const field = event.target.closest("[data-itf-field]");
  if (field?.dataset.itfField === "player") openItfPlayerSearch(field.dataset.itfSide);
  else if (field?.dataset.itfField === "category") openResultCategoryPicker();
  else if (field?.dataset.itfField === "tournament") openResultTournamentPicker();
});
resultContent.addEventListener("keydown", event => {
  const field = event.target.closest("[data-itf-field]");
  if (!field) return;
  if (["player", "category", "tournament"].includes(field.dataset.itfField) && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (field.dataset.itfField === "category") openResultCategoryPicker();
    else if (field.dataset.itfField === "tournament") openResultTournamentPicker();
    else openItfPlayerSearch(field.dataset.itfSide);
  } else if (["Enter", "Escape"].includes(event.key)) {
    event.preventDefault();
    field.blur();
  }
});

function chooseItfPlayer(player) {
  if (playerPickerSelection) {
    playerPickerSelection(player);
    itfPlayerDialog.close();
    return;
  }
  const match = selectedResultMatch();
  if (!match?.manual || match.id !== itfPlayerMatchId) return;
  const other = match[itfPlayerSide === "winner" ? "loser" : "winner"];
  if (other.id === player.id) return;
  const previous = match[itfPlayerSide];
  if (previous.placeholder && uploadedResultPhotos.has(previous.id)) {
    const photo = uploadedResultPhotos.get(previous.id);
    const existing = uploadedResultPhotos.get(player.id);
    if (existing && existing !== photo) URL.revokeObjectURL(existing);
    uploadedResultPhotos.set(player.id, photo);
    uploadedResultPhotos.delete(previous.id);
  }
  match[itfPlayerSide] = { id: player.id, name: player.name, country: player.country,
    display_name: player.display_name, aliases: player.aliases || [] };
  renderResultCard();
  itfPlayerDialog.close();
}

document.getElementById("tour-player-apply").addEventListener("click", () => {
  const match = selectedResultMatch();
  const name = itfPlayerInput.value.trim().slice(0, 80);
  const rank = document.getElementById("tour-player-rank");
  if (!name || (!playerPickerSelection && (!match?.manual || match.id !== itfPlayerMatchId))) return;
  if (!rank.reportValidity()) return;
  const player = {
    ...playerPickerPlayer, name, placeholder: false,
    name_override: !!playerPickerPlayer.name_override || name !== playerDisplayName(playerPickerPlayer),
    rank: rank.value ? /^\d+$/.test(rank.value) ? Number(rank.value) : "NR" : "NR",
    country: document.getElementById("tour-player-country").value,
  };
  if (playerPickerSelection) playerPickerSelection(player);
  else {
    match[itfPlayerSide] = player;
    renderResultCard();
  }
  itfPlayerDialog.close();
});

function showItfPlayerOptions() {
  const match = selectedResultMatch();
  const otherId = playerPickerSelection ? null : match?.[itfPlayerSide === "winner" ? "loser" : "winner"]?.id;
  const query = normalize(itfPlayerInput.value.trim());
  itfPlayerChoices = players.filter(player => player.id !== otherId && playerMatchesSearch(player, query)).slice(0, 8);
  itfPlayerActiveIndex = -1;
  itfPlayerInput.removeAttribute("aria-activedescendant");
  itfPlayerInput.setAttribute("aria-expanded", "true");
  itfPlayerOptions.replaceChildren();
  itfPlayerChoices.forEach((player, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion";
    option.id = "itf-player-option-" + index;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    const name = document.createElement("span");
    name.textContent = playerDisplayName(player);
    const rank = document.createElement("span");
    rank.textContent = (player.rank == null ? "NR" : "#" + player.rank) + " · " + player.country;
    option.append(name, rank);
    option.addEventListener("mousedown", event => event.preventDefault());
    option.addEventListener("click", () => chooseItfPlayer(player));
    itfPlayerOptions.append(option);
  });
  if (!itfPlayerChoices.length) {
    const empty = document.createElement("p");
    empty.textContent = "No ranked players match that name.";
    itfPlayerOptions.append(empty);
  }
  document.getElementById("itf-player-status").textContent = itfPlayerChoices.length + " matching players.";
}

itfPlayerInput.addEventListener("input", showItfPlayerOptions);
itfPlayerInput.addEventListener("keydown", event => {
  if (["ArrowDown", "ArrowUp"].includes(event.key) && itfPlayerChoices.length) {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    itfPlayerActiveIndex = itfPlayerActiveIndex < 0 ? direction > 0 ? 0 : itfPlayerChoices.length - 1
      : (itfPlayerActiveIndex + direction + itfPlayerChoices.length) % itfPlayerChoices.length;
    [...itfPlayerOptions.children].forEach((option, index) => option.setAttribute("aria-selected", String(index === itfPlayerActiveIndex)));
    itfPlayerInput.setAttribute("aria-activedescendant", "itf-player-option-" + itfPlayerActiveIndex);
    document.getElementById("itf-player-option-" + itfPlayerActiveIndex).scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    const player = itfPlayerChoices[Math.max(0, itfPlayerActiveIndex)];
    if (player) chooseItfPlayer(player);
  }
});
itfPlayerDialog.querySelector("form").addEventListener("submit", event => {
  event.preventDefault();
  const player = itfPlayerChoices[Math.max(0, itfPlayerActiveIndex)];
  if (player) chooseItfPlayer(player);
});
document.getElementById("itf-player-close").addEventListener("click", () => itfPlayerDialog.close());
itfPlayerDialog.addEventListener("close", () => {
  itfPlayerInput.setAttribute("aria-expanded", "false");
});

for (const side of ["winner", "loser"]) {
  const input = document.getElementById("result-" + side + "-upload");
  input.addEventListener("change", async () => {
    const match = selectedResultMatch();
    const file = input.files[0];
    if (!match || !file) return;
    if (!file.type.startsWith("image/")) { resultStatus.textContent = "Choose an image file for the portrait."; return; }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const previous = uploadedResultPhotos.get(match[side].id);
      uploadedResultPhotos.set(match[side].id, url);
      if (previous) URL.revokeObjectURL(previous);
      renderResultCard();
    } catch {
      URL.revokeObjectURL(url);
      resultStatus.textContent = "That portrait could not be opened. Choose another image.";
    }
    input.value = "";
  });
}
