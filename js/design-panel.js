import {
  colorControl,
  initColorPalette,
  closeColorPalette,
} from "./color-palette.js";
import {
  ROLES,
  SET_NAMES,
  defaults,
  designSet,
  clone,
  uid,
  mergeStyle,
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
import {
  $,
  option,
  toast,
  askName,
  panelIsOpen,
  initPanelFolding,
} from "./ui-common.js";
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

const SHADOW_DIRECTIONS = [
  [225, "↖", "左上"],
  [270, "↑", "上"],
  [315, "↗", "右上"],
  [180, "←", "左"],
  [null, "•", ""],
  [0, "→", "右"],
  [135, "↙", "左下"],
  [90, "↓", "下"],
  [45, "↘", "右下"],
];
function shadowDirection(value) {
  return `<div class="shadow-direction"><div class="direction-grid" role="group" aria-label="影の方向">${SHADOW_DIRECTIONS.map(([angle, arrow, label]) => (angle === null ? '<span aria-hidden="true">●</span>' : `<button type="button" data-shadow-angle="${angle}" title="${label}（${angle}°）" aria-label="影を${label}へ" aria-pressed="${Number(value) % 360 === angle}">${arrow}</button>`)).join("")}</div><div class="direction-number"><label for="setting-shadow-angle">角度 °</label><input id="setting-shadow-angle" data-path="shadow.angle" type="number" min="0" max="360" step="1" value="${value}"></div></div>`;
}
function syncShadowDirection(angle) {
  $("settings")
    .querySelectorAll("[data-shadow-angle]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(angle) % 360 === Number(button.dataset.shadowAngle)),
      ),
    );
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
  else if (type === "color") input = colorControl(path, id, value);
  else if (type === "direction") input = shadowDirection(value);
  else
    input = `<input id="${id}" data-path="${path}" type="${type}" value="${value}" ${opts.min !== undefined ? `min="${opts.min}" max="${opts.max}" step="${opts.step || 1}"` : ""}>${type === "range" ? `<output>${Number(Number(value).toFixed(2))}</output>` : ""}`;

  return `<div class="field"><label for="${type === "color" ? id + "-palette" : id}">${label}</label>${input}</div>`;
}

function group(title, content) {
  return `<fieldset ${title === "座布団・配置" ? 'id="boxStyleSettings"' : ""} class="field-group"><legend>${title}</legend>${content}</fieldset>`;
}

function section(title, content, key, initialOpen = false, status = "") {
  return `<details class="settings-section" data-panel-key="${key}" ${panelIsOpen(key, initialOpen) ? "open" : ""}><summary><span>${title}</span>${status ? `<span class="section-status">${status}</span>` : ""}</summary>${content}</details>`;
}

function textColorFields() {
  const gradient = settingsStyle().gradient;
  return (
    field("color", gradient ? "上の色" : "文字色", "color") +
    (gradient ? field("color2", "下の色", "color") : "")
  );
}

function syncSettings() {
  closeColorPalette();
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

  let html = section(
    "文字",
    group(
      "文字",
      f("font", "フォント", "select", { values: fontOptions() }) +
        f("size", "文字サイズ px", "range", { min: 12, max: 240 }) +
        f("letterSpacing", "字間 px", "metric", { min: -100, max: 200 }) +
        f("fillOn", "塗りを表示", "checkbox") +
        f("gradient", "グラデーション", "checkbox") +
        `<div id="textColorFields">${textColorFields()}</div>`,
    ),
    "text",
    true,
  );

  let outlineHtml = group(
    "フチの重ね方",
    f("joinOutlines", "文字間のフチを結合", "checkbox") +
      '<p class="hint">フチを層ごとにまとめ、重なった所の境目をなくします。離れている場合は字間を詰めるか、フチを太くしてください。</p>',
  );
  const edges = settingsStyle().edges;
  for (let i = 0; i < edges.length; i++) {
    if (i > 0 && !edges[i].on) continue;
    outlineHtml += group(
      `フチ ${i + 1}`,
      f(
        `edges.${i}.on`,
        i === 0 ? "フチを表示" : "このフチを表示",
        "checkbox",
      ) +
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
  }
  const nextEdge = edges.findIndex((edge, index) => index > 0 && !edge.on);
  outlineHtml += `<div class="edge-add"><button type="button" data-add-edge="${nextEdge}" ${nextEdge < 0 ? "disabled" : ""}>＋ フチを追加${nextEdge < 0 ? "（最大3層）" : ""}</button></div>`;

  const detailOpen = panelIsOpen("stroke");

  outlineHtml +=
    `<details data-panel-key="stroke" id="strokeDetails" ${detailOpen ? "open" : ""}><summary>線の詳細設定</summary>` +
    group(
      "フチの角の形",
      f("lineJoin", "角の形", "select", {
        values: [
          ["round", "ラウンド"],
          ["miter", "マイター"],
          ["bevel", "ベベル"],
        ],
      }) +
        f("miterLimit", "角の比率", "range", { min: 1, max: 10, step: 0.1 }) +
        '<p class="hint">角の比率は「マイター」を選んだときだけ調整できます。線端の設定は閉じた文字輪郭では見た目が変わらないため省いています。</p>',
    ) +
    "</details>";

  html += section(
    "フチ",
    outlineHtml,
    "outlines",
    false,
    `${edges.filter((edge) => edge.on).length}層`,
  );
  html += section(
    "影",
    group(
      "ドロップシャドウ",
      f("shadow.on", "有効", "checkbox") +
        f("shadow.blur", "ぼかし", "range", { min: 0, max: 50 }) +
        f("shadow.distance", "距離 px", "range", { min: 0, max: 120 }) +
        f("shadow.angle", "影の方向", "direction") +
        f("shadow.opacity", "不透明度", "range", {
          min: 0,
          max: 1,
          step: 0.05,
        }) +
        f("shadow.color", "色", "color"),
    ),
    "shadow",
    false,
    settingsStyle().shadow.on ? "ON" : "OFF",
  );

  {
    html += section(
      "行間",
      group(
        "行の配置",
        f("lineGap", "行間 px", "metric", { min: -100, max: 300 }),
      ),
      "lines",
    );
    let boxHtml = group(
      "座布団・配置",
      f("box.on", "座布団を表示", "checkbox") +
        f("align", "文字揃え", "select", {
          values: [
            ["left", "左"],
            ["center", "中央"],
            ["right", "右"],
          ],
        }) +
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
      boxDetailOpen = panelIsOpen("box-details");

    boxHtml += group(
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

    boxHtml +=
      `<details data-panel-key="box-details" id="boxDetails" ${boxDetailOpen ? "open" : ""}><summary>座布団のサイズ・位置の詳細</summary>` +
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

    html += section("座布団", boxHtml, "box", false, box.on ? "ON" : "OFF");
    html += section(
      "自動強調",
      group(
        "自動強調",
        f("auto.on", "数字・記号・括弧", "checkbox") +
          f("auto.scale", "拡大倍率", "range", { min: 1, max: 2, step: 0.05 }) +
          f("auto.color", "強調色", "color"),
      ),
      "auto",
      false,
      settingsStyle().auto.on ? "ON" : "OFF",
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
        path === "joinOutlines" ||
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
  const miterEnabled = settingsStyle().lineJoin === "miter";
  $("setting-miterLimit").disabled ||= !miterEnabled;
  $("setting-miterLimit")
    .closest(".field")
    .classList.toggle("inactive-setting", !miterEnabled);
  $("setting-miterLimit").closest(".field").title = miterEnabled
    ? "尖った角の伸びを制限します"
    : "角の形をマイターにすると調整できます";
  if (nextEdge < 0)
    $("settings").querySelector("[data-add-edge]").disabled = true;
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
function usedProjectColors() {
  const colors = new Set();
  function collect(style) {
    if (style.fillOn !== false) {
      colors.add(style.color);
      if (style.gradient) colors.add(style.color2);
    }
    for (const edge of style.edges) if (edge.on) colors.add(edge.color);
    if (style.shadow.on) colors.add(style.shadow.color);
    if (style.box.on) {
      colors.add(style.box.color);
      if (style.box.border) colors.add(style.box.borderColor);
    }
    if (style.auto.on) colors.add(style.auto.color);
  }
  collect(settingsStyle());
  for (const item of current().rows) {
    const base = rowStyle(item);
    collect(base);
    for (const mark of item.marks) if (mark) collect(mergeStyle(base, mark));
  }
  return [...colors];
}

export function initDesignPanel(options) {
  fontOptions = options.fontOptions;
  initPanelFolding(document.querySelector(".settings-panel"));
  initColorPalette({
    readUsedColors: usedProjectColors,
    applyColor: (path, color) =>
      applyPatch(
        patchPath(path, color),
        "色を変更",
        `${current().id}:${state.scope}:${state.role}:${row()?.id}:${state.range?.start}:${path}`,
      ),
  });
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
    const sectionKey = {
      "box.on": "box",
      "shadow.on": "shadow",
      "auto.on": "auto",
    }[path];
    if (sectionKey)
      $("settings").querySelector(
        `[data-panel-key="${sectionKey}"] > summary .section-status`,
      ).textContent = value ? "ON" : "OFF";
    if (path === "lineJoin") notify("design");
    if (path === "gradient") $("textColorFields").innerHTML = textColorFields();
    if (path === "shadow.angle") syncShadowDirection(value);
    if (/^edges\.[12]\.on$/.test(path)) notify("design");
  });

  $("settings").addEventListener("change", (e) => {
    const el = e.target;
    if (el.type === "number" && el.dataset.path) {
      const value = readPath(settingsStyle(), el.dataset.path);
      el.value = value ?? 0;
    }
  });

  $("settings").addEventListener("click", (e) => {
    const direction = e.target.closest("[data-shadow-angle]");
    if (direction) {
      const angle = Number(direction.dataset.shadowAngle);
      applyPatch({ shadow: { angle } }, "影の方向を変更");
      $("setting-shadow-angle").value = angle;
      syncShadowDirection(angle);
      return;
    }
    const addEdge = e.target.closest("[data-add-edge]");
    if (addEdge) {
      const index = Number(addEdge.dataset.addEdge);
      if (index < 1 || index > 2) return;
      const edges = [];
      edges[index] = {
        on: true,
        width: settingsStyle().edges[index].width || 6,
      };
      applyPatch({ edges }, "フチを追加");
      notify("design");
      return;
    }

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
