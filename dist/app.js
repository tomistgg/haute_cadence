"use strict";

const searchInput = document.getElementById("player-search");
const options = document.getElementById("player-options");
const status = document.getElementById("search-status");
const card = document.getElementById("player-card");
const cardDesign = document.getElementById("card-design");

function scaleCardDesign() {
  const width = card.getBoundingClientRect().width;
  if (!width) return;
  const scale = String(width / cardDesign.offsetWidth);
  if (card.style.getPropertyValue("--card-scale") !== scale) card.style.setProperty("--card-scale", scale);
}

new ResizeObserver(scaleCardDesign).observe(card);
const cardType = document.getElementById("card-type");
function isResultCard() {
  return ["result", "tour-result", "instagram-result", "multiple-tour-result", "multiple-photo-result"].includes(cardType.value);
}
function isDrawCard() { return cardType.value === "draw"; }
const backgroundButton = document.getElementById("choose-background");
const backgroundDialog = document.getElementById("background-dialog");
const backgroundOptions = document.getElementById("background-options");
const selectedBackgrounds = new Map();

function updateBackgroundControls() {
  const type = cardType.value;
  document.getElementById("preview-controls").hidden = type === "form";
  document.getElementById("result-match-picker").hidden = !isResultCard();
  backgroundButton.hidden = type === "tour-result";
  const selected = selectedBackgrounds.get(type) || "";
  card.dataset.scheduleGrass = String(type === "schedule" && (!selected || selected === "assets/surfaces/grass_1.png"));
  const original = isDrawCard() ? "assets/surfaces/hard_4.png" : ["schedule", "multiple-photo-result"].includes(type) ? "assets/surfaces/grass_1.png"
    : ["instagram-result", "multiple-tour-result"].includes(type) ? "assets/surfaces/hard_4.png" : isResultCard() ? "assets/result-court.svg"
    : type === "wta-tour" ? "assets/tour-court.svg" : "assets/title-court.svg";
  card.style.backgroundImage = !["form", "tour-result"].includes(type) && selected ? `url("${selected}")` : "";
  document.getElementById("background-thumbnail").src = selected || original;
  document.getElementById("default-background-thumbnail").src = original;
  let label = "Original";
  backgroundOptions.querySelectorAll("button").forEach(button => {
    const active = button.dataset.background === selected;
    button.setAttribute("aria-pressed", String(active));
    if (active) label = button.textContent;
  });
  backgroundButton.setAttribute("aria-label", "Choose background. Current: " + label);
  backgroundButton.title = "Background: " + label;
}

backgroundButton.addEventListener("click", () => backgroundDialog.showModal());
backgroundOptions.addEventListener("click", event => {
  const button = event.target.closest("button[data-background]");
  if (!button) return;
  selectedBackgrounds.set(cardType.value, button.dataset.background);
  updateBackgroundControls();
  backgroundDialog.close();
});
fetch("data/surfaces.json", { cache: "no-store" })
  .then(response => { if (!response.ok) throw new Error("Backgrounds could not be loaded."); return response.json(); })
  .then(surfaces => {
    surfaces.forEach(surface => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.background = surface.src;
      const image = document.createElement("img");
      image.src = surface.src;
      image.alt = "";
      image.loading = "lazy";
      const label = document.createElement("span");
      label.textContent = surface.name;
      button.append(image, label);
      backgroundOptions.append(button);
    });
    document.getElementById("background-status").textContent = "";
    updateBackgroundControls();
  })
  .catch(error => { document.getElementById("background-status").textContent = error.message; });
const tournamentWrap = document.getElementById("tournament-search-wrap");
const tournamentInput = document.getElementById("tournament-search");
const tournamentOptions = document.getElementById("tournament-options");
const tournamentStatus = document.getElementById("tournament-status");
const formResults = document.getElementById("form-results");
const tourTitleNumber = document.getElementById("tour-title-number");
const tourTitleOrdinal = document.getElementById("tour-title-ordinal");
const lastTitleValue = document.getElementById("last-title-value");
// shortcut: Manual form edits are kept in this tab; add persistent storage if saving cards is needed.
const manualForms = new Map();
let selectedTournamentId = "";
let visibleTournaments = [];
let tournamentActiveIndex = -1;
let tournamentQuery = "";
let calendar = null;
let calendarFailed = false;
let tournaments = [];
let selectedPlayer = null;
let players = [];
let playerNameIndex = { by_wta_id: {}, by_name: {} };
let snapshotDate = "";
let activeIndex = -1;
let visiblePlayers = [];

const TOURNAMENT_NAME_OVERRIDES = {
  "WTA 500 Perth + Sydney": "United Cup",
  "Grand Slam Melbourne": "Open d'Australie",
  "Grand Slam Paris": "Roland Garros",
  "Grand Slam Wimbledon": "Wimbledon",
  "Grand Slam Flushing Meadows": "US Open",
  "Grand Slam New York": "US Open",
  "Finals Indian Wells": "WTA Finals",
  "WTA Finals Indian Wells": "WTA Finals",
  "Parma": "Parme",
  "Modena": "Modène",
  "Manila": "Manille",
  "London": "Queen's",
  "Athens": "Athènes",
  "Warsaw": "Varsovie",
  "Philadelphia": "Philadelphie",
  "Valencia": "Valence",
  "Singapore": "Singapour",
  "Beijing": "Pékin",
  "Lisbon": "Lisbonne",
  "Mallorca": "Majorque",
  "Palermo": "Palerme",
  "Hamburg": "Hambourg",
  "'s-Hertogenbosch": "Bois-le-duc"
};

const photoByName = new Map([
  ["alina charaeva", "assets/players/alina-charaeva.jpg"],
  ["leylah fernandez", "assets/players/leylah-fernandez.png"],
  ["elsa jacquemot", "assets/players/elsa-jacquemot.png"],
  ["diana shnaider", "assets/players/diana-shnaider.png"]
]);
const PLAYER_PHOTOS_API = ["localhost", "127.0.0.1", "[::1]"].includes(window.location?.hostname)
  ? "" : "https://tennis-wta-api.schiter-tomas.workers.dev";
let drivePhotos = new Map();
let photosLastRefresh = 0;
let photosUpdating = false;
const portraitPlayers = new WeakMap();

function photoNameKey(name) {
  return normalize(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function refreshPlayerPhotos() {
  if (photosUpdating || Date.now() - photosLastRefresh < 300000) return;
  photosUpdating = true;
  try {
    const response = await fetch(PLAYER_PHOTOS_API + "/photos", { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Player photo library unavailable");
    const data = await response.json();
    if (!Array.isArray(data.photos)) throw new Error("Invalid player photo library");
    const next = new Map();
    for (const photo of data.photos) {
      if (typeof photo.name !== "string" || !/\.(png|jpe?g|webp)$/i.test(photo.name) ||
          typeof photo.path !== "string" || !/^\/photos\/[A-Za-z0-9_-]+\?v=[A-Za-z0-9%_.:-]+$/.test(photo.path)) {
        throw new Error("Invalid player photo entry");
      }
      const key = photoNameKey(photo.name.replace(/\.[^.]+$/, ""));
      if (!next.has(key)) next.set(key, PLAYER_PHOTOS_API + photo.path);
    }
    drivePhotos = next;
    photosLastRefresh = Date.now();
    card.querySelectorAll("img[data-player-portrait]").forEach(image => {
      const binding = portraitPlayers.get(image);
      if (binding) setPlayerPortrait(image, binding.initials, binding.player, binding.override);
    });
  } catch {
    console.warn("Drive player photos are unavailable; keeping the existing portraits.");
  } finally {
    photosUpdating = false;
  }
}

function setPlayerPortrait(image, initials, player, override) {
  portraitPlayers.get(image)?.loaded();
  let loaded;
  const ready = new Promise(resolve => { loaded = resolve; });
  portraitPlayers.set(image, { initials, player, override, ready, loaded });
  image.dataset.playerPortrait = String(player.id || "");
  const photo = override || savedPlayerPhoto(player);
  const show = visible => {
    image.hidden = !visible;
    image.style.display = visible ? "block" : "none";
    initials.hidden = visible;
    initials.style.display = visible ? "none" : "flex";
  };
  initials.textContent = initials.dataset?.photoPlaceholder
    || playerDisplayName(player).split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  image.crossOrigin = "anonymous";
  image.onload = loaded;
  image.onerror = () => {
    const fallback = bundledPlayerPhoto(player);
    if (!override && photo?.startsWith(PLAYER_PHOTOS_API + "/photos/") && fallback && image.getAttribute("src") !== fallback) {
      image.src = fallback;
      return;
    }
    image.onerror = null;
    image.removeAttribute("src");
    show(false);
    loaded();
  };
  show(!!photo);
  image.alt = photo ? playerDisplayName(player) + " portrait" : "";
  if (photo) {
    if (image.getAttribute("src") !== photo) image.src = photo;
    if (image.complete && image.naturalWidth) loaded();
  } else {
    image.removeAttribute("src");
    loaded();
  }
}

refreshPlayerPhotos();
window.addEventListener("focus", refreshPlayerPhotos);
setInterval(refreshPlayerPhotos, 300000);

function playerForm(player) {
  if (!manualForms.has(player.id)) manualForms.set(player.id, { results: Array(10).fill(""), edited: new Set() });
  return manualForms.get(player.id);
}

function cyclePlayerForm(player, index) {
  const form = playerForm(player), states = ["", "win", "loss"];
  form.results[index] = states[(states.indexOf(form.results[index]) + 1) % states.length];
  form.edited.add(index);
}

function refreshVisiblePlayerForms(player) {
  if (selectedPlayer?.id === player.id && cardType.value === "form") renderPlayerForm(selectedPlayer);
  document.querySelectorAll(".draw-player-card").forEach(root => {
    if (root.dataset.playerId === player.id) renderPlayerForm(player, root);
  });
  if (document.getElementById("draw-form-dialog").open) renderDrawFormEditor();
}

async function loadPlayerForm(player) {
  if (!/^[1-9]\d*$/.test(String(player.id))) return;
  const form = playerForm(player);
  if (form.loading || Date.now() < (form.nextLoad || 0)) return;
  form.loading = true;
  form.error = "";
  try {
    const { collectPlayerForm } = await import("./wta-live.mjs");
    const results = await collectPlayerForm(player.id);
    results.forEach((result, index) => { if (!form.edited.has(index)) form.results[index] = result; });
    form.nextLoad = Date.now() + 300000;
  } catch (error) {
    form.error = "WTA Form could not be loaded. You can still edit the ten results manually.";
    form.nextLoad = Date.now() + 60000;
    console.warn("Player Form unavailable:", error);
    if (selectedPlayer?.id === player.id && cardType.value === "form") status.textContent = form.error;
  } finally {
    form.loading = false;
    refreshVisiblePlayerForms(player);
  }
}

function renderTourTitleNumber(player, root = cardDesign) {
  const tourTitleNumber = root.querySelector("#tour-title-number");
  const tourTitleOrdinal = root.querySelector("#tour-title-ordinal");
  const number = String(player.tour_title_count);
  tourTitleNumber.textContent = number;
  tourTitleNumber.parentElement.classList.toggle("wide", number.length > 2);
  tourTitleOrdinal.hidden = !player.tour_title_count;
}

const formButtons = Array.from({ length: 10 }, (_, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "form-result";
  button.addEventListener("click", () => {
    if (!selectedPlayer) return;
    cyclePlayerForm(selectedPlayer, index);
    renderPlayerForm(selectedPlayer);
  });
  formResults.append(button);
  return button;
});

function lastTitleLabel(item) {
  const category = tournamentCategoryLabel({ "125K": "WTA 125", "Finals": "WTA Finals" }[item.category] || item.category);
  const title = item.category === "Grand Slam" ? tournamentName(item) : category + " " + tournamentName(item);
  return (title + " " + item.year).toLocaleUpperCase();
}

function fitLastTitleText() { fitLastTitleValue(lastTitleValue); }

function fitPlayerName(name, available, maximumFontSize = "") {
  name.style.fontSize = maximumFontSize;
  name.style.transform = "none";
  name.style.removeProperty("width");
  if (available <= 0) return 0;
  const style = getComputedStyle(name);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = style.font;
  const width = measure.measureText(name.textContent).width;
  const padding = Math.max(4, parseFloat(style.webkitTextStrokeWidth) || 0);
  const scale = width ? Math.min(1, Math.max(0, available - padding) / width) : 1;
  name.style.fontSize = parseFloat(style.fontSize) * scale + "px";
  return Math.min(width + padding, available);
}

function fitCardPlayerNames(root = cardDesign) {
  root.querySelectorAll(".card-name").forEach(name => {
    fitPlayerName(name, name.clientWidth, Math.min(10.2, 140 / Math.max(1, name.textContent.length)) + "cqw");
  });
}

function fitTournamentName(name, fontSize) {
  name.dataset.tournamentFontSize = fontSize;
  name.style.fontSize = fontSize;
  name.style.removeProperty("--tournament-name-scale");
  const boxStyle = getComputedStyle(name.parentElement);
  const available = name.parentElement.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight);
  if (available <= 0) return;
  const measure = document.createElement("canvas").getContext("2d");
  const style = getComputedStyle(name);
  measure.font = style.font;
  const width = measure.measureText(name.textContent || name.dataset.placeholder || "TOURNAMENT").width + 2;
  name.style.width = available + "px";
  name.style.fontSize = parseFloat(style.fontSize) * Math.min(1, available / width) + "px";
}

function fitTournamentHeadings() {
  document.querySelectorAll(".title-event strong, .result-event strong, .draw-event strong, .manual-draw-round-text strong").forEach(name => {
    if (name.getClientRects().length) {
      fitTournamentName(name, name.dataset.tournamentFontSize || name.style.fontSize || getComputedStyle(name).fontSize);
    }
  });
}

function fitLastTitleValue(value) {
  const available = value.parentElement.clientWidth;
  if (!available) return;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = getComputedStyle(value).font;
  const text = value.textContent;
  const width = Math.max(available, measure.measureText(text).width + 2);
  value.style.width = width + "px";
  value.style.transform = width > available ? "scaleX(" + available / width + ")" : "none";
}

new ResizeObserver(fitLastTitleText).observe(lastTitleValue.parentElement);
document.fonts.ready.then(() => { fitLastTitleText(); fitCardPlayerNames(); });

function renderPlayerForm(player, root = cardDesign) {
  const form = playerForm(player);
  const content = root.querySelector(".card-content");
  const group = content.querySelector(".card-form");
  group.setAttribute("aria-busy", String(Boolean(form.loading)));
  group.title = form.error || (form.loading ? "Loading the last ten singles results from WTA…" : "Last ten singles results, oldest to newest. Click to edit.");
  [...content.querySelectorAll(".form-result")].forEach((button, index) => {
    const result = form.results[index];
    const label = result === "win" ? "win" : result === "loss" ? "loss" : "not set";
    button.dataset.result = result;
    button.textContent = result === "win" ? "V" : result === "loss" ? "d" : "\u00b7";
    button.setAttribute("aria-label", "Match " + (index + 1) + ": " + label + ". Click to cycle blank, win, loss.");
    button.title = "Match " + (index + 1) + ": " + label + " (click: blank > win > loss)";
  });
  const value = root.querySelector("#last-title-value");
  value.textContent = player.latest_title ? lastTitleLabel(player.latest_title) : "W/O";
  fitLastTitleValue(value);
}


function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value) {
  return stripAccents(value).toLocaleLowerCase();
}

function playerDisplayName(player) {
  const name = player.name_override ? player.name
    : playerNameIndex.by_wta_id[String(player.id)] || player.display_name
      || playerNameIndex.by_name[normalize(player.name || "")] || player.name || "";
  return stripAccents(name);
}

function playerMatchesSearch(player, query) {
  return [player.name, playerDisplayName(player), ...(player.aliases || [])].some(name => normalize(name).includes(query));
}

function savedPlayerPhoto(player) {
  const byId = drivePhotos.get(String(player.id));
  if (byId) return byId;
  const names = [player.name, playerDisplayName(player), ...(player.aliases || [])];
  // This is the abbreviated filename already used in the shared photo collection.
  if (names.some(name => photoNameKey(name) === "jessica bouzas maneiro")) names.push("Jessica Bouzas");
  return names.map(name => drivePhotos.get(photoNameKey(name))).find(Boolean) || bundledPlayerPhoto(player);
}

function bundledPlayerPhoto(player) {
  return [player.name, playerDisplayName(player), ...(player.aliases || [])]
    .map(name => photoByName.get(normalize(name))).find(Boolean);
}

function getAge(dob, asOf) {
  if (!dob) return "—";
  const birth = new Date(dob + "T00:00:00Z");
  const date = new Date(asOf + "T00:00:00Z");
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function tierForRank(rank, age) {
  if (!Number.isFinite(rank)) return Number.isFinite(age) && age >= 0 && age <= 19 ? "prospect" : "top_300";
  if (rank === 1) return "top_1";
  if (rank <= 10) return "top_10";
  if (Number.isFinite(age) && age >= 0 && age <= 19) return "prospect";
  if (rank <= 20) return "top_20";
  if (rank <= 100) return "top_100";
  if (rank <= 200) return "top_200";
  if (rank <= 300) return "top_300";
  if (rank <= 400) return "top_400";
  if (rank <= 500) return "top_500";
  if (rank <= 600) return "top_600";
  return "top_300";
}

function tournamentStyle(item) {
  const level = normalize(item.level || "").replace(/[\s_-]/g, "");
  const name = normalize(item.name || "").replace(/[\s_-]/g, "");
  const isSlam = /grandslam/.test(level) || /australianopen|rolandgarros|wimbledon|usopen/.test(name);
  if (isSlam && /junior/.test(level + name)) return { label: "Grand Slam Juniors", color: "#ff66c4" };
  if (/bjkc|billiejeankingcup|fedcup/.test(name + level)) return { label: "BJKC", color: "#2e0046" };
  if (isSlam) return { label: "Grand Slam", color: "#2e0046" };
  if (/finals/.test(level + name)) return { label: "WTA Finals", color: "#2e0046" };
  if (level === "wta1000" || level === "1000") return { label: "WTA 1000", color: "#bb8914" };
  if (level === "wta500" || level === "500") return { label: "WTA 500", color: "#699694" };
  if (level === "wta250" || level === "250") return { label: "WTA 250", color: "#7b52b5" };
  if (level === "wta125" || item.column === "wta_125") return { label: "WTA 125", color: "#7ed957" };
  return null;
}

function yearTournaments(data, year = new Date().getFullYear()) {
  const required = ["column", "name", "level", "startDate"];
  if (!Array.isArray(data.fields) || !data.weeks || required.some(field => !data.fields.includes(field))) {
    throw new Error("Calendar data is missing required fields.");
  }
  const found = new Map();
  for (const rows of Object.values(data.weeks)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const item = Object.fromEntries(data.fields.map((field, index) => [field, row[index]]));
      if (!Number.isFinite(Date.parse(item.startDate))) continue;
      if (Number(item.year || item.startDate.slice(0, 4)) !== year) continue;
      if (String(item.calendarKey || "").includes("|qualifying")) continue;
      const style = tournamentStyle(item);
      if (!style) continue;
      const id = String(item.calendarKey || [item.column, item.name, item.startDate].join("|"));
      found.set(id, { ...item, category: style.label, color: style.color, id });
    }
  }
  return [...found.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}

function tournamentName(item) {
  const category = item.category || item.level;
  const city = item.city || item.name.replace(/^WTA\s*125\s*/i, "");
  const cityKey = normalize(city).replace(/[\s'-]/g, "");
  const lookup = normalize(category || "").replace(/\s/g, "") + cityKey;
  const override = Object.entries(TOURNAMENT_NAME_OVERRIDES).find(([key]) =>
    [lookup, cityKey].includes(normalize(key).replace(/[\s'-]/g, "")));
  const name = override ? override[1] : city;
  if (category !== "WTA 125") return name;
  const date = item.startDate || item.start_date;
  const year = String(item.year || date?.slice(0, 4) || "");
  const editions = tournaments.filter(event => event.category === category && normalize(event.city || "") === normalize(city)
    && (!year || String(event.year || event.startDate.slice(0, 4)) === year));
  const id = String(item.tournamentId || item.wta_id || item.id || "").replace(/^wta:/, "").split(":")[0];
  const index = editions.findIndex(event => (item.id && event.id === item.id)
    || (id && String(event.tournamentId) === id) || (date && event.startDate === date));
  return editions.length > 1 && index >= 0 ? name + " " + (index + 1) : name;
}

function tournamentCategoryLabel(category) {
  return category.replace("Grand Slam", "Grand Chelem");
}

function tournamentLabel(item) {
  return tournamentName(item) + " (" + tournamentCategoryLabel(item.category) + ")";
}

function titleTournaments() {
  if (cardType.value === "wta-125") return tournaments.filter(item => item.category === "WTA 125");
  if (cardType.value === "wta-tour") {
    return tournaments.filter(item => ["WTA 250", "WTA 500", "WTA 1000", "WTA Finals", "Grand Slam"].includes(item.category));
  }
  return [];
}

function closeTournamentOptions() {
  tournamentOptions.classList.remove("open");
  tournamentOptions.replaceChildren();
  tournamentInput.setAttribute("aria-expanded", "false");
  tournamentInput.removeAttribute("aria-activedescendant");
  visibleTournaments = [];
  tournamentActiveIndex = -1;
}

function selectTournament(item) {
  if (!titleTournaments().some(tournament => tournament.id === item.id)) return;
  selectedTournamentId = item.id;
  tournamentInput.value = tournamentLabel(item);
  closeTournamentOptions();
  tournamentStatus.textContent = "Selected " + tournamentLabel(item);
  if (selectedPlayer) renderCard(selectedPlayer);
}

function showTournamentOptions(query) {
  tournamentQuery = query;
  const needle = normalize(query.trim());
  visibleTournaments = titleTournaments().filter(item => normalize(
    [tournamentName(item), item.city, item.name, item.category, tournamentCategoryLabel(item.category),
      item.country, item.startDate].join(" ")
  ).includes(needle));
  tournamentActiveIndex = -1;
  tournamentInput.removeAttribute("aria-activedescendant");
  tournamentOptions.replaceChildren();
  for (const [index, item] of visibleTournaments.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion tournament-suggestion";
    button.id = "tournament-option-" + index;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    const name = document.createElement("span");
    name.textContent = tournamentLabel(item);
    const detail = document.createElement("span");
    detail.className = "tournament-meta";
    detail.textContent = item.startDate + " - " + item.country;
    button.append(name, detail);
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => selectTournament(item));
    tournamentOptions.append(button);
  }
  if (!visibleTournaments.length) {
    const empty = document.createElement("div");
    empty.className = "tournament-empty";
    empty.textContent = "No matching tournaments.";
    tournamentOptions.append(empty);
  }
  tournamentOptions.classList.add("open");
  tournamentInput.setAttribute("aria-expanded", "true");
  tournamentStatus.textContent = visibleTournaments.length + " matching tournaments.";
}

function updateTournamentSearch() {
  tournaments = calendar ? yearTournaments(calendar) : [];
  tournamentWrap.hidden = !["wta-125", "wta-tour"].includes(cardType.value);
  if (tournamentWrap.hidden) {
    closeTournamentOptions();
    return;
  }
  const available = titleTournaments();
  const open = tournamentOptions.classList.contains("open");
  const editing = document.activeElement === tournamentInput;
  tournamentInput.disabled = !available.length;
  tournamentInput.placeholder = !calendar
    ? calendarFailed ? "Calendar unavailable" : "Loading tournaments..."
    : available.length ? "Search " + new Date().getFullYear() + " tournaments" : "No tournaments for this card type";
  if (!available.some(item => item.id === selectedTournamentId)) selectedTournamentId = "";
  if (!editing) {
    const selected = available.find(item => item.id === selectedTournamentId);
    tournamentInput.value = selected ? tournamentLabel(selected) : "";
  }
  if (open && editing && available.length) showTournamentOptions(tournamentQuery);
  else closeTournamentOptions();
}

function showOptions(query) {
  const needle = normalize(query.trim());
  activeIndex = -1;
  const matches = needle
    ? players.filter(player => playerMatchesSearch(player, needle))
    : players;
  visiblePlayers = matches.slice(0, 8);
  options.replaceChildren();
  visiblePlayers.forEach((player, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.id = "player-option-" + index;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.innerHTML = '<span class="suggestion-name"></span>';
    button.querySelector(".suggestion-name").textContent = playerDisplayName(player);
    button.addEventListener("click", () => selectPlayer(player));
    options.append(button);
  });
  options.classList.toggle("open", visiblePlayers.length > 0);
  searchInput.setAttribute("aria-expanded", String(visiblePlayers.length > 0));
  status.textContent = matches.length ? (matches.length > 8 ? "Showing 8 of " + matches.length + " matches · use more letters to narrow" : matches.length + (matches.length === 1 ? " match" : " matches")) : "No ranked player matches that name.";
}

function selectPlayer(player) {
  selectedPlayer = player;
  searchInput.value = playerDisplayName(player);
  options.classList.remove("open");
  searchInput.setAttribute("aria-expanded", "false");
  options.replaceChildren();
  status.textContent = "Selected " + (player.rank ?? "NR") + " · " + player.country;
  renderCard(player);
}

function renderCard(player) {
  if (cardType.value === "schedule") return renderScheduleCard();
  if (isDrawCard()) return renderDrawCard();
  if (isResultCard()) return renderResultCard();
  document.querySelector(".card-content").hidden = false;
  document.getElementById("result-card-content").hidden = true;
  document.getElementById("draw-card-content").hidden = true;
  renderPlayerArtwork(cardDesign, player, cardType.value);
  card.hidden = false;
  scaleCardDesign();
  fitCardPlayerNames();
  fitTournamentHeadings();
}

function renderPlayerArtwork(root, player, type = "form") {
  const node = id => root.querySelector("#" + id);
  const name = playerDisplayName(player).toLocaleUpperCase();
  const age = getAge(player.dob, snapshotDate);
  const frame = root === cardDesign ? card : root;
  frame.dataset.type = type;
  const titleDetails = node("card-title-details");
  titleDetails.hidden = type === "form";
  if (type === "form") titleDetails.removeAttribute("src");
  else titleDetails.src = "assets/details/" + (type === "wta-tour" ? "wtatour" : "wta125") + "_title_details.png";
  const tournament = titleTournaments().find(item => item.id === selectedTournamentId);
  const eventName = tournament ? tournamentName(tournament).toLocaleUpperCase() : "\u2014";
  const eventHeading = node("card-event-name");
  eventHeading.textContent = eventName;
  eventHeading.style.fontSize = "8.3cqw";
  const eventBox = root.querySelector(".title-event");
  eventBox.style.backgroundColor = tournament ? tournament.color : type === "wta-125" ? "#7ed957" : "#699694";
  const category = tournament ? tournament.category : type === "wta-125" ? "WTA 125" : "WTA TOUR";
  eventBox.style.width = Math.max(18, Math.min(48, eventName.length * 2.9 + 3), Math.min(48, category.length * 1.35 + 3)) + "%";
  node("card-event-category").textContent = tournament
    ? tournamentCategoryLabel(tournament.category).toLocaleUpperCase()
    : type === "wta-125" ? "WTA 125" : "WTA TOUR";
  node("card-age").textContent = age + " ANS";
  node("card-country").textContent = player.country ? player.country + "." : "—";
  const flag = node("card-flag");
  // Flag filenames use the three-letter country codes from the rankings CSV.
  flag.hidden = !player.country;
  if (player.country) flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg";
  else flag.removeAttribute("src");
  flag.alt = player.country + " flag";
  node("card-rank").parentElement.style.fontSize = String(player.rank).length > 3 ? "9cqw" : "12cqw";
  node("card-rank-ordinal").textContent = player.rank == null ? "" : player.rank === 1 ? "er" : "\u00e8me";
  node("card-rank-ordinal").hidden = player.rank == null;
  const tier = tierForRank(player.rank, age);
  frame.dataset.tier = tier;
  node("card-base").src = "assets/cards/" + tier + "_card.png";
  const detailsTier = ["top_400", "top_500", "top_600"].includes(tier) ? "top_200" : tier;
  node("card-details").src = "assets/details/" + detailsTier + "_details.png";
  const baseBadge = node("card-base-badge");
  if (tier === "top_10") baseBadge.src = "assets/cards/" + tier + "_card.png";
  else baseBadge.removeAttribute("src");
  node("card-name").textContent = name;
  node("card-rank").textContent = String(player.rank ?? "NR");
  const atCareerBest = Number.isFinite(player.rank) && player.rank === player.best_rank;
  const careerLabel = node("career-best-label");
  careerLabel.hidden = !atCareerBest;
  careerLabel.textContent = "MEILLEUR CLASSEMENT\nEN CARRI\u00c8RE";
  const bestRankLabel = node("best-rank-label");
  bestRankLabel.hidden = atCareerBest;
  const bestRankDigits = String(player.best_rank).length;
  bestRankLabel.classList.toggle("long-rank", bestRankDigits > 2);
  bestRankLabel.classList.toggle("three-digit-rank", bestRankDigits === 3);
  node("best-rank-value").textContent = player.best_rank ?? "—";
  node("best-rank-year").textContent = player.best_rank_year ? "EN " + player.best_rank_year : "";

  const image = node("card-photo");
  const initials = node("card-initials");
  setPlayerPortrait(image, initials, player);
  node("svg-title").textContent = cardType.selectedOptions[0].textContent + " - " + name + " \u00b7 WTA #" + (player.rank ?? "NR");
  node("svg-description").textContent = name + ", WTA singles rank " + (player.rank ?? "NR") + ", " + player.country + ", " + age + " years old.";
  if (type === "form") loadPlayerForm(player);
  renderPlayerForm(player, root);
  renderTourTitleNumber(player, root);
}

function moveActive(direction) {
  if (!visiblePlayers.length) return;
  activeIndex = (activeIndex + direction + visiblePlayers.length) % visiblePlayers.length;
  [...options.querySelectorAll("[role=option]")].forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
  searchInput.setAttribute("aria-activedescendant", "player-option-" + activeIndex);
}

cardType.addEventListener("change", () => {
  updateBackgroundControls();
  const playerSearchWrap = document.getElementById("player-search-wrap");
  const noPlayerSearch = isResultCard() || isDrawCard() || cardType.value === "schedule";
  playerSearchWrap.style.visibility = noPlayerSearch ? "hidden" : "";
  playerSearchWrap.inert = noPlayerSearch;
  updateTournamentSearch();
  if (selectedPlayer) renderCard(selectedPlayer);
  else if (!isResultCard()) card.hidden = true;
  if (["wta-125", "wta-tour", "schedule"].includes(cardType.value)) refreshCalendar();
});

window.addEventListener("focus", () => {
  if (["wta-125", "wta-tour", "schedule"].includes(cardType.value)) refreshCalendar();
});

tournamentInput.addEventListener("focus", () => {
  tournamentInput.select();
  showTournamentOptions("");
});
tournamentInput.addEventListener("input", () => showTournamentOptions(tournamentInput.value));
tournamentInput.addEventListener("blur", () => {
  closeTournamentOptions();
  const selected = titleTournaments().find(item => item.id === selectedTournamentId);
  tournamentInput.value = selected ? tournamentLabel(selected) : "";
});
tournamentInput.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!tournamentOptions.classList.contains("open")) showTournamentOptions(tournamentInput.value);
    if (!visibleTournaments.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    tournamentActiveIndex = tournamentActiveIndex < 0
      ? direction > 0 ? 0 : visibleTournaments.length - 1
      : (tournamentActiveIndex + direction + visibleTournaments.length) % visibleTournaments.length;
    [...tournamentOptions.querySelectorAll("[role=option]")].forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === tournamentActiveIndex));
      if (index === tournamentActiveIndex) option.scrollIntoView({ block: "nearest" });
    });
    tournamentInput.setAttribute("aria-activedescendant", "tournament-option-" + tournamentActiveIndex);
  } else if (event.key === "Enter" && tournamentOptions.classList.contains("open") && visibleTournaments.length) {
    event.preventDefault();
    selectTournament(visibleTournaments[Math.max(0, tournamentActiveIndex)]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTournamentOptions();
    const selected = titleTournaments().find(item => item.id === selectedTournamentId);
    tournamentInput.value = selected ? tournamentLabel(selected) : "";
  }
});

searchInput.addEventListener("input", () => showOptions(searchInput.value));
searchInput.addEventListener("focus", () => showOptions(searchInput.value));
searchInput.addEventListener("keydown", event => {
  if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
  else if (event.key === "Enter" && visiblePlayers.length) { event.preventDefault(); selectPlayer(visiblePlayers[activeIndex < 0 ? 0 : activeIndex]); }
  else if (event.key === "Escape") { options.classList.remove("open"); searchInput.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("click", event => {
  if (!event.target.closest("#tournament-search-wrap")) closeTournamentOptions();
  if (!event.target.closest("#player-search-wrap")) { options.classList.remove("open"); searchInput.setAttribute("aria-expanded", "false"); }
});

fetch("data/players.json", { cache: "no-store" })
  .then(response => { if (!response.ok) throw new Error("Player data could not be loaded"); return response.json(); })
  .then(data => {
    players = data.players;
    playerNameIndex = data.player_names || { by_wta_id: {}, by_name: {} };
    snapshotDate = data.snapshot_date;
    status.textContent = "Player list loaded.";
    if (!card.hidden) renderCard(selectedPlayer);
  })
  .catch(error => {
    status.textContent = error.message;
  });

function refreshCalendar() {
  return fetch("data/calendar_snapshot.json", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error("Calendar data could not be loaded");
      return response.json();
    })
    .then(data => {
      yearTournaments(data);
      const changed = calendarFailed || JSON.stringify(data) !== JSON.stringify(calendar);
      calendar = data;
      calendarFailed = false;
      if (!changed) return;
      updateTournamentSearch();
      if (selectedPlayer) renderCard(selectedPlayer);
      else if (cardType.value === "schedule") renderScheduleCard();
    })
    .catch(error => {
      calendarFailed = true;
      calendar = null;
      updateTournamentSearch();
      status.textContent = error.message;
    });
}

refreshCalendar();

function createRefreshCooldown(buttonId) {
  const button = document.getElementById(buttonId);
  const key = "haute-cadence:" + buttonId + ":next-refresh";
  let until = 0, pending = false, manual = false;

  function read() {
    try {
      const stored = Number(localStorage.getItem(key));
      until = Number.isFinite(stored) ? stored : 0;
    } catch {
      // Keep the countdown in memory when browser storage is unavailable.
    }
  }

  function save(value) {
    until = value;
    try { localStorage.setItem(key, String(value)); } catch { /* In-memory cooldown still applies. */ }
  }

  function update() {
    const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    button.disabled = pending || seconds > 0;
    button.textContent = seconds && !pending
      ? `Refresh (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")})` : "Refresh";
  }

  read();
  update();
  setInterval(update, 1000);
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) { read(); update(); }
  });

  return {
    begin(force) {
      read();
      if (pending || (force && until > Date.now())) { update(); return false; }
      pending = true;
      manual = force;
      if (manual) save(Date.now() + 120000);
      update();
      return true;
    },
    finish(success) {
      if (manual) save(success ? Date.now() + 120000 : 0);
      pending = false;
      update();
    },
  };
}
