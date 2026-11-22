/**
 * The made-up encounters of the sample windows (api.samples). Pure: the cast and the texts come in as arguments, so
 * the builders run without Foundry. Nothing here is saved anywhere.
 */

import {normalizeEncounter} from "./encounter-data.mjs";

/** The id the sample loot table has: the sample windows show its name, nothing looks it up. */
export const SAMPLE_LOOT = "RollTable.sample-loot";

/**
 * An encounter from a short recipe.
 * @param {object} options
 * @param {{id: string, name: string, img: string}[]} options.cast
 * @param {{id: string, count: number, name?: string, formula?: string, linked?: boolean}[]} options.parts
 * @param {string} [options.notes]
 * @param {boolean} [options.loot]
 * @returns {object}   A normalized encounter
 */
export function sampleEncounter({cast, parts, notes = "", loot = false}) {
  const groups = [];
  const tokens = [];
  let row = 0;
  for ( const [index, part] of parts.entries() ) {
    const member = cast.find(m => m.id === part.id);
    if ( !member ) continue;
    const key = `g${index + 1}`;
    const name = part.name ?? member.name;
    groups.push({key, actorUuid: `Actor.sample-${member.id}`, sourceUuid: "", name, img: member.img, type: "npc",
      linked: !!part.linked, formula: part.formula ?? ""});
    for ( let i = 0; i < part.count; i++ ) {
      tokens.push({group: key, dx: i, dy: row, elevation: 0, data: {name, actorLink: !!part.linked, width: 1, height: 1,
        texture: {src: member.img, scaleX: 1, scaleY: 1}}});
    }
    row++;
  }
  return normalizeEncounter({grid: {sizeX: 100, sizeY: 100, type: 1}, groups, tokens, notes,
    lootTable: loot ? SAMPLE_LOOT : null});
}

/**
 * The encounters of the sample list, with what the window shows besides them.
 * @param {{id: string, name: string, img: string}[]} cast
 * @param {{names: {ambush: string, bridge: string, wolves: string}, notes: string, place: string, bandit: string,
 *   wolf: string, troll: string}} text   The names and texts in the language of the user
 * @returns {{uuid: string, name: string, sort: number, folder: string|null, encounter: object, placed: number,
 *   pinScenes: string[], pinsHere: number, turns: number}[]}
 */
export function sampleEncounterList(cast, text) {
  return [
    {uuid: "JournalEntry.sample-ambush", name: text.names.ambush, sort: 1, folder: "root", placed: 5, pinScenes: [text.place],
      pinsHere: 1, turns: 1, encounter: sampleEncounter({cast, loot: true, notes: text.notes,
        parts: [{id: "bandit1", count: 3, name: text.bandit, formula: "1d4+1"}, {id: "wolf", count: 2, name: text.wolf}]})},
    {uuid: "JournalEntry.sample-bridge", name: text.names.bridge, sort: 2, folder: "mill", placed: 0, pinScenes: [],
      pinsHere: 0, turns: 0, encounter: sampleEncounter({cast, parts: [{id: "troll", count: 1, name: text.troll, linked: true},
        {id: "bandit2", count: 2, name: text.bandit}]})},
    {uuid: "JournalEntry.sample-wolves", name: text.names.wolves, sort: 3, folder: null, placed: 0, pinScenes: [],
      pinsHere: 0, turns: 0, encounter: sampleEncounter({cast, parts: [{id: "wolf", count: 3, name: text.wolf}]})}
  ];
}
