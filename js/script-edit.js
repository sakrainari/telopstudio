import { ROLES, clone, uid } from "./presets.js";
import {
  state,
  library,
  current,
  row,
  rowStyle,
  saveSoon,
  persist,
  project,
  selectedRow,
  notify,
  subscribe,
} from "./state.js";
import { transaction } from "./history.js";
import { $, escape, option, toast, askName } from "./ui-common.js";
import {
  parseBlock,
  parseScript,
  updateText,
  selectionRange,
  markRange,
} from "./parser.js";
function syncProjects() {
  $("projects").innerHTML = library.projects
    .map((p) => option(p.id, p.name, library.active))
    .join("");
}

function syncCards() {
  const p = current();
  $("rowCount").textContent = `${p.rows.length} CUTS`;
  $("galleryCount").textContent = `${p.rows.length}枚`;

  $("cards").innerHTML =
    p.rows
      .map(
        (r, i) =>
          `<article class="card ${r.id === p.selected ? "active" : ""}" data-id="${r.id}"><div class="card-head"><input type="checkbox" aria-label="${i + 1}枚目を選択" data-check ${state.checked.has(r.id) ? "checked" : ""}><span class="card-number">${String(i + 1).padStart(2, "0")}</span><select data-role aria-label="${i + 1}枚目の役割">${Object.entries(
            ROLES,
          )
            .map(([k, v]) => option(k, v, r.role))
            .join(
              "",
            )}</select></div><button class="card-summary" data-choose-card="${r.id}" title="中央で編集">${escape(r.text) || "（空のテロップ）"}</button><div class="card-actions"><button data-action="copy" title="画像をコピー">▣ コピー</button></div><div class="card-actions"><button data-action="up" ${i === 0 ? "disabled" : ""} title="上へ移動">↑</button><button data-action="down" ${i === p.rows.length - 1 ? "disabled" : ""} title="下へ移動">↓</button><button data-action="duplicate">複製</button><button data-action="delete" class="push">削除</button></div>${Object.keys(r.override).length ? '<p class="card-note">● カード個別設定</p>' : ""}</article>`,
      )
      .join("") ||
    '<p class="empty-list">最初の言葉から、はじめよう。<br>「＋ テロップ追加」で作成できます。</p>';
}

function captureSelection(el) {
  const previousRange = state.range;
  const range = selectionRange(el.value, el.selectionStart, el.selectionEnd);
  state.range = range.end > range.start ? range : null;

  const wasPartial = state.scope === "selection";
  if (!state.range && wasPartial) state.scope = state.returnScope;
  syncSelectionTools();
  const changed =
    previousRange?.start !== state.range?.start ||
    previousRange?.end !== state.range?.end;
  if (wasPartial && (changed || !state.range)) notify("design");
  saveSoon();
}

function quick(action) {
  const r = row();
  if (!r || !state.range)
    return toast("変更したい文字をドラッグ選択してください。");
  transaction(
    action === "clear"
      ? "選択文字の強調解除"
      : action === "inherit"
        ? "選択文字を役割に戻す"
        : "選択文字を装飾",
    () => {
      if (action === "clear" || action === "inherit")
        markRange(r, state.range, {}, action);
      else if (action === "large" || action === "small") {
        for (let i = state.range.start; i < state.range.end; i++)
          markRange(
            r,
            { start: i, end: i + 1 },
            {
              size: Math.max(
                12,
                Math.min(
                  240,
                  (r.marks[i]?.size || rowStyle(r).size) *
                    (action === "small" ? 1 / 1.3 : 1.3),
                ),
              ),
            },
          );
      } else if (action === "important")
        markRange(r, state.range, {
          color: "#ff545f",
          gradient: false,
          size: Math.min(240, rowStyle(r).size * 1.3),
        });
      else
        markRange(r, state.range, {
          color: { red: "#ff545f", yellow: "#ffda53", blue: "#70a5ff" }[action],
          gradient: false,
        });
    },
  );
  notify("design");
  restoreSelectionHighlight();
}

function restoreSelectionHighlight() {
  const el = $("editor");
  if (!state.range || !el?.isConnected) return;
  const chars = Array.from(el.value),
    start = chars.slice(0, state.range.start).join("").length,
    end = chars.slice(0, state.range.end).join("").length;
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, end);
}

function editText(id, value, source) {
  const r = current().rows.find((r) => r.id === id);
  if (!r || r.text === value) return;
  current().selected = id;
  state.role = r.role;
  transaction("文字を編集", () => updateText(r, value), `text:${id}`);
  state.range = null;
  if (state.scope === "selection") state.scope = state.returnScope;
  syncCards();
  notify("design");
}

function addRows(rows) {
  if (current().rows.length + rows.length > 300)
    return toast("1プロジェクトは300枚までです。", true);
  transaction("テロップを追加", () => {
    current().rows.push(...rows);
    current().selected = rows[0]?.id || current().selected;
  });
  state.range = null;
  state.scope = "role";
  state.returnScope = "role";
  state.role = row()?.role || "A";
  notify("refresh");
}

function syncSelectionTools() {
  const r = row(),
    range = state.range,
    text =
      r && range
        ? Array.from(r.text).slice(range.start, range.end).join("")
        : "";

  $("selectionLabel").textContent = range
    ? `選択中：「${text.slice(0, 24)}${text.length > 24 ? "…" : ""}」`
    : "文字を選ぶと部分装飾できます";

  $("endSelection").disabled = !range;
  $("editSelection").disabled = !range;

  document
    .querySelectorAll("[data-quick]")
    .forEach((b) => (b.disabled = !range));
}

function syncEditorTools() {
  const r = row(),
    i = current().rows.indexOf(r);
  $("editorRole").innerHTML = Object.entries(ROLES)
    .map(([k, v]) => option(k, v, r?.role))
    .join("");
  $("editorRole").disabled = !r;
  for (const id of ["splitCard", "editRole", "editCard"]) $(id).disabled = !r;
  $("previousCard").disabled = i <= 0;
  $("nextCard").disabled = i < 0 || i >= current().rows.length - 1;
  $("mergeCard").disabled = i < 0 || i >= current().rows.length - 1;
}

function navigateCard(delta) {
  const i = current().rows.indexOf(row()),
    r = current().rows[i + delta];
  if (r) {
    selectedRow(r.id);
    $("editor").focus();
  }
}

function addSameRole() {
  if (current().rows.length >= 300)
    return toast("1プロジェクトは300枚までです。", true);
  const r = row(),
    next = parseBlock("");
  next.role = r?.role || "A";
  transaction("同じ話者で追加", () => {
    const i = current().rows.indexOf(r);
    current().rows.splice(i + 1, 0, next);
    current().selected = next.id;
  });
  state.range = null;
  state.scope = "role";
  state.returnScope = "role";
  state.role = next.role;
  notify("refresh");
  $("editor").focus();
}
function syncEditor() {
  const r = row();
  if (state.scope !== "role") state.role = r?.role || "A";
  $("editor").value = r?.text || "";
  $("editor").disabled = !r;
  $("currentLabel").textContent = r
    ? `CUT ${String(current().rows.indexOf(r) + 1).padStart(2, "0")} / ${ROLES[r.role]}`
    : "NO CUT";
  syncEditorTools();
  syncSelectionTools();
}
export function initScriptEditor() {
  $("addRow").onclick = addSameRole;

  $("importScript").onclick = () => {
    const rows = parseScript($("script").value);
    if (rows.some((r) => r.text.length > 5000))
      return toast("1枚5000文字以内にしてください。", true);
    if (!rows.length) return toast("台本を入力してください。");
    addRows(rows);
    toast(`${rows.length}枚を追加しました。`);
  };

  $("selectAll").onclick = () => {
    if (state.checked.size === current().rows.length) state.checked.clear();
    else current().rows.forEach((r) => state.checked.add(r.id));
    notify("script");
    notify("checked");
  };

  $("editor").addEventListener("input", () =>
    editText(current().selected, $("editor").value, $("editor")),
  );

  for (const event of ["select", "pointerup", "keyup"])
    $("editor").addEventListener(event, () => {
      if (row()) captureSelection($("editor"));
    });

  $("cards").addEventListener("change", (e) => {
    const card = e.target.closest("[data-id]");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches("[data-check]")) {
      e.target.checked ? state.checked.add(id) : state.checked.delete(id);
      notify("checked");
      return;
    }
    if (e.target.matches("[data-role]")) {
      transaction("役割を変更", () => {
        const r = current().rows.find((x) => x.id === id);
        r.role = e.target.value;
        r.override = {};
      });
      selectedRow(id);
    }
  });

  $("cards").addEventListener("click", (e) => {
    const card = e.target.closest("[data-id]");
    if (!card) return;
    const id = card.dataset.id,
      button = e.target.closest("[data-action]");
    if (!button) {
      if (!e.target.closest("textarea,select,input")) selectedRow(id);
      return;
    }
    const action = button.dataset.action;
    const p = current(),
      index = p.rows.findIndex((r) => r.id === id),
      r = p.rows[index];
    if (action === "copy") return;
    if (action === "duplicate" && p.rows.length >= 300)
      return toast("1プロジェクトは300枚までです。", true);

    transaction(
      {
        up: "テロップを上へ",
        down: "テロップを下へ",
        duplicate: "テロップを複製",
        delete: "テロップを削除",
      }[action],
      () => {
        if (action === "delete") {
          p.rows.splice(index, 1);
          state.checked.delete(id);
          if (p.selected === id)
            p.selected = p.rows[Math.min(index, p.rows.length - 1)]?.id || null;
        } else if (action === "duplicate") {
          const dupe = clone(r);
          dupe.id = uid();
          p.rows.splice(index + 1, 0, dupe);
          p.selected = dupe.id;
        } else {
          const to = index + (action === "up" ? -1 : 1);
          if (to >= 0 && to < p.rows.length)
            [p.rows[index], p.rows[to]] = [p.rows[to], p.rows[index]];
        }
      },
    );
    state.range = null;
    if (state.scope === "selection") state.scope = state.returnScope;
    notify("refresh");
  });

  document.addEventListener("pointerdown", (e) => {
    if (
      e.target.closest(
        "[data-quick], [data-action=large], [data-action=red], [data-action=yellow], [data-action=clear]",
      )
    )
      e.preventDefault();
  });

  $("endSelection").onclick = () => {
    const el = $("editor");
    state.range = null;
    state.scope = state.returnScope;
    if (el?.isConnected) el.setSelectionRange(el.selectionEnd, el.selectionEnd);
    notify("design");
  };

  $("quickbar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quick]");
    if (b) quick(b.dataset.quick);
  });

  $("projects").onchange = () => {
    persist();
    library.active = $("projects").value;
    state.range = null;
    state.scope = "role";
    state.checked.clear();
    state.role = row()?.role || "A";
    notify("refresh");
    saveSoon();
  };

  $("newProject").onclick = async () => {
    const name = await askName("新規プロジェクト", "新しいプロジェクト");
    if (!name) return;
    if (library.projects.length >= 100)
      return toast("プロジェクトは100件までです。", true);
    const p = project(name, [parseBlock("")]);
    library.projects.push(p);
    library.active = p.id;
    state.range = null;
    state.scope = "role";
    state.returnScope = "role";
    state.role = row()?.role || "A";
    state.checked.clear();
    notify("refresh");
    saveSoon();
    $("editor").focus();
  };

  $("renameProject").onclick = async () => {
    const name = await askName("プロジェクト名", current().name);
    if (!name) return;
    transaction("プロジェクト名を変更", () => (current().name = name));
    notify("projects");
  };

  $("editorRole").onchange = () => {
    if (!row()) return;
    transaction("話者を変更", () => {
      row().role = $("editorRole").value;
      row().override = {};
    });
    selectedRow(row().id);
  };

  $("previousCard").onclick = () => navigateCard(-1);

  $("nextCard").onclick = () => navigateCard(1);

  $("addSameRole").onclick = addSameRole;

  $("splitCard").onclick = () => {
    const r = row();
    if (!r) return;
    const at = selectionRange(
        r.text,
        $("editor").selectionStart,
        $("editor").selectionStart,
      ).start,
      chars = Array.from(r.text);
    if (at === 0 || at === chars.length)
      return toast("文章の途中にカーソルを置いてください。");
    if (current().rows.length >= 300)
      return toast("1プロジェクトは300枚までです。", true);
    transaction("カーソル位置で分割", () => {
      const next = clone(r);
      next.id = uid();
      next.text = chars.slice(at).join("");
      next.marks = r.marks.slice(at);
      r.text = chars.slice(0, at).join("");
      r.marks = r.marks.slice(0, at);
      current().rows.splice(current().rows.indexOf(r) + 1, 0, next);
      current().selected = next.id;
    });
    state.range = null;
    if (state.scope === "selection") state.scope = state.returnScope;
    notify("refresh");
    $("editor").focus();
    $("editor").setSelectionRange(0, 0);
  };

  $("mergeCard").onclick = () => {
    const r = row(),
      i = current().rows.indexOf(r),
      next = current().rows[i + 1];
    if (!r || !next) return;
    if (r.text.length + next.text.length + 1 > 5000)
      return toast("結合後は1枚5000文字以内にしてください。", true);
    if (
      (r.role !== next.role ||
        JSON.stringify(rowStyle(r)) !== JSON.stringify(rowStyle(next))) &&
      !confirm(
        "次のカードは話者または基本デザインが異なります。結合後は現在のカードの話者・基本デザインに揃えます。文字単位の装飾は残ります。結合しますか？",
      )
    )
      return;
    const caret = r.text.length;
    transaction("次のカードと結合", () => {
      r.text += "\n" + next.text;
      r.marks = [...r.marks, null, ...next.marks];
      current().rows.splice(i + 1, 1);
      state.checked.delete(next.id);
    });
    state.range = null;
    if (state.scope === "selection") state.scope = state.returnScope;
    notify("refresh");
    $("editor").focus();
    $("editor").setSelectionRange(caret, caret);
  };

  $("editor").addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      addSameRole();
    } else if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      navigateCard(e.key === "ArrowUp" ? -1 : 1);
    }
  });
  subscribe(["refresh"], () => {
    syncProjects();
    syncCards();
    syncEditor();
  });
  subscribe(["script"], syncCards);
  subscribe(["projects"], syncProjects);
  subscribe(["design"], syncSelectionTools);
  subscribe(["selection-highlight"], restoreSelectionHighlight);
}
