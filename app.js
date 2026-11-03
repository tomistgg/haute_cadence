"use strict";

const searchInput = document.getElementById("player-search");
const options = document.getElementById("player-options");
const status = document.getElementById("search-status");
const card = document.getElementById("player-card");
const cardType = document.getElementById("card-type");
const tournamentWrap = document.getElementById("tournament-search-wrap");
const tournamentInput = document.getElementById("tournament-search");
const tournamentOptions = document.getElementById("tournament-options");
const tournamentStatus = document.getElementById("tournament-status");
const formResults = document.getElementById("form-results");
const tourTitleNumber = document.getElementById("tour-title-number");
const tourTitleOrdinal = document.getElementById("tour-title-ordinal");
const lastTitleInput = document.getElementById("last-title-search");
const lastTitleOptions = document.getElementById("last-title-options");
const lastTitleStatus = document.getElementById("last-title-status");
let visibleLastTitles = [];
let lastTitleActiveIndex = -1;
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
  "Grand Slam New York": "US Open"
};

const photoByName = new Map([
  ["alina charaeva", "assets/players/alina-charaeva.jpg"],
  ["leylah fernandez", "assets/players/leylah-fernandez.png"],
  ["elsa jacquemot", "assets/players/elsa-jacquemot.png"],
  ["diana shnaider", "assets/players/diana-shnaider.png"]
]);

function playerForm(player) {
  if (!manualForms.has(player.id)) {
    manualForms.set(player.id, { results: Array(10).fill(""), lastTitleId: "", tourTitleNumber: "" });
  }
  return manualForms.get(player.id);
}

function renderTourTitleNumber(player) {
  const number = playerForm(player).tourTitleNumber;
  tourTitleNumber.value = number;
  tourTitleNumber.style.width = Math.max(1, number.length) + "ch";
  tourTitleNumber.parentElement.classList.toggle("wide", number.length > 2);
  tourTitleOrdinal.hidden = !number;
}

tourTitleNumber.addEventListener("input", () => {
  if (!selectedPlayer) return;
  playerForm(selectedPlayer).tourTitleNumber = tourTitleNumber.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3);
  renderTourTitleNumber(selectedPlayer);
});
tourTitleNumber.addEventListener("focus", () => tourTitleNumber.select());

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
  return (item.category + " " + tournamentName(item) + " " + (item.year || item.startDate.slice(0, 4))).toLocaleUpperCase();
}

function closeLastTitleOptions() {
  lastTitleOptions.classList.remove("open");
  lastTitleInput.setAttribute("aria-expanded", "false");
  lastTitleInput.removeAttribute("aria-activedescendant");
}

function selectLastTitle(item) {
  if (!selectedPlayer) return;
  playerForm(selectedPlayer).lastTitleId = item ? item.id : "";
  renderPlayerForm(selectedPlayer);
}

function showLastTitleOptions(query) {
  const needle = normalize(query.trim());
  visibleLastTitles = tournaments.filter(item => normalize(
    [lastTitleLabel(item), item.name, item.city, item.country, item.startDate].join(" ")
  ).includes(needle)).sort((a, b) => tournamentName(a).localeCompare(tournamentName(b)) || a.startDate.localeCompare(b.startDate));
  if (!needle) visibleLastTitles.unshift(null);
  lastTitleActiveIndex = -1;
  lastTitleInput.removeAttribute("aria-activedescendant");
  lastTitleOptions.replaceChildren();
  visibleLastTitles.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion tournament-suggestion";
    button.id = "last-title-option-" + index;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    const name = document.createElement("span");
    name.textContent = item ? lastTitleLabel(item) : "No title";
    button.append(name);
    if (item) {
      const detail = document.createElement("span");
      detail.className = "tournament-meta";
      detail.textContent = item.startDate + " - " + item.country;
      button.append(detail);
    }
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => selectLastTitle(item));
    lastTitleOptions.append(button);
  });
  if (!visibleLastTitles.length) {
    const empty = document.createElement("div");
    empty.className = "tournament-empty";
    empty.textContent = "No matching tournaments.";
    lastTitleOptions.append(empty);
  }
  lastTitleOptions.classList.add("open");
  lastTitleInput.setAttribute("aria-expanded", "true");
  lastTitleStatus.textContent = visibleLastTitles.filter(Boolean).length + " matching tournaments.";
}

function renderPlayerForm(player) {
  const form = playerForm(player);
  formButtons.forEach((button, index) => {
    const result = form.results[index];
    const label = result === "win" ? "win" : result === "loss" ? "loss" : "not set";
    button.dataset.result = result;
    button.textContent = result === "win" ? "\u2713" : result === "loss" ? "\u2715" : "\u00b7";
    button.setAttribute("aria-label", "Match " + (index + 1) + ": " + label + ". Click to cycle blank, win, loss.");
    button.title = "Match " + (index + 1) + ": " + label + " (click: blank > win > loss)";
  });
  const title = tournaments.find(item => item.id === form.lastTitleId);
  lastTitleInput.value = title ? lastTitleLabel(title) : "";
  lastTitleInput.disabled = !tournaments.length;
  lastTitleInput.placeholder = calendarFailed ? "Calendar unavailable" : tournaments.length ? "Search tournaments" : "Loading tournaments...";
  const text = title ? lastTitleLabel(title) : "Search tournaments";
  lastTitleInput.style.fontSize = Math.min(4.3, 112 / text.length) + "cqw";
  lastTitleInput.title = title ? text : "Choose the latest tournament won";
  closeLastTitleOptions();
}

lastTitleInput.addEventListener("focus", () => {
  lastTitleInput.select();
  showLastTitleOptions("");
});
lastTitleInput.addEventListener("click", () => {
  if (!lastTitleOptions.classList.contains("open")) showLastTitleOptions("");
});
lastTitleInput.addEventListener("input", () => showLastTitleOptions(lastTitleInput.value));
lastTitleInput.addEventListener("blur", () => {
  closeLastTitleOptions();
  if (selectedPlayer) renderPlayerForm(selectedPlayer);
});
lastTitleInput.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!lastTitleOptions.classList.contains("open")) showLastTitleOptions(lastTitleInput.value);
    if (!visibleLastTitles.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    lastTitleActiveIndex = lastTitleActiveIndex < 0
      ? direction > 0 ? 0 : visibleLastTitles.length - 1
      : (lastTitleActiveIndex + direction + visibleLastTitles.length) % visibleLastTitles.length;
    [...lastTitleOptions.querySelectorAll("[role=option]")].forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === lastTitleActiveIndex));
      if (index === lastTitleActiveIndex) option.scrollIntoView({ block: "nearest" });
    });
    lastTitleInput.setAttribute("aria-activedescendant", "last-title-option-" + lastTitleActiveIndex);
  } else if (event.key === "Enter" && lastTitleOptions.classList.contains("open") && visibleLastTitles.length) {
    event.preventDefault();
    selectLastTitle(visibleLastTitles[Math.max(0, lastTitleActiveIndex)]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (selectedPlayer) renderPlayerForm(selectedPlayer);
  }
});

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

function tierForRank(rank) {
  if (rank === 1) return "top_1";
  if (rank <= 10) return "top_10";
  if (rank <= 20) return "top_20";
  if (rank <= 100) return "top_100";
  if (rank <= 200) return "top_200";
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

function closeTournamentOptions() {
  tournamentOptions.classList.remove("open");
  tournamentOptions.replaceChildren();
  tournamentInput.setAttribute("aria-expanded", "false");
  tournamentInput.removeAttribute("aria-activedescendant");
  visibleTournaments = [];
  tournamentActiveIndex = -1;
}

function selectTournament(item) {
  selectedTournamentId = item.id;
  tournamentInput.value = tournamentLabel(item);
  closeTournamentOptions();
  tournamentStatus.textContent = "Selected " + tournamentLabel(item);
  if (selectedPlayer) renderCard(selectedPlayer);
}

function showTournamentOptions(query) {
  tournamentQuery = query;
  const needle = normalize(query.trim());
  visibleTournaments = tournaments.filter(item => normalize(
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
  lastTitleInput.disabled = !selectedPlayer || !tournaments.length;
  tournamentWrap.hidden = cardType.value === "form";
  if (tournamentWrap.hidden) {
    closeTournamentOptions();
    return;
  }
  const open = tournamentOptions.classList.contains("open");
  const editing = document.activeElement === tournamentInput;
  tournamentInput.disabled = !tournaments.length;
  tournamentInput.placeholder = !calendar
    ? calendarFailed ? "Calendar unavailable" : "Loading tournaments..."
    : tournaments.length ? "Search " + new Date().getFullYear() + " tournaments" : "No tournaments for this year";
  if (!tournaments.some(item => item.id === selectedTournamentId)) selectedTournamentId = "";
  if (!editing) {
    const selected = tournaments.find(item => item.id === selectedTournamentId);
    tournamentInput.value = selected ? tournamentLabel(selected) : "";
  }
  if (open && editing && tournaments.length) showTournamentOptions(tournamentQuery);
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
  const type = cardType.value;
  card.dataset.type = type;
  const titleDetails = document.getElementById("card-title-details");
  titleDetails.hidden = type === "form";
  if (type === "form") titleDetails.removeAttribute("src");
  else titleDetails.src = "assets/" + (type === "wta-tour" ? "wtatour" : "wta125") + "_title_details.png";
  const tournament = type === "form" ? null : tournaments.find(item => item.id === selectedTournamentId);
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
  document.getElementById("card-age").textContent = getAge(player.dob, snapshotDate) + " ANS";
  document.getElementById("card-country").textContent = player.country;
  const flag = document.getElementById("card-flag");
  // Flag filenames use the three-letter country codes from the rankings CSV.
  flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg";
  flag.alt = player.country + " flag";
  document.getElementById("card-name").style.fontSize = Math.min(10.2, 140 / name.length) + "cqw";
  document.getElementById("card-rank").parentElement.style.fontSize = String(player.rank).length > 3 ? "9cqw" : "12cqw";
  document.getElementById("card-rank-ordinal").textContent = player.rank === 1 ? "er" : "\u00e8me";
  const tier = tierForRank(player.rank);
  card.dataset.tier = tier;
  document.getElementById("card-base").src = "assets/" + tier + "_card.png";
  document.getElementById("card-details").src = "assets/" + tier + "_details.png";
  const baseBadge = document.getElementById("card-base-badge");
  if (tier === "top_10") baseBadge.src = "assets/top_10_card.png";
  else baseBadge.removeAttribute("src");
  document.getElementById("card-name").textContent = name;
  document.getElementById("card-rank").textContent = String(player.rank);
  const atCareerBest = player.rank === player.best_rank;
  const careerLabel = document.getElementById("career-best-label");
  careerLabel.hidden = !atCareerBest;
  careerLabel.textContent = "MEILLEUR CLASSEMENT\nEN CARRI\u00c8RE";
  const bestRankLabel = document.getElementById("best-rank-label");
  bestRankLabel.hidden = atCareerBest;
  bestRankLabel.classList.toggle("long-rank", String(player.best_rank).length > 3);
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
  document.getElementById("svg-description").textContent = name + ", WTA singles rank " + player.rank + ", " + player.country + ", " + getAge(player.dob, snapshotDate) + " years old.";
  renderPlayerForm(player);
  renderTourTitleNumber(player);
  card.removeAttribute("hidden");
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
  const selected = tournaments.find(item => item.id === selectedTournamentId);
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
    const selected = tournaments.find(item => item.id === selectedTournamentId);
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
