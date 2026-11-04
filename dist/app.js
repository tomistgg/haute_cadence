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
let snapshotDate = "";
let activeIndex = -1;
let visiblePlayers = [];

const TOURNAMENT_NAME_OVERRIDES = {
  "WTA 500 Perth + Sydney": "United Cup",
  "Grand Slam Melbourne": "Australian Open",
  "Grand Slam Paris": "Roland Garros",
  "Grand Slam Wimbledon": "Wimbledon",
  "Grand Slam Flushing Meadows": "US Open",
  "Grand Slam New York": "US Open"
};

const photoByName = new Map([
  ["alina charaeva", "assets/players/alina-charaeva.jpg"],
  ["leylah fernandez", "assets/players/leylah-fernandez.png"],
  ["elsa jacquemot", "assets/players/elsa-jacquemot.png"],
  ["diana shnaider", "assets/players/diana-shnaider.png"]
]);

function playerForm(player) {
  if (!manualForms.has(player.id)) manualForms.set(player.id, { results: Array(10).fill("") });
  return manualForms.get(player.id);
}

function renderTourTitleNumber(player) {
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
    const form = playerForm(selectedPlayer);
    const states = ["", "win", "loss"];
    form.results[index] = states[(states.indexOf(form.results[index]) + 1) % states.length];
    renderPlayerForm(selectedPlayer);
  });
  formResults.append(button);
  return button;
});

function lastTitleLabel(item) {
  const category = { "125K": "WTA 125", "Finals": "WTA Finals" }[item.category] || item.category;
  const title = item.category === "Grand Slam" ? tournamentName(item) : category + " " + tournamentName(item);
  return (title + " " + item.year).toLocaleUpperCase();
}

function fitLastTitleText() {
  const available = lastTitleValue.parentElement.clientWidth;
  if (!available) return;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = getComputedStyle(lastTitleValue).font;
  const text = lastTitleValue.textContent;
  const width = Math.max(available, measure.measureText(text).width + 2);
  lastTitleValue.style.width = width + "px";
  lastTitleValue.style.transform = width > available ? "scaleX(" + available / width + ")" : "none";
}

new ResizeObserver(fitLastTitleText).observe(lastTitleValue.parentElement);
document.fonts.ready.then(fitLastTitleText);

function renderPlayerForm(player) {
  const form = playerForm(player);
  formButtons.forEach((button, index) => {
    const result = form.results[index];
    const label = result === "win" ? "win" : result === "loss" ? "loss" : "not set";
    button.dataset.result = result;
    button.textContent = result === "win" ? "V" : result === "loss" ? "d" : "\u00b7";
    button.setAttribute("aria-label", "Match " + (index + 1) + ": " + label + ". Click to cycle blank, win, loss.");
    button.title = "Match " + (index + 1) + ": " + label + " (click: blank > win > loss)";
  });
  lastTitleValue.textContent = player.latest_title ? lastTitleLabel(player.latest_title) : "W/O";
  fitLastTitleText();
}


function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
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
  const lookup = normalize((item.category || item.level) + " " + (item.city || "")).replace(/\s/g, "");
  const override = Object.entries(TOURNAMENT_NAME_OVERRIDES).find(([key]) => normalize(key).replace(/\s/g, "") === lookup);
  return override ? override[1] : item.city || item.name.replace(/^WTA\s*125\s*/i, "");
}

function tournamentLabel(item) {
  return tournamentName(item) + " (" + item.category + ")";
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
    [tournamentName(item), item.city, item.name, item.category, item.country, item.startDate].join(" ")
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
  tournamentWrap.hidden = cardType.value === "form";
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
    ? players.filter(player => normalize(player.name).includes(needle))
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
    button.querySelector(".suggestion-name").textContent = player.name;
    button.addEventListener("click", () => selectPlayer(player));
    options.append(button);
  });
  options.classList.toggle("open", visiblePlayers.length > 0);
  searchInput.setAttribute("aria-expanded", String(visiblePlayers.length > 0));
  status.textContent = matches.length ? (matches.length > 8 ? "Showing 8 of " + matches.length + " matches · use more letters to narrow" : matches.length + (matches.length === 1 ? " match" : " matches")) : "No ranked player matches that name.";
}

function selectPlayer(player) {
  selectedPlayer = player;
  searchInput.value = player.name;
  options.classList.remove("open");
  searchInput.setAttribute("aria-expanded", "false");
  options.replaceChildren();
  status.textContent = "Selected #" + player.rank + " · " + player.country;
  renderCard(player);
}

function renderCard(player) {
  const name = player.name.toLocaleUpperCase();
  const age = getAge(player.dob, snapshotDate);
  const type = cardType.value;
  card.dataset.type = type;
  const titleDetails = document.getElementById("card-title-details");
  titleDetails.hidden = type === "form";
  if (type === "form") titleDetails.removeAttribute("src");
  else titleDetails.src = "assets/details/" + (type === "wta-tour" ? "wtatour" : "wta125") + "_title_details.png";
  const tournament = titleTournaments().find(item => item.id === selectedTournamentId);
  const eventName = tournament ? tournamentName(tournament).toLocaleUpperCase() : "\u2014";
  const eventHeading = document.getElementById("card-event-name");
  eventHeading.textContent = eventName;
  eventHeading.style.fontSize = Math.min(7.7, 110 / eventName.length) + "cqw";
  const eventBox = document.querySelector(".title-event");
  eventBox.style.backgroundColor = tournament ? tournament.color : type === "wta-125" ? "#7ed957" : "#699694";
  const category = tournament ? tournament.category : type === "wta-125" ? "WTA 125" : "WTA TOUR";
  eventBox.style.width = Math.max(18, Math.min(48, eventName.length * 2.9 + 3), Math.min(48, category.length * 1.35 + 3)) + "%";
  document.getElementById("card-event-category").textContent = tournament
    ? tournament.category.toLocaleUpperCase()
    : type === "wta-125" ? "WTA 125" : "WTA TOUR";
  document.getElementById("card-age").textContent = age + " ANS";
  document.getElementById("card-country").textContent = player.country + ".";
  const flag = document.getElementById("card-flag");
  // Flag filenames use the three-letter country codes from the rankings CSV.
  flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg";
  flag.alt = player.country + " flag";
  document.getElementById("card-name").style.fontSize = Math.min(10.2, 140 / name.length) + "cqw";
  document.getElementById("card-rank").parentElement.style.fontSize = String(player.rank).length > 3 ? "9cqw" : "12cqw";
  document.getElementById("card-rank-ordinal").textContent = player.rank === 1 ? "er" : "\u00e8me";
  const tier = tierForRank(player.rank, age);
  card.dataset.tier = tier;
  document.getElementById("card-base").src = "assets/cards/" + tier + "_card.png";
  const detailsTier = ["top_400", "top_500", "top_600"].includes(tier) ? "top_200" : tier;
  document.getElementById("card-details").src = "assets/details/" + detailsTier + "_details.png";
  const baseBadge = document.getElementById("card-base-badge");
  if (tier === "top_10" || tier === "prospect") baseBadge.src = "assets/cards/" + tier + "_card.png";
  else baseBadge.removeAttribute("src");
  document.getElementById("card-name").textContent = name;
  document.getElementById("card-rank").textContent = String(player.rank);
  const atCareerBest = player.rank === player.best_rank;
  const careerLabel = document.getElementById("career-best-label");
  careerLabel.hidden = !atCareerBest;
  careerLabel.textContent = "MEILLEUR CLASSEMENT\nEN CARRI\u00c8RE";
  const bestRankLabel = document.getElementById("best-rank-label");
  bestRankLabel.hidden = atCareerBest;
  const bestRankDigits = String(player.best_rank).length;
  bestRankLabel.classList.toggle("long-rank", bestRankDigits > 2);
  bestRankLabel.classList.toggle("three-digit-rank", bestRankDigits === 3);
  document.getElementById("best-rank-value").textContent = player.best_rank;
  document.getElementById("best-rank-year").textContent = "EN " + player.best_rank_year;

  const image = document.getElementById("card-photo");
  const initials = document.getElementById("card-initials");
  const photoPath = photoByName.get(normalize(player.name));
  if (photoPath) {
    image.src = photoPath;
    image.alt = name + " portrait";
    image.style.display = "block";
    initials.style.display = "none";
  } else {
    image.removeAttribute("src");
    image.alt = "";
    image.style.display = "none";
    initials.textContent = player.name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
    initials.style.display = "flex";
  }
  document.getElementById("svg-title").textContent = cardType.selectedOptions[0].textContent + " - " + name + " \u00b7 WTA #" + player.rank;
  document.getElementById("svg-description").textContent = name + ", WTA singles rank " + player.rank + ", " + player.country + ", " + age + " years old.";
  renderPlayerForm(player);
  renderTourTitleNumber(player);
  card.removeAttribute("hidden");
  scaleCardDesign();
}

function moveActive(direction) {
  if (!visiblePlayers.length) return;
  activeIndex = (activeIndex + direction + visiblePlayers.length) % visiblePlayers.length;
  [...options.querySelectorAll("[role=option]")].forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
  searchInput.setAttribute("aria-activedescendant", "player-option-" + activeIndex);
}

cardType.addEventListener("change", () => {
  updateTournamentSearch();
  if (selectedPlayer) renderCard(selectedPlayer);
  if (cardType.value !== "form") refreshCalendar();
});

window.addEventListener("focus", () => {
  if (cardType.value !== "form") refreshCalendar();
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
    snapshotDate = data.snapshot_date;
    status.textContent = "Player list loaded.";
    const example = players.find(player => normalize(player.name) === "alina charaeva");
    if (example) selectPlayer(example);
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
      calendar = data;
      calendarFailed = false;
      updateTournamentSearch();
      if (selectedPlayer) renderCard(selectedPlayer);
    })
    .catch(error => {
      calendarFailed = true;
      calendar = null;
      updateTournamentSearch();
      status.textContent = error.message;
    });
}

refreshCalendar();
