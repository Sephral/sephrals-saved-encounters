import {MODULE_ID, TESTED_VERSIONS, setting, t} from "./config.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {registerHubModule} from "./hub.mjs";
import {editEncounter, saveSelected} from "./editor-app.mjs";
import {openEncounters, refreshEncounters} from "./encounters-app.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {TURN_KEYS, cancelPreview, turnPreview} from "./preview.mjs";
import {pinFor, placeAgain, placeAtPin, placeEncounter, placePin, rememberPin, removePlaced, rollLoot,
  turnEncounter} from "./placement.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {changeLanguage, registerSettings} from "./settings.mjs";
import {encounterOf, isEncounter, placementOf, turnsOf, worldEncounters} from "./store.mjs";
import {registerUsage} from "./usage.mjs";

/** The tools in the token controls. */
const TOOLS = {save: "sseSave", open: "sseEncounters"};

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  registerSettings({
    language: value => changeLanguage(value, refreshEncounters),
    redraw: refreshEncounters,
    placements: refreshEncounters,
    openEncounters
  });
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["encounterSaved", "encounterPlaced", "combatStarted", "pinPlaced", "placedAtPin", "placedAgain",
      "tokensRemoved", "actorAdded", "lootRolled"],
    settings: ["theme", "placeHidden", "combatAddPlayers", "pinShowsName"]
  });
  registerKeys();
  registerDebug();
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("renderJournalDirectory", onRenderJournalDirectory);
  Hooks.on("getHeaderControlsJournalEntrySheet", onJournalHeaderControls);
  Hooks.on("activateNote", onActivateNote);
  for ( const event of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createNote", "deleteNote",
    "deleteToken", "createFolder", "updateFolder", "deleteFolder", "canvasReady"] ) {
    Hooks.on(event, refreshEncounters);
  }
  game.modules.get(MODULE_ID).api = {
    /** Open the encounters window (GM). */
    open: openEncounters,
    /** Save the selected tokens as a new encounter: opens the editor with them (GM). */
    saveSelected,
    /** Open the editor of an encounter (a JournalEntry). */
    edit: editEncounter,
    /** All encounters of the world (journal entries). */
    encounters: worldEncounters,
    /** The encounter data of a journal entry, or null. */
    encounterOf,
    /**
     * Place an encounter (its JournalEntry or UUID). Options: {combat, center: {x, y}, scene, counts, hidden, turns}.
     * Without a center the GM picks the spot on the map. Returns the created tokens.
     */
    place: placeEncounter,
    /** The facing of an encounter: quarter turns clockwise from the saved formation (0 to 3). */
    facing: turnsOf,
    /** Turn the remembered facing of an encounter by quarter turns (1 right, -1 left). Returns the new facing. */
    turn: turnEncounter,
    /** Turn the group of the running preview (1 right, -1 left). Returns false when no group is being placed. */
    turnPreview,
    /** Place an encounter at its pin on the viewed scene. */
    placeAtPin,
    /** Put a pin for an encounter on the map, the GM picks the spot. */
    placePin,
    /** Remove the tokens of the last placement. */
    removePlaced,
    /** Remove the placed tokens and place the encounter again at the same spot with the same counts. */
    placeAgain,
    /** The last placement of an encounter (by UUID), or null. */
    lastPlacement: placementOf,
    /** Roll the loot table of an encounter, into the Loot Ledger when it is active. */
    rollLoot,
    /** Stop a running placement. */
    cancel: cancelPreview,
    /** Check the module (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM). */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(setting("uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  noticeNewVersions();
});

/**
 * The keys. Save the selected tokens and open the window have no default keys, the GM chooses them in Foundry's key
 * settings. Turn left and right (Q and E) act only while a group follows the mouse: they come before Foundry's own
 * use of Q and E (zoom on Foundry 13, down and up for selected tokens on 14) and hand the key on otherwise. Shift may
 * be held with them, since it only switches off the grid snap of the preview.
 */
function registerKeys() {
  game.keybindings.register(MODULE_ID, "saveSelected", {
    name: "SSE.Keys.saveSelected",
    editable: [],
    restricted: true,
    onDown: () => {
      saveSelected();
      return true;
    }
  });
  game.keybindings.register(MODULE_ID, "openWindow", {
    name: "SSE.Keys.openWindow",
    editable: [],
    restricted: true,
    onDown: () => {
      openEncounters();
      return true;
    }
  });
  const {PRIORITY} = CONST.KEYBINDING_PRECEDENCE;
  game.keybindings.register(MODULE_ID, TURN_KEYS.left, {
    name: "SSE.Keys.turnLeft",
    hint: "SSE.Keys.turnHint",
    editable: [{key: "KeyQ"}],
    reservedModifiers: ["Shift"],
    restricted: true,
    precedence: PRIORITY,
    onDown: () => turnPreview(-1)
  });
  game.keybindings.register(MODULE_ID, TURN_KEYS.right, {
    name: "SSE.Keys.turnRight",
    hint: "SSE.Keys.turnHint",
    editable: [{key: "KeyE"}],
    reservedModifiers: ["Shift"],
    restricted: true,
    precedence: PRIORITY,
    onDown: () => turnPreview(1)
  });
}

/**
 * Hook "getSceneControlButtons": save the selection and open the window, in the token controls (GM).
 * @param {Record<string, object>|object[]} controls
 */
function onGetSceneControlButtons(controls) {
  if ( !game.user.isGM ) return;
  const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === "token") : null);
  if ( !tokens ) return;
  const tools = [
    {name: TOOLS.open, title: "SSE.Tool.open", icon: "fa-solid fa-dragon", button: true, visible: true,
      onChange: () => openEncounters()},
    {name: TOOLS.save, title: "SSE.Tool.save", icon: "fa-solid fa-people-group", button: true, visible: true,
      onChange: () => saveSelected()}
  ];
  for ( const tool of tools ) {
    if ( Array.isArray(tokens.tools) ) tokens.tools.push({...tool, onClick: tool.onChange});
    else {
      tool.order = Object.keys(tokens.tools ?? {}).length;
      tokens.tools[tool.name] = tool;
    }
  }
}

/**
 * Hook "renderJournalDirectory": a button above the journal list (GM).
 * @param {Application} app
 * @param {HTMLElement} html
 */
function onRenderJournalDirectory(app, html) {
  if ( !game.user.isGM ) return;
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  const actions = element?.querySelector(".header-actions");
  if ( !actions || actions.querySelector(".sse-open") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sse-open";
  button.innerHTML = `<i class="fa-solid fa-dragon" inert></i> <span>${t("SSE.Window.title")}</span>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    openEncounters();
  });
  actions.append(button);
}

/**
 * Hook "getHeaderControlsJournalEntrySheet": place, fight, pin and edit in the menu of an encounter's journal entry.
 * Foundry looks the handlers up in the window's actions, so they are put there too.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
function onJournalHeaderControls(app, controls) {
  const entry = app.document;
  if ( !game.user.isGM || !isEncounter(entry) ) return;
  const add = (action, icon, label, visible, handler) => {
    app.options.actions[action] = handler;
    if ( !controls.some(c => c.action === action) ) controls.push({action, icon, label, visible});
  };
  const document = () => app.document;
  add("ssePlace", "fa-solid fa-hand-pointer", "SSE.Window.place", () => true, () => placeEncounter(document()));
  add("sseFight", "fa-solid fa-swords", "SSE.Window.fight", () => true,
    () => placeEncounter(document(), {combat: true}));
  add("sseAtPin", "fa-solid fa-map-location-dot", "SSE.Window.atPin", () => !!pinFor(document()),
    () => placeAtPin(document()));
  add("ssePin", "fa-solid fa-location-dot", "SSE.Window.pin", () => !document().pack, () => placePin(document()));
  add("sseAgain", "fa-solid fa-rotate-left", "SSE.Window.again", () => !!placementOf(document().uuid),
    () => placeAgain(document()));
  add("sseEdit", "fa-solid fa-pen", "SSE.Window.edit", () => !document().pack, () => editEncounter(document()));
}

/**
 * Hook "activateNote": a GM opening an encounter's pin. The journal then offers to place it at this pin; with Alt
 * held the encounter is placed right away and the journal stays closed.
 * @param {Note} note
 * @returns {boolean|void}
 */
function onActivateNote(note) {
  const doc = note?.document;
  const entry = doc?.entry;
  if ( !game.user.isGM || !isEncounter(entry) ) return;
  rememberPin(doc);
  if ( game.keyboard?.isModifierActive?.("Alt") ) {
    placeAtPin(entry, {note: doc});
    return false;
  }
}
