import assert from "node:assert/strict";
import test from "node:test";

// The parts of Foundry the registration and the state touch
const menus = new Map();
const hooks = [];
const getProperty = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);
const encounter = {
  v: 1,
  grid: {sizeX: 100, sizeY: 100, type: 1},
  groups: [{key: "g0", actorUuid: "Actor.a", sourceUuid: "Compendium.x.y.Actor.z", name: "Goblin", formula: "1d4",
    linked: false}],
  tokens: [{group: "g0", dx: 0, dy: 0, data: {name: "Goblin"}}, {group: "g0", dx: 1, dy: 0, data: {name: "Goblin"}}],
  notes: "secret plan",
  lootTable: "RollTable.t"
};
const entries = [
  {id: "j1", uuid: "JournalEntry.j1", name: "Camp", flags: {"sephrals-saved-encounters": {encounter, turns: 3}}},
  {id: "j2", uuid: "JournalEntry.j2", name: "Diary", flags: {}}
];
globalThis.Hooks = {on: name => hooks.push(name)};
globalThis.foundry = {utils: {getProperty}, applications: {api: {ApplicationV2: class {}}}};
globalThis.canvas = {scene: {uuid: "Scene.s", grid: {type: 1, size: 100}}, level: null};
globalThis.game = {
  user: {id: "gm", isGM: true},
  journal: {filter: fn => entries.filter(fn)},
  scenes: [{notes: [{entryId: "j1"}, {entryId: "j9"}]}],
  i18n: {localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}`},
  settings: {
    registerMenu: (module, key, data) => menus.set(`${module}.${key}`, data),
    get: (module, key) => (key === "placements"
      ? {"JournalEntry.j1": {sceneUuid: "Scene.s", levelId: null, tokenIds: ["a", "b"], turns: 2, at: 5}} : null)
  }
};

const {MODULE_ID} = await import("../scripts/config.mjs");
const {describeState, registerDebug, trace} = await import("../scripts/debug.mjs");

test("the debug file button and the module's part are registered", () => {
  registerDebug();
  const menu = menus.get(`${MODULE_ID}.debugFile`);
  assert.equal(menu.label, "SSE.DEBUG.Save");
  assert.equal(menu.restricted, true);
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.equal(provider.label(), "SSE.DEBUG.Entry");
  assert.deepEqual(provider.omitSettings, ["placements"]);
  assert.equal(provider.message, undefined);
  assert.equal(provider.trace, trace);
  assert.deepEqual(hooks, ["getChatMessageContextOptions"]);
});

test("the state counts encounters, placements and pins without notes or token data", () => {
  const state = describeState();
  assert.deepEqual(state.encounters, [{uuid: "JournalEntry.j1", groups: 1, tokens: 2, formulas: 1, loot: true,
    turns: 3, sources: [{world: true, compendium: true, linked: false}]}]);
  assert.deepEqual(state.placements, [{uuid: "JournalEntry.j1", scene: "Scene.s", level: null, tokens: 2, turns: 2,
    at: 5}]);
  assert.equal(state.pins, 1);
  assert.equal(state.previewRunning, false);
  assert.deepEqual(state.viewed, {scene: "Scene.s", level: null, grid: {type: 1, size: 100}});
  assert.ok(!JSON.stringify(state).includes("secret plan"));
});
