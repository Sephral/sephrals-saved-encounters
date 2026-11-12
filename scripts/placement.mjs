/**
 * Placing an encounter: roll the counts, find the actors, let the GM choose the spot, create the tokens on the viewed
 * level, remember the placement and start the fight if asked. Also the map pins, removing the placed tokens and
 * placing them again.
 */

import {MODULE_ID, PIN_ICON, hasLevels, setting, t} from "./config.mjs";
import {resolveActors} from "./actors.mjs";
import {arrangePoints, limitLinked, normalTurns, planBounds, planPlacement, planPoints, resolveCounts, scaleCounts,
  turnPlan} from "./encounter-data.mjs";
import {PlacementPreview} from "./preview.mjs";
import {encounterOf, findEncounter, forgetPlacement, placedTokens, placementOf, rememberPlacement, rememberTurns,
  turnsOf} from "./store.mjs";
import {trace} from "./debug.mjs";
import {countFeature} from "./usage.mjs";

/**
 * Roll a count formula.
 * @param {string} formula
 * @returns {Promise<number>}
 */
async function rollFormula(formula) {
  const roll = await new Roll(formula).evaluate({allowInteractive: false});
  return roll.total;
}

/**
 * The grid of a scene in pixels per cell.
 * @param {Scene} scene
 * @returns {{sizeX: number, sizeY: number, square: boolean, gridless: boolean}}
 */
function gridOf(scene) {
  const grid = scene.grid;
  const size = grid?.size ?? 100;
  return {sizeX: grid?.sizeX ?? size, sizeY: grid?.sizeY ?? size, square: !!grid?.isSquare,
    gridless: !!grid?.isGridless};
}

/**
 * The floor of a level (Foundry 14), or 0.
 * @param {Scene} scene
 * @param {string|null} levelId
 * @returns {number}
 */
function levelBottom(scene, levelId) {
  if ( !hasLevels() || !levelId ) return 0;
  const bottom = scene.levels?.get(levelId)?.elevation?.bottom;
  return Number.isFinite(bottom) ? bottom : 0;
}

/**
 * Snap the top left corner of a token the way Foundry snaps a dragged token.
 * @param {Scene} scene
 * @param {{x: number, y: number, width: number, height: number, shape?: number}} data
 * @returns {{x: number, y: number}}
 */
function snapToken(scene, data) {
  try {
    const Cls = CONFIG.Token.documentClass;
    const doc = new Cls({name: "", x: Math.round(data.x), y: Math.round(data.y), width: data.width,
      height: data.height, ...(data.shape !== undefined ? {shape: data.shape} : {})}, {parent: scene});
    const snapped = doc.getSnappedPosition({x: data.x, y: data.y, width: data.width, height: data.height});
    return {x: snapped.x, y: snapped.y};
  } catch {
    return {x: data.x, y: data.y};
  }
}

/**
 * The rectangle of the scene itself in pixels, without its padding.
 * @param {Scene} scene
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
function sceneRect(scene) {
  const d = scene?.dimensions;
  if ( !d || !Number.isFinite(d.sceneWidth) ) return null;
  return {x: d.sceneX, y: d.sceneY, width: d.sceneWidth, height: d.sceneHeight};
}

/**
 * The top left corners in pixels of all planned tokens around a center: inside the scene, snapped to the grid, one
 * token per cell (see arrangePoints).
 * @param {object} encounter
 * @param {object[]} plan
 * @param {Scene} scene
 * @param {{x: number, y: number}} center
 * @param {boolean} snap
 * @returns {{index: number, x: number, y: number, width: number, height: number}[]}
 */
export function positionsFor(encounter, plan, scene, center, snap) {
  const grid = gridOf(scene);
  const points = planPoints(encounter, plan, center, grid);
  const shapeOf = p => encounter.tokens[p.index].data?.shape;
  const snapper = (snap && !grid.gridless) ? (p => snapToken(scene, {...p, shape: shapeOf(p)})) : null;
  return arrangePoints(points, {grid, rect: sceneRect(scene), snap: snapper});
}

/**
 * The picture of a token, with a random one of the actor's when the prototype asks for it (wildcard images).
 * @param {object} data
 * @param {Actor|null} actor
 * @returns {Promise<string|null>}
 */
async function tokenImage(data, actor) {
  const src = data.texture?.src ?? null;
  if ( !src?.includes("*") || !actor ) return src;
  try {
    const images = await actor.getTokenImages();
    return images[Math.floor(Math.random() * images.length)] ?? actor.img;
  } catch {
    return actor.img;
  }
}

/**
 * The token data to create from a plan.
 * @param {object} encounter
 * @param {object[]} points     From positionsFor
 * @param {Map<string, Actor>} actors
 * @param {{scene: Scene, levelId: string|null, hidden: boolean}} options
 * @returns {Promise<object[]>}
 */
async function tokenData(encounter, points, actors, {scene, levelId, hidden}) {
  const bottom = levelBottom(scene, levelId);
  const result = [];
  for ( const point of points ) {
    const token = encounter.tokens[point.index];
    const actor = actors.get(token.group);
    if ( !actor ) continue;
    const data = foundry.utils.deepClone(token.data);
    data.actorId = actor.id;
    data.x = Math.round(point.x);
    data.y = Math.round(point.y);
    data.elevation = bottom + (Number(token.elevation) || 0);
    if ( hidden ) data.hidden = true;
    if ( hasLevels() && levelId ) data.level = levelId;
    const src = await tokenImage(data, actor);
    if ( src ) foundry.utils.setProperty(data, "texture.src", src);
    data.width ??= 1;
    data.height ??= 1;
    result.push(data);
  }
  return result;
}

/**
 * The actors that already have a linked token on a scene: unique characters that stand there.
 * @param {Scene} scene
 * @returns {Set<string>}
 */
export function linkedOnScene(scene) {
  return new Set((scene?.tokens ?? []).filter(token => token.actorLink && token.actorId).map(token => token.actorId));
}

/**
 * Place an encounter. Without a center the GM chooses the spot on the map. A unique character (a token linked to its
 * actor) is placed once and left out when it already stands on the scene. The GM gets a notice naming it. Place and
 * fight does not pull such a character into the fight either. The group faces the way it was placed last (see
 * turnsOf); in the preview the GM turns it, and that facing is remembered for the next placement and the pin.
 * @param {JournalEntry|string} ref           The encounter or its UUID
 * @param {object} [options]
 * @param {boolean} [options.combat=false]    Start a fight with the placed tokens
 * @param {{x: number, y: number}|null} [options.center]   Place here without asking
 * @param {Scene|null} [options.scene]        The scene, defaults to the viewed scene
 * @param {string|null} [options.levelId]     The level (Foundry 14), defaults to the viewed level
 * @param {Record<string, number>|null} [options.counts]   Fixed counts instead of rolling
 * @param {number} [options.multiply]         Place the group this many times over: the counts of every group are
 *   multiplied (linked actors stay single), for modules that place "three of these groups"
 * @param {boolean} [options.hidden]          Place hidden, defaults to the setting
 * @param {boolean} [options.snap=true]
 * @param {number} [options.turns]            Quarter turns clockwise from the saved formation (negative: to the
 *   left), defaults to the remembered facing
 * @returns {Promise<TokenDocument[]>}
 */
export async function placeEncounter(ref, {combat = false, center = null, scene = null, levelId, counts = null,
  hidden, snap = true, turns, multiply = 1} = {}) {
  if ( !game.user.isGM ) return [];
  const entry = await findEncounter(ref);
  const encounter = encounterOf(entry);
  if ( !encounter?.tokens.length ) {
    ui.notifications.warn(t("SSE.Notice.empty"));
    return [];
  }
  scene ??= canvas?.scene ?? null;
  if ( !scene || (!center && !canvas?.ready) ) {
    ui.notifications.warn(t("SSE.Notice.noScene"));
    return [];
  }
  const viewed = scene === canvas?.scene;
  levelId = levelId ?? (viewed && hasLevels() ? (canvas.level?.id ?? null) : null);
  if ( hasLevels() && !levelId ) levelId = scene.initialLevel?.id ?? scene.levels?.contents?.[0]?.id ?? null;
  hidden ??= setting("placeHidden");

  const {actors, missing, imported} = await resolveActors(encounter);
  if ( missing.length ) ui.notifications.warn(t("SSE.Notice.missingActors", {names: missing.join(", ")}));
  if ( !actors.size ) return [];
  counts ??= await resolveCounts(encounter, rollFormula);
  counts = scaleCounts(encounter, counts, multiply);
  const planned = planPlacement(encounter, counts).filter(p => actors.has(encounter.tokens[p.index].group));
  // Unique characters (linked actors) come once per scene: not again when they already stand there
  const {plan, skipped} = limitLinked(encounter, planned, {actorOf: key => actors.get(key)?.id,
    present: linkedOnScene(scene)});
  if ( skipped.length ) {
    const names = [...new Set(skipped.map(key => actors.get(key)?.name).filter(Boolean))].join(", ");
    ui.notifications.info(t(combat ? "SSE.Notice.linkedSkippedFight" : "SSE.Notice.linkedSkipped", {names}));
  }
  if ( !plan.length ) {
    if ( !skipped.length ) ui.notifications.info(t("SSE.Notice.noneRolled", {name: entry.name}));
    return [];
  }

  turns = (turns === undefined) || (turns === null) ? turnsOf(entry) : normalTurns(turns);
  // The plan turned each way, made once: the preview asks for it on every frame
  const turned = [];
  const planFor = q => (turned[q] ??= turnPlan(encounter, plan, q));
  if ( !center ) {
    const grid = gridOf(scene);
    const layout = (point, wantSnap, q) => positionsFor(encounter, planFor(normalTurns(q)), scene, point, wantSnap)
      .map(p => {
        const data = encounter.tokens[p.index].data;
        return {x: p.x, y: p.y, width: p.width * grid.sizeX, height: p.height * grid.sizeY,
          src: data.texture?.src?.includes("*") ? actors.get(encounter.tokens[p.index].group)?.img : data.texture?.src,
          scaleX: data.texture?.scaleX, scaleY: data.texture?.scaleY};
      });
    const label = t(combat ? "SSE.Preview.placeFight" : "SSE.Preview.place", {name: entry.name, count: plan.length});
    const choice = await new PlacementPreview({layout, label, turns}).choose();
    if ( !choice ) return [];
    center = choice.center;
    snap = choice.snap;
    turns = normalTurns(choice.turns);
    // The facing chosen here is the one the pin and the next placement start with
    await rememberTurns(entry, turns).catch(err => console.warn(`${MODULE_ID} | The facing was not kept`, err));
  }

  const points = positionsFor(encounter, planFor(turns), scene, center, snap);
  const data = await tokenData(encounter, points, actors, {scene, levelId, hidden});
  const created = await scene.createEmbeddedDocuments("Token", data);
  await rememberPlacement(entry.uuid, {sceneUuid: scene.uuid, levelId, center: {x: center.x, y: center.y},
    tokenIds: created.map(token => token.id), counts, turns});
  trace.add("placed", {encounter: entry.uuid, scene: scene.uuid, tokens: created.length, counts, imported, combat,
    skipped: skipped.length, turns});
  countFeature(MODULE_ID, "encounterPlaced");
  if ( imported ) ui.notifications.info(t("SSE.Notice.imported", {count: imported}));
  if ( combat ) await startCombat(scene, created);
  ui.notifications.info(t("SSE.Notice.placed", {name: entry.name, count: created.length}));
  return created;
}

/**
 * Actor types that stand for something else than a fighter: a party or group (Crucible, dnd5e, SWADE, PF2e), loot
 * (PF2e). Crucible cannot even sort a fight with its group actor in it.
 */
const NOT_FIGHTING = new Set(["group", "party", "loot"]);

/**
 * Can the token of a placement join a fight? Not without an actor, not as a group or loot actor, not as an Item Piles
 * pile.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
export function canFight(token) {
  const actor = token?.actor;
  if ( !actor || NOT_FIGHTING.has(actor.type) ) return false;
  try {
    if ( game.modules.get("item-piles")?.active && game.itempiles?.API?.isValidItemPile?.(token) ) return false;
  } catch {
    // Item Piles could not tell; the token fights
  }
  return true;
}

/**
 * Put placed tokens into the fight of their scene (a new one when there is none), with the player tokens of the scene
 * if the setting says so, and roll initiative for the new monsters. Groups, loot and piles stay out (see canFight).
 * @param {Scene} scene
 * @param {TokenDocument[]} tokens
 * @returns {Promise<Combat|null>}
 */
export async function startCombat(scene, created) {
  const tokens = created.filter(canFight);
  if ( !tokens.length ) return null;
  let combat = game.combats.find(c => (c.scene?.id === scene.id) && c.active)
    ?? game.combats.find(c => c.scene?.id === scene.id);
  if ( !combat ) combat = await Combat.implementation.create({scene: scene.id, active: true});
  else if ( !combat.active ) await combat.activate();
  const present = new Set(combat.combatants.map(c => c.tokenId));
  const joining = [...tokens];
  if ( setting("combatAddPlayers") ) {
    for ( const token of scene.tokens ) {
      if ( token.actor?.hasPlayerOwner && !token.hidden && canFight(token) ) joining.push(token);
    }
  }
  const add = [];
  for ( const token of joining ) {
    if ( present.has(token.id) ) continue;
    present.add(token.id);
    add.push({tokenId: token.id, sceneId: scene.id, actorId: token.actorId, hidden: token.hidden});
  }
  if ( add.length ) await combat.createEmbeddedDocuments("Combatant", add);
  const placed = new Set(tokens.map(token => token.id));
  const ids = combat.combatants.filter(c => placed.has(c.tokenId) && (c.initiative === null)).map(c => c.id);
  // A system without a working initiative formula must not undo the fight: the monsters are in it, the GM rolls later
  if ( ids.length ) {
    try {
      await combat.rollInitiative(ids);
    } catch(err) {
      console.warn(`${MODULE_ID} | Initiative could not be rolled`, err);
      ui.notifications.warn(t("SSE.Notice.initiativeFailed", {error: err?.message ?? String(err)}));
    }
  }
  ui.sidebar?.changeTab?.("combat", "primary");
  countFeature(MODULE_ID, "combatStarted");
  trace.add("combat", {combat: combat.id, added: add.length, rolled: ids.length});
  return combat;
}

/**
 * Remove the tokens of the last placement that are still on their scene.
 * @param {JournalEntry|string} ref
 * @returns {Promise<number>}   How many were removed
 */
export async function removePlaced(ref) {
  const entry = await findEncounter(ref);
  if ( !entry || !game.user.isGM ) return 0;
  const {scene, tokens} = placedTokens(entry.uuid);
  if ( scene && tokens.length ) await scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id));
  countFeature(MODULE_ID, "tokensRemoved");
  trace.add("removed", {encounter: entry.uuid, tokens: tokens.length});
  ui.notifications.info(t("SSE.Notice.removed", {name: entry.name, count: tokens.length}));
  return tokens.length;
}

/**
 * Remove the placed tokens and place the encounter again at the same spot with the same counts and facing, as fresh
 * tokens.
 * @param {JournalEntry|string} ref
 * @returns {Promise<TokenDocument[]>}
 */
export async function placeAgain(ref) {
  const entry = await findEncounter(ref);
  if ( !entry || !game.user.isGM ) return [];
  const placement = placementOf(entry.uuid);
  const scene = placement ? fromUuidSync(placement.sceneUuid) : null;
  if ( !placement || !scene ) {
    ui.notifications.warn(t("SSE.Notice.noPlacement", {name: entry.name}));
    if ( placement ) await forgetPlacement(entry.uuid);
    return [];
  }
  const {tokens} = placedTokens(entry.uuid);
  if ( tokens.length ) await scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id));
  countFeature(MODULE_ID, "placedAgain");
  // A placement from before the group could turn faced the saved way
  return placeEncounter(entry, {center: placement.center, scene, levelId: placement.levelId,
    counts: placement.counts, turns: placement.turns ?? 0});
}

/**
 * Turn the remembered facing of an encounter, which the next placement, the pin and Alt and double click use.
 * @param {JournalEntry|string} ref
 * @param {number} delta    Quarter turns: 1 right, -1 left
 * @returns {Promise<number|null>}   The new facing, null when the encounter cannot keep one (not found, compendium)
 */
export async function turnEncounter(ref, delta) {
  const entry = await findEncounter(ref);
  if ( !entry || entry.pack || !game.user.isGM ) return null;
  const turns = normalTurns(turnsOf(entry) + Math.round(Number(delta) || 0));
  await rememberTurns(entry, turns);
  trace.add("turned", {encounter: entry.uuid, turns});
  return turns;
}

/* -------------------------------------------- */
/*  Pins                                        */
/* -------------------------------------------- */

/**
 * Put a pin for an encounter on the map. The GM chooses the spot.
 * @param {JournalEntry|string} ref
 * @returns {Promise<NoteDocument|null>}
 */
export async function placePin(ref) {
  const entry = await findEncounter(ref);
  if ( !entry || !game.user.isGM ) return null;
  if ( entry.pack ) {
    ui.notifications.warn(t("SSE.Notice.pinCompendium"));
    return null;
  }
  if ( !canvas?.ready || !canvas.scene ) {
    ui.notifications.warn(t("SSE.Notice.noScene"));
    return null;
  }
  const choice = await new PlacementPreview({layout: () => [], pin: true,
    label: t("SSE.Preview.pin", {name: entry.name})}).choose();
  if ( !choice ) return null;
  const scene = canvas.scene;
  const data = {
    entryId: entry.id,
    x: Math.round(choice.center.x),
    y: Math.round(choice.center.y),
    texture: {src: PIN_ICON, tint: "#ffb04a"},
    iconSize: 48,
    text: setting("pinShowsName") ? entry.name : "",
    fontSize: 24,
    textAnchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM
  };
  if ( hasLevels() && canvas.level ) data.levels = [canvas.level.id];
  const [note] = await scene.createEmbeddedDocuments("Note", [data]);
  countFeature(MODULE_ID, "pinPlaced");
  trace.add("pin", {encounter: entry.uuid, scene: scene.uuid, note: note?.id});
  const shown = game.settings.get("core", "notesDisplayToggle") || (canvas.activeLayer === canvas.notes);
  ui.notifications.info(t(shown ? "SSE.Notice.pinned" : "SSE.Notice.pinnedHidden", {name: entry.name}));
  return note ?? null;
}

/**
 * The pin that was opened last, by encounter id, so its journal can place the encounter there.
 * @type {Map<string, {sceneId: string, noteId: string}>}
 */
const openedPins = new Map();

/**
 * Remember the pin a GM opened.
 * @param {NoteDocument} note
 */
export function rememberPin(note) {
  if ( note?.entryId && note.parent ) openedPins.set(note.entryId, {sceneId: note.parent.id, noteId: note.id});
}

/**
 * The pin to place an encounter at: the one opened last when it is on the viewed scene, else the first pin there.
 * @param {JournalEntry} entry
 * @returns {NoteDocument|null}
 */
export function pinFor(entry) {
  const scene = canvas?.scene;
  if ( !scene || !entry || entry.pack ) return null;
  const opened = openedPins.get(entry.id);
  if ( opened?.sceneId === scene.id ) {
    const note = scene.notes.get(opened.noteId);
    if ( note ) return note;
  }
  return scene.notes.find(n => n.entryId === entry.id) ?? null;
}

/**
 * Place an encounter at one of its pins.
 * @param {JournalEntry|string} ref
 * @param {object} [options]
 * @param {NoteDocument} [options.note]   Defaults to the pin found by pinFor
 * @param {boolean} [options.combat=false]
 * @returns {Promise<TokenDocument[]>}
 */
export async function placeAtPin(ref, {note, combat = false} = {}) {
  const entry = await findEncounter(ref);
  if ( !entry ) return [];
  note ??= pinFor(entry);
  if ( !note ) {
    ui.notifications.warn(t("SSE.Notice.noPin", {name: entry.name}));
    return [];
  }
  const scene = note.parent;
  const levelId = hasLevels() ? ([...(note.levels ?? [])][0] ?? (scene === canvas.scene ? canvas.level?.id : null)) : null;
  countFeature(MODULE_ID, "placedAtPin");
  return placeEncounter(entry, {center: {x: note.x, y: note.y}, scene, levelId, combat});
}

/* -------------------------------------------- */
/*  Loot                                        */
/* -------------------------------------------- */

/**
 * Roll the loot table of an encounter: into the Loot Ledger's preview when that module is active, else into the chat.
 * @param {JournalEntry|string} ref
 * @returns {Promise<boolean>}
 */
export async function rollLoot(ref) {
  const entry = await findEncounter(ref);
  const encounter = encounterOf(entry);
  if ( !encounter?.lootTable ) {
    ui.notifications.warn(t("SSE.Notice.noLoot"));
    return false;
  }
  const table = await fromUuid(encounter.lootTable).catch(() => null);
  if ( !(table instanceof RollTable) ) {
    ui.notifications.warn(t("SSE.Notice.lootMissing"));
    return false;
  }
  const ledger = game.modules.get("sephrals-loot-ledger");
  countFeature(MODULE_ID, "lootRolled");
  if ( ledger?.active && (typeof ledger.api?.rollLoot === "function") ) {
    await ledger.api.rollLoot(table);
    trace.add("loot", {encounter: entry.uuid, table: table.uuid, to: "ledger"});
    return true;
  }
  await table.draw();
  trace.add("loot", {encounter: entry.uuid, table: table.uuid, to: "chat"});
  return true;
}

/**
 * The size of the group in cells for a plan, for the windows.
 * @param {object} encounter
 * @returns {{width: number, height: number}}
 */
export function groupSize(encounter) {
  const bounds = planBounds(encounter, planPlacement(encounter));
  return {width: bounds.width, height: bounds.height};
}
