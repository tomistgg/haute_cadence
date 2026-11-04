"use strict";

const resultControls = document.getElementById("result-controls");
const resultSelect = document.getElementById("result-match");
const resultStatus = document.getElementById("result-status");
const resultContent = document.getElementById("result-card-content");
const uploadedResultPhotos = new Map();
const resultHeaderRight = { premier: 1279, deuxieme: 1279, troisieme: 1299, quartdefinale: 1298, demifinale: 1224, finale: 1188 };
let resultFeed = null;
let selectedResultId = "";
let resultsLoading = false;

function currentResults() {
  const now = Date.now();
  return (resultFeed?.matches || []).filter(match => {
    const finished = Date.parse(match.completed_at);
    return Number.isFinite(finished) && now - 86400000 <= finished && finished <= now;
  });
}

function resultPhoto(player) {
  return uploadedResultPhotos.get(player.id) || photoByName.get(normalize(player.name));
}

function resultRank(player) {
  return players.find(row => row.id === player.id)?.rank ?? "NR";
}

function fitResultNames() {
  const measure = document.createElement("canvas").getContext("2d");
  resultContent.querySelectorAll(".result-score-name > span").forEach(name => {
    measure.font = getComputedStyle(name).font;
    const width = measure.measureText(name.textContent).width + 4;
    name.style.width = width + "px";
    name.style.transform = width > name.parentElement.clientWidth ? "scaleX(" + name.parentElement.clientWidth / width + ")" : "none";
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
    initials.textContent = player.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("");
  }
  document.getElementById("result-" + side + "-photo-status").textContent = player.name + (photo ? " · portrait ready" : " · upload a portrait");
}

function renderResultCard() {
  if (cardType.value !== "result") return;
  const match = currentResults().find(item => item.id === selectedResultId);
  if (!match) {
    card.hidden = true;
    return;
  }
  card.dataset.type = "result";
  card.removeAttribute("data-tier");
  document.querySelector(".card-content").hidden = true;
  document.getElementById("card-title-details").hidden = true;
  resultContent.hidden = false;
  resultContent.dataset.sets = String(Math.max(2, match.sets.length));
  document.getElementById("result-round-art").src = "assets/results/" + match.round_art + ".png";
  document.getElementById("result-score-art").src = "assets/results/" + (match.sets.length === 3 ? "trois_sets" : "deux_sets") + ".png";
  const heading = document.getElementById("result-round-heading");
  heading.hidden = !match.round_heading;
  heading.textContent = match.round_heading;
  const event = document.getElementById("result-event");
  event.style.left = (resultHeaderRight[match.round_art] - 302) + "px";
  event.style.backgroundColor = tournamentStyle({ level: match.tournament.category, name: match.tournament.name })?.color || "#7ed957";
  const eventName = document.getElementById("result-event-name");
  eventName.textContent = tournamentName(match.tournament).toLocaleUpperCase();
  eventName.style.fontSize = Math.min(72, 400 / Math.max(1, eventName.textContent.length) * 1.6) + "px";
  document.getElementById("result-event-category").textContent = match.tournament.category === "Finals" ? "WTA FINALS" : match.tournament.category.toLocaleUpperCase();
  document.getElementById("result-retired").hidden = !match.status;
  document.getElementById("result-retired").textContent = match.status;
  for (const side of ["winner", "loser"]) {
    const player = match[side];
    setResultPhoto(side, player);
    const row = resultContent.querySelector('[data-side="' + side + '"]');
    const flag = row.querySelector(".result-score-flag");
    const fallback = row.querySelector(".result-flag-fallback");
    fallback.textContent = player.country || "—";
    fallback.hidden = true;
    flag.hidden = false;
    flag.onerror = () => { flag.hidden = true; fallback.hidden = false; };
    flag.src = "assets/flags/" + player.country.toLowerCase() + ".svg";
    flag.alt = player.country + " flag";
    const rank = row.querySelector(".result-score-rank");
    rank.textContent = resultRank(player);
    rank.style.fontSize = String(rank.textContent).length > 3 ? "62px" : "80px";
    row.querySelector(".result-score-name > span").textContent = (player.first_name + " " + player.last_name.toLocaleUpperCase()).trim();
    const scores = row.querySelector(".result-score-sets");
    scores.replaceChildren();
    for (let index = 0; index < Math.max(2, match.sets.length); index += 1) {
      const set = match.sets[index];
      const score = document.createElement("span");
      if (set) {
        score.textContent = set[side];
        score.classList.toggle("set-won", set[side] > set[side === "winner" ? "loser" : "winner"]);
        if (set.tiebreak && set[side] < set[side === "winner" ? "loser" : "winner"]) {
          const tiebreak = document.createElement("sup");
          tiebreak.textContent = set.tiebreak;
          score.append(tiebreak);
        }
      }
      scores.append(score);
    }
  }
  document.getElementById("svg-title").textContent = "Result Card · " + match.winner.name + " defeated " + match.loser.name;
  document.getElementById("svg-description").textContent = match.tournament.name + ", " + match.round + ", " + match.sets.map(set => set.winner + "-" + set.loser).join(" ");
  card.hidden = false;
  scaleCardDesign();
  fitResultNames();
}

function updateResultOptions() {
  const matches = currentResults();
  if (!matches.some(match => match.id === selectedResultId)) selectedResultId = matches[0]?.id || "";
  resultSelect.replaceChildren();
  for (const match of matches) {
    const option = document.createElement("option");
    option.value = match.id;
    option.textContent = [match.tournament.city, match.round, match.winner.name + " d. " + match.loser.name,
      match.sets.map(set => set.winner + "–" + set.loser).join(" "),
      new Date(match.completed_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })].join(" · ");
    resultSelect.append(option);
  }
  resultSelect.disabled = !matches.length;
  document.getElementById("result-winner-upload").disabled = !matches.length;
  document.getElementById("result-loser-upload").disabled = !matches.length;
  if (!matches.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No completed singles matches in the last 24 hours";
    resultSelect.append(empty);
  }
  resultSelect.value = selectedResultId;
  const updated = resultFeed?.updated_at ? " Updated " + new Date(resultFeed.updated_at).toLocaleString() + "." : "";
  const stale = resultFeed?.updated_at && Date.now() - Date.parse(resultFeed.updated_at) > 3600000
    ? " The saved feed is more than an hour old; recent matches may be missing." : "";
  resultStatus.textContent = (matches.length ? matches.length + " completed matches." : "No completed matches in this 24-hour window.") + updated + stale + (resultFeed?.refresh_error ? " " + resultFeed.refresh_error : "");
  renderResultCard();
}

async function refreshResults() {
  if (resultsLoading) return;
  resultsLoading = true;
  const button = document.getElementById("refresh-results");
  button.disabled = true;
  resultStatus.textContent = "Loading completed WTA singles matches…";
  try {
    const response = await fetch("data/recent_results.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Completed WTA matches are temporarily unavailable. Try Refresh again.");
    const data = await response.json();
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
document.getElementById("refresh-results").addEventListener("click", refreshResults);
cardType.addEventListener("change", () => {
  resultControls.hidden = cardType.value !== "result";
  if (cardType.value === "result") refreshResults();
});
window.addEventListener("focus", () => { if (cardType.value === "result") refreshResults(); });
setInterval(() => { if (cardType.value === "result") refreshResults(); }, 300000);
document.fonts.ready.then(fitResultNames);

for (const side of ["winner", "loser"]) {
  const input = document.getElementById("result-" + side + "-upload");
  input.addEventListener("change", async () => {
    const match = currentResults().find(item => item.id === selectedResultId);
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
