"use strict";

const scheduleContent = document.getElementById("schedule-card-content");
const scheduleMatches = document.getElementById("schedule-matches");
const scheduleRounds = {
  premiers: "PREMIERS TOURS", deuxiemes: "DEUXIÈMES TOURS", quarts: "QUARTS DE FINALE",
  troisiemes: "TROISIÈMES TOURS",
  demi: "DEMI-FINALES", finale: "FINALE", qualy1: "QUALIFICATIONS - T1",
  qualy2: "QUALIFICATIONS - T2", qualy3: "QUALIFICATIONS - T3",
};
const scheduleState = {
  count: 5,
  round: "premiers",
  tournamentId: "",
  players: Array.from({ length: 5 }, () => [null, null]),
  times: Array(5).fill(""),
};
// Body rectangles inside the supplied frame PNGs; their rank tabs extend above and to the left.
const scheduleFrames = {
  top_1: [216, 571], top_10: [216, 619], top_20: [183, 622],
  top_100: [216, 619], "top_100+": [216, 589], prospect: [240, 589],
};
// Visible bounds and round-text width, excluding each PNG's transparent canvas padding.
const scheduleBanners = {
  premiers: [160, 327, 1178, 167, 851], deuxiemes: [120, 304, 1228, 167, 901],
  quarts: [158, 341, 1223, 167, 897], demi: [209, 366, 1060, 168, 737],
  finale: [354, 342, 798, 167, 475], qualy1: [90, 335, 1284, 167, 955],
  qualy2: [98, 373, 1284, 168, 963], qualy3: [135, 366, 1284, 168, 963],
};

function schedulePlayerFrame(player) {
  const age = getAge(player.dob, snapshotDate);
  const tier = tierForRank(typeof player.rank === "number" ? player.rank : null, age);
  if (tier === "prospect") return "prospect";
  if (player.rank === 1) return "top_1";
  if (player.rank >= 2 && player.rank <= 10) return "top_10";
  if (player.rank >= 11 && player.rank <= 20) return "top_20";
  if (player.rank >= 21 && player.rank <= 100) return "top_100";
  return "top_100+";
}

function scheduleRankText(player) {
  const rank = Number.isFinite(player.rank) ? player.rank : "NR";
  const ordinal = rank === 1 ? "ère" : rank === "NR" ? "" : "ème";
  return { rank, ordinal };
}

function schedulePlayerSlot(matchIndex, side, geometry) {
  const player = scheduleState.players[matchIndex][side];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "schedule-player";
  button.style.left = geometry.left + "px";
  button.style.top = geometry.top + "px";
  button.style.width = geometry.width + "px";
  button.style.setProperty("--schedule-photo-height", geometry.height + "px");
  button.setAttribute("aria-label", "Select player " + (side + 1) + " for match " + (matchIndex + 1)
    + (player ? ": " + playerDisplayName(player) : ""));

  const photoWrap = document.createElement("span");
  photoWrap.className = "schedule-photo-wrap";
  const photo = document.createElement("img");
  photo.className = "schedule-player-photo";
  photo.alt = "";
  const initials = document.createElement("span");
  initials.className = "schedule-player-initials";
  initials.setAttribute("aria-hidden", "true");
  const frame = document.createElement("img");
  frame.className = "schedule-player-frame";
  frame.alt = "";
  const tier = player ? schedulePlayerFrame(player) : "top_100+";
  const [frameX, frameY] = scheduleFrames[tier];
  const scaleX = geometry.width / 991, scaleY = geometry.height / 547;
  frame.src = "assets/schedule/" + tier + "_frame.png";
  frame.style.cssText = `left:${-frameX * scaleX}px;top:${-frameY * scaleY}px;width:${1440 * scaleX}px;height:${1800 * scaleY}px;`;
  const rank = document.createElement("span");
  rank.className = "schedule-player-rank";
  rank.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "schedule-player-name";

  if (player) {
    const label = scheduleRankText(player);
    setPlayerPortrait(photo, initials, player);
    if (String(label.rank).length > 2) rank.classList.add("schedule-rank-wide");
    const value = document.createElement("span");
    value.textContent = label.rank;
    rank.append(value);
    if (label.ordinal) {
      const suffix = document.createElement("sup");
      suffix.textContent = label.ordinal;
      rank.append(suffix);
    }
    name.textContent = playerDisplayName(player).toLocaleUpperCase();
  } else {
    rank.textContent = "";
    name.textContent = "SELECT PLAYER";
  }
  photoWrap.append(photo, initials, frame, rank);
  button.append(photoWrap, name);
  button.addEventListener("click", () => {
    const current = scheduleState.players[matchIndex][side] || {
      id: "schedule-" + matchIndex + "-" + side, name: "", country: "", placeholder: true,
    };
    openPlayerPicker(current, "Select Player " + (side + 1), selected => {
      scheduleState.players[matchIndex][side] = selected;
      renderScheduleCard();
    });
  });
  return button;
}

function scheduleGeometry(count, index) {
  if (count === 4) {
    return {
      left: [276, 789], width: 376, height: 376 * 547 / 991,
      top: [343, 731, 1118, 1505][index], time: [280, 668, 1055, 1442][index],
    };
  }
  return {
    left: [324, 781], width: 336, height: 336 * 547 / 991,
    top: [251, 573, 898, 1222, 1546][index], time: [195, 517, 842, 1166, 1490][index],
  };
}

function renderScheduleCard() {
  if (cardType.value !== "schedule") return;
  card.dataset.type = "schedule";
  card.removeAttribute("data-tier");
  card.removeAttribute("data-draw-round");
  card.hidden = false;
  document.getElementById("card-save-image").hidden = true;
  document.querySelector(".card-content").hidden = true;
  document.getElementById("result-card-content").hidden = true;
  document.getElementById("draw-card-content").hidden = true;
  document.getElementById("card-title-details").hidden = true;
  scheduleContent.hidden = false;
  document.querySelectorAll("[data-schedule-count]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.scheduleCount) === scheduleState.count));
  });
  scheduleContent.dataset.matchCount = String(scheduleState.count);
  document.getElementById("schedule-layout-art").src = "assets/schedule/" + scheduleState.count + "_matches.png";
  const tournament = tournaments.find(item => item.id === scheduleState.tournamentId);
  const tournamentButton = document.getElementById("schedule-tournament-button");
  tournamentButton.style.backgroundColor = tournament?.color || "#699694";
  document.getElementById("schedule-tournament-name").textContent = tournament
    ? tournamentName(tournament).toLocaleUpperCase() : "TOURNAMENT";
  document.getElementById("schedule-tournament-category").textContent = tournament
    ? tournamentCategoryLabel(tournament.category).toLocaleUpperCase() : "WTA TOUR";
  const roundArt = document.getElementById("schedule-round-art");
  const banner = scheduleState.round === "troisiemes" ? "deuxiemes" : scheduleState.round;
  roundArt.src = "assets/schedule/" + banner + ".png";
  roundArt.alt = scheduleRounds[scheduleState.round];
  const [x, y, width, height, contentWidth] = scheduleBanners[banner];
  const bannerScale = 134 / height;
  const bannerWidth = width * bannerScale;
  const roundButton = document.getElementById("schedule-round-button");
  roundButton.dataset.round = scheduleState.round;
  roundButton.style.width = bannerWidth + "px";
  roundArt.parentElement.style.width = "100%";
  roundArt.style.cssText = `left:${-x * bannerScale}px;top:${-y * bannerScale}px;width:${1600 * bannerScale}px;height:${900 * bannerScale}px;`;
  tournamentButton.style.right = (1440 - bannerWidth) / 2 + 14 + "px";
  tournamentButton.style.maxWidth = (width - contentWidth) * bannerScale - 28 + "px";
  const roundLabel = document.getElementById("schedule-round-label");
  roundLabel.hidden = scheduleState.round !== "troisiemes";
  if (!roundLabel.hidden) {
    // No third-round PNG was supplied; retain its logo and paint the label over the shared strip.
    roundArt.parentElement.style.width = "150px";
    roundLabel.textContent = scheduleRounds.troisiemes;
  }
  scheduleMatches.replaceChildren();
  for (let index = 0; index < scheduleState.count; index++) {
    const geometry = scheduleGeometry(scheduleState.count, index);
    const time = document.createElement("div");
    time.className = "schedule-match-time";
    time.contentEditable = "plaintext-only";
    time.spellcheck = false;
    time.dataset.timeIndex = String(index);
    time.dataset.placeholder = "HEURE - COURT";
    time.setAttribute("aria-label", "Match " + (index + 1) + " time and court");
    time.setAttribute("role", "textbox");
    time.textContent = scheduleState.times[index];
    time.style.top = geometry.time + "px";
    scheduleMatches.append(time);
    scheduleMatches.append(schedulePlayerSlot(index, 0, { ...geometry, left: geometry.left[0] }));
    scheduleMatches.append(schedulePlayerSlot(index, 1, { ...geometry, left: geometry.left[1] }));
  }
  card.style.setProperty("--card-scale", String(card.getBoundingClientRect().width / cardDesign.offsetWidth));
  fitScheduleText();
}

function fitScheduleText() {
  const eventName = document.getElementById("schedule-tournament-name");
  const category = document.getElementById("schedule-tournament-category");
  eventName.style.fontSize = "79px";
  category.style.fontSize = "26px";
  const eventWidth = eventName.parentElement.clientWidth - 40;
  fitPlayerName(eventName, eventWidth, "79px");
  fitPlayerName(category, eventWidth, "26px");
  const roundLabel = document.getElementById("schedule-round-label");
  if (!roundLabel.hidden) fitPlayerName(roundLabel, 500, "96px");
  scheduleMatches.querySelectorAll(".schedule-player-name").forEach(name => {
    fitPlayerName(name, name.parentElement.clientWidth - 12, scheduleState.count === 4 ? "45px" : "40px");
  });
  scheduleMatches.querySelectorAll(".schedule-match-time").forEach(time => {
    fitPlayerName(time, time.clientWidth, scheduleState.count === 4 ? "55px" : "49px");
  });
}

function showScheduleTournamentOptions() {
  const options = document.getElementById("schedule-tournament-options");
  const query = normalize(document.getElementById("schedule-tournament-search").value.trim());
  const matches = tournaments.filter(item => normalize(tournamentLabel(item)).includes(query)
    || normalize(item.name).includes(query));
  options.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "tournament-empty";
    empty.textContent = calendar ? "No matching tournaments in this year's WTA Calendar." : "WTA Calendar unavailable.";
    options.append(empty);
  }
  matches.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion tournament-suggestion schedule-tournament-option";
    button.setAttribute("role", "option");
    const label = document.createElement("span");
    label.textContent = tournamentLabel(item);
    const date = document.createElement("span");
    date.className = "tournament-meta";
    date.textContent = item.startDate;
    button.append(label, date);
    button.addEventListener("click", () => {
      scheduleState.tournamentId = item.id;
      document.getElementById("schedule-tournament-dialog").close();
      renderScheduleCard();
    });
    options.append(button);
  });
}

document.getElementById("schedule-options").hidden = true;
document.getElementById("schedule-options").addEventListener("click", event => {
  if (cardType.value !== "schedule") return;
  const button = event.target.closest("[data-schedule-count]");
  if (!button) return;
  scheduleState.count = Number(button.dataset.scheduleCount);
  renderScheduleCard();
});
document.getElementById("schedule-round-button").addEventListener("click", () => {
  if (cardType.value !== "schedule") return;
  document.getElementById("schedule-round-dialog").showModal();
});
document.getElementById("schedule-round-options").addEventListener("click", event => {
  if (cardType.value !== "schedule") return;
  const button = event.target.closest("[data-schedule-round]");
  if (!button) return;
  scheduleState.round = button.dataset.scheduleRound;
  document.getElementById("schedule-round-dialog").close();
  renderScheduleCard();
});
document.getElementById("schedule-tournament-button").addEventListener("click", () => {
  if (cardType.value !== "schedule") return;
  document.getElementById("schedule-tournament-search").value = "";
  showScheduleTournamentOptions();
  document.getElementById("schedule-tournament-dialog").showModal();
  document.getElementById("schedule-tournament-search").focus();
});
document.getElementById("schedule-tournament-search").addEventListener("input", showScheduleTournamentOptions);
scheduleMatches.addEventListener("input", event => {
  const time = event.target.closest("[data-time-index]");
  if (!time) return;
  const value = time.textContent.replace(/[\r\n]/g, " ").slice(0, 60);
  if (value !== time.textContent) time.textContent = value;
  scheduleState.times[Number(time.dataset.timeIndex)] = value;
  fitScheduleText();
});
cardType.addEventListener("change", () => {
  const active = cardType.value === "schedule";
  document.getElementById("schedule-options").hidden = !active;
  if (!active) {
    scheduleContent.hidden = true;
    for (const id of ["schedule-round-dialog", "schedule-tournament-dialog"]) {
      const dialog = document.getElementById(id);
      if (dialog.open) dialog.close();
    }
  }
  else renderScheduleCard();
});
document.fonts.ready.then(() => { if (cardType.value === "schedule") fitScheduleText(); });
