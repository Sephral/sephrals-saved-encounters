/**
 * Constants and small helpers shared by the scripts of the module. The module runs on Foundry 13 and 14, so it uses
 * game.i18n instead of the v14 global _loc.
 */

/** The id of this module. */
export const MODULE_ID = "sephrals-saved-encounters";

/** The folder of the module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** The Foundry versions the module was verified against (see the self-test). */
export const TESTED_VERSIONS = {core: "14.369"};

/** The flag on a journal entry that holds an encounter. */
export const ENCOUNTER_FLAG = "encounter";

/** The flag on a journal entry with the facing of its encounter: quarter turns clockwise, as last placed. */
export const TURNS_FLAG = "turns";

/** The flag on the folders the module made. */
export const FOLDER_FLAG = "root";

/** The icon of a map pin. */
export const PIN_ICON = "icons/svg/combat.svg";

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Localize a key, with optional data.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * Is this Foundry 14 or newer (scenes with levels)?
 * @returns {boolean}
 */
export function hasLevels() {
  return (game.release?.generation ?? 13) >= 14;
}

/**
 * Is a window open or on its way? While an application renders, its "rendered" flag is false, and a redraw asked
 * for in that moment would be lost.
 * @param {ApplicationV2|undefined} app
 * @returns {boolean}
 */
export function isShown(app) {
  const states = foundry.applications.api.ApplicationV2.RENDER_STATES;
  return !!app && ((app.state === states.RENDERED) || (app.state === states.RENDERING));
}

/**
 * Open Foundry's settings on the tab of this module.
 */
export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch(err) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, err);
  }
  sheet.bringToFront?.();
}

/**
 * Put a gear into the title bar of a window that opens the settings of this module. The windows are for GMs only,
 * so every user who sees one gets the gear.
 * @param {HTMLElement} frame   The window frame
 */
export function addSettingsGear(frame) {
  const header = frame?.querySelector(".window-header");
  if ( !header || header.querySelector(".sse-settings") ) return;
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear sse-settings";
  gear.dataset.tooltip = t("SSE.gear");
  gear.setAttribute("aria-label", t("SSE.gear"));
  gear.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}

/**
 * The image of a token or actor, or Foundry's default.
 * @param {string|null|undefined} src
 * @returns {string}
 */
export function imageOr(src) {
  return src || "icons/svg/mystery-man.svg";
}

/**
 * Is a path a video?
 * @param {string} src
 * @returns {boolean}
 */
export function isVideo(src) {
  return /\.(webm|mp4|m4v|ogv|mov)(\?|#|$)/i.test(String(src ?? ""));
}
