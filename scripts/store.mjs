/**
 * Where encounters live: one journal entry each, in a folder "Encounters" only the GM can see, with a readable page
 * and the data in a flag. So an encounter can travel in a compendium or an adventure. The last placement of each
 * encounter is kept in a hidden world setting.
 */

import {ENCOUNTER_FLAG, FOLDER_FLAG, MODULE_ID, TURNS_FLAG, setting, t} from "./config.mjs";
import {normalTurns, normalizeEncounter, pageHtml, prunePlacements} from "./encounter-data.mjs";

/** The flag on the page the module writes. */
const SUMMARY_FLAG = "summary";

/**
 * The encounter of a journal entry (world or compendium), or null.
 * @param {JournalEntry|object|null} entry
 * @returns {object|null}
 */
export function encounterOf(entry) {
  if ( !entry ) return null;
  return normalizeEncounter(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.${ENCOUNTER_FLAG}`));
}

/**
 * Does a journal entry hold an encounter?
 * @param {JournalEntry|object|null} entry
 * @returns {boolean}
 */
export function isEncounter(entry) {
  return !!foundry.utils.getProperty(entry ?? {}, `flags.${MODULE_ID}.${ENCOUNTER_FLAG}`);
}

/**
 * All encounters of the world.
 * @returns {JournalEntry[]}
 */
export function worldEncounters() {
  return game.journal.filter(entry => isEncounter(entry));
}

/**
 * Find an encounter's journal entry by UUID (world or compendium).
 * @param {string|JournalEntry} ref
 * @returns {Promise<JournalEntry|null>}
 */
export async function findEncounter(ref) {
  if ( !ref ) return null;
  const entry = (typeof ref === "string") ? await fromUuid(ref) : ref;
  return (entry?.documentName === "JournalEntry") && isEncounter(entry) ? entry : null;
}

/**
 * The facing of an encounter: quarter turns clockwise (0 to 3) from the saved formation, as it was placed last.
 * @param {JournalEntry|object|string|null} entry   The journal entry or its UUID
 * @returns {number}
 */
export function turnsOf(entry) {
  if ( typeof entry === "string" ) entry = fromUuidSync(entry, {strict: false});
  if ( !entry || (typeof entry !== "object") ) return 0;
  return normalTurns(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.${TURNS_FLAG}`));
}

/**
 * Remember the facing of an encounter on its journal entry, so placing at the pin uses it too. An encounter in a
 * compendium keeps its facing, the compendium may be locked.
 * @param {JournalEntry} entry
 * @param {number} turns
 * @returns {Promise<boolean>}   Was it written?
 */
export async function rememberTurns(entry, turns) {
  const q = normalTurns(turns);
  if ( !entry || entry.pack || !game.user.isGM || (turnsOf(entry) === q) ) return false;
  await entry.update({[`flags.${MODULE_ID}.${TURNS_FLAG}`]: q});
  return true;
}

/* -------------------------------------------- */
/*  Folders                                     */
/* -------------------------------------------- */

/**
 * The folder the module made for a document type, found by its flag, so a renamed folder still counts.
 * @param {"JournalEntry"|"Actor"} type
 * @returns {Folder|undefined}
 */
function moduleFolder(type) {
  return game.folders.find(f => (f.type === type) && f.getFlag(MODULE_ID, FOLDER_FLAG));
}

/**
 * The "Encounters" journal folder, made when it is missing.
 * @param {object} [options]
 * @param {boolean} [options.create=true]
 * @returns {Promise<Folder|null>}
 */
export async function encounterRoot({create = true} = {}) {
  const found = moduleFolder("JournalEntry");
  if ( found || !create ) return found ?? null;
  return Folder.implementation.create({name: t("SSE.Folder.root"), type: "JournalEntry", color: "#7a2e1d",
    flags: {[MODULE_ID]: {[FOLDER_FLAG]: true}}});
}

/**
 * The actor folder for monsters imported from compendiums, made when it is missing.
 * @returns {Promise<Folder>}
 */
export async function actorFolder() {
  return moduleFolder("Actor") ?? Folder.implementation.create({name: t("SSE.Folder.actors"), type: "Actor",
    color: "#7a2e1d", flags: {[MODULE_ID]: {[FOLDER_FLAG]: true}}});
}

/**
 * The folders an encounter can go to: the "Encounters" folder and everything below it.
 * @returns {{id: string, name: string, depth: number}[]}
 */
export function encounterFolders() {
  const root = moduleFolder("JournalEntry");
  if ( !root ) return [];
  const list = [{id: root.id, name: root.name, depth: 0}];
  const walk = (parent, depth) => {
    const children = game.folders.filter(f => (f.type === "JournalEntry") && (f.folder?.id === parent.id))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    for ( const child of children ) {
      list.push({id: child.id, name: child.name, depth});
      walk(child, depth + 1);
    }
  };
  walk(root, 1);
  return list;
}

/**
 * Make a new folder below the "Encounters" folder.
 * @param {string} name
 * @param {string|null} [parentId]   Defaults to the "Encounters" folder
 * @returns {Promise<Folder>}
 */
export async function createEncounterFolder(name, parentId = null) {
  const root = await encounterRoot();
  return Folder.implementation.create({name, type: "JournalEntry", folder: parentId ?? root.id});
}

/* -------------------------------------------- */
/*  Writing                                     */
/* -------------------------------------------- */

/**
 * The page labels in the current language.
 * @param {object} encounter
 * @returns {Promise<object>}
 */
async function labels(encounter) {
  const table = encounter.lootTable ? await fromUuid(encounter.lootTable).catch(() => null) : null;
  return {
    monsters: t("SSE.Page.monsters"),
    count: t("SSE.Page.count"),
    notes: t("SSE.Page.notes"),
    unique: t("SSE.Page.unique"),
    rolled: formula => t("SSE.Page.rolled", {formula}),
    loot: t("SSE.Page.loot"),
    lootName: table?.name ?? null
  };
}

/**
 * Save a new encounter as a journal entry only the GM can see.
 * @param {object} encounter    Normalized encounter data
 * @param {object} options
 * @param {string} options.name
 * @param {string|null} [options.folderId]   Defaults to the "Encounters" folder
 * @returns {Promise<JournalEntry>}
 */
export async function createEncounter(encounter, {name, folderId = null}) {
  const root = await encounterRoot();
  const content = pageHtml(encounter, await labels(encounter));
  return JournalEntry.implementation.create({
    name: name || t("SSE.Editor.defaultName"),
    folder: folderId ?? root.id,
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
    flags: {[MODULE_ID]: {[ENCOUNTER_FLAG]: encounter}},
    pages: [{name: t("SSE.Page.name"), type: "text", text: {content}, flags: {[MODULE_ID]: {[SUMMARY_FLAG]: true}}}]
  });
}

/**
 * Write changed encounter data back and renew the readable page. Pages the GM added stay as they are.
 * @param {JournalEntry} entry
 * @param {object} encounter
 * @param {{name?: string, folderId?: string|null}} [options]
 * @returns {Promise<JournalEntry>}
 */
export async function updateEncounter(entry, encounter, {name, folderId} = {}) {
  const update = {[`flags.${MODULE_ID}.${ENCOUNTER_FLAG}`]: encounter};
  if ( name ) update.name = name;
  if ( folderId !== undefined ) update.folder = folderId;
  // Arrays are replaced and every key is present, so the merge of the update writes exactly this data
  await entry.update(update);
  const content = pageHtml(encounter, await labels(encounter));
  const page = entry.pages.find(p => p.getFlag(MODULE_ID, SUMMARY_FLAG));
  if ( page ) await page.update({"text.content": content});
  else {
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: t("SSE.Page.name"), type: "text", text: {content},
      sort: -1, flags: {[MODULE_ID]: {[SUMMARY_FLAG]: true}}}]);
  }
  return entry;
}

/**
 * Delete an encounter with its map pins and its last placement. Placed tokens stay on their scene.
 * @param {JournalEntry} entry
 */
export async function deleteEncounter(entry) {
  for ( const scene of game.scenes ) {
    const pins = scene.notes.filter(n => n.entryId === entry.id).map(n => n.id);
    if ( pins.length ) await scene.deleteEmbeddedDocuments("Note", pins);
  }
  await forgetPlacement(entry.uuid);
  await entry.delete();
}

/* -------------------------------------------- */
/*  Pins                                        */
/* -------------------------------------------- */

/**
 * The map pins of an encounter on a scene.
 * @param {JournalEntry} entry
 * @param {Scene|null} [scene]   Defaults to the viewed scene
 * @returns {NoteDocument[]}
 */
export function pinsOf(entry, scene = canvas?.scene) {
  if ( !entry || entry.pack || !scene ) return [];
  return scene.notes.filter(n => n.entryId === entry.id);
}

/**
 * Every scene with a pin of the encounter.
 * @param {JournalEntry} entry
 * @returns {Scene[]}
 */
export function pinnedScenes(entry) {
  if ( !entry || entry.pack ) return [];
  return game.scenes.filter(s => s.notes.some(n => n.entryId === entry.id));
}

/* -------------------------------------------- */
/*  Placements                                  */
/* -------------------------------------------- */

/**
 * The last placement of an encounter.
 * @param {string} uuid
 * @returns {{sceneUuid: string, levelId: string|null, center: {x: number, y: number}, tokenIds: string[],
 *   counts: Record<string, number>, at: number}|null}
 */
export function placementOf(uuid) {
  return setting("placements")?.[uuid] ?? null;
}

/**
 * Remember the last placement of an encounter.
 * @param {string} uuid
 * @param {object} placement
 */
export async function rememberPlacement(uuid, placement) {
  const all = foundry.utils.deepClone(setting("placements") ?? {});
  all[uuid] = {...placement, at: Date.now()};
  await game.settings.set(MODULE_ID, "placements", prunePlacements(all));
}

/**
 * Forget the last placement of an encounter.
 * @param {string} uuid
 */
export async function forgetPlacement(uuid) {
  const all = foundry.utils.deepClone(setting("placements") ?? {});
  if ( !(uuid in all) ) return;
  delete all[uuid];
  await game.settings.set(MODULE_ID, "placements", all);
}

/**
 * The tokens of the last placement that are still on their scene.
 * @param {string} uuid
 * @returns {{scene: Scene|null, tokens: TokenDocument[]}}
 */
export function placedTokens(uuid) {
  const placement = placementOf(uuid);
  if ( !placement ) return {scene: null, tokens: []};
  const scene = fromUuidSync(placement.sceneUuid);
  if ( !scene ) return {scene: null, tokens: []};
  return {scene, tokens: placement.tokenIds.map(id => scene.tokens.get(id)).filter(Boolean)};
}
