import assert from "node:assert/strict";
import test from "node:test";

import {SAMPLE_LOOT, sampleEncounter, sampleEncounterList} from "../scripts/sample-data.mjs";
import {groupSummary, pageHtml, planPlacement} from "../scripts/encounter-data.mjs";
import {sampleCast} from "../scripts/samples.mjs";

const foes = sampleCast().filter(member => member.side === "foe");
const text = {names: {ambush: "Bandit encounter", bridge: "Troll encounter", wolves: "Wolf encounter"}, notes: "Notes.",
  place: "The old mill", bandit: "Bandit", wolf: "Wolf", troll: "Troll"};

test("a sample encounter has its groups, tokens and loot", () => {
  const encounter = sampleEncounter({cast: foes, loot: true, notes: "Hi",
    parts: [{id: "bandit1", count: 3, name: "Bandit", formula: "1d4+1"}, {id: "troll", count: 1, linked: true}]});
  assert.equal(encounter.groups.length, 2);
  assert.equal(encounter.tokens.length, 4);
  assert.equal(encounter.lootTable, SAMPLE_LOOT);
  assert.deepEqual(groupSummary(encounter).map(g => [g.name, g.count, g.formula, g.linked]),
    [["Bandit", 3, "1d4+1", false], ["Troll", 1, "", true]]);
  assert.equal(planPlacement(encounter).length, 4);
});

test("unknown cast members are left out", () => {
  const encounter = sampleEncounter({cast: foes, parts: [{id: "nobody", count: 2}, {id: "wolf", count: 1}]});
  assert.equal(encounter.groups.length, 1);
});

test("the sample list shows every kind of row", () => {
  const list = sampleEncounterList(foes, text);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(e => e.folder), ["root", "mill", null]);
  assert.ok(list[0].encounter.lootTable && list[0].placed > 0 && list[0].pinsHere && list[0].turns);
  assert.ok(list[1].encounter.groups.some(g => g.linked));
  assert.equal(new Set(list.map(e => e.uuid)).size, 3);
});

test("the journal page of a sample encounter reads like a real one", () => {
  const [first] = sampleEncounterList(foes, text);
  const html = pageHtml(first.encounter, {monsters: "Monsters", count: "How many", notes: "Notes", unique: "unique",
    rolled: formula => `rolled: ${formula}`, loot: "Loot", lootName: "Loot table"});
  assert.match(html, /rolled: 1d4\+1/);
  assert.match(html, /Loot table/);
  assert.match(html, /Notes\./);
});
