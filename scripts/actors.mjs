/**
 * The actors behind an encounter. A group points to a world actor, to the compendium actor it came from, or to a
 * compendium actor directly. At placement the world actor is used when it exists; a compendium actor is imported
 * once into the folder "Encounter actors" and reused by every later placement.
 */

import {MODULE_ID} from "./config.mjs";
import {actorFolder} from "./store.mjs";

/**
 * The compendium actor a world actor was imported from.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function compendiumSource(actor) {
  return actor?._stats?.compendiumSource ?? foundry.utils.getProperty(actor ?? {}, "flags.core.sourceId") ?? null;
}

/**
 * The actor reference of an actor, world or compendium.
 * @param {Actor} actor
 * @returns {import("./encounter-data.mjs").ActorRef}
 */
export function actorRef(actor) {
  if ( actor.pack ) {
    return {actorUuid: null, sourceUuid: actor.uuid, name: actor.name, img: actor.img, type: actor.type};
  }
  return {actorUuid: actor.uuid, sourceUuid: compendiumSource(actor), name: actor.name, img: actor.img,
    type: actor.type};
}

/**
 * The actor reference of a token on a scene: its world actor, also for unlinked tokens.
 * @param {TokenDocument} token
 * @returns {import("./encounter-data.mjs").ActorRef}
 */
export function actorRefOfToken(token) {
  const base = token.baseActor ?? game.actors.get(token.actorId) ?? null;
  if ( base ) return actorRef(base);
  return {actorUuid: null, sourceUuid: null, name: token.name, img: token.texture?.src ?? null, type: null};
}

/**
 * The name of the compendium actor behind a group: from the compendium's index when it is there, else the name the
 * group was saved with.
 * @param {object} group
 * @returns {Promise<string|null>}
 */
async function sourceName(group) {
  let entry = null;
  try {
    const parsed = foundry.utils.parseUuid(group.sourceUuid);
    const pack = parsed?.collection?.metadata ? parsed.collection : null;
    if ( pack && parsed.id ) entry = pack.index.get(parsed.id) ?? (await pack.getIndex()).get(parsed.id) ?? null;
  } catch {
    // A compendium that is gone: the saved name is all there is
  }
  return entry?.name ?? (group.name || null);
}

/**
 * Find or import the world actor of a group.
 * @param {object} group     A group of the encounter
 * @param {object} cache     Shared between the groups of one placement: {folder, bySource}
 * @returns {Promise<Actor|null>}
 */
async function worldActor(group, cache) {
  // The world actor itself
  if ( group.actorUuid ) {
    const actor = await fromUuid(group.actorUuid).catch(() => null);
    if ( (actor instanceof Actor) && !actor.pack ) return actor;
  }
  // An actor imported earlier from the same compendium actor. Only one that still has the monster's name: a world
  // keeps homebrew variants made from a compendium actor ("Skeletal Archer" from "Skeleton"), and they carry the same
  // source.
  if ( group.sourceUuid ) {
    if ( cache.bySource.has(group.sourceUuid) ) return cache.bySource.get(group.sourceUuid);
    const name = await sourceName(group);
    const imported = game.actors.find(a => (compendiumSource(a) === group.sourceUuid) && (!name || (a.name === name)));
    if ( imported ) {
      cache.bySource.set(group.sourceUuid, imported);
      return imported;
    }
    // Import it once
    const source = await fromUuid(group.sourceUuid).catch(() => null);
    if ( (source instanceof Actor) && source.pack ) {
      cache.folder ??= await actorFolder();
      const actor = await game.actors.importFromCompendium(game.packs.get(source.pack), source.id,
        {folder: cache.folder.id});
      if ( actor ) {
        cache.imported++;
        cache.bySource.set(group.sourceUuid, actor);
        return actor;
      }
    }
  }
  // Last resort, for encounters from another world: an actor of the same name and type
  const byName = game.actors.filter(a => (a.name === group.name) && (!group.type || (a.type === group.type)));
  return byName.length === 1 ? byName[0] : null;
}

/**
 * The world actors of all groups of an encounter. Groups whose actor cannot be found are listed by name.
 * @param {object} encounter
 * @returns {Promise<{actors: Map<string, Actor>, missing: string[], imported: number}>}
 */
export async function resolveActors(encounter) {
  const cache = {folder: null, bySource: new Map(), imported: 0};
  const actors = new Map();
  const missing = [];
  for ( const group of encounter.groups ) {
    const actor = await worldActor(group, cache);
    if ( actor ) actors.set(group.key, actor);
    else missing.push(group.name || group.key);
  }
  return {actors, missing, imported: cache.imported};
}

/**
 * The token data of an actor dropped into an encounter: its prototype token.
 * @param {Actor} actor
 * @returns {object}
 */
export function prototypeData(actor) {
  const data = actor.prototypeToken?.toObject?.() ?? foundry.utils.deepClone(actor.prototypeToken ?? {});
  data.name ||= actor.name;
  delete data.flags?.[MODULE_ID];
  return data;
}
