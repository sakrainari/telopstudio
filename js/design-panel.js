import {
  ROLES,
  SET_NAMES,
  defaults,
  designSet,
  clone,
  uid,
} from "./presets.js";
import { markRange } from "./parser.js";
import {
  state,
  library,
  current,
  row,
  rowStyle,
  settingsStyle,
  updateStyle,
  saveSoon,
  notify,
  subscribe,
} from "./state.js";
import { transaction } from "./history.js";
import { $, option, toast, askName } from "./ui-common.js";
let fontOptions;
let styleClipboard = null;
function syncSets() {
  const selected = $("designSet").value;
  $("designSet").innerHTML =
    '<optgroup label="サンプル">' +
    Object.entries(SET_NAMES)
      .map(([k, v]) => option(k, v, selected))
      .join("") +
    '</optgroup><optgroup label="マイセット">' +
    library.sets.map((s) => option(s.id, s.name, selected)).join("") +
    "</optgroup>";
}

function readPath(obj, path) {
  return path.split(".").reduce((v, k) => v?.[k], obj);
}

function patchPath(path, value) {
  const parts = path.split(".");
  let root = {},
    ptr = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    ptr[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    ptr = ptr[k];
  }
  ptr[parts.at(-1)] = value;
  return root;
}

function field(path, label, type, opts = {}) {
  let value = readPath(settingsStyle(), path);
  if (value == null && path.startsWith("box.pad"))
    value = settingsStyle().box.padding;
  const id = "setting-" + path.replaceAll(".", "-");
  let input;

  if (type === "metric")
    input = `<div class="metric"><input id="${id}" data-path="${path}" type="range" min="${opts.min}" max="${opts.max}" step="${opts.step || 1}" value="${value}"><input aria-label="${label} 数値" data-path="${path}" type="number" min="${opts.min}" max="${opts.max}" step="${opts.step || 1}" value="${value}"><button type="button" data-reset-path="${path}" data-reset-value="${opts.reset ?? 0}" title="${opts.reset ?? 0}に戻す">↺</button></div>`;
  else if (type === "select")
    input = `<select id="${id}" data-path="${path}">${opts.values.map(([k, v]) => option(k, v, value)).join("")}</select>`;
  else if (type === "checkbox")
    input = `<input id="${id}" data-path="${path}" type="checkbox" ${value ? "checked" : ""}>`;
  else
    input = `<input id="${id}" data-path="${path}" type="${type}" value="${value}" ${opts.min !== undefined ? `min="${opts.min}" max="${opts.max}" step="${opts.step || 1}"` : ""}>${type === "range" ? `<output>${Number(Number(value).toFixed(2))}</output>` : ""}`;

  return `<div class="field"><label for="${id}">${label}</label>${input}</div>`;
}

function group(title, content) {
  return `<fieldset class="field-group"><legend>${title}</legend>${content}</fieldset>`;
}

function syncSettings() {
  const partial = state.scope === "selection";
  $("scope").value = state.scope;

  $("roleTabs").innerHTML = Object.keys(ROLES)
    .map(
      (r) =>
        `<button data-tab="${r}" class="${state.role === r ? "active" : ""}">${r === "N" ? "ナレ" : r === "※" ? "注釈" : r === "!" ? "衝撃" : "話者" + r}</button>`,
    )
    .join("");

  $("targetHint").textContent = partial
    ? state.range
      ? `選択した${state.range.end - state.range.start}文字に適用。座布団・行間は選択終了後に編集できます。`
      : "中央の入力欄で文字を選択してください。"
    : state.scope === "role"
      ? `${ROLES[state.role]}の共通設定。カード・文字の個別指定が優先されます。`
      : "※このカードだけ変更します。話者全体を変える場合は「役割の共通設定」へ。";

  $("targetHint").classList.toggle("individual-warning", state.scope === "row");

  document
    .querySelectorAll("[data-quick]")
    .forEach((b) => (b.disabled = !state.range));

  const f = field;

  let html = group(
    "文字",
    f("font", "フォント", "select", { values: fontOptions() }) +
      f("size", "文字サイズ px", "range", { min: 12, max: 240 }) +
      f("letterSpacing", "字間 px", "metric", { min: -100, max: 200 }) +
      f("fillOn", "塗りを表示", "checkbox") +
      f("gradient", "グラデーション", "checkbox") +
      f("color", "文字色 / 上", "color") +
      f("color2", "文字色 / 下", "color"),
  );

  for (let i = 0; i < 3; i++)
    html += group(
      `フチ ${i + 1}`,
      f(`edges.${i}.on`, "有効", "checkbox") +
        f(`edges.${i}.color`, "色", "color") +
        f(`edges.${i}.width`, "太さ px", "range", { min: 0, max: 24 }) +
        f(`edges.${i}.position`, "位置", "select", {
          values: [
            ["outside", "外側"],
            ["center", "中央"],
            ["inside", "内側"],
          ],
        }),
    );

  const detailOpen = $("strokeDetails")?.open;

  html +=
    `<details id="strokeDetails" ${detailOpen ? "open" : ""}><summary>線の詳細設定</summary>` +
    group(
      "ストロークスタイル",
      f("lineJoin", "角の結合", "select", {
        values: [
          ["round", "ラウンド"],
          ["miter", "マイター"],
          ["bevel", "ベベル"],
        ],
      }) +
        f("miterLimit", "角の比率", "range", { min: 1, max: 10, step: 0.1 }) +
        f("lineCap", "線端", "select", {
          values: [
            ["butt", "バット"],
            ["round", "丸型"],
            ["square", "角型"],
          ],
        }) +
        '<p class="hint">線端は閉じた文字の輪郭では通常、見た目が変わりません。角の比率はマイター結合時に使います。</p>',
    ) +
    "</details>";

  html += group(
    "ドロップシャドウ",
    f("shadow.on", "有効", "checkbox") +
      f("shadow.blur", "ぼかし", "range", { min: 0, max: 50 }) +
      f("shadow.distance", "距離 px", "range", { min: 0, max: 120 }) +
      f("shadow.angle", "方向 °", "range", { min: 0, max: 360 }) +
      f("shadow.opacity", "不透明度", "range", { min: 0, max: 1, step: 0.05 }) +
      f("shadow.color", "色", "color"),
  );

  {
    html += group(
      "行の配置",
      f("lineGap", "行間 px", "metric", { min: -100, max: 300 }),
    );
    html += group(
      "座布団・配置",
      f("align", "文字揃え", "select", {
        values: [
          ["left", "左"],
          ["center", "中央"],
          ["right", "右"],
        ],
      }) +
        f("box.on", "座布団を表示", "checkbox") +
        f("box.mode", "背景の範囲", "select", {
          values: [
            ["all", "すべての行"],
            ["line", "1行ずつ"],
          ],
        }) +
        f("box.color", "背景色", "color") +
        f("box.opacity", "不透明度", "range", { min: 0, max: 1, step: 0.05 }) +
        f("box.radius", "角丸 px", "range", { min: 0, max: 100 }) +
        ["Top", "Right", "Bottom", "Left"]
          .map((side, i) =>
            f(
              "box.pad" + side,
              ["上の余白", "右の余白", "下の余白", "左の余白"][i] + " px",
              "metric",
              { min: 0, max: 300 },
            ),
          )
          .join("") +
        f("box.border", "枠線 px", "range", { min: 0, max: 12 }) +
        f("box.borderColor", "枠線色", "color"),
    );

    const box = settingsStyle().box,
      boxDetailOpen = $("boxDetails")?.open;

    html += group(
      "座布団内の文字位置",
      '<div class="anchor-grid" aria-label="座布団内の配置">' +
        ["top", "center", "bottom"]
          .flatMap((y, yi) =>
            ["left", "center", "right"].map(
              (x, xi) =>
                `<button type="button" data-anchor-x="${x}" data-anchor-y="${y}" aria-label="${["上", "中央", "下"][yi]}・${["左", "中央", "右"][xi]}" aria-pressed="${box.alignX === x && box.alignY === y}" class="${box.alignX === x && box.alignY === y ? "active" : ""}">${
                  [
                    ["↖", "↑", "↗"],
                    ["←", "●", "→"],
                    ["↙", "↓", "↘"],
                  ][yi][xi]
                }</button>`,
            ),
          )
          .join("") +
        '</div><p class="hint">座布団ONで有効。固定サイズにすると配置の違いがわかりやすくなります。</p>',
    );

    html +=
      `<details id="boxDetails" ${boxDetailOpen ? "open" : ""}><summary>座布団のサイズ・位置の詳細</summary>` +
      group(
        "サイズと微調整",
        f("box.sizeMode", "サイズ", "select", {
          values: [
            ["auto", "文字に合わせる"],
            ["fixed", "固定サイズ"],
          ],
        }) +
          f("box.width", "幅 px", "metric", {
            min: 24,
            max: 4096,
            reset: 1000,
          }) +
          f("box.height", "高さ px", "metric", {
            min: 24,
            max: 4096,
            reset: 300,
          }) +
          f("box.offsetX", "文字のX px", "metric", { min: -500, max: 500 }) +
          f("box.offsetY", "文字のY px", "metric", { min: -500, max: 500 }) +
          '<p class="hint">幅・高さは固定サイズで有効。はみ出した文字も切り取らずに出力します。行別背景では1行ごとのサイズです。</p>',
      ) +
      "</details>";

    html += group(
      "自動強調",
      f("auto.on", "数字・記号・括弧", "checkbox") +
        f("auto.scale", "拡大倍率", "range", { min: 1, max: 2, step: 0.05 }) +
        f("auto.color", "強調色", "color"),
    );
  }

  $("settings").innerHTML = html;

  $("settings")
    .querySelectorAll("fieldset")
    .forEach((group) => {
      const input = group.querySelector("[data-path]");
      const path = input?.dataset.path;
      const whole =
        path === "lineGap" ||
        path === "align" ||
        path?.startsWith("box.") ||
        path?.startsWith("auto.") ||
        group.querySelector("[data-anchor-x]");
      if (whole) group.disabled = partial;
    });

  $("settings")
    .querySelectorAll("input,select,button")
    .forEach(
      (el) =>
        (el.disabled =
          state.scope !== "role" && (!row() || (partial && !state.range))),
    );
}

function applyPatch(patch, name, key) {
  const r = row();
  if (state.scope === "selection" && (!r || !state.range))
    return toast("先に入力欄で文字を選択してください。");
  if (state.scope === "row" && !r) return;

  transaction(name, () => updateStyle(patch), key);
}

function openDesign(scope) {
  if (scope === "selection" && state.scope !== "selection")
    state.returnScope = state.scope;
  state.scope = scope;
  if (scope !== "selection") state.returnScope = scope;
  if (scope === "role") state.role = row()?.role || "A";
  notify("design");
  $("scope").focus();
  $("scope").scrollIntoView({ block: "nearest" });
}
function syncStyleTransfer() {
  $("copyStyle").disabled = !row();
  $("pasteStyle").disabled = !styleClipboard;
}
export function initDesignPanel(options) {
  fontOptions = options.fontOptions;
  $("scope").onchange = () => {
    state.scope = $("scope").value;
    if (state.scope !== "selection") state.returnScope = state.scope;
    if (state.scope === "role" && row()) state.role = row().role;
    notify("design");
  };

  $("roleTabs").onclick = (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.role = b.dataset.tab;
    state.scope = "role";
    state.returnScope = "role";
    notify("design");
  };

  $("settings").addEventListener("input", (e) => {
    const el = e.target,
      path = el.dataset.path;
    if (!path) return;
    let value =
      el.type === "checkbox"
        ? el.checked
        : ["range", "number"].includes(el.type)
          ? Number(el.value)
          : el.value;
    if (["range", "number"].includes(el.type)) {
      if (el.value === "" || !Number.isFinite(value)) return;
      value = Math.min(Number(el.max), Math.max(Number(el.min), value));
      const metric = el.closest(".metric");
      if (metric)
        metric.querySelectorAll("input").forEach((x) => {
          if (x !== el) x.value = value;
        });
      else if (el.type === "range") el.nextElementSibling.value = value;
    }
    const title =
      el.closest("fieldset").querySelector("legend").textContent +
      "：" +
      el.closest(".field").querySelector("label").textContent +
      "を変更";
    applyPatch(
      patchPath(path, value),
      title,
      `${current().id}:${state.scope}:${state.role}:${row()?.id}:${state.range?.start}:${path}`,
    );
  });

  $("settings").addEventListener("change", (e) => {
    const el = e.target;
    if (el.type === "number" && el.dataset.path) {
      const value = readPath(settingsStyle(), el.dataset.path);
      el.value = value ?? 0;
    }
  });

  $("settings").addEventListener("click", (e) => {
    const reset = e.target.closest("[data-reset-path]");
    if (reset) {
      applyPatch(
        patchPath(reset.dataset.resetPath, Number(reset.dataset.resetValue)),
        "間隔・配置を戻す",
      );
      notify("design");
      return;
    }
    const anchor = e.target.closest("[data-anchor-x]");
    if (anchor) {
      applyPatch(
        {
          box: {
            alignX: anchor.dataset.anchorX,
            alignY: anchor.dataset.anchorY,
          },
        },
        "座布団内の配置を変更",
      );
      notify("design");
    }
  });

  $("resetStyle").onclick = () => {
    if (state.scope === "selection") {
      if (!state.range) return;
      transaction("選択文字を役割に戻す", () =>
        markRange(row(), state.range, {}, "inherit"),
      );
      notify("design", "selection-highlight");
      return;
    }
    transaction("設定を初期値に戻す", () => {
      if (state.scope === "role")
        current().roles[state.role] = defaults()[state.role];
      else if (row()) row().override = {};
    });
    notify("design");
    notify("script");
  };

  $("applySet").onclick = () => {
    const key = $("designSet").value,
      roles = Object.hasOwn(SET_NAMES, key)
        ? designSet(key)
        : library.sets.find((s) => s.id === key)?.roles;
    if (!roles) return;
    const target = $("setTarget").value,
      rows = current().rows.filter(
        (r) =>
          target === "all" ||
          (target === "current"
            ? r.id === current().selected
            : state.checked.has(r.id)),
      );
    if (!rows.length) return toast("適用するカードを選んでください。");
    transaction("デザインセットを適用", () => {
      for (const r of rows) {
        const keptFont = rowStyle(r).font;
        r.override = clone(roles[r.role]);
        if ($("keepFont").checked) r.override.font = keptFont;
        if (!$("keepMarks").checked) r.marks = Array.from(r.text, () => null);
      }
    });
    notify("script");
    notify("design");
    toast(`${rows.length}枚にサンプルを当てました。`);
  };

  $("saveSet").onclick = async () => {
    const name = await askName("マイセットの名前", "マイセット");
    if (!name) return;
    if (library.sets.length >= 100)
      return toast("マイセットは100件までです。", true);
    const roles = clone(current().roles);
    if (row()) roles[row().role] = clone(rowStyle(row()));
    library.sets.push({ id: uid(), name, roles });
    notify("presets");
    saveSoon();
    toast(
      "5役割を保存しました。現在のカードのデザインも、その役割に取り込みました。",
    );
  };

  $("copyStyle").onclick = () => {
    if (!row()) return;
    styleClipboard = clone(rowStyle(row()));
    $("styleClipboardHint").textContent =
      "カードの基本装飾をコピー済み。文字・役割・文字単位の装飾はコピーしません。";
    syncStyleTransfer();
    toast("装飾をコピーしました。");
  };

  $("pasteStyle").onclick = () => {
    if (!styleClipboard) return;
    const selected = $("styleTarget").value === "selected",
      targets = current().rows.filter((r) =>
        selected ? state.checked.has(r.id) : r.id === current().selected,
      );
    if (!targets.length) return toast("貼り付け先のカードを選んでください。");
    transaction("装飾を貼り付け", () => {
      for (const r of targets) {
        r.override = clone(styleClipboard);
        if (!$("keepPasteMarks").checked)
          r.marks = Array.from(r.text, () => null);
      }
    });
    notify("refresh");
    toast(`${targets.length}枚に装飾を貼り付けました。`);
  };

  $("editRole").onclick = () => openDesign("role");

  $("editCard").onclick = () => openDesign("row");

  $("editSelection").onclick = () => openDesign("selection");
  subscribe(["refresh"], () => {
    syncSets();
    syncSettings();
    syncStyleTransfer();
  });
  subscribe(["design"], syncSettings);
  subscribe(["presets"], syncSets);
  subscribe(["checked"], syncStyleTransfer);
}
