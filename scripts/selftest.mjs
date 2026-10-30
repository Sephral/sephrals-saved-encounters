/**
 * Self-test: what placing relies on in Foundry (grid snapping, coordinates, token creation, fights, compendium
 * import), the storage, the texts, and a round trip of a small encounter through the placement plan.
 */

import {MODULE_ID, TESTED_VERSIONS, esc, t} from "./config.mjs";
import {buildEncounter, planPlacement, planPoints, resolveCounts, turnPlan} from "./encounter-data.mjs";
import {positionsFor} from "./placement.mjs";
import {encounterOf, worldEncounters} from "./store.mjs";

/**
 * A small encounter to plan: two tokens of one actor with a count formula, rolled to three, turned right and back.
 * @returns {Promise<boolean>}
 */
async function planWorks() {
  const encounter = buildEncounter({
    tokens: [
      {data: {x: 100, y: 100, width: 1, height: 1, name: "A"}, actor: {actorUuid: "Actor.a", name: "A"}},
      {data: {x: 200, y: 100, width: 1, height: 1, name: "A"}, actor: {actorUuid: "Actor.a", name: "A"}}
    ],
    grid: {sizeX: 100, sizeY: 100}
  });
  encounter.groups[0].formula = "1d1+2";
  const counts = await resolveCounts(encounter, async formula => (await new Roll(formula).evaluate()).total);
  const plan = planPlacement(encounter, counts);
  const points = planPoints(encounter, plan, {x: 500, y: 500}, {sizeX: 100, sizeY: 100});
  const cells = list => list.map(p => `${p.dx},${p.dy}`).join(" ");
  const turned = turnPlan(encounter, plan, 1);
  const turns = (cells(turned) !== cells(plan)) && (cells(turnPlan(encounter, turned, -1)) === cells(plan));
  return (counts[encounter.groups[0].key] === 3) && (plan.length === 3) && points.every(p => Number.isFinite(p.x))
    && turns;
}

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  const Token = CONFIG.Token?.documentClass;
  check(typeof Token?.prototype?.getSnappedPosition === "function", "SSE.SELFTEST.Snap");
  check((typeof canvas?.canvasCoordinatesFromClient === "function")
    && (typeof canvas?.clientCoordinatesFromCanvas === "function"), "SSE.SELFTEST.Coordinates");
  check(typeof Combat?.implementation?.prototype?.rollInitiative === "function", "SSE.SELFTEST.Combat");
  check(typeof game.actors?.importFromCompendium === "function", "SSE.SELFTEST.Import");
  check(typeof foundry.applications?.api?.DialogV2 === "function", "SSE.SELFTEST.Dialog");
  check(!!foundry.applications?.ux?.TextEditor?.implementation?.getDragEventData, "SSE.SELFTEST.Drop");
  for ( const key of ["placements", "placeHidden", "combatAddPlayers"] ) {
    check(game.settings.settings.has(`${MODULE_ID}.${key}`), "SSE.SELFTEST.Storage", {key});
  }
  const broken = worldEncounters().filter(entry => !encounterOf(entry)).map(entry => entry.name);
  check(!broken.length, "SSE.SELFTEST.Broken", {names: broken.join(", ")});
  const keys = ["SSE.Window.title", "SSE.Editor.newTitle", "SSE.Preview.place", "SSE.Notice.placed", "SSE.Page.monsters",
    "SSE.Turn.keys"];
  const missing = keys.filter(key => !game.i18n.has(key));
  check(!missing.length, "SSE.SELFTEST.Texts", {keys: missing.join(", ")});
  check(await planWorks().catch(() => false), "SSE.SELFTEST.Plan");
  if ( canvas?.ready && canvas.scene ) {
    let ok = false;
    try {
      const encounter = buildEncounter({tokens: [{data: {x: 0, y: 0, width: 1, height: 1}, actor: {name: "A"}}],
        grid: {sizeX: 100, sizeY: 100}});
      const points = positionsFor(encounter, planPlacement(encounter), canvas.scene,
        {x: canvas.dimensions.sceneX + 75, y: canvas.dimensions.sceneY + 75}, true);
      ok = points.length === 1 && Number.isFinite(points[0].x) && Number.isFinite(points[0].y);
    } catch {
      ok = false;
    }
    check(ok, "SSE.SELFTEST.Positions");
  }
  return {problems, checks};
}

/**
 * Run the self-test and report the result.
 * @param {object} [options]
 * @param {boolean} [options.report=true]
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report = true} = {}) {
  const {problems, checks} = await checkAll();
  const summary = problems.length ? t("SSE.SELFTEST.Problems", {problems: problems.length, checks})
    : t("SSE.SELFTEST.Passed", {checks});
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    const versions = t("SSE.SELFTEST.Version", {current: game.version, tested: TESTED_VERSIONS.core});
    let content = `<h3>${esc(t("SSE.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id],
      speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry is newer than the version the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  if ( !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("SSE.SELFTEST.NewVersions", {versions: signature}), {permanent: true});
}
