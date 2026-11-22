// Sample windows (api.samples, contract in samples.mjs): the encounters window, the editor, the journal page of an
// encounter, the hints of the placement preview and the question before a delete, filled with made-up encounters, so
// translators and testers see every text in its place without saving an encounter first. Nothing here writes: no
// journal entry, token, pin or fight is made, no setting is changed, the map is not touched, no usage counter counts.
import {MODULE_ID, esc, t} from "./config.mjs";
import {pageHtml} from "./encounter-data.mjs";
import {EncounterEditor, NEW_FOLDER} from "./editor-app.mjs";
import {EncountersApp} from "./encounters-app.mjs";
import {hintHtml, showFacing} from "./preview.mjs";
import {SAMPLE_LOOT, sampleEncounter, sampleEncounterList} from "./sample-data.mjs";
import {pageLabels} from "./store.mjs";
import {blockedForm, closeSample, markSample, openSampleDialog, openSampleHtml, sampleActions, sampleCast, sampleId,
  sampleText} from "./samples.mjs";

/** Folders of the sample list: the "Encounters" folder and one below it. */
function sampleFolders() {
  const root = {id: "sample-root", name: t("SSE.Folder.root"), sort: 0, folder: null};
  const mill = {id: "sample-mill", name: sampleText("place"), sort: 1, folder: root};
  return {root, mill, list: [{id: root.id, name: root.name, depth: 0}, {id: mill.id, name: mill.name, depth: 1}]};
}

/** The made-up texts in the language of the user. */
function texts() {
  return {
    names: {
      ambush: t("SSE.Editor.namePlaceholder", {name: sampleText("bandit")}),
      bridge: t("SSE.Editor.namePlaceholder", {name: sampleText("troll")}),
      wolves: t("SSE.Editor.namePlaceholder", {name: sampleText("wolf")})
    },
    notes: t("SSE.Sample.notes"),
    place: sampleText("place"),
    bandit: sampleText("bandit"),
    wolf: sampleText("wolf"),
    troll: sampleText("troll")
  };
}

const castOf = () => sampleCast().filter(member => member.side === "foe");
const list = () => sampleEncounterList(castOf(), texts());

/** The encounters window over the made-up list. Its buttons do nothing, search and folders work. */
class SampleEncountersApp extends EncountersApp {
  constructor({empty = false, key, ...options} = {}) {
    super({id: sampleId(MODULE_ID, key), actions: sampleActions(EncountersApp, []), ...options});
    this.sampleEmpty = empty;
    markSample(this);
  }

  /** @override */
  async _source() {
    const {root, mill} = sampleFolders();
    const folders = {root, mill, none: null};
    return {root, entries: this.sampleEmpty ? [] : list().map(entry => ({...entry, folder: folders[entry.folder ?? "none"]}))};
  }

  /** @override */
  _facts(entry) {
    return {encounter: entry.encounter, scene: {name: sampleText("place")},
      tokens: Array.from({length: entry.placed}), pinsHere: entry.pinsHere,
      pinScenes: entry.pinScenes.map(name => ({name})), turns: entry.turns};
  }

  /** @override */
  _onRender(context, options) {
    // The two checkboxes would write settings: they show the setting, a click only says it does nothing
    for ( const box of this.element.querySelectorAll("input[data-setting]") ) {
      box.removeAttribute("data-setting");
      box.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        globalThis.ui?.notifications?.info(game.i18n.localize("SSE.Sample.nothing"));
      }, true);
    }
    super._onRender(context, options);
  }
}

/** The editor over a made-up encounter. The form saves nothing, removing a monster or the loot table only looks. */
class SampleEditor extends EncounterEditor {
  constructor({key, ledger = false, newFolder = false, hasChanges = false, draft, name = "", folderId = null,
    editing = false, ...options}) {
    super({id: sampleId(MODULE_ID, key), draft, hasChanges, actions: sampleActions(EncounterEditor, ["removeGroup", "clearLoot",
      "cancel"]), form: {handler: blockedForm, submitOnChange: false, closeOnSubmit: false}, ...options});
    this.sampleLedger = ledger;
    this.sampleEditing = editing;
    this.inputs.name = name;
    this.inputs.folderId = newFolder ? NEW_FOLDER : folderId;
    markSample(this);
  }

  /** @override */
  get title() {
    return this.sampleEditing ? t("SSE.Editor.editTitle", {name: this.inputs.name}) : t("SSE.Editor.newTitle");
  }

  /** @override */
  _folders() {
    return sampleFolders().list;
  }

  /** @override */
  async _lootTable() {
    return (this.encounter.lootTable === SAMPLE_LOOT)
      ? {name: t("SSE.Sample.lootTable"), img: "icons/svg/chest.svg"} : null;
  }

  /** @override */
  _ledgerActive() {
    return this.sampleLedger;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if ( this.sampleEditing ) context.isNew = false;
    return context;
  }
}

async function openEditor(key, options) {
  await closeSample(sampleId(MODULE_ID, key));
  const app = new SampleEditor({key, ...options});
  await app.render({force: true});
  return app;
}

async function openList(key, options = {}) {
  await closeSample(sampleId(MODULE_ID, key));
  const app = new SampleEncountersApp({key, ...options});
  await app.render({force: true});
  return app;
}

/** One preview hint, as the module draws it over the map, in a window. */
function hintElement(label, {pin = false, turns = 0} = {}) {
  const hint = document.createElement("div");
  hint.className = "sse-preview-hint";
  hint.style.cssText = "position:static;transform:none;margin:0 0 8px;max-width:none;";
  hint.innerHTML = hintHtml(label, pin);
  showFacing(hint, turns);
  return hint;
}

/**
 * The sample entries of the module (api.samples).
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const title = t("SSE.Window.title");
  const placing = t("SSE.Sample.groupPlacing");
  const journal = t("SSE.Sample.groupJournal");
  const questions = t("SSE.Sample.groupQuestions");
  const entries = [];
  const add = (id, group, label, open) => entries.push({id, group, label, open});

  add("list", title, `${title}: ${t("SSE.Sample.list")}`, () => openList("list"));
  add("list-empty", title, `${title}: ${t("SSE.Sample.listEmpty")}`, () => openList("list-empty", {empty: true}));

  const editorTitle = t("SSE.Editor.newTitle");
  const full = () => list()[0];
  const bridge = () => list()[1];
  add("editor-new", title, `${editorTitle}: ${t("SSE.Sample.editorNew")}`, () => openEditor("editor-new",
    {draft: bridge().encounter, hasChanges: true, folderId: "sample-root"}));
  add("editor-folder", title, `${editorTitle}: ${t("SSE.Sample.editorFolder")}`, () => openEditor("editor-folder",
    {draft: bridge().encounter, newFolder: true}));
  add("editor-edit", title, `${editorTitle}: ${t("SSE.Sample.editorEdit")}`, () => openEditor("editor-edit",
    {draft: full().encounter, editing: true, name: full().name, folderId: "sample-root", ledger: true}));
  add("editor-empty", title, `${editorTitle}: ${t("SSE.Sample.editorEmpty")}`, () => openEditor("editor-empty",
    {draft: {tokens: [], groups: [], grid: {sizeX: 100, sizeY: 100, type: 1}}}));

  add("page", journal, t("SSE.Sample.page"), () => openSampleHtml({moduleId: MODULE_ID, id: "page",
    title: full().name, width: 460, body: () => {
      const element = document.createElement("div");
      element.className = "sse-sample-page";
      element.style.cssText = "padding:4px 8px;";
      const encounter = sampleEncounter({cast: castOf(), loot: true, notes: `${t("SSE.Sample.notes")}\n\n${t("SSE.Sample.notes2")}`,
        parts: [{id: "bandit1", count: 3, name: sampleText("bandit"), formula: "1d4+1"},
          {id: "troll", count: 1, name: sampleText("troll"), linked: true}, {id: "wolf", count: 2, name: sampleText("wolf")}]});
      element.innerHTML = pageHtml(encounter, pageLabels(t("SSE.Sample.lootTable")));
      return element;
    }}));

  const hint = (id, label, build) => add(id, placing, label, () => openSampleHtml({moduleId: MODULE_ID, id, title: label,
    width: 560, body: build}));
  hint("preview-place", t("SSE.Sample.previewPlace"), () => hintElement(t("SSE.Preview.place", {name: full().name, count: 5})));
  hint("preview-fight", t("SSE.Sample.previewFight"), () => hintElement(t("SSE.Preview.placeFight", {name: full().name, count: 5}),
    {turns: 2}));
  hint("preview-pin", t("SSE.Sample.previewPin"), () => hintElement(t("SSE.Preview.pin", {name: full().name}), {pin: true}));
  hint("preview-turns", t("SSE.Sample.previewTurns"), () => {
    const box = document.createElement("div");
    for ( const turns of [1, 2, 3] ) box.append(hintElement(t("SSE.Preview.place", {name: full().name, count: 5}), {turns}));
    return box;
  });

  add("delete-confirm", questions, t("SSE.Window.deleteTitle"), () => openSampleDialog({moduleId: MODULE_ID, id: "delete-confirm",
    title: t("SSE.Window.deleteTitle"), width: 420,
    content: () => `<p>${esc(t("SSE.Window.deleteText", {name: full().name}))}</p>`,
    buttons: [{label: game.i18n.localize("Yes"), icon: "fa-solid fa-check", default: true},
      {label: game.i18n.localize("No"), icon: "fa-solid fa-xmark"}]}));
  return entries;
}
