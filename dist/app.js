"use strict";

const searchInput = document.getElementById("player-search");
const options = document.getElementById("player-options");
const status = document.getElementById("search-status");
const card = document.getElementById("player-card");
const cardType = document.getElementById("card-type");
let selectedPlayer = null;
let players = [];
let snapshotDate = "";
let activeIndex = -1;
let visiblePlayers = [];

const photoByName = new Map([
  ["alina charaeva", "assets/players/alina-charaeva.jpg"],
  ["leylah fernandez", "assets/players/leylah-fernandez.png"],
  ["elsa jacquemot", "assets/players/elsa-jacquemot.png"],
  ["diana shnaider", "assets/players/diana-shnaider.png"]
]);

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

function badgeFor(rank) {
  if (rank <= 100) return ["TOP", "100"];
  if (rank <= 250) return ["TOP", "250"];
  if (rank <= 500) return ["TOP", "500"];
  if (rank <= 1000) return ["TOP", "1000"];
  return ["WTA", "RANKED"];
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
  // shortcut: Tournament names, title counts, and form stay blank until results data is supplied.
  card.dataset.type = type;
  document.getElementById("card-event-category").textContent = type === "wta-125" ? "WTA 125" : "WTA TOUR";
  document.getElementById("card-age").textContent = getAge(player.dob, snapshotDate) + " ANS";
  document.getElementById("card-country").textContent = player.country;
  document.getElementById("card-name").style.fontSize = Math.min(9.2, 126 / name.length) + "cqw";
  document.getElementById("card-rank").parentElement.style.fontSize = String(player.rank).length > 3 ? "9cqw" : "12cqw";
  document.getElementById("card-rank-ordinal").textContent = player.rank === 1 ? "er" : "\u00e8me";
  const isTop20 = player.rank <= 20;
  const tier = isTop20 ? "top_20" : "top_100";
  document.getElementById("card-base").src = "assets/" + tier + "_card.png";
  document.getElementById("card-details").src = "assets/" + tier + "_details.png";
  document.getElementById("card-name").textContent = name;
  document.getElementById("card-rank").textContent = String(player.rank);
  document.getElementById("card-previous").textContent = type === "form"
    ? "MEILLEUR : #" + player.best_rank
    : player.rank + "e EN " + snapshotDate.slice(0, 4);

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
  card.removeAttribute("hidden");
}

function moveActive(direction) {
  if (!visiblePlayers.length) return;
  activeIndex = (activeIndex + direction + visiblePlayers.length) % visiblePlayers.length;
  [...options.querySelectorAll("[role=option]")].forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
  searchInput.setAttribute("aria-activedescendant", "player-option-" + activeIndex);
}

cardType.addEventListener("change", () => {
  if (selectedPlayer) renderCard(selectedPlayer);
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
  if (!event.target.closest(".search-wrap")) { options.classList.remove("open"); searchInput.setAttribute("aria-expanded", "false"); }
});

fetch("data/players.json")
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
