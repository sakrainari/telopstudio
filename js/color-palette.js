import { $, toast } from "./ui-common.js";

const STORAGE_KEY = "telop-studio-colors-v1";
const BASIC_COLORS = [
  "#ffffff",
  "#e5e7eb",
  "#9ca3af",
  "#4b5563",
  "#111111",
  "#000000",
  "#ff545f",
  "#dc2626",
  "#ff902b",
  "#ffcf59",
  "#ffed6a",
  "#facc15",
  "#83dfc6",
  "#22c55e",
  "#238b81",
  "#70a5ff",
  "#427cff",
  "#1d4ed8",
  "#b3a0ff",
  "#8e47e6",
  "#fc6baa",
  "#ec4899",
  "#f6eac8",
  "#b48e4d",
];
const normalize = (value) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;
let recent = [],
  favorites = [],
  target = null,
  currentColor = "#ffffff";
let readUsedColors,
  applyColor,
  storageWarningShown = false;

function cleanList(values, limit) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).map(normalize).filter(Boolean),
    ),
  ].slice(0, limit);
}

function persistColors() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ recent, favorites }));
  } catch {
    if (!storageWarningShown) {
      toast(
        "色の履歴とお気に入りを保存できませんでした。今回の画面では引き続き使えます。",
        true,
      );
      storageWarningShown = true;
    }
  }
}

export function colorControl(path, id, value) {
  const color = normalize(value) || "#ffffff";
  return `<div class="color-control"><input id="${id}" data-path="${path}" type="color" value="${color}" hidden tabindex="-1" aria-hidden="true"><button id="${id}-palette" type="button" data-palette-open="${path}" data-color-id="${id}" aria-haspopup="dialog" aria-label="色を変更 ${color}" title="パレットを開いて色を変更"><span class="color-chip" style="background:${color}"></span><span class="color-code">${color.toUpperCase()}</span><span class="color-action">変更</span></button></div>`;
}

function swatches(colors, emptyText) {
  return colors.length
    ? `<div class="palette-swatches">${colors.map((color) => `<button type="button" data-palette-color="${color}" title="${color.toUpperCase()}" aria-label="${color.toUpperCase()}" aria-pressed="${color === currentColor}" style="--swatch:${color}"></button>`).join("")}</div>`
    : `<p class="hint">${emptyText}</p>`;
}

function syncPalette() {
  $("paletteBasic").innerHTML = swatches(BASIC_COLORS, "");
  $("paletteRecent").innerHTML = swatches(
    cleanList([...recent, ...readUsedColors()], 72),
    "色を選ぶと、ここに残ります。",
  );
  $("paletteFavorites").innerHTML = swatches(
    favorites,
    "上の☆ボタンで登録できます。",
  );
  $("paletteCustom").value = currentColor;
  $("paletteHex").value = currentColor.toUpperCase();
  $("paletteHex").setCustomValidity("");
  $("paletteCurrent").style.background = currentColor;
  const saved = favorites.includes(currentColor);
  $("paletteFavorite").textContent = saved
    ? "★ お気に入りから外す"
    : "☆ お気に入りに追加";
  $("paletteFavorite").setAttribute("aria-pressed", String(saved));
  $("paletteFavorite").disabled = !saved && favorites.length >= 64;
}

function chooseColor(value, remember = true) {
  const color = normalize(value);
  if (!color || !target) return;
  const input = $(target.id);
  // A target belongs to the settings view that opened the modal.
  if (
    !input?.isConnected ||
    input.disabled ||
    input.closest("fieldset:disabled")
  ) {
    $("colorPaletteDialog").close();
    return;
  }
  currentColor = color;
  if (input.value.toLowerCase() !== color) applyColor(target.path, color);
  input.value = color;
  const button = $(target.id + "-palette");
  if (button) {
    button.querySelector(".color-chip").style.background = color;
    button.querySelector(".color-code").textContent = color.toUpperCase();
    button.setAttribute("aria-label", "色を変更 " + color);
  }
  if (remember) {
    recent = [color, ...recent.filter((item) => item !== color)].slice(0, 18);
    persistColors();
    syncPalette();
  } else {
    $("paletteCurrent").style.background = color;
    $("paletteHex").value = color.toUpperCase();
  }
}

export function initColorPalette(options) {
  applyColor = options.applyColor;
  readUsedColors = options.readUsedColors;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    recent = cleanList(saved?.recent, 18);
    favorites = cleanList(saved?.favorites, 64);
  } catch {
    /* Palette preferences do not prevent project editing. */
  }

  const dialog = document.createElement("dialog");
  dialog.id = "colorPaletteDialog";
  dialog.setAttribute("aria-labelledby", "paletteTitle");
  dialog.innerHTML = `<div class="dialog-head"><h2 id="paletteTitle">色を選ぶ</h2><button type="button" id="paletteDone">完了</button></div>
    <p class="hint">選んだ色はすぐ反映されます。「戻る」で取り消せます。</p>
    <div class="palette-current"><span id="paletteCurrent" class="color-chip"></span><label for="paletteHex">HEX</label><input id="paletteHex" maxlength="7" spellcheck="false" autocomplete="off" pattern="#[0-9a-fA-F]{6}" aria-label="色コード"><input id="paletteCustom" type="color" aria-label="詳細な色を選ぶ"></div>
    <button id="paletteFavorite" type="button" class="wide">☆ お気に入りに追加</button>
    <h3>基本カラー</h3><div id="paletteBasic"></div>
    <h3>使用したカラー</h3><div id="paletteRecent"></div>
    <h3>お気に入りカラー</h3><div id="paletteFavorites"></div>`;
  document.body.append(dialog);

  $("settings").addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette-open]");
    if (!button || button.disabled || button.closest("fieldset:disabled"))
      return;
    const input = $(button.dataset.colorId);
    const label = button.closest(".field").querySelector("label").textContent;
    target = { path: button.dataset.paletteOpen, id: input.id };
    currentColor = normalize(input.value) || "#ffffff";
    $("paletteTitle").textContent = label + "を選ぶ";
    syncPalette();
    dialog.showModal();
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette-color]");
    if (button) chooseColor(button.dataset.paletteColor);
  });
  $("paletteDone").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    target = null;
  });
  $("paletteFavorite").onclick = () => {
    favorites = favorites.includes(currentColor)
      ? favorites.filter((color) => color !== currentColor)
      : [...favorites, currentColor].slice(0, 64);
    persistColors();
    syncPalette();
  };
  $("paletteCustom").addEventListener("input", (event) =>
    chooseColor(event.target.value, false),
  );
  $("paletteCustom").addEventListener("change", (event) =>
    chooseColor(event.target.value),
  );
  $("paletteHex").addEventListener("change", (event) => {
    const value = event.target.value.trim();
    const color = normalize(value.startsWith("#") ? value : "#" + value);
    if (color) chooseColor(color);
    else {
      event.target.setCustomValidity(
        "#と6桁の色コードを入力してください。例：#FF545F",
      );
      event.target.reportValidity();
    }
  });
  $("paletteHex").addEventListener("input", (event) =>
    event.target.setCustomValidity(""),
  );
  $("paletteHex").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.dispatchEvent(new Event("change"));
    }
  });
}

export function closeColorPalette() {
  const dialog = $("colorPaletteDialog");
  if (dialog?.open) dialog.close();
}
