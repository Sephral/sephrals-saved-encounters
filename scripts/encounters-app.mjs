/**
 * The encounters window: every saved encounter of the world by folder, with search, and the buttons to place, fight,
 * pin, place again, remove, roll loot, edit and delete.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, imageOr, isShown, setting, t} from "./config.mjs";
import {groupSummary} from "./encounter-data.mjs";
import {editEncounter, saveSelected} from "./editor-app.mjs";
import {placeAgain, placeAtPin, placeEncounter, placePin, removePlaced, rollLoot, turnEncounter} from "./placement.mjs";
import {facingLabel} from "./preview.mjs";
import {deleteEncounter, encounterOf, encounterRoot, findEncounter, pinnedScenes, pinsOf, placedTokens, turnsOf,
  worldEncounters} from "./store.mjs";
import {markUsed} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * A short line about the groups of an encounter: "3 Goblin, 1d4+1 Wolf".
 * @param {object} encounter
 * @returns {string}
 */
export function summaryLine(encounter) {
  return groupSummary(encounter).map(g => {
    const count = g.formula ? g.formula : String(g.count);
    return t("SSE.Window.groupLine", {count, name: g.name});
  }).join(", ");
}

export class EncountersApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sse-encounters",
    classes: ["sse-app", "sse-encounters"],
    tag: "section",
    window: {title: "SSE.Window.title", icon: "fa-solid fa-dragon", resizable: true},
    position: {width: 600, height: 620},
    actions: {
      saveSelected: EncountersApp.#onSaveSelected,
      place: EncountersApp.#onPlace,
      fight: EncountersApp.#onFight,
      pin: EncountersApp.#onPin,
      atPin: EncountersApp.#onAtPin,
      again: EncountersApp.#onAgain,
      remove: EncountersApp.#onRemove,
      loot: EncountersApp.#onLoot,
      turnLeft: EncountersApp.#onTurnLeft,
      turnRight: EncountersApp.#onTurnRight,
      edit: EncountersApp.#onEdit,
      open: EncountersApp.#onOpen,
      delete: EncountersApp.#onDelete
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/encounters.hbs`, scrollable: [".sse-list"]}};

  /** The search text, kept across redraws. */
  #search = "";

  /** Folders the GM closed. */
  #closed = new Set();

  /** @override */
  get title() {
    return t("SSE.Window.title");
  }

  /** @override */
  async _prepareContext() {
    const root = await encounterRoot({create: false});
    const entries = worldEncounters();
    const folders = new Map();
    for ( const entry of entries ) {
      const folder = entry.folder ?? null;
      const key = folder?.id ?? "none";
      if ( !folders.has(key) ) {
        folders.set(key, {id: key, name: folder?.name ?? t("SSE.Window.noFolder"),
          depth: depthBelow(folder, root), sort: folderPath(folder), closed: this.#closed.has(key), encounters: []});
      }
      folders.get(key).encounters.push(this.#row(entry));
    }
    const list = [...folders.values()].sort((a, b) => a.sort.localeCompare(b.sort));
    for ( const folder of list ) {
      folder.encounters.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      folder.count = folder.encounters.length;
    }
    return {
      folders: list,
      empty: !entries.length,
      search: this.#search,
      placeHidden: setting("placeHidden"),
      combatAddPlayers: setting("combatAddPlayers"),
      theme: setting("theme"),
      text: {
        search: t("SSE.Window.search"),
        saveSelected: t("SSE.Window.saveSelected"),
        saveHint: t("SSE.Window.saveHint"),
        placeHidden: t("SSE.SETTINGS.placeHidden.name"),
        combatAddPlayers: t("SSE.SETTINGS.combatAddPlayers.name"),
        empty: t("SSE.Window.empty"),
        place: t("SSE.Window.place"),
        fight: t("SSE.Window.fight"),
        pin: t("SSE.Window.pin"),
        atPin: t("SSE.Window.atPin"),
        again: t("SSE.Window.again"),
        remove: t("SSE.Window.remove"),
        loot: t("SSE.Window.loot"),
        turnLeft: t("SSE.Window.turnLeft"),
        turnRight: t("SSE.Window.turnRight"),
        edit: t("SSE.Window.edit"),
        open: t("SSE.Window.openJournal"),
        delete: t("SSE.Window.delete")
      }
    };
  }

  /**
   * The row of one encounter.
   * @param {JournalEntry} entry
   * @returns {object}
   */
  #row(entry) {
    const encounter = encounterOf(entry);
    const groups = groupSummary(encounter);
    const {scene, tokens} = placedTokens(entry.uuid);
    const pinsHere = pinsOf(entry).length;
    const pinScenes = pinnedScenes(entry);
    const meta = [];
    if ( tokens.length ) meta.push({icon: "fa-solid fa-chess-pawn", text: t("SSE.Window.placedOn", {count: tokens.length, scene: scene.name})});
    if ( pinScenes.length ) meta.push({icon: "fa-solid fa-location-dot", text: t("SSE.Window.pinnedOn", {scenes: pinScenes.map(s => s.name).join(", ")})});
    if ( encounter.lootTable ) meta.push({icon: "fa-solid fa-coins", text: t("SSE.Window.hasLoot")});
    const turns = turnsOf(entry);
    if ( turns ) meta.push({icon: "fa-solid fa-compass", text: facingLabel(turns), facing: true});
    const summary = summaryLine(encounter);
    return {
      uuid: entry.uuid,
      name: entry.name,
      sort: entry.sort,
      turns,
      summary,
      total: encounter.tokens.length,
      portraits: groups.slice(0, 4).map(g => ({src: imageOr(g.img), name: g.name})),
      more: Math.max(groups.length - 4, 0),
      meta,
      placed: tokens.length > 0,
      pinHere: pinsHere > 0,
      loot: !!encounter.lootTable,
      needle: `${entry.name} ${summary}`.toLowerCase()
    };
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.dataset.sseTheme = setting("theme");
    const input = this.element.querySelector("input[name=search]");
    input?.addEventListener("input", () => {
      this.#search = input.value;
      this.#filter();
    });
    for ( const box of this.element.querySelectorAll("input[data-setting]") ) {
      box.addEventListener("change", () => game.settings.set(MODULE_ID, box.dataset.setting, box.checked));
    }
    for ( const details of this.element.querySelectorAll("details[data-folder]") ) {
      details.addEventListener("toggle", () => {
        if ( details.open ) this.#closed.delete(details.dataset.folder);
        else this.#closed.add(details.dataset.folder);
      });
    }
    this.#filter();
  }

  /** Hide the encounters that do not match the search. */
  #filter() {
    const needle = this.#search.trim().toLowerCase();
    for ( const row of this.element.querySelectorAll(".sse-row") ) {
      row.hidden = !!needle && !row.dataset.search.includes(needle);
    }
    for ( const folder of this.element.querySelectorAll("details[data-folder]") ) {
      const visible = [...folder.querySelectorAll(".sse-row")].some(row => !row.hidden);
      folder.hidden = !visible;
      if ( needle && visible ) folder.open = true;
    }
  }

  /**
   * The encounter of a clicked row.
   * @param {HTMLElement} target
   * @returns {Promise<JournalEntry|null>}
   */
  static async #entry(target) {
    return findEncounter(target.closest("[data-uuid]")?.dataset.uuid);
  }

  /**
   * Run a placement with the window out of the way.
   * @param {Function} run
   */
  async #withMapFree(run) {
    const wasOpen = this.rendered && !this.minimized;
    if ( wasOpen ) await this.minimize();
    try {
      await run();
    } finally {
      if ( wasOpen && this.rendered ) await this.maximize();
    }
  }

  /** @this {EncountersApp} */
  static #onSaveSelected() {
    saveSelected();
  }

  /** @this {EncountersApp} */
  static async #onPlace(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await this.#withMapFree(() => placeEncounter(entry));
  }

  /** @this {EncountersApp} */
  static async #onFight(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await this.#withMapFree(() => placeEncounter(entry, {combat: true}));
  }

  /** @this {EncountersApp} */
  static async #onPin(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await this.#withMapFree(() => placePin(entry));
  }

  /** @this {EncountersApp} */
  static async #onAtPin(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await placeAtPin(entry);
  }

  /** @this {EncountersApp} */
  static async #onAgain(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await placeAgain(entry);
  }

  /** @this {EncountersApp} */
  static async #onRemove(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await removePlaced(entry);
  }

  /** @this {EncountersApp} */
  static async #onLoot(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await rollLoot(entry);
  }

  /** @this {EncountersApp} */
  static async #onTurnLeft(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await turnEncounter(entry, -1);
  }

  /** @this {EncountersApp} */
  static async #onTurnRight(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) await turnEncounter(entry, 1);
  }

  /** @this {EncountersApp} */
  static async #onEdit(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( entry ) editEncounter(entry);
  }

  /** @this {EncountersApp} */
  static async #onOpen(event, target) {
    const entry = await EncountersApp.#entry(target);
    entry?.sheet.render(true);
  }

  /** @this {EncountersApp} */
  static async #onDelete(event, target) {
    const entry = await EncountersApp.#entry(target);
    if ( !entry ) return;
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: {title: t("SSE.Window.deleteTitle")},
      content: `<p>${esc(t("SSE.Window.deleteText", {name: entry.name}))}</p>`,
      rejectClose: false
    });
    if ( yes ) await deleteEncounter(entry);
  }
}

/**
 * How deep a folder sits below the "Encounters" folder.
 * @param {Folder|null} folder
 * @param {Folder|null} root
 * @returns {number}
 */
function depthBelow(folder, root) {
  let depth = 0;
  let current = folder;
  while ( current && (current !== root) ) {
    depth++;
    current = current.folder;
  }
  return depth;
}

/**
 * A sortable path of a folder, so subfolders follow their parent.
 * @param {Folder|null} folder
 * @returns {string}
 */
function folderPath(folder) {
  const parts = [];
  let current = folder;
  while ( current ) {
    parts.unshift(`${String(current.sort ?? 0).padStart(12, "0")}${current.name}`);
    current = current.folder;
  }
  return parts.join("/") || "~";
}

/**
 * Open the encounters window (GM).
 * @returns {Promise<EncountersApp|null>}
 */
export function openEncounters() {
  if ( !game.user.isGM ) return Promise.resolve(null);
  const app = foundry.applications.instances.get("sse-encounters") ?? new EncountersApp();
  markUsed(MODULE_ID);
  if ( isShown(app) ) {
    if ( app.minimized ) app.maximize();
    app.bringToFront();
    return Promise.resolve(app);
  }
  return app.render({force: true});
}

/** Redraw the encounters window soon, once for many changes. */
let refreshTimer = null;

/**
 * Redraw the encounters window when it is open.
 */
export function refreshEncounters() {
  if ( refreshTimer ) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const app = foundry.applications.instances.get("sse-encounters");
    if ( isShown(app) ) app.render();
  }, 100);
}
