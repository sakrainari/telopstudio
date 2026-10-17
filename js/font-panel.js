import { ROLES } from "./presets.js";
import {
  initUserFonts,
  allFonts,
  weightOf,
  addFontFile,
  addLocalFont,
  removeFont,
  hasLocalFontAccess,
  systemFontFamilies,
} from "./fonts.js";
import {
  state,
  current,
  row,
  settingsStyle,
  updateStyle,
  usedFonts,
  notify,
  subscribe,
} from "./state.js";
import { transaction } from "./history.js";
import { $, escape, toast } from "./ui-common.js";
const SOURCE_LABEL = {
  builtin: "",
  file: "追加したファイル",
  local: "PCのフォント",
  missing: "このPCに未登録",
};

function fontEntries() {
  const list = allFonts(),
    known = new Set(list.map((f) => f.family));

  for (const f of usedFonts())
    if (f && !known.has(f)) list.push({ family: f, source: "missing" });

  return list;
}

export function fontOptions() {
  return fontEntries().map((f) => [
    f.family,
    f.source === "missing" ? `${f.family}（未登録）` : f.family,
  ]);
}

function syncFonts() {
  const active = settingsStyle().font;

  const sample =
    (row()?.text || "").replace(/\s+/g, "").slice(0, 10) || "テロップ";

  const disabled =
    state.scope !== "role" &&
    (!row() || (state.scope === "selection" && !state.range));

  $("fontTarget").textContent =
    state.scope === "role"
      ? `${ROLES[state.role]}の共通設定に使う`
      : state.scope === "selection"
        ? state.range
          ? "選んだ文字に使う"
          : "文字を選ぶと使えます"
        : "このカードに使う";

  $("fontList").innerHTML = fontEntries()
    .map((f) => {
      const removable = f.source === "file" || f.source === "local";

      const tag = SOURCE_LABEL[f.source];

      return (
        `<div class="font-item${f.family === active ? " active" : ""}${f.source === "missing" ? " missing" : ""}">` +
        `<button type="button" data-font="${escape(f.family)}" ${disabled ? "disabled" : ""} title="${escape(f.family)}">` +
        `<span class="font-sample" style="font-family:'${escape(f.family)}',sans-serif;font-weight:${weightOf(f.family)}">${escape(sample)}</span>` +
        `<span class="font-name">${escape(f.family)}${tag ? `<em>${tag}</em>` : ""}</span></button>` +
        (removable
          ? `<button type="button" class="font-remove" data-remove-font="${escape(f.family)}" title="一覧から外す">×</button>`
          : "") +
        "</div>"
      );
    })
    .join("");
}

function afterFontAdded(names) {
  notify("design");
  notify("render");
  toast(`${names.join("、")} を追加しました。一覧から選べます。`);
}

let systemFonts = [];

function renderSystemFonts() {
  const q = $("fontSearch").value.trim().toLowerCase(),
    added = new Set(allFonts().map((f) => f.family));

  const list = systemFonts
    .filter((f) => f.toLowerCase().includes(q))
    .slice(0, 300);

  $("systemFontCount").textContent =
    `${systemFonts.length}書体のうち${list.length}件を表示${list.length >= 300 ? "（名前で絞り込めます）" : ""}`;

  $("systemFontList").innerHTML =
    list
      .map(
        (f) =>
          `<button type="button" data-system-font="${escape(f)}" ${added.has(f) ? "disabled" : ""}>` +
          `<span class="font-sample" style="font-family:'${escape(f)}',sans-serif">テロップ Aa 123</span>` +
          `<span class="font-name">${escape(f)}${added.has(f) ? "<em>追加済み</em>" : ""}</span></button>`,
      )
      .join("") || '<p class="hint">見つかりません。</p>';
}
export async function initFontPanel() {
  $("fontList").addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-remove-font]");

    if (rm) {
      const family = rm.dataset.removeFont;

      if (
        !confirm(
          `「${family}」を一覧から外しますか？\nこのフォントを使っているテロップは、代わりのフォントで表示されます。`,
        )
      )
        return;

      await removeFont(family);
      notify("design");
      notify("render");
      toast(`「${family}」を一覧から外しました。`);
      return;
    }

    const b = e.target.closest("[data-font]");
    if (!b) return;

    transaction("フォントを変更", () => updateStyle({ font: b.dataset.font }));
    notify("design");
  });

  $("fontAllCards").onclick = () => {
    const font = settingsStyle().font,
      p = current();

    if (
      !confirm(
        `すべてのカード・すべての役割のフォントを「${font}」にしますか？\n（元に戻すボタンで戻せます）`,
      )
    )
      return;

    transaction("フォントを全カードに適用", () => {
      for (const k of Object.keys(p.roles)) p.roles[k].font = font;

      for (const r of p.rows) {
        delete r.override.font;
        r.marks = r.marks.map((m) => {
          if (!m || !("font" in m)) return m;
          const rest = { ...m };
          delete rest.font;
          return Object.keys(rest).length ? rest : null;
        });
      }
    });

    notify("refresh");
    toast(`すべてのカードを「${font}」にしました。`);
  };

  $("fontFromFile").onclick = () => {
    $("fontFile").value = "";
    $("fontFile").click();
  };

  $("fontFile").onchange = async () => {
    const added = [];

    for (const file of [...$("fontFile").files]) {
      try {
        added.push(await addFontFile(file));
      } catch (e) {
        toast(`${file.name}：${e.message}`, true);
      }
    }

    if (added.length) afterFontAdded(added);
  };

  $("fontNameAdd").onclick = async () => {
    try {
      const name = await addLocalFont($("fontNameInput").value);
      $("fontNameInput").value = "";
      afterFontAdded([name]);
    } catch (e) {
      toast(e.message, true);
    }
  };

  $("fontNameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      $("fontNameAdd").click();
    }
  });

  $("fontFromPC").onclick = async () => {
    if (!hasLocalFontAccess())
      return toast(
        "このブラウザではPCのフォント一覧を読めません（Chrome / Edge で使えます）。下の欄にフォント名を入力して追加できます。",
        true,
      );

    try {
      systemFonts = await systemFontFamilies();
    } catch (e) {
      return toast(
        "フォント一覧の読み取りが許可されませんでした。下の欄にフォント名を入力して追加できます。",
        true,
      );
    }

    $("fontSearch").value = "";
    renderSystemFonts();
    $("fontDialog").showModal();
    $("fontSearch").focus();
  };

  $("fontSearch").addEventListener("input", renderSystemFonts);

  $("systemFontList").onclick = async (e) => {
    const b = e.target.closest("[data-system-font]");
    if (!b) return;

    try {
      const name = await addLocalFont(b.dataset.systemFont, {
        skipCheck: true,
      });
      renderSystemFonts();
      afterFontAdded([name]);
    } catch (err) {
      toast(err.message, true);
    }
  };
  subscribe(["refresh", "design"], syncFonts);
  const fontInit = await initUserFonts();

  if (fontInit.error)
    toast(
      "追加フォントの保存場所を開けませんでした。追加フォントは今回だけ使えます。",
      true,
    );
}

export function showMissingFontWarning() {
  const missing = [...usedFonts()].filter(
    (f) => !allFonts().some((x) => x.family === f),
  );
  if (missing.length)
    toast(
      `このPCに未登録のフォントがあります：${missing.join("、")}。「＋ 自分のフォントを追加」から追加してください。`,
      true,
    );
}
