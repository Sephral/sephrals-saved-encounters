/**
 * The data of an encounter and the plan of a placement. Pure functions without Foundry, so the tests can check them.
 *
 * An encounter keeps its tokens in grid cells relative to the group, so it fits a scene with another grid size, and
 * the actor behind every token as a group with an optional count formula.
 */

/** The version of the stored data. */
export const DATA_VERSION = 1;

/** The most tokens one group may roll. */
export const MAX_COUNT = 50;

/** The most tokens one placement creates. */
export const MAX_TOKENS = 200;

/** Token fields that belong to one placement on one scene, not to the encounter. */
const PLACEMENT_KEYS = ["_id", "x", "y", "elevation", "sort", "actorId", "level", "levels"];

/** Characters a count formula may hold before Foundry checks it. */
const FORMULA_CHARS = /^[0-9dDkKhHlLxX+\-*/(). ]+$/;

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

/**
 * A number rounded to three places, so cells survive the trip through JSON without long fractions.
 * @param {number} n
 * @returns {number}
 */
function round(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * A finite number or the fallback.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A non-empty string or null.
 * @param {*} value
 * @returns {string|null}
 */
function str(value) {
  return (typeof value === "string") && value.trim() ? value.trim() : null;
}

/**
 * A deep copy of plain data.
 * @param {*} value
 * @returns {*}
 */
function copy(value) {
  return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
}

/* -------------------------------------------- */
/*  Building an encounter                       */
/* -------------------------------------------- */

/**
 * The token data an encounter keeps: everything but position, scene and identity. The changes made on an unlinked
 * token (its actor delta, such as lost hit points) stay out unless asked for.
 * @param {object} data                The source data of a token
 * @param {object} [options]
 * @param {boolean} [options.keepDelta=false]
 * @returns {object}
 */
export function stripTokenData(data, {keepDelta = false} = {}) {
  const result = copy(data ?? {}) ?? {};
  for ( const key of PLACEMENT_KEYS ) delete result[key];
  for ( const key of Object.keys(result) ) if ( key.startsWith("_") ) delete result[key];
  // Token Attacher keeps the ids of the tiles and walls attached on the old scene; on another placement they would
  // point to the wrong things, or drag the originals along on the same scene. Its prototype attachments stay.
  const attacher = result.flags?.["token-attacher"];
  if ( attacher && (typeof attacher === "object") ) {
    delete attacher.attached;
    if ( !Object.keys(attacher).length ) delete result.flags["token-attacher"];
  }
  if ( !keepDelta ) delete result.delta;
  else if ( result.delta && (typeof result.delta === "object") ) delete result.delta._id;
  return result;
}

/**
 * The positions of tokens in grid cells, relative to the top left corner of the group.
 * @param {{x: number, y: number}[]} tokens
 * @param {{sizeX: number, sizeY: number}} grid
 * @returns {{dx: number, dy: number}[]}
 */
export function relativeLayout(tokens, grid) {
  if ( !tokens.length ) return [];
  const minX = Math.min(...tokens.map(t => num(t.x)));
  const minY = Math.min(...tokens.map(t => num(t.y)));
  const sizeX = num(grid?.sizeX, 100) || 100;
  const sizeY = num(grid?.sizeY, 100) || 100;
  return tokens.map(t => ({dx: round((num(t.x) - minX) / sizeX), dy: round((num(t.y) - minY) / sizeY)}));
}

/**
 * The key of the actor behind a token, to group the tokens of the same actor.
 * @param {ActorRef} actor
 * @returns {string}
 */
export function actorKey(actor) {
  return actor?.actorUuid ?? actor?.sourceUuid ?? `name:${actor?.name ?? ""}`;
}

/**
 * @typedef {object} ActorRef
 * @property {string|null} actorUuid    The world actor
 * @property {string|null} sourceUuid   The compendium actor it came from, or the compendium actor itself
 * @property {string} name
 * @property {string|null} img
 * @property {string|null} type
 */

/**
 * A new group key that is not taken yet.
 * @param {{key: string}[]} groups
 * @returns {string}
 */
export function nextGroupKey(groups) {
  const used = new Set(groups.map(g => g.key));
  let n = groups.length;
  while ( used.has(`g${n}`) ) n++;
  return `g${n}`;
}

/**
 * Build an encounter from tokens on a scene.
 * @param {object} input
 * @param {{data: object, actor: ActorRef}[]} input.tokens   The source data of each token and the actor behind it
 * @param {{sizeX: number, sizeY: number, type?: number}} input.grid   The grid of the scene
 * @param {boolean} [input.keepDelta=false]   Keep the changes made on unlinked tokens
 * @param {number} [input.levelBottom=0]      The floor of the level the tokens stand on (Foundry 14)
 * @param {string} [input.notes=""]
 * @returns {object}
 */
export function buildEncounter({tokens, grid, keepDelta = false, levelBottom = 0, notes = ""}) {
  const groups = [];
  const byActor = new Map();
  const offsets = relativeLayout(tokens.map(t => t.data), grid);
  const entries = tokens.map((token, i) => {
    const key = actorKey(token.actor);
    let group = byActor.get(key);
    if ( !group ) {
      group = {
        key: nextGroupKey(groups),
        actorUuid: str(token.actor?.actorUuid),
        sourceUuid: str(token.actor?.sourceUuid),
        name: String(token.actor?.name ?? token.data?.name ?? ""),
        img: str(token.actor?.img),
        type: str(token.actor?.type),
        linked: false,
        formula: ""
      };
      byActor.set(key, group);
      groups.push(group);
    }
    if ( token.data?.actorLink ) group.linked = true;
    return {
      group: group.key,
      dx: offsets[i].dx,
      dy: offsets[i].dy,
      elevation: round(num(token.data?.elevation) - num(levelBottom)),
      data: stripTokenData(token.data, {keepDelta})
    };
  });
  return normalizeEncounter({v: DATA_VERSION, grid, groups, tokens: entries, notes, lootTable: null});
}

/**
 * Check and complete stored encounter data. Unknown or broken parts fall away, a group without tokens too.
 * @param {*} raw
 * @returns {object|null}   null when it is no encounter
 */
export function normalizeEncounter(raw) {
  if ( !raw || (typeof raw !== "object") || !Array.isArray(raw.tokens) ) return null;
  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .filter(g => g && (typeof g.key === "string") && g.key)
    .map(g => ({
      key: g.key,
      actorUuid: str(g.actorUuid),
      sourceUuid: str(g.sourceUuid),
      name: String(g.name ?? ""),
      img: str(g.img),
      type: str(g.type),
      linked: !!g.linked,
      formula: cleanFormula(g.formula)
    }));
  const keys = new Set(groups.map(g => g.key));
  const tokens = raw.tokens
    .filter(t => t && keys.has(t.group))
    .map(t => ({
      group: t.group,
      dx: round(num(t.dx)),
      dy: round(num(t.dy)),
      elevation: round(num(t.elevation)),
      data: (t.data && (typeof t.data === "object")) ? t.data : {}
    }));
  const used = new Set(tokens.map(t => t.group));
  const sizeX = num(raw.grid?.sizeX, 100) > 0 ? num(raw.grid?.sizeX, 100) : 100;
  const sizeY = num(raw.grid?.sizeY, 100) > 0 ? num(raw.grid?.sizeY, 100) : 100;
  return {
    v: DATA_VERSION,
    grid: {sizeX, sizeY, type: Math.trunc(num(raw.grid?.type, 1))},
    groups: groups.filter(g => used.has(g.key)),
    tokens,
    notes: String(raw.notes ?? ""),
    lootTable: str(raw.lootTable)
  };
}

/* -------------------------------------------- */
/*  Editing                                     */
/* -------------------------------------------- */

/**
 * A count formula as it is kept: trimmed, and empty when it holds characters no dice formula has.
 * @param {*} formula
 * @returns {string}
 */
export function cleanFormula(formula) {
  const text = String(formula ?? "").trim();
  return (text && FORMULA_CHARS.test(text)) ? text : "";
}

/**
 * Does a formula only hold characters of a dice formula? Foundry checks the rest when it rolls.
 * @param {string} formula
 * @returns {boolean}
 */
export function looksLikeFormula(formula) {
  const text = String(formula ?? "").trim();
  return !text || FORMULA_CHARS.test(text);
}

/**
 * The size of a token in cells.
 * @param {object} token   An encounter token
 * @returns {{w: number, h: number}}
 */
function sizeOf(token) {
  return {w: Math.max(num(token.data?.width, 1), 0.1), h: Math.max(num(token.data?.height, 1), 0.1)};
}

/**
 * Do two rectangles in cells overlap?
 * @param {{x: number, y: number, w: number, h: number}} a
 * @param {{x: number, y: number, w: number, h: number}} b
 * @returns {boolean}
 */
export function overlaps(a, b) {
  const e = 0.001;
  return (a.x < b.x + b.w - e) && (b.x < a.x + a.w - e) && (a.y < b.y + b.h - e) && (b.y < a.y + a.h - e);
}

/**
 * The nearest free spot for a token of a size: whole cells in growing rings around an origin.
 * @param {{x: number, y: number, w: number, h: number}[]} occupied
 * @param {{w: number, h: number}} size
 * @param {{x: number, y: number}} origin
 * @returns {{x: number, y: number}}
 */
export function freeSpot(occupied, size, origin) {
  const ox = Math.round(num(origin.x));
  const oy = Math.round(num(origin.y));
  for ( let r = 0; r < 60; r++ ) {
    const ring = [];
    for ( let x = ox - r; x <= ox + r; x++ ) {
      for ( let y = oy - r; y <= oy + r; y++ ) {
        if ( (Math.abs(x - ox) !== r) && (Math.abs(y - oy) !== r) ) continue;
        ring.push({x, y, d: Math.hypot(x - origin.x, y - origin.y)});
      }
    }
    ring.sort((a, b) => (a.d - b.d) || (a.y - b.y) || (a.x - b.x));
    for ( const spot of ring ) {
      const rect = {x: spot.x, y: spot.y, w: size.w, h: size.h};
      if ( !occupied.some(o => overlaps(o, rect)) ) return {x: spot.x, y: spot.y};
    }
  }
  return {x: ox, y: oy};
}

/**
 * Add a token of an actor to an encounter, on the nearest free cell. Tokens of an actor the encounter already has
 * join its group.
 * @param {object} encounter     Normalized encounter (not changed)
 * @param {ActorRef} actor
 * @param {object} data          Token data, for example the prototype token of the actor
 * @returns {object}             The new encounter
 */
export function addActorToken(encounter, actor, data) {
  const result = copy(encounter);
  const key = actorKey(actor);
  let group = result.groups.find(g => actorKey(g) === key);
  if ( !group ) {
    group = {key: nextGroupKey(result.groups), actorUuid: str(actor.actorUuid), sourceUuid: str(actor.sourceUuid),
      name: String(actor.name ?? ""), img: str(actor.img), type: str(actor.type), linked: !!data?.actorLink,
      formula: ""};
    result.groups.push(group);
  }
  const token = {group: group.key, dx: 0, dy: 0, elevation: 0, data: stripTokenData(data)};
  const occupied = result.tokens.map(t => ({x: t.dx, y: t.dy, ...sizeOf(t)}));
  const same = result.tokens.filter(t => t.group === group.key);
  const near = same.length ? same : result.tokens;
  const origin = near.length
    ? {x: near.reduce((s, t) => s + t.dx, 0) / near.length, y: near.reduce((s, t) => s + t.dy, 0) / near.length}
    : {x: 0, y: 0};
  const spot = freeSpot(occupied, sizeOf(token), origin);
  token.dx = spot.x;
  token.dy = spot.y;
  result.tokens.push(token);
  return normalizeEncounter(shiftToOrigin(result));
}

/**
 * Move all tokens so the group starts at cell 0, 0 again.
 * @param {object} encounter
 * @returns {object}
 */
function shiftToOrigin(encounter) {
  if ( !encounter.tokens.length ) return encounter;
  const minX = Math.min(...encounter.tokens.map(t => t.dx));
  const minY = Math.min(...encounter.tokens.map(t => t.dy));
  for ( const t of encounter.tokens ) {
    t.dx = round(t.dx - minX);
    t.dy = round(t.dy - minY);
  }
  return encounter;
}

/**
 * Remove a group and its tokens.
 * @param {object} encounter
 * @param {string} key
 * @returns {object}
 */
export function removeGroup(encounter, key) {
  const result = copy(encounter);
  result.groups = result.groups.filter(g => g.key !== key);
  result.tokens = result.tokens.filter(t => t.group !== key);
  return normalizeEncounter(shiftToOrigin(result)) ?? {...result, tokens: []};
}

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/**
 * The groups with their number of saved tokens, for lists and the journal page.
 * @param {object} encounter
 * @returns {{key: string, name: string, img: string|null, count: number, formula: string, linked: boolean}[]}
 */
export function groupSummary(encounter) {
  return encounter.groups.map(g => ({
    key: g.key,
    name: g.name,
    img: g.img,
    count: encounter.tokens.filter(t => t.group === g.key).length,
    formula: g.linked ? "" : g.formula,
    linked: g.linked
  }));
}

/**
 * The number of tokens as saved, by group.
 * @param {object} encounter
 * @returns {Record<string, number>}
 */
export function savedCounts(encounter) {
  const counts = {};
  for ( const g of encounter.groups ) counts[g.key] = encounter.tokens.filter(t => t.group === g.key).length;
  return counts;
}

/**
 * Roll the count of every group with a formula. Linked actors and groups without a formula keep their saved count.
 * @param {object} encounter
 * @param {(formula: string) => Promise<number>|number} roll   Rolls a formula, returns the total
 * @returns {Promise<Record<string, number>>}
 */
export async function resolveCounts(encounter, roll) {
  const counts = savedCounts(encounter);
  for ( const g of encounter.groups ) {
    if ( g.linked || !g.formula ) continue;
    try {
      counts[g.key] = clampCount(await roll(g.formula));
    } catch {
      // A formula Foundry cannot roll keeps the saved count
    }
  }
  return counts;
}

/**
 * A rolled count as a whole number of tokens.
 * @param {*} value
 * @returns {number}
 */
export function clampCount(value) {
  return Math.min(Math.max(Math.floor(num(value)), 0), MAX_COUNT);
}

/* -------------------------------------------- */
/*  Placement plan                              */
/* -------------------------------------------- */

/**
 * Which tokens go where. Each group places its saved tokens as long as the count allows. More tokens than saved are
 * copies of the group's first token on the nearest free cells around the group.
 * @param {object} encounter
 * @param {Record<string, number>} [counts]   Tokens per group, missing groups as saved
 * @returns {{index: number, dx: number, dy: number}[]}   index of the encounter token to copy, cells
 */
export function planPlacement(encounter, counts = {}) {
  const plan = [];
  const occupied = [];
  const extras = [];
  for ( const group of encounter.groups ) {
    const own = encounter.tokens.map((token, index) => ({token, index})).filter(e => e.token.group === group.key);
    if ( !own.length ) continue;
    const want = (group.key in counts) ? clampCount(counts[group.key]) : own.length;
    for ( const {token, index} of own.slice(0, want) ) {
      plan.push({index, dx: token.dx, dy: token.dy});
      occupied.push({x: token.dx, y: token.dy, ...sizeOf(token)});
    }
    if ( want > own.length ) extras.push({own, n: want - own.length});
  }
  for ( const {own, n} of extras ) {
    const template = own[0];
    const size = sizeOf(template.token);
    const origin = {x: own.reduce((s, e) => s + e.token.dx, 0) / own.length, y: own.reduce((s, e) => s + e.token.dy, 0) / own.length};
    for ( let i = 0; i < n; i++ ) {
      const spot = freeSpot(occupied, size, origin);
      plan.push({index: template.index, dx: spot.x, dy: spot.y});
      occupied.push({x: spot.x, y: spot.y, ...size});
    }
  }
  return plan.slice(0, MAX_TOKENS);
}

/**
 * Keep unique characters unique on a scene. A token linked to its actor (actorLink) is placed at most once per actor,
 * whatever the count says, and not at all when that actor already has a token on the scene. Unlinked tokens stay as
 * planned.
 * @param {object} encounter
 * @param {{index: number, dx: number, dy: number}[]} plan   From planPlacement
 * @param {object} options
 * @param {(groupKey: string) => string|null|undefined} options.actorOf   The id of the world actor behind a group
 * @param {Iterable<string>} [options.present]   Ids of the actors that already have a linked token on the scene
 * @returns {{plan: {index: number, dx: number, dy: number}[], skipped: string[]}}   skipped: the keys of the groups
 *   left out because their actor is already on the scene
 */
export function limitLinked(encounter, plan, {actorOf, present = []}) {
  const onScene = new Set(present);
  const taken = new Set();
  const skipped = [];
  const kept = plan.filter(p => {
    const token = encounter.tokens[p.index];
    if ( !token?.data?.actorLink ) return true;
    const id = actorOf(token.group) || `group:${token.group}`;
    if ( onScene.has(id) ) {
      if ( !skipped.includes(token.group) ) skipped.push(token.group);
      return false;
    }
    if ( taken.has(id) ) return false;
    taken.add(id);
    return true;
  });
  return {plan: kept, skipped};
}

/**
 * The cells a plan covers.
 * @param {object} encounter
 * @param {{index: number, dx: number, dy: number}[]} plan
 * @returns {{minX: number, minY: number, width: number, height: number}}
 */
export function planBounds(encounter, plan) {
  if ( !plan.length ) return {minX: 0, minY: 0, width: 1, height: 1};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for ( const p of plan ) {
    const {w, h} = sizeOf(encounter.tokens[p.index]);
    minX = Math.min(minX, p.dx);
    minY = Math.min(minY, p.dy);
    maxX = Math.max(maxX, p.dx + w);
    maxY = Math.max(maxY, p.dy + h);
  }
  return {minX, minY, width: maxX - minX, height: maxY - minY};
}

/* -------------------------------------------- */
/*  Turning                                     */
/* -------------------------------------------- */

/**
 * A number of quarter turns as 0, 1, 2 or 3 (clockwise). Negative numbers turn the other way: -1 is 3.
 * @param {*} turns
 * @returns {number}
 */
export function normalTurns(turns) {
  const n = Math.round(num(turns));
  return ((n % 4) + 4) % 4;
}

/**
 * Turn cells around the middle of their group in quarter turns, clockwise on the map (y grows downwards). The centers
 * of the tokens turn, each token keeps its size, so its picture keeps its facing and a 2x1 token stays 2 wide. The
 * pivot is the middle of the box around the token centers: a quarter turn keeps it in place, so four quarter turns,
 * or one each way, give back exactly the same cells. Where the group lands is up to planPoints, which centers it on
 * the pointer, so the cells may start at a fraction of a cell. The steps between the tokens stay whole cells.
 * @param {{dx: number, dy: number, w: number, h: number}[]} cells   Top left corner and size in cells
 * @param {number} turns   Quarter turns clockwise, negative for counterclockwise
 * @returns {{dx: number, dy: number, w: number, h: number}[]}   The same items with new corners
 */
export function turnCells(cells, turns) {
  const q = normalTurns(turns);
  if ( !q || !cells.length ) return cells.map(c => ({...c}));
  const centers = cells.map(c => ({x: num(c.dx) + (num(c.w, 1) / 2), y: num(c.dy) + (num(c.h, 1) / 2)}));
  const cx = (Math.min(...centers.map(c => c.x)) + Math.max(...centers.map(c => c.x))) / 2;
  const cy = (Math.min(...centers.map(c => c.y)) + Math.max(...centers.map(c => c.y))) / 2;
  // Six places are enough for cells kept with three, and keep the sums free of floating point dust
  const tidy = n => Math.round(n * 1e6) / 1e6;
  return cells.map((c, i) => {
    let x = centers[i].x - cx;
    let y = centers[i].y - cy;
    // One quarter turn clockwise on the map: right becomes down, down becomes left
    for ( let k = 0; k < q; k++ ) [x, y] = [-y, x];
    return {...c, dx: tidy(cx + x - (num(c.w, 1) / 2)), dy: tidy(cy + y - (num(c.h, 1) / 2))};
  });
}

/**
 * Turn a placement plan around the middle of the group in quarter turns (see turnCells).
 * @param {object} encounter
 * @param {{index: number, dx: number, dy: number}[]} plan   From planPlacement
 * @param {number} turns   Quarter turns clockwise, negative for counterclockwise
 * @returns {{index: number, dx: number, dy: number}[]}
 */
export function turnPlan(encounter, plan, turns) {
  const cells = plan.map(p => ({...p, ...sizeOf(encounter.tokens[p.index])}));
  return turnCells(cells, turns).map(({w, h, ...p}) => p);
}

/**
 * The top left corner in pixels of every planned token, with the group centered on a point.
 * @param {object} encounter
 * @param {{index: number, dx: number, dy: number}[]} plan
 * @param {{x: number, y: number}} center   Pixels on the scene
 * @param {{sizeX: number, sizeY: number}} grid   The grid of the target scene
 * @returns {{index: number, x: number, y: number, width: number, height: number}[]}
 */
export function planPoints(encounter, plan, center, grid) {
  const bounds = planBounds(encounter, plan);
  const left = num(center.x) - (bounds.width * grid.sizeX / 2);
  const top = num(center.y) - (bounds.height * grid.sizeY / 2);
  return plan.map(p => {
    const {w, h} = sizeOf(encounter.tokens[p.index]);
    return {
      index: p.index,
      x: left + ((p.dx - bounds.minX) * grid.sizeX),
      y: top + ((p.dy - bounds.minY) * grid.sizeY),
      width: w,
      height: h
    };
  });
}

/**
 * Is a number a whole number, give or take a rounding error?
 * @param {number} n
 * @returns {boolean}
 */
function isWhole(n) {
  return Math.abs(n - Math.round(n)) < 0.01;
}

/**
 * The rectangle of planned tokens in pixels.
 * @param {{x: number, y: number, width: number, height: number}} p   Top left in pixels, size in cells
 * @param {{sizeX: number, sizeY: number}} grid
 * @returns {{x: number, y: number, w: number, h: number}}
 */
function pixelBox(p, grid) {
  return {x: p.x, y: p.y, w: Math.max(num(p.width, 1), 0.1) * grid.sizeX, h: Math.max(num(p.height, 1), 0.1) * grid.sizeY};
}

/**
 * Shift a group of tokens so it lies inside a rectangle. A group bigger than the rectangle starts at its top left.
 * @param {object[]} points
 * @param {{sizeX: number, sizeY: number}} grid
 * @param {{x: number, y: number, width: number, height: number}|null} rect
 * @param {boolean} whole     Shift by whole cells only, so a group on the grid stays on it
 * @returns {object[]}
 */
function shiftInto(points, grid, rect, whole) {
  if ( !rect || !points.length ) return points;
  const boxes = points.map(p => pixelBox(p, grid));
  const left = Math.min(...boxes.map(b => b.x));
  const top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.w));
  const bottom = Math.max(...boxes.map(b => b.y + b.h));
  const along = (start, end, from, size) => {
    if ( (end - start > size) || (start < from) ) return from - start;
    if ( end > from + size ) return from + size - end;
    return 0;
  };
  let dx = along(left, right, rect.x, rect.width);
  let dy = along(top, bottom, rect.y, rect.height);
  if ( whole ) {
    dx = Math.sign(dx) * Math.ceil((Math.abs(dx) / grid.sizeX) - 0.001) * grid.sizeX;
    dy = Math.sign(dy) * Math.ceil((Math.abs(dy) / grid.sizeY) - 0.001) * grid.sizeY;
  }
  if ( !dx && !dy ) return points;
  return points.map(p => ({...p, x: p.x + dx, y: p.y + dy}));
}

/**
 * Bring the planned tokens onto the scene: keep the group inside the scene rectangle, snap it to the grid and keep two
 * tokens off the same cell. A group whose cells are whole numbers on a square grid moves as one by the snap of its
 * first token, so it keeps its shape. Otherwise (hex grids, or an encounter saved on a hex or gridless scene) every
 * token snaps on its own, and a token whose cell is taken or outside the scene moves to the nearest free cell.
 * @param {{index: number, x: number, y: number, width: number, height: number}[]} points   From planPoints
 * @param {object} options
 * @param {{sizeX: number, sizeY: number, square?: boolean, gridless?: boolean}} options.grid
 * @param {{x: number, y: number, width: number, height: number}|null} [options.rect]   The scene in pixels
 * @param {((p: object) => {x: number, y: number})|null} [options.snap]   Snaps the top left corner of a token
 * @returns {{index: number, x: number, y: number, width: number, height: number}[]}
 */
export function arrangePoints(points, {grid, rect = null, snap = null}) {
  if ( !points.length ) return points;
  const shifted = shiftInto(points, grid, rect, false);
  if ( !snap || grid.gridless ) return shifted;
  const lead = shifted[0];
  const whole = grid.square && shifted.every(p => isWhole((p.x - lead.x) / grid.sizeX) && isWhole((p.y - lead.y) / grid.sizeY));
  if ( whole ) {
    const s = snap(lead);
    const moved = shifted.map(p => ({...p, x: p.x + (s.x - lead.x), y: p.y + (s.y - lead.y)}));
    return shiftInto(moved, grid, rect, true);
  }
  // Hex cells do not line up with the scene's edge, so half a cell may stick out
  const inside = b => !rect || ((b.x >= rect.x - (grid.sizeX / 2)) && (b.y >= rect.y - (grid.sizeY / 2))
    && (b.x + b.w <= rect.x + rect.width + (grid.sizeX / 2)) && (b.y + b.h <= rect.y + rect.height + (grid.sizeY / 2)));
  // Neighbouring hexes overlap as rectangles, so boxes count as taken only when they overlap by more than a fifth
  const shrink = b => ({x: b.x + (grid.sizeX * 0.2), y: b.y + (grid.sizeY * 0.2), w: b.w - (grid.sizeX * 0.4),
    h: b.h - (grid.sizeY * 0.4)});
  const taken = [];
  const free = b => inside(b) && !taken.some(t => overlaps(shrink(t), shrink(b)));
  return shifted.map(p => {
    let best = {...p, ...snap(p)};
    if ( !free(pixelBox(best, grid)) ) {
      const ring = [];
      for ( let r = 1; r <= 12; r++ ) {
        for ( let i = -r; i <= r; i++ ) for ( let j = -r; j <= r; j++ ) {
          if ( (Math.abs(i) === r) || (Math.abs(j) === r) ) ring.push({i, j, d: Math.hypot(i, j)});
        }
      }
      ring.sort((a, b) => a.d - b.d);
      for ( const {i, j} of ring ) {
        const candidate = {...p, ...snap({...p, x: p.x + (i * grid.sizeX), y: p.y + (j * grid.sizeY)})};
        if ( free(pixelBox(candidate, grid)) ) {
          best = candidate;
          break;
        }
      }
    }
    const box = pixelBox(best, grid);
    taken.push({x: box.x, y: box.y, w: box.w, h: box.h});
    return best;
  });
}

/* -------------------------------------------- */
/*  Journal page                                */
/* -------------------------------------------- */

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * The readable page of an encounter: the monsters with their counts and the notes.
 * @param {object} encounter
 * @param {{monsters: string, count: string, notes: string, unique: string, rolled: (formula: string) => string,
 *   loot?: string, lootName?: string|null}} labels
 * @returns {string}
 */
export function pageHtml(encounter, labels) {
  const rows = groupSummary(encounter).map(g => {
    const count = g.linked ? labels.unique : (g.formula ? labels.rolled(g.formula) : String(g.count));
    const img = g.img ? `<img src="${escapeHtml(g.img)}" alt="" width="36" height="36" style="border:none;vertical-align:middle"> ` : "";
    return `<tr><td>${img}${escapeHtml(g.name)}</td><td>${escapeHtml(count)}</td></tr>`;
  }).join("");
  let html = `<h2>${escapeHtml(labels.monsters)}</h2><table><thead><tr><th>${escapeHtml(labels.monsters)}</th>`
    + `<th>${escapeHtml(labels.count)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  if ( labels.lootName ) html += `<p><strong>${escapeHtml(labels.loot)}:</strong> ${escapeHtml(labels.lootName)}</p>`;
  const notes = encounter.notes.trim();
  if ( notes ) {
    const paragraphs = notes.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
    html += `<h2>${escapeHtml(labels.notes)}</h2>${paragraphs}`;
  }
  return html;
}

/* -------------------------------------------- */
/*  Placements                                  */
/* -------------------------------------------- */

/**
 * Keep the latest placements only.
 * @param {Record<string, {at: number}>} placements
 * @param {number} [max=200]
 * @returns {Record<string, object>}
 */
export function prunePlacements(placements, max = 200) {
  const entries = Object.entries(placements ?? {}).filter(([, p]) => p && (typeof p === "object"));
  entries.sort((a, b) => num(b[1].at) - num(a[1].at));
  return Object.fromEntries(entries.slice(0, max));
}

export const __test__ = {round, num, str, sizeOf, shiftToOrigin};
