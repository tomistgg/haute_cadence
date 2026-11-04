"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const elements = new Map();
function element() {
  return { textContent: "", children: [], listeners: {},
    querySelector() { return this; },
    addEventListener(event, listener) { this.listeners[event] = listener; },
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    setAttribute() {}, showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); } };
}
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-11-04T12:00:00Z"])); }
}
const context = {
  Date: FixedDate,
  document: { getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }, createElement: element, fonts: { ready: { then() {} } } },
  window: { addEventListener() {} },
  cardType: { value: "result", addEventListener() {} },
  setInterval() {}, refreshCalendar: async () => {},
};
vm.createContext(context);
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.runInContext(appSource.slice(appSource.indexOf("const TOURNAMENT_NAME_OVERRIDES"), appSource.indexOf("const photoByName")), context);
vm.runInContext(appSource.slice(appSource.indexOf("function stripAccents("), appSource.indexOf("function getAge(")), context);
vm.runInContext(appSource.slice(appSource.indexOf("function tournamentStyle("), appSource.indexOf("function yearTournaments(")), context);
vm.runInContext(appSource.slice(appSource.indexOf("function tournamentName("), appSource.indexOf("function tournamentLabel(")), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "result-card.js"), "utf8"), context);
vm.runInContext("renderResultCard = () => {}; selectedResultId = 'itf-2'", context);
const fields = ["column", "level", "name", "city", "startDate", "endDate", "calendarKey", "country"];
const row = (id, level = "W50", start = "2026-11-02", end = "2026-11-08", column = "itf") =>
  [column, level, level + " City", "City", start, end, id, "MEX"];
context.calendar = { fields, weeks: { week: [row("current"), row("current"), row("high", "W100"),
  row("previous", "W50", "2026-10-26", "2026-11-01"), row("next", "W50", "2026-11-09", "2026-11-15"),
  row("monday", "W15", "2026-10-26", "2026-11-02"), row("sunday", "W15", "2026-11-08", "2026-11-15"),
  row("men", "M15"), row("wta", "WTA 125", undefined, undefined, "wta_125"),
  row("bad", "W50", "2026-11-04", "2026-11-02"), row("current|qualifying"),
] } };

async function main() {
  const choices = context.currentWeekResultTournaments(context.calendar, false);
  assert.equal(choices.map(item => item.id).join(","), "high,current,monday,sunday");
  assert.equal(context.currentWeekResultTournaments(context.calendar, false, "2026-11-08").length, 4);
  assert.equal(context.currentWeekResultTournaments(context.calendar, false, "2026-11-09").map(item => item.id).join(","), "next,sunday");
  const crossYear = { fields, weeks: { week: [row("new-year", "W75", "2025-12-29", "2026-01-04")] } };
  assert.equal(context.currentWeekResultTournaments(crossYear, false, "2026-01-01").length, 1);
  const match = context.selectedResultMatch();
  match.sets[0].winner = 6;
  await context.openResultTournamentPicker();
  assert.equal(elements.get("itf-tournament-options").children.length, 4);
  context.selectResultTournament(choices[0]);
  assert.equal(match.tournament.name, "City");
  assert.equal(match.tournament.category, "W100");
  assert.equal(match.sets[0].winner, 6, "selection must preserve the manually entered score");
  await context.openResultTournamentPicker();
  vm.runInContext("selectedResultId = 'itf-3'", context);
  context.selectResultTournament(choices[1]);
  assert.equal(context.selectedResultMatch().tournament.name, "", "a stale picker must not change another draft");
  context.cardType.value = "tour-result";
  vm.runInContext("selectedResultId = 'tour-manual'", context);
  context.selectResultTournament(choices[1]);
  assert.equal(context.selectedResultMatch().tournament.name, "");

  const tourRow = (id, level, start = "2026-11-02", end = "2026-11-08") => row(id, level, start, end, "wta_tour");
  const qualifying = ["gs", "Grand Slam", "Roland Garros Qualifying", "", "2026-11-02", "2026-11-08", "wta:903:2026|qualifying", "FRA"];
  const slam = ["gs", "Grand Slam", "Roland Garros - Paris", "PARIS", "2026-11-09", "2026-11-22", "wta:903:2026", "FRA"];
  context.calendar = { fields, weeks: { week: [tourRow("250", "WTA 250"), tourRow("500", "WTA 500"),
    tourRow("125", "WTA 125"), tourRow("itf", "W75"), tourRow("juniors", "Grand Slam Juniors"),
    tourRow("past", "WTA 1000", "2026-10-26", "2026-11-01"), tourRow("finals", "Finals", "2026-11-08", "2026-11-15"),
    qualifying, slam, qualifying,
  ] } };
  const tourChoices = context.currentWeekResultTournaments(context.calendar, true);
  assert.equal(tourChoices.map(item => item.id).join(","), "wta:903:2026,finals,500,250");
  assert.equal(tourChoices[0].city, "Roland Garros", "qualifying must use the main event's standard name");
  assert.equal(tourChoices[0].qualifying, true);
  for (const today of ["2026-11-09", "2026-11-16"]) {
    const slams = context.currentWeekResultTournaments(context.calendar, true, today).filter(item => item.category === "Grand Slam");
    assert.equal(slams.length, 1, "both weeks of the Grand Slam main draw must be included");
    assert.equal(slams[0].qualifying, false);
  }
  const overlap = { fields, weeks: { week: [qualifying, [...slam.slice(0, 4), "2026-11-08", ...slam.slice(5)]] } };
  assert.equal(context.currentWeekResultTournaments(overlap, true).length, 1, "overlapping qualifying and main dates must not duplicate the event");
  const orphan = { fields, weeks: { week: [["gs", "Grand Slam", "US Open Qualifying", "", "2026-11-02", "2026-11-08", "wta:905:2026|qualifying", "USA"]] } };
  assert.equal(context.currentWeekResultTournaments(orphan, true)[0].city, "US Open");
  const tourMatch = context.selectedResultMatch();
  tourMatch.sets[0].loser = 4;
  await context.openResultTournamentPicker();
  assert.equal(elements.get("itf-tournament-heading").textContent, "This week's WTA tournaments");
  context.selectResultTournament(tourChoices[0]);
  assert.equal(tourMatch.tournament.name, "Roland Garros");
  assert.equal(tourMatch.tournament.category, "Grand Slam");
  assert.equal(tourMatch.sets[0].loser, 4);
  console.log("Weekly ITF/Tour filtering, Slam qualifying and main weeks, deduplication, category autofill and draft isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
