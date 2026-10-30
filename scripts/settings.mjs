/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language.
 */

import {MODULE_ID, isShown} from "./config.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, object>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: "language", choices: {
    [FOLLOW_FOUNDRY]: "SSE.LANGUAGE.default", de: "SSE.LANGUAGE.de", en: "SSE.LANGUAGE.en"}},
  theme: {type: String, default: "signature", scope: "client", onChange: "redraw", choices: {
    signature: "SSE.SETTINGS.theme.signature", foundry: "SSE.SETTINGS.theme.foundry"}},
  placeHidden: {type: Boolean, default: false, scope: "client", onChange: "redraw"},
  combatAddPlayers: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  pinShowsName: {type: Boolean, default: true}
};

/**
 * Register all settings of the module and its menus.
 * @param {{language: Function, redraw: Function, openEncounters: Function, placements: Function}} handlers
 */
export function registerSettings(handlers) {
  openEncountersMenu = handlers.openEncounters;
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SSE.SETTINGS.${key}.name`,
      hint: `SSE.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.type,
      choices: def.choices,
      default: def.default,
      onChange: def.onChange ? value => handlers[def.onChange]?.(value) : undefined
    });
  }

  // The last placement of every encounter, by the encounter's UUID, so it can be removed and placed again
  game.settings.register(MODULE_ID, "placements", {scope: "world", config: false, type: Object, default: {},
    onChange: value => handlers.placements?.(value)});
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});

  game.settings.registerMenu(MODULE_ID, "encounters", {
    name: "SSE.Window.title",
    label: "SSE.Window.open",
    hint: "SSE.Window.menuHint",
    icon: "fa-solid fa-dragon",
    type: EncountersMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SSE.SELFTEST.Title",
    label: "SSE.SELFTEST.Run",
    hint: "SSE.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: EncounterSelfTestMenu,
    restricted: true
  });
}

/** Opens the encounters window for the menu button. */
let openEncountersMenu = () => {};

/** The menu button which opens the encounters window (the one window, not a second copy of it). */
class EncountersMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await openEncountersMenu();
    return this;
  }
}

/** The menu button which runs the self-test. Foundry only accepts application classes as menus. */
class EncounterSelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/**
 * Switch the module strings when the user picks another module language, then redraw.
 * @param {string} value
 * @param {Function} redraw
 */
export function changeLanguage(value, redraw) {
  applyModuleLanguage(value).then(() => {
    for ( const id of ["sse-encounters"] ) {
      const app = foundry.applications.instances.get(id);
      if ( isShown(app) ) app.render({window: {title: app.title}});
    }
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}
