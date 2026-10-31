/**
 * The window to save and edit an encounter: name, folder, a count per monster, actors dropped in from the sidebar or
 * a compendium, a loot table and notes.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, imageOr, setting, t} from "./config.mjs";
import {actorRef, actorRefOfToken, prototypeData} from "./actors.mjs";
import {addActorToken, buildEncounter, groupSummary, looksLikeFormula, normalizeEncounter,
  removeGroup} from "./encounter-data.mjs";
import {createEncounter, createEncounterFolder, encounterFolders, encounterOf, encounterRoot,
  updateEncounter} from "./store.mjs";
import {trace} from "./debug.mjs";
import {countFeature} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Value of the folder select that makes a new folder. */
const NEW_FOLDER = "__new__";

export class EncounterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {JournalEntry} [options.entry]     The encounter to edit
   * @param {object} [options.draft]           A new encounter
   * @param {boolean} [options.hasChanges]     The tokens of the draft carry changes (hit points and the like)
   */
  constructor({entry = null, draft = null, hasChanges = false, ...options} = {}) {
    super({...options, id: entry ? `sse-editor-${entry.id}` : "sse-editor-new"});
    this.entry = entry;
    this.encounter = entry ? encounterOf(entry) : normalizeEncounter(draft);
    this.hasChanges = hasChanges;
    this.inputs = {
      name: entry?.name ?? "",
      folderId: entry?.folder?.id ?? null,
      newFolder: "",
      keepChanges: false
    };
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sse-app", "sse-editor"],
    tag: "form",
    window: {icon: "fa-solid fa-dragon", resizable: true},
    position: {width: 560, height: "auto"},
    form: {handler: EncounterEditor.#onSubmit, submitOnChange: false, closeOnSubmit: false},
    actions: {
      removeGroup: EncounterEditor.#onRemoveGroup,
      clearLoot: EncounterEditor.#onClearLoot,
      cancel: EncounterEditor.#onCancel
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/editor.hbs`, scrollable: [".sse-groups"]}};

  /** @override */
  get title() {
    return this.entry ? t("SSE.Editor.editTitle", {name: this.entry.name}) : t("SSE.Editor.newTitle");
  }

  /** @override */
  async _prepareContext() {
    const folders = encounterFolders();
    const root = folders[0] ?? null;
    const folderId = this.inputs.folderId ?? root?.id ?? NEW_FOLDER;
    const table = this.encounter.lootTable ? await fromUuid(this.encounter.lootTable).catch(() => null) : null;
    const groups = groupSummary(this.encounter).map(g => ({
      ...g,
      img: imageOr(g.img),
      countLabel: t(g.count === 1 ? "SSE.Editor.tokenOne" : "SSE.Editor.tokens", {count: g.count})
    }));
    return {
      name: this.inputs.name,
      placeholder: groups[0]?.name ? t("SSE.Editor.namePlaceholder", {name: groups[0].name}) : t("SSE.Editor.defaultName"),
      folders: [
        ...folders.map(f => ({id: f.id, label: `${" ".repeat(f.depth)}${f.name}`, selected: f.id === folderId})),
        {id: NEW_FOLDER, label: t("SSE.Editor.newFolderOption"), selected: folderId === NEW_FOLDER}
      ],
      showNewFolder: folderId === NEW_FOLDER,
      newFolder: this.inputs.newFolder,
      rootName: root?.name ?? t("SSE.Folder.root"),
      groups,
      empty: !groups.length,
      loot: table ? {name: table.name, img: imageOr(table.img)} : null,
      ledgerActive: Boolean(game.modules.get("sephrals-loot-ledger")?.active),
      notes: this.encounter.notes,
      hasChanges: this.hasChanges,
      keepChanges: this.inputs.keepChanges,
      theme: setting("theme"),
      isNew: !this.entry,
      text: {
        name: t("SSE.Editor.name"),
        folder: t("SSE.Editor.folder"),
        newFolder: t("SSE.Editor.newFolder"),
        monsters: t("SSE.Editor.monsters"),
        formula: t("SSE.Editor.formula"),
        formulaHint: t("SSE.Editor.formulaHint"),
        unique: t("SSE.Editor.unique"),
        remove: t("SSE.Editor.remove"),
        drop: t("SSE.Editor.drop"),
        empty: t("SSE.Editor.empty"),
        loot: t("SSE.Editor.loot"),
        lootDrop: t("SSE.Editor.lootDrop"),
        clearLoot: t("SSE.Editor.clearLoot"),
        ledgerHint: t("SSE.Editor.ledgerHint"),
        ledgerLink: t("SSE.Editor.ledgerLink"),
        notes: t("SSE.Editor.notes"),
        notesHint: t("SSE.Editor.notesHint"),
        keepChanges: t("SSE.Editor.keepChanges"),
        keepChangesHint: t("SSE.Editor.keepChangesHint"),
        save: t("SSE.Editor.save"),
        cancel: t("SSE.Editor.cancel")
      }
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
    const form = this.element;
    form.querySelector("[name=name]")?.addEventListener("input", event => this.inputs.name = event.target.value);
    form.querySelector("[name=newFolder]")?.addEventListener("input", event => this.inputs.newFolder = event.target.value);
    form.querySelector("[name=keepChanges]")?.addEventListener("change", event => this.inputs.keepChanges = event.target.checked);
    form.querySelector("[name=notes]")?.addEventListener("input", event => this.encounter.notes = event.target.value);
    form.querySelector("[name=folderId]")?.addEventListener("change", event => {
      this.inputs.folderId = event.target.value;
      this.render();
    });
    for ( const input of form.querySelectorAll("input[data-formula]") ) {
      input.addEventListener("input", () => {
        const group = this.encounter.groups.find(g => g.key === input.dataset.formula);
        if ( group ) group.formula = input.value.trim();
        input.classList.toggle("sse-invalid", !looksLikeFormula(input.value));
      });
    }
    for ( const zone of form.querySelectorAll("[data-drop]") ) {
      zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.classList.add("sse-drop-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("sse-drop-over"));
      zone.addEventListener("drop", event => {
        zone.classList.remove("sse-drop-over");
        this.#onDrop(event, zone.dataset.drop);
      });
    }
  }

  /**
   * An actor or a roll table dropped into the window.
   * @param {DragEvent} event
   * @param {"actors"|"loot"} zone
   */
  async #onDrop(event, zone) {
    event.preventDefault();
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const data = TextEditor.getDragEventData(event);
    if ( !data?.uuid ) return;
    const doc = await fromUuid(data.uuid).catch(() => null);
    if ( (doc instanceof Actor) ) {
      this.encounter = addActorToken(this.encounter, actorRef(doc), prototypeData(doc));
      countFeature(MODULE_ID, "actorAdded");
      trace.add("actorAdded", {actor: doc.uuid});
      return this.render();
    }
    if ( doc instanceof RollTable ) {
      this.encounter.lootTable = doc.uuid;
      return this.render();
    }
    ui.notifications.warn(t(zone === "loot" ? "SSE.Editor.lootOnly" : "SSE.Editor.actorsOnly"));
  }

  /** @this {EncounterEditor} */
  static #onRemoveGroup(event, target) {
    const key = target.closest("[data-group]")?.dataset.group;
    if ( !key ) return;
    this.encounter = removeGroup(this.encounter, key);
    this.render();
  }

  /** @this {EncounterEditor} */
  static #onClearLoot() {
    this.encounter.lootTable = null;
    this.render();
  }

  /** @this {EncounterEditor} */
  static #onCancel() {
    this.close();
  }

  /**
   * Save the encounter.
   * @this {EncounterEditor}
   */
  static async #onSubmit(event, form, formData) {
    const values = formData.object;
    const encounter = normalizeEncounter(this.encounter);
    if ( !encounter?.tokens.length ) {
      ui.notifications.warn(t("SSE.Editor.noTokens"));
      return;
    }
    for ( const group of encounter.groups ) {
      const raw = String(values[`formula.${group.key}`] ?? group.formula ?? "").trim();
      if ( raw && (!looksLikeFormula(raw) || !Roll.validate(raw)) ) {
        ui.notifications.warn(t("SSE.Editor.badFormula", {formula: raw, name: group.name}));
        return;
      }
      group.formula = group.linked ? "" : raw;
    }
    encounter.notes = String(values.notes ?? encounter.notes ?? "");
    if ( !this.entry && !values.keepChanges ) {
      for ( const token of encounter.tokens ) delete token.data.delta;
    }
    const name = String(values.name ?? "").trim() || this.#defaultName(encounter);
    let folderId = values.folderId || null;
    if ( folderId === NEW_FOLDER ) {
      const folderName = String(values.newFolder ?? "").trim();
      if ( !folderName ) {
        ui.notifications.warn(t("SSE.Editor.folderName"));
        return;
      }
      folderId = (await createEncounterFolder(folderName)).id;
    }
    folderId ??= (await encounterRoot()).id;
    let entry;
    if ( this.entry ) {
      entry = await updateEncounter(this.entry, encounter, {name, folderId});
      trace.add("edited", {encounter: entry.uuid, groups: encounter.groups.length, tokens: encounter.tokens.length});
    }
    else {
      entry = await createEncounter(encounter, {name, folderId});
      countFeature(MODULE_ID, "encounterSaved");
      trace.add("saved", {encounter: entry.uuid, groups: encounter.groups.length, tokens: encounter.tokens.length});
      ui.notifications.info(t("SSE.Notice.saved", {name, count: encounter.tokens.length}));
    }
    await this.close();
    return entry;
  }

  /**
   * The name of an encounter without one: its biggest group.
   * @param {object} encounter
   * @returns {string}
   */
  #defaultName(encounter) {
    const groups = groupSummary(encounter).sort((a, b) => b.count - a.count);
    return groups[0]?.name ? t("SSE.Editor.namePlaceholder", {name: groups[0].name}) : t("SSE.Editor.defaultName");
  }
}

/**
 * Save the tokens the GM has selected as a new encounter: open the editor with them.
 * @returns {Promise<EncounterEditor|null>}
 */
export async function saveSelected() {
  if ( !game.user.isGM ) return null;
  const tokens = canvas?.ready ? canvas.tokens.controlled.map(token => token.document) : [];
  if ( !tokens.length ) {
    ui.notifications.warn(t("SSE.Notice.selectTokens"));
    return null;
  }
  const scene = canvas.scene;
  const grid = scene.grid;
  const level = (game.release.generation >= 14) ? canvas.level : null;
  const bottom = Number.isFinite(level?.elevation?.bottom) ? level.elevation.bottom : 0;
  const draft = buildEncounter({
    tokens: tokens.map(token => ({data: token.toObject(), actor: actorRefOfToken(token)})),
    grid: {sizeX: grid.sizeX ?? grid.size, sizeY: grid.sizeY ?? grid.size, type: grid.type},
    keepDelta: true,
    levelBottom: bottom
  });
  const hasChanges = draft.tokens.some(token => {
    const delta = token.data.delta;
    return delta && Object.keys(delta).some(key => !["_id", "flags"].includes(key)
      && (Array.isArray(delta[key]) ? delta[key].length : (delta[key] && Object.keys(delta[key]).length)));
  });
  await encounterRoot();
  return new EncounterEditor({draft, hasChanges}).render({force: true});
}

/**
 * Open the editor of an encounter.
 * @param {JournalEntry} entry
 * @returns {Promise<EncounterEditor>}
 */
export function editEncounter(entry) {
  const app = foundry.applications.instances.get(`sse-editor-${entry.id}`) ?? new EncounterEditor({entry});
  return app.render({force: true});
}
