import {
  defaults,
  uid,
  mergeStyle,
  saveLibrary,
  readLibrary,
  validateLibrary,
} from "./presets.js";
import { parseScript, markRange } from "./parser.js";
export let library;
let storageBlocked = false,
  saveTimer;
export const state = {
  range: null,
  role: "A",
  scope: "role",
  returnScope: "role",
  checked: new Set(),
};
const listeners = new Set();
// Topic contracts are documented in ARCHITECTURE.md. Notifications are synchronous.
export function subscribe(topics, listener) {
  const entry = { topics: new Set(topics), listener };
  listeners.add(entry);
  return () => listeners.delete(entry);
}
export function notify(...topics) {
  const changed = new Set(topics);
  for (const entry of listeners) {
    if (topics.some((topic) => entry.topics.has(topic)))
      entry.listener(changed);
  }
}
export let saveStatus = "保存済み";
export let notice = null;
function savingStatus(value) {
  saveStatus = value;
  notify("save-status");
}
export function report(message, error = false) {
  notice = { message, error };
  notify("notice");
}
export function initState(sampleScript) {
  try {
    library = readLibrary();
  } catch {
    storageBlocked = true;
    report(
      "保存データを読み込めません。既存データは上書きしません。JSON保存で作業を保管してください。",
      true,
    );
  }
  if (!library?.projects.length) {
    const p = project("はじめてのテロップ", parseScript(sampleScript));
    library = { projects: [p], sets: [], active: p.id };
  }
  state.role = row()?.role || "A";
}
export function persist() {
  clearTimeout(saveTimer);
  try {
    if (storageBlocked) throw Error("保存データの読込エラー");
    saveLibrary(library);
    savingStatus("保存済み");
  } catch {
    savingStatus("保存失敗");
    report(
      "ブラウザ保存に失敗しました。JSON保存でバックアップしてください。",
      true,
    );
  }
}
export function saveSoon() {
  savingStatus("保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}
export function saveOnExit() {
  if (!storageBlocked)
    try {
      saveLibrary(library);
    } catch {}
}
export function project(name, rows = []) {
  return {
    id: uid(),
    name,
    roles: defaults(),
    rows,
    selected: rows[0]?.id || null,
  };
}

export const current = () =>
  library.projects.find((p) => p.id === library.active) || library.projects[0];

export const row = () =>
  current().rows.find((r) => r.id === current().selected);

export const rowStyle = (r) => mergeStyle(current().roles[r.role], r.override);

export function patchMerge(base, patch) {
  const out = { ...base, ...patch };
  for (const key of ["shadow", "box", "auto"])
    if (patch[key]) out[key] = { ...base[key], ...patch[key] };
  if (patch.edges)
    out.edges = Array.from({ length: 3 }, (_, i) => ({
      ...base.edges?.[i],
      ...patch.edges[i],
    }));
  return out;
}

export function settingsStyle() {
  const r = row();
  if (state.scope === "role") return current().roles[state.role];
  if (!r) return current().roles[state.role];
  const base = rowStyle(r);
  return state.scope === "selection" && state.range
    ? mergeStyle(base, r.marks[state.range.start] || {})
    : base;
}

export function usedFonts() {
  const set = new Set(),
    p = current();

  for (const s of Object.values(p.roles)) set.add(s.font);

  for (const r of p.rows) {
    if (r.override.font) set.add(r.override.font);
    for (const m of r.marks) if (m?.font) set.add(m.font);
  }

  return set;
}
export function updateStyle(patch) {
  const r = row();
  if (state.scope === "role")
    current().roles[state.role] = mergeStyle(
      current().roles[state.role],
      patch,
    );
  else if (state.scope === "selection" && r && state.range)
    markRange(r, state.range, patch);
  else if (state.scope === "row" && r)
    r.override = patchMerge(r.override, patch);
}
export function replaceProject(project) {
  library.projects[library.projects.findIndex((p) => p.id === project.id)] =
    project;
}
export function selectedRow(id) {
  if (!current().rows.some((r) => r.id === id)) return;
  current().selected = id;
  state.range = null;
  if (state.scope === "selection") state.scope = state.returnScope;
  state.role = row().role;
  notify("selection-change", "refresh");
  saveSoon();
}
export function importLibrary(data, mode) {
  const incoming = validateLibrary(data);
  if (library.sets.length + incoming.sets.length > 100)
    throw Error("マイセットの合計が100件を超えます。");
  if (mode === "project") {
    if (!incoming.projects.length)
      throw Error("プロジェクトが入っていません。");
    if (library.projects.length + incoming.projects.length > 100)
      throw Error("プロジェクトの合計が100件を超えます。");
    library.projects.push(...incoming.projects);
    library.active = incoming.active;
  } else if (!incoming.sets.length) throw Error("マイセットが入っていません。");
  library.sets.push(...incoming.sets);
  state.range = null;
  state.scope = "role";
  state.returnScope = "role";
  state.role = row()?.role || "A";
  state.checked.clear();
  notify("refresh");
  saveSoon();
}
