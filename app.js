"use strict";

const searchInput = document.getElementById("player-search");
const options = document.getElementById("player-options");
const status = document.getElementById("search-status");
const card = document.getElementById("player-card");
const loading = document.getElementById("loading");
const cardNote = document.getElementById("card-note");
let players = [];
let snapshotDate = "";
let activeIndex = -1;
let visiblePlayers = [];

const photoByName = new Map([
  ["leylah fernandez", "assets/players/leylah-fernandez.png"],
  ["elsa jacquemot", "assets/players/elsa-jacquemot.png"],
  ["diana shnaider", "assets/players/diana-shnaider.png"]
]);

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")).toUpperCase();
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
  if (!needle) {
    options.classList.remove("open");
    options.replaceChildren();
    searchInput.setAttribute("aria-expanded", "false");
    status.textContent = "Type a name to search the full ranking.";
    return;
  }
  const matches = players.filter(player => normalize(player.name).includes(needle));
  visiblePlayers = matches.slice(0, 8);
  options.replaceChildren();
  visiblePlayers.forEach((player, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.id = "player-option-" + index;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.innerHTML = '<span class="suggestion-name"></span><span class="suggestion-meta"></span>';
    button.querySelector(".suggestion-name").textContent = player.name;
    button.querySelector(".suggestion-meta").textContent = "#" + player.rank + " · " + player.country;
    button.addEventListener("click", () => selectPlayer(player));
    options.append(button);
  });
  options.classList.toggle("open", visiblePlayers.length > 0);
  searchInput.setAttribute("aria-expanded", String(visiblePlayers.length > 0));
  status.textContent = matches.length ? (matches.length > 8 ? "Showing 8 of " + matches.length + " matches · use more letters to narrow" : matches.length + (matches.length === 1 ? " match" : " matches")) : "No ranked player matches that name.";
}

function selectPlayer(player) {
  searchInput.value = player.name;
  options.classList.remove("open");
  searchInput.setAttribute("aria-expanded", "false");
  options.replaceChildren();
  status.textContent = "Selected #" + player.rank + " · " + player.country;
  renderCard(player);
}

function renderCard(player) {
  const name = player.name.toLocaleUpperCase();
  const isTop20 = player.rank <= 20;
  const tier = isTop20 ? "top_20" : "top_100";
  document.getElementById("card-base").src = "assets/" + tier + "_card.png";
  document.getElementById("card-details").src = "assets/" + tier + "_details.png";
  document.getElementById("card-name").textContent = name;
  document.getElementById("card-rank").textContent = String(player.rank);
  document.getElementById("card-previous").textContent = player.previous_rank == null
    ? "NEW \u00b7 " + snapshotDate.slice(0, 4)
    : "#" + player.previous_rank + " LAST WEEK";

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
  document.getElementById("svg-title").textContent = name + " \u00b7 WTA #" + player.rank;
  document.getElementById("svg-description").textContent = name + ", WTA singles rank " + player.rank + ", " + player.country + ", " + getAge(player.dob, snapshotDate) + " years old.";
  document.getElementById("selected-id-note").textContent = "WTA singles \u00b7 #" + player.rank;
  card.removeAttribute("hidden");
  cardNote.hidden = false;
}

function moveActive(direction) {
  if (!visiblePlayers.length) return;
  activeIndex = (activeIndex + direction + visiblePlayers.length) % visiblePlayers.length;
  [...options.querySelectorAll("[role=option]")].forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
  searchInput.setAttribute("aria-activedescendant", "player-option-" + activeIndex);
}

searchInput.addEventListener("input", () => showOptions(searchInput.value));
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
    document.getElementById("snapshot-pill").textContent = "WTA · " + formatDate(snapshotDate);
    document.getElementById("player-count").textContent = players.length.toLocaleString("en-US");
    loading.hidden = true;
    status.textContent = players.length.toLocaleString("en-US") + " ranked players · snapshot " + formatDate(snapshotDate);
    const example = players.find(player => normalize(player.name) === "alina charaeva");
    if (example) selectPlayer(example);
  })
  .catch(error => {
    loading.textContent = "Could not load the ranking data. Run the local server from the project instructions.";
    status.textContent = error.message;
  });