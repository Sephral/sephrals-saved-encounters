import assert from "node:assert/strict";
import test from "node:test";

import {DATA_VERSION, MAX_COUNT, actorKey, addActorToken, arrangePoints, buildEncounter, clampCount, cleanFormula, freeSpot,
  groupSummary, limitLinked, looksLikeFormula, nextGroupKey, normalTurns, normalizeEncounter, overlaps, pageHtml, planBounds,
  planPlacement, planPoints, prunePlacements, relativeLayout, removeGroup, resolveCounts, savedCounts, stripTokenData, turnCells,
  turnPlan} from "../scripts/encounter-data.mjs";

const GRID = {sizeX: 100, sizeY: 100, type: 1};
const goblin = {actorUuid: "Actor.gob", sourceUuid: "Compendium.dnd5e.monsters.Actor.g1", name: "Goblin",
  img: "goblin.webp", type: "npc"};
const boss = {actorUuid: "Actor.boss", sourceUuid: null, name: "Grukk", img: "boss.webp", type: "npc"};

/** A token as Foundry's toObject gives it. */
function token(x, y, extra = {}) {
  return {_id: `t${x}${y}`, name: "Goblin", x, y, elevation: 0, sort: 3, actorId: "gob", width: 1, height: 1,
    texture: {src: "goblin.webp", scaleX: 1, scaleY: 1}, hidden: false, disposition: -1, actorLink: false,
    delta: {_id: "d1", system: {attributes: {hp: {value: 2}}}}, _movementHistory: [], _regions: [], level: "lvl",
    flags: {other: {a: 1}}, ...extra};
}

/** Three goblins in a row and a boss below them. */
function goblinCamp() {
  return buildEncounter({
    tokens: [
      {data: token(300, 200), actor: goblin},
      {data: token(400, 200), actor: goblin},
      {data: token(500, 200), actor: goblin},
      {data: token(400, 300, {name: "Grukk", actorLink: true, width: 2, height: 2}), actor: boss}
    ],
    grid: GRID,
    notes: "They guard the bridge."
  });
}

test("token data keeps the look and loses position, scene and identity", () => {
  const data = stripTokenData(token(300, 200));
  for ( const key of ["_id", "x", "y", "elevation", "sort", "actorId", "level", "_movementHistory", "_regions", "delta"] ) {
    assert.equal(key in data, false, key);
  }
  assert.equal(data.name, "Goblin");
  assert.deepEqual(data.texture, {src: "goblin.webp", scaleX: 1, scaleY: 1});
  assert.deepEqual(data.flags, {other: {a: 1}});
  const kept = stripTokenData(token(0, 0), {keepDelta: true});
  assert.deepEqual(kept.delta, {system: {attributes: {hp: {value: 2}}}});
});

test("positions become grid cells relative to the group", () => {
  assert.deepEqual(relativeLayout([{x: 300, y: 200}, {x: 450, y: 200}, {x: 300, y: 350}], GRID),
    [{dx: 0, dy: 0}, {dx: 1.5, dy: 0}, {dx: 0, dy: 1.5}]);
  assert.deepEqual(relativeLayout([{x: 140, y: 70}, {x: 280, y: 70}], {sizeX: 140, sizeY: 140}),
    [{dx: 0, dy: 0}, {dx: 1, dy: 0}]);
  assert.deepEqual(relativeLayout([], GRID), []);
});

test("an encounter groups the tokens by actor", () => {
  const encounter = goblinCamp();
  assert.equal(encounter.v, DATA_VERSION);
  assert.equal(encounter.groups.length, 2);
  const [gob, grukk] = encounter.groups;
  assert.equal(gob.name, "Goblin");
  assert.equal(gob.sourceUuid, "Compendium.dnd5e.monsters.Actor.g1");
  assert.equal(gob.linked, false);
  assert.equal(grukk.linked, true);
  assert.deepEqual(encounter.tokens.map(t => [t.group, t.dx, t.dy]),
    [[gob.key, 0, 0], [gob.key, 1, 0], [gob.key, 2, 0], [grukk.key, 1, 1]]);
  assert.equal(encounter.notes, "They guard the bridge.");
  assert.deepEqual(savedCounts(encounter), {[gob.key]: 3, [grukk.key]: 1});
});

test("the elevation is kept relative to the floor of the level", () => {
  const encounter = buildEncounter({tokens: [{data: token(0, 0, {elevation: 25}), actor: goblin}], grid: GRID,
    levelBottom: 20});
  assert.equal(encounter.tokens[0].elevation, 5);
});

test("group keys stay unique", () => {
  assert.equal(nextGroupKey([]), "g0");
  assert.equal(nextGroupKey([{key: "g0"}, {key: "g1"}]), "g2");
  assert.equal(nextGroupKey([{key: "g1"}]), "g2");
  assert.equal(actorKey({actorUuid: null, sourceUuid: "C.x", name: "A"}), "C.x");
  assert.equal(actorKey({name: "A"}), "name:A");
});

test("normalizing drops broken parts and groups without tokens", () => {
  assert.equal(normalizeEncounter(null), null);
  assert.equal(normalizeEncounter({groups: []}), null);
  const result = normalizeEncounter({
    grid: {sizeX: -5},
    groups: [{key: "g0", name: "A", formula: "1d4; drop"}, {key: "g1", name: "Empty"}, {name: "no key"}],
    tokens: [{group: "g0", dx: "1", dy: null}, {group: "gx"}, null]
  });
  assert.deepEqual(result.groups.map(g => g.key), ["g0"]);
  assert.equal(result.groups[0].formula, "");
  assert.deepEqual(result.tokens, [{group: "g0", dx: 1, dy: 0, elevation: 0, data: {}}]);
  assert.deepEqual(result.grid, {sizeX: 100, sizeY: 100, type: 1});
  assert.equal(result.lootTable, null);
});

test("formulas are checked for dice characters", () => {
  assert.equal(cleanFormula(" 1d4+1 "), "1d4+1");
  assert.equal(cleanFormula("2d6kh1"), "2d6kh1");
  assert.equal(cleanFormula("@abilities.str"), "");
  assert.equal(looksLikeFormula(""), true);
  assert.equal(looksLikeFormula("3"), true);
  assert.equal(looksLikeFormula("(1d4)*2"), true);
  assert.equal(looksLikeFormula("ten"), false);
  assert.equal(clampCount(3.9), 3);
  assert.equal(clampCount(-2), 0);
  assert.equal(clampCount(500), MAX_COUNT);
  assert.equal(clampCount("x"), 0);
});

test("counts roll for groups with a formula, linked actors keep theirs", async () => {
  const encounter = goblinCamp();
  encounter.groups[0].formula = "1d4+1";
  encounter.groups[1].formula = "5";
  const rolled = [];
  const counts = await resolveCounts(encounter, formula => {
    rolled.push(formula);
    return 5;
  });
  assert.deepEqual(rolled, ["1d4+1"]);
  assert.deepEqual(counts, {[encounter.groups[0].key]: 5, [encounter.groups[1].key]: 1});
  const broken = await resolveCounts(encounter, () => {
    throw new Error("bad");
  });
  assert.equal(broken[encounter.groups[0].key], 3);
});

test("a unique character is placed once and left out when it already stands on the scene", () => {
  const encounter = goblinCamp();
  const [gob, grukk] = encounter.groups;
  const actorOf = key => ({[gob.key]: "gob", [grukk.key]: "boss"})[key];
  const plan = planPlacement(encounter);
  // Not on the scene: everything as planned
  const free = limitLinked(encounter, plan, {actorOf, present: new Set(["hero"])});
  assert.deepEqual(free.plan, plan);
  assert.deepEqual(free.skipped, []);
  // The boss already stands there: only the goblins come, the boss is named as skipped
  const there = limitLinked(encounter, plan, {actorOf, present: ["boss"]});
  assert.deepEqual(there.plan.map(p => p.index), [0, 1, 2]);
  assert.deepEqual(there.skipped, [grukk.key]);
  // Unlinked goblins are placed however often their actor already stands on the scene
  const goblinsThere = limitLinked(encounter, plan, {actorOf, present: ["gob"]});
  assert.deepEqual(goblinsThere.plan, plan);
  assert.deepEqual(goblinsThere.skipped, []);
});

test("a count on a unique character places at most one token of it", () => {
  const encounter = goblinCamp();
  const [gob, grukk] = encounter.groups;
  const actorOf = key => ({[gob.key]: "gob", [grukk.key]: "boss"})[key];
  const plan = planPlacement(encounter, {[gob.key]: 5, [grukk.key]: 3});
  assert.equal(plan.filter(p => encounter.tokens[p.index].group === grukk.key).length, 3);
  const limited = limitLinked(encounter, plan, {actorOf});
  assert.equal(limited.plan.filter(p => encounter.tokens[p.index].group === grukk.key).length, 1);
  assert.equal(limited.plan.filter(p => encounter.tokens[p.index].group === gob.key).length, 5);
  assert.deepEqual(limited.skipped, []);
  // Two saved tokens of the same linked actor, or two groups that end up with the same world actor: one token
  const twice = buildEncounter({tokens: [
    {data: token(0, 0, {name: "Grukk", actorLink: true}), actor: boss},
    {data: token(100, 0, {name: "Grukk", actorLink: true}), actor: boss},
    {data: token(200, 0, {name: "Grukk", actorLink: true}), actor: {...boss, actorUuid: "Actor.copy"}}
  ], grid: GRID});
  const one = limitLinked(twice, planPlacement(twice), {actorOf: () => "boss"});
  assert.equal(one.plan.length, 1);
  // Without a world actor id the group itself counts
  assert.equal(limitLinked(twice, planPlacement(twice), {actorOf: () => null}).plan.length, 2);
});

test("a plan places the saved tokens as long as the count allows", () => {
  const encounter = goblinCamp();
  const [gob, grukk] = encounter.groups;
  const full = planPlacement(encounter);
  assert.deepEqual(full.map(p => [p.index, p.dx, p.dy]), [[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 1, 1]]);
  const fewer = planPlacement(encounter, {[gob.key]: 1, [grukk.key]: 1});
  assert.deepEqual(fewer.map(p => p.index), [0, 3]);
  const none = planPlacement(encounter, {[gob.key]: 0, [grukk.key]: 0});
  assert.deepEqual(none, []);
});

test("more tokens than saved go to the nearest free cells, never on top of others", () => {
  const encounter = goblinCamp();
  const [gob] = encounter.groups;
  const plan = planPlacement(encounter, {[gob.key]: 6});
  assert.equal(plan.length, 7);
  const rects = plan.map(p => {
    const {width, height} = encounter.tokens[p.index].data;
    return {x: p.dx, y: p.dy, w: width, h: height};
  });
  for ( let i = 0; i < rects.length; i++ ) {
    for ( let j = i + 1; j < rects.length; j++ ) assert.equal(overlaps(rects[i], rects[j]), false, `${i} ${j}`);
  }
  // The extra goblins copy the first goblin and stay close to the camp
  for ( const p of plan.slice(4) ) {
    assert.equal(p.index, 0);
    assert.ok(Math.abs(p.dx - 1) <= 2 && Math.abs(p.dy) <= 2, JSON.stringify(p));
  }
});

test("free spots grow outwards in rings", () => {
  assert.deepEqual(freeSpot([], {w: 1, h: 1}, {x: 2, y: 3}), {x: 2, y: 3});
  const taken = [{x: 0, y: 0, w: 1, h: 1}];
  const spot = freeSpot(taken, {w: 1, h: 1}, {x: 0, y: 0});
  assert.equal(Math.max(Math.abs(spot.x), Math.abs(spot.y)), 1);
  const big = freeSpot([{x: 0, y: 0, w: 2, h: 2}], {w: 2, h: 2}, {x: 0, y: 0});
  assert.equal(overlaps({x: 0, y: 0, w: 2, h: 2}, {...big, w: 2, h: 2}), false);
});

test("plan points center the group on the click and scale to the grid of the scene", () => {
  const encounter = goblinCamp();
  const plan = planPlacement(encounter);
  assert.deepEqual(planBounds(encounter, plan), {minX: 0, minY: 0, width: 3, height: 3});
  const points = planPoints(encounter, plan, {x: 1000, y: 1000}, {sizeX: 50, sizeY: 50});
  assert.deepEqual(points[0], {index: 0, x: 925, y: 925, width: 1, height: 1});
  assert.deepEqual(points[3], {index: 3, x: 975, y: 975, width: 2, height: 2});
});

test("actors dropped into an encounter join their group or start a new one", () => {
  const encounter = goblinCamp();
  const more = addActorToken(encounter, goblin, {name: "Goblin", width: 1, height: 1, texture: {src: "g.webp"}});
  assert.equal(more.groups.length, 2);
  assert.equal(more.tokens.length, 5);
  const wolf = {actorUuid: null, sourceUuid: "Compendium.dnd5e.monsters.Actor.w", name: "Wolf", img: "w.webp",
    type: "npc"};
  const pack = addActorToken(more, wolf, {name: "Wolf", width: 1, height: 1, actorLink: false});
  assert.equal(pack.groups.length, 3);
  assert.equal(pack.groups[2].sourceUuid, wolf.sourceUuid);
  assert.equal(pack.groups[2].actorUuid, null);
  const rects = pack.tokens.map(t => ({x: t.dx, y: t.dy, w: t.data.width ?? 1, h: t.data.height ?? 1}));
  for ( let i = 0; i < rects.length; i++ ) {
    for ( let j = i + 1; j < rects.length; j++ ) assert.equal(overlaps(rects[i], rects[j]), false);
  }
  assert.equal(Math.min(...pack.tokens.map(t => t.dx)), 0);
  assert.equal(Math.min(...pack.tokens.map(t => t.dy)), 0);
  const first = addActorToken(normalizeEncounter({tokens: [], groups: []}), wolf, {name: "Wolf"});
  assert.deepEqual(first.tokens.map(t => [t.dx, t.dy]), [[0, 0]]);
});

test("removing a group removes its tokens", () => {
  const encounter = goblinCamp();
  const result = removeGroup(encounter, encounter.groups[0].key);
  assert.deepEqual(result.groups.map(g => g.name), ["Grukk"]);
  assert.deepEqual(result.tokens.map(t => [t.dx, t.dy]), [[0, 0]]);
});

test("the summary lists counts, formulas and unique characters", () => {
  const encounter = goblinCamp();
  encounter.groups[0].formula = "1d4+1";
  encounter.groups[1].formula = "3";
  assert.deepEqual(groupSummary(encounter).map(g => [g.name, g.count, g.formula, g.linked]),
    [["Goblin", 3, "1d4+1", false], ["Grukk", 1, "", true]]);
});

test("the journal page escapes names and notes", () => {
  const encounter = goblinCamp();
  encounter.groups[0].name = "<b>Goblin</b>";
  encounter.groups[0].formula = "1d4+1";
  encounter.notes = "Line one\nline two\n\n<script>x</script>";
  const html = pageHtml(encounter, {monsters: "Monsters", count: "Count", notes: "Notes", unique: "unique",
    rolled: f => `rolled: ${f}`, loot: "Loot", lootName: "Hoard"});
  assert.ok(html.includes("&lt;b&gt;Goblin&lt;/b&gt;"));
  assert.ok(html.includes("rolled: 1d4+1"));
  assert.ok(html.includes("<td>unique</td>"));
  assert.ok(html.includes("<p>Line one<br>line two</p>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Hoard"));
  assert.ok(!html.includes("<script>"));
});

test("only the latest placements are kept", () => {
  const all = {a: {at: 1}, b: {at: 3}, c: {at: 2}, d: null};
  assert.deepEqual(Object.keys(prunePlacements(all, 2)), ["b", "c"]);
});

/** A square grid snap: the top left corner to the nearest cell corner. */
const squareSnap = size => p => ({x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size});

test("a group at the edge of the scene is moved inside and stays on the grid", () => {
  const grid = {sizeX: 100, sizeY: 100, square: true};
  const rect = {x: 0, y: 0, width: 1200, height: 800};
  const points = [{index: 0, x: -150, y: -130, width: 1, height: 1}, {index: 1, x: -50, y: -130, width: 1, height: 1},
    {index: 2, x: -150, y: -30, width: 2, height: 2}];
  const placed = arrangePoints(points, {grid, rect, snap: squareSnap(100)});
  assert.deepEqual(placed.map(p => [p.x, p.y]), [[0, 0], [100, 0], [0, 100]]);
  const far = points.map(p => ({...p, x: p.x + 1300, y: p.y + 820}));
  const placedFar = arrangePoints(far, {grid, rect, snap: squareSnap(100)});
  for ( const p of placedFar ) {
    assert.ok(p.x >= 0 && p.x + (p.width * 100) <= 1200 && p.y >= 0 && p.y + (p.height * 100) <= 800, JSON.stringify(p));
    assert.equal(p.x % 100, 0);
  }
});

test("a group inside the scene keeps its shape on a square grid", () => {
  const grid = {sizeX: 100, sizeY: 100, square: true};
  const points = [{index: 0, x: 513, y: 307, width: 1, height: 1}, {index: 1, x: 613, y: 307, width: 1, height: 1},
    {index: 2, x: 513, y: 407, width: 2, height: 2}];
  const placed = arrangePoints(points, {grid, rect: {x: 0, y: 0, width: 2000, height: 1400}, snap: squareSnap(100)});
  assert.deepEqual(placed.map(p => [p.x, p.y]), [[500, 300], [600, 300], [500, 400]]);
});

test("cells saved on a hex or gridless scene land on separate squares", () => {
  const grid = {sizeX: 100, sizeY: 100, square: true};
  // Half cells and three quarter rows, as an encounter from a hex scene gives them
  const points = [{index: 0, x: 900, y: 600, width: 1, height: 1}, {index: 1, x: 950, y: 675, width: 1, height: 1},
    {index: 2, x: 1000, y: 600, width: 1, height: 1}, {index: 3, x: 1050, y: 675, width: 1, height: 1}];
  const placed = arrangePoints(points, {grid, rect: {x: 0, y: 0, width: 2000, height: 1400}, snap: squareSnap(100)});
  const keys = placed.map(p => `${p.x},${p.y}`);
  assert.equal(new Set(keys).size, 4, keys.join(" "));
  for ( const p of placed ) assert.ok(p.x % 100 === 0 && p.y % 100 === 0);
});

test("without snapping the group is only kept inside the scene", () => {
  const grid = {sizeX: 100, sizeY: 100, gridless: true};
  const points = [{index: 0, x: 1950, y: 10, width: 1, height: 1}];
  assert.deepEqual(arrangePoints(points, {grid, rect: {x: 0, y: 0, width: 2000, height: 1400}}).map(p => [p.x, p.y]), [[1900, 10]]);
  assert.deepEqual(arrangePoints(points, {grid}).map(p => [p.x, p.y]), [[1950, 10]]);
});

test("Token Attacher's list of attached things from the old scene is not kept", () => {
  const data = token(0, 0, {flags: {"token-attacher": {attached: {Tile: ["a"]}, prototypeAttached: {Tile: [{x: 0}]}},
    other: {a: 1}}});
  const kept = stripTokenData(data);
  assert.equal(kept.flags["token-attacher"].attached, undefined);
  assert.deepEqual(kept.flags["token-attacher"].prototypeAttached, {Tile: [{x: 0}]});
  assert.deepEqual(kept.flags.other, {a: 1});
  const only = stripTokenData(token(0, 0, {flags: {"token-attacher": {attached: {Tile: ["a"]}}}}));
  assert.equal(only.flags["token-attacher"], undefined);
});

/* -------------------------------------------- */
/*  Turning the formation                       */
/* -------------------------------------------- */

/** The cells of a plan as "index:dx,dy", for comparing. */
const cellsOf = plan => plan.map(p => `${p.index}:${p.dx},${p.dy}`).join(" ");

/** The middle of the box around the token centers of a plan: the pivot of a turn. */
function middle(encounter, plan) {
  const centers = plan.map(p => {
    const {width, height} = encounter.tokens[p.index].data;
    return {x: p.dx + (width / 2), y: p.dy + (height / 2)};
  });
  return {x: (Math.min(...centers.map(c => c.x)) + Math.max(...centers.map(c => c.x))) / 2,
    y: (Math.min(...centers.map(c => c.y)) + Math.max(...centers.map(c => c.y))) / 2};
}

/** The shape of a plan: [index, dx, dy] with the group's box starting at cell 0, 0. */
function shape(encounter, plan) {
  const b = planBounds(encounter, plan);
  return plan.map(p => [p.index, p.dx - b.minX, p.dy - b.minY]);
}

/** A plan's rectangles in cells. */
const rectsOf = (encounter, plan) => plan.map(p => ({x: p.dx, y: p.dy, w: encounter.tokens[p.index].data.width,
  h: encounter.tokens[p.index].data.height}));

/** The first two rectangles that overlap, or null. */
function anyOverlap(rects) {
  for ( let i = 0; i < rects.length; i++ ) {
    for ( let j = i + 1; j < rects.length; j++ ) if ( overlaps(rects[i], rects[j]) ) return `${i} ${j}`;
  }
  return null;
}

test("quarter turns are kept as 0 to 3, negative turns go the other way", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, -1, -2, -3, -4, -5].map(normalTurns), [0, 1, 2, 3, 0, 1, 3, 2, 1, 0, 3]);
  assert.equal(normalTurns("2"), 2);
  assert.equal(normalTurns(undefined), 0);
  assert.equal(normalTurns("left"), 0);
});

test("four quarter turns give back the formation", () => {
  const encounter = goblinCamp();
  const plan = planPlacement(encounter);
  let turned = plan;
  for ( let i = 0; i < 4; i++ ) turned = turnPlan(encounter, turned, 1);
  assert.equal(cellsOf(turned), cellsOf(plan));
  let back = plan;
  for ( let i = 0; i < 4; i++ ) back = turnPlan(encounter, back, -1);
  assert.equal(cellsOf(back), cellsOf(plan));
  assert.equal(cellsOf(turnPlan(encounter, plan, 4)), cellsOf(plan));
  assert.equal(cellsOf(turnPlan(encounter, plan, 0)), cellsOf(plan));
  // Two single turns are one half turn, three right are one left
  assert.equal(cellsOf(turnPlan(encounter, turnPlan(encounter, plan, 1), 1)), cellsOf(turnPlan(encounter, plan, 2)));
  assert.equal(cellsOf(turnPlan(encounter, plan, 3)), cellsOf(turnPlan(encounter, plan, -1)));
});

test("a turn left then right gives back the formation", () => {
  const encounter = goblinCamp();
  const [gob] = encounter.groups;
  // With extra goblins on free cells around the saved ones
  const plan = planPlacement(encounter, {[gob.key]: 7});
  assert.equal(cellsOf(turnPlan(encounter, turnPlan(encounter, plan, -1), 1)), cellsOf(plan));
  assert.equal(cellsOf(turnPlan(encounter, turnPlan(encounter, plan, 1), -1)), cellsOf(plan));
  assert.equal(cellsOf(turnPlan(encounter, turnPlan(encounter, plan, 2), 2)), cellsOf(plan));
  assert.equal(anyOverlap(rectsOf(encounter, turnPlan(encounter, plan, 1))), null);
});

test("a turn right moves the front to the right side, the 2x2 boss included", () => {
  // Goblins in a row on top, the 2x2 boss below the middle one
  const encounter = goblinCamp();
  const plan = planPlacement(encounter);
  const right = turnPlan(encounter, plan, 1);
  assert.deepEqual(shape(encounter, right), [[0, 2, 0], [1, 2, 1], [2, 2, 2], [3, 0, 1]]);
  const left = turnPlan(encounter, plan, -1);
  assert.deepEqual(shape(encounter, left), [[0, 0, 2], [1, 0, 1], [2, 0, 0], [3, 1, 0]]);
  const half = turnPlan(encounter, plan, 2);
  assert.deepEqual(shape(encounter, half), [[0, 2, 2], [1, 1, 2], [2, 0, 2], [3, 0, 0]]);
  for ( const turned of [right, left, half] ) {
    assert.equal(anyOverlap(rectsOf(encounter, turned)), null);
    // The pivot stays and the 3x3 square stays 3x3
    assert.deepEqual(middle(encounter, turned), middle(encounter, plan));
    const b = planBounds(encounter, turned);
    assert.deepEqual([b.width, b.height], [3, 3]);
  }
});

test("a token wider than tall keeps its size, its center turns with the group", () => {
  const cart = {actorUuid: "Actor.cart", sourceUuid: null, name: "Cart", img: null, type: "npc"};
  const encounter = buildEncounter({tokens: [
    {data: token(0, 0, {width: 2, height: 1}), actor: cart},
    {data: token(0, 100), actor: goblin},
    {data: token(100, 100), actor: goblin}
  ], grid: GRID});
  const plan = planPlacement(encounter);
  const right = turnPlan(encounter, plan, 1);
  // The cart's center moves from (1, 0.5) to (1.5, 1), its corner by half a cell, its size stays 2x1
  assert.deepEqual(shape(encounter, right), [[0, 0.5, 0.5], [1, 0, 0], [2, 0, 1]]);
  assert.deepEqual(middle(encounter, right), middle(encounter, plan));
  assert.equal(encounter.tokens[0].data.width, 2);
  assert.equal(encounter.tokens[0].data.height, 1);
  let back = right;
  for ( let i = 0; i < 3; i++ ) back = turnPlan(encounter, back, 1);
  assert.equal(cellsOf(back), cellsOf(plan));
  assert.equal(cellsOf(turnPlan(encounter, right, -1)), cellsOf(plan));
  // The general function keeps other fields and the sizes it was given
  assert.deepEqual(turnCells([{dx: 0, dy: 0, w: 3, h: 1, id: "a"}], 1), [{dx: 0, dy: 0, w: 3, h: 1, id: "a"}]);
});

test("odd and even widths turn into a column on whole cell steps", () => {
  // Three in a row: the middle one stays, the left one goes up
  const odd = turnCells([{dx: 0, dy: 0, w: 1, h: 1}, {dx: 1, dy: 0, w: 1, h: 1}, {dx: 2, dy: 0, w: 1, h: 1}], 1);
  assert.deepEqual(odd.map(c => [c.dx, c.dy]), [[1, -1], [1, 0], [1, 1]]);
  // Two in a row: the middle lies between them, so the column starts half a cell off, one whole cell apart
  const even = turnCells([{dx: 0, dy: 0, w: 1, h: 1}, {dx: 1, dy: 0, w: 1, h: 1}], 1);
  assert.deepEqual(even.map(c => [c.dx, c.dy]), [[0.5, -0.5], [0.5, 0.5]]);
  // Four by one and two by three blocks: steps between tokens stay whole cells after every turn
  const blocks = [
    [0, 1, 2, 3].map(x => ({dx: x, dy: 0, w: 1, h: 1})),
    [0, 1].flatMap(x => [0, 1, 2].map(y => ({dx: x, dy: y, w: 1, h: 1})))
  ];
  for ( const block of blocks ) {
    for ( const turns of [1, 2, 3, -1] ) {
      const turned = turnCells(block, turns);
      const lead = turned[0];
      for ( const c of turned ) {
        assert.ok(Number.isInteger(c.dx - lead.dx) && Number.isInteger(c.dy - lead.dy), JSON.stringify(turned));
      }
      assert.equal(new Set(turned.map(c => `${c.dx},${c.dy}`)).size, block.length);
    }
  }
});

test("a turned formation lands on the square grid in its new shape, centered on the click", () => {
  const encounter = goblinCamp();
  const turned = turnPlan(encounter, planPlacement(encounter), 1);
  const grid = {sizeX: 100, sizeY: 100, square: true};
  const rect = {x: 0, y: 0, width: 2000, height: 1400};
  const points = planPoints(encounter, turned, {x: 1013, y: 807}, grid);
  const placed = arrangePoints(points, {grid, rect, snap: squareSnap(100)});
  for ( const p of placed ) assert.ok(p.x % 100 === 0 && p.y % 100 === 0, JSON.stringify(p));
  const at = Object.fromEntries(placed.map(p => [p.index, [p.x, p.y]]));
  // Goblins in a column on the right, the boss left of the middle goblin
  assert.equal(at[0][0], at[1][0]);
  assert.equal(at[1][0], at[2][0]);
  assert.deepEqual([at[1][1] - at[0][1], at[2][1] - at[1][1]], [100, 100]);
  assert.deepEqual([at[0][0] - at[3][0], at[1][1] - at[3][1]], [200, 0]);
  const left = Math.min(...placed.map(p => p.x));
  const top = Math.min(...placed.map(p => p.y));
  assert.ok(Math.abs(left + 150 - 1013) <= 100 && Math.abs(top + 150 - 807) <= 100, `${left},${top}`);
  // Two in a row (an even width) still land on whole cells, one above the other
  const pair = buildEncounter({tokens: [{data: token(0, 0), actor: goblin}, {data: token(100, 0), actor: goblin}], grid: GRID});
  const pairPoints = planPoints(pair, turnPlan(pair, planPlacement(pair), 1), {x: 1000, y: 700}, grid);
  const pairPlaced = arrangePoints(pairPoints, {grid, rect, snap: squareSnap(100)});
  assert.deepEqual(pairPlaced.map(p => [p.x - pairPlaced[0].x, p.y - pairPlaced[0].y]), [[0, 0], [0, 100]]);
  for ( const p of pairPlaced ) assert.ok(p.x % 100 === 0 && p.y % 100 === 0, JSON.stringify(p));
});
