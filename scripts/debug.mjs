/**
 * Saved Encounters' part of the debug file of Sephral's modules: how many encounters the world has, their last
 * placements and pins, and the recent saves, placements and fights. No token data, no notes.
 */

import {MODULE_ID, setting, t} from "./config.mjs";
import {DebugTrace, registerDebugMenu, registerDebugProvider} from "./debug-file.mjs";
import {previewActive} from "./preview.mjs";
import {encounterOf, turnsOf, worldEncounters} from "./store.mjs";

/** The recent decisions of the module. */
export const trace = new DebugTrace();

/**
 * Run one part and keep its error instead, so one broken reading does not cost the rest.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.message ?? err)};
  }
}

/**
 * What the module knows right now.
 * @returns {object}
 */
export function describeState() {
  return {
    encounters: attempt(() => worldEncounters().map(entry => {
      const encounter = encounterOf(entry);
      return {uuid: entry.uuid, groups: encounter?.groups.length ?? null, tokens: encounter?.tokens.length ?? null,
        formulas: encounter?.groups.filter(g => g.formula).length ?? null, loot: !!encounter?.lootTable,
        turns: turnsOf(entry),
        sources: encounter?.groups.map(g => ({world: !!g.actorUuid, compendium: !!g.sourceUuid, linked: g.linked}))};
    })),
    placements: attempt(() => Object.entries(setting("placements") ?? {}).map(([uuid, p]) => ({uuid,
      scene: p.sceneUuid, level: p.levelId ?? null, tokens: p.tokenIds?.length ?? 0, turns: p.turns ?? 0,
      at: p.at}))),
    pins: attempt(() => game.scenes.reduce((n, scene) => n + scene.notes.filter(note =>
      worldEncounters().some(entry => entry.id === note.entryId)).length, 0)),
    previewRunning: attempt(() => previewActive()),
    viewed: attempt(() => ({scene: canvas?.scene?.uuid ?? null, level: canvas?.level?.id ?? null,
      grid: canvas?.scene ? {type: canvas.scene.grid.type, size: canvas.scene.grid.size} : null}))
  };
}

/**
 * The button in the settings and the module's part of the file. Call in "init".
 */
export function registerDebug() {
  registerDebugMenu(MODULE_ID, {name: "SSE.DEBUG.Title", label: "SSE.DEBUG.Save", hint: "SSE.DEBUG.Hint"});
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("SSE.DEBUG.Entry"),
    notice: file => t("SSE.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()}),
    trace,
    // The placements are summed up above
    omitSettings: ["placements"]
  });
}
