import { weightOf } from "./fonts.js";
import { initShortPreview } from "./short-preview.js";
import { ROLES, clone } from "./presets.js";
import { loadFonts, render } from "./renderer.js";
import { copyPNG, savePNG, filename, download, exportZIP } from "./exporter.js";
import {
  state,
  library,
  current,
  row,
  selectedRow,
  importLibrary,
  subscribe,
  usedFonts,
} from "./state.js";
import { $, toast } from "./ui-common.js";
let renderTimer,
  galleryTimer,
  renderVersion = 0,
  zipBusy = false,
  fontReady = false;
const cache = new Map();
let viewportPreview;
function getCanvas(r) {
  const key = r.id;
  if (!cache.has(key)) cache.set(key, render(r, current().roles));
  return cache.get(key);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  clearTimeout(galleryTimer);
  fontReady = false;
  $("copy").disabled = true;
  $("png").disabled = true;
  const version = ++renderVersion;
  renderTimer = setTimeout(async () => {
    const text = [
      ...new Set(
        Array.from(
          current()
            .rows.map((r) => r.text)
            .join(""),
        ),
      ),
    ].join("");
    await loadFonts(text, [...usedFonts()]);
    if (version !== renderVersion) return;
    fontReady = true;
    cache.clear();
    drawPreview();
    galleryTimer = setTimeout(drawGallery, 160);
  }, 70);
}

function drawPreview() {
  if (!fontReady) return;
  const r = row();
  $("preview").replaceChildren();
  $("copy").disabled = !r;
  $("png").disabled = !r;

  if (!r) {
    viewportPreview.clear();
    $("dimensions").textContent = "—";
    const text = document.createElement("span");
    text.id = "emptyHint";
    text.textContent = "テロップを追加して、文字を入力してください";
    $("preview").append(text);
    return;
  }

  try {
    const c = getCanvas(r),
      display = document.createElement("canvas");
    display.width = c.width;
    display.height = c.height;
    display.getContext("2d").drawImage(c, 0, 0);
    viewportPreview.show(display);
    $("dimensions").textContent = `${c.width} × ${c.height} px`;
  } catch (e) {
    viewportPreview.clear();
    $("dimensions").textContent = "描画エラー";
    const msg = document.createElement("p");
    msg.className = "error-text";
    msg.textContent = e.message;
    $("preview").append(msg);
    $("copy").disabled = true;
    $("png").disabled = true;
  }
}

function drawGallery() {
  if (!fontReady) return;
  const fragment = document.createDocumentFragment();
  current().rows.forEach((r, i) => {
    const box = document.createElement("article");
    box.className = "thumb" + (r.id === current().selected ? " active" : "");
    box.dataset.id = r.id;
    const button = document.createElement("button");
    button.className = "thumb-view checker";
    button.dataset.choose = r.id;
    button.title = `${i + 1}: ${r.text}`;

    try {
      const c = getCanvas(r),
        tiny = document.createElement("canvas"),
        scale = Math.min(1, 360 / c.width, 150 / c.height);
      tiny.width = Math.max(1, Math.round(c.width * scale));
      tiny.height = Math.max(1, Math.round(c.height * scale));
      tiny.getContext("2d").drawImage(c, 0, 0, tiny.width, tiny.height);
      const img = document.createElement("img");
      img.src = tiny.toDataURL();
      img.alt = r.text || "空のテロップ";
      button.append(img);
    } catch (e) {
      button.textContent = "描画できません：" + e.message;
    }

    box.append(button);
    const info = document.createElement("div");
    info.className = "thumb-info";
    info.innerHTML = `<span>${String(i + 1).padStart(2, "0")} / ${ROLES[r.role]}</span><button data-copy="${r.id}" title="画像をコピー">▣ コピー</button>`;
    box.append(info);
    fragment.append(box);
    if (r.id !== current().selected) cache.delete(r.id);
  });
  $("gallery").replaceChildren(fragment);

  // Keep only the selected full-size image. Thumbnails no longer need large canvases.

  for (const id of cache.keys())
    if (id !== current().selected) cache.delete(id);
}

async function copyRow(r, button) {
  if (!r || !fontReady) return;
  try {
    await copyPNG(getCanvas(r));
    const old = button.textContent;
    button.textContent = "コピー完了！";
    toast("透過PNGをコピーしました。");
    setTimeout(() => (button.textContent = old), 1800);
  } catch (e) {
    toast(`${e.message} PNG保存も利用できます。`, true);
  }
}

function updateSelectionUI() {
  const count = current().rows.filter((r) => state.checked.has(r.id)).length;
  $("zipSelected").textContent = `チェックした${count}枚をZIP保存 ↓`;
  $("zipSelected").disabled = !count || zipBusy;
}

async function saveZip(selected) {
  if (zipBusy) return;
  if (!fontReady) return toast("フォント準備中です。");
  const ids = selected ? new Set(state.checked) : null;
  if (ids && !ids.size) return toast("書き出すカードにチェックしてください。");
  zipBusy = true;
  $("zip").disabled = true;
  updateSelectionUI();
  const b = selected ? $("zipSelected") : $("zip"),
    snapshot = clone(current());
  try {
    await exportZIP(
      snapshot,
      render,
      (done, total) => (b.textContent = `${done} / ${total} 枚`),
      ids,
    );
    toast("ZIPを書き出しました。");
  } catch (e) {
    toast(e.message, true);
  } finally {
    zipBusy = false;
    $("zip").disabled = false;
    $("zip").textContent = "全件ZIP ↓";
    updateSelectionUI();
  }
}

function exportJSON(setsOnly) {
  const data = {
    version: 2,
    projects: setsOnly ? [] : [current()],
    sets: library.sets,
    active: current().id,
  };
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    setsOnly ? "telop-mysets.json" : "telop-project.json",
  );
}

let importMode = "project";

function chooseJSON(mode) {
  importMode = mode;
  $("jsonFile").value = "";
  $("jsonFile").click();
}
export async function initPreviewExport() {
  viewportPreview = initShortPreview();

  $("copy").onclick = () => copyRow(row(), $("copy"));

  $("png").onclick = async () => {
    try {
      if (row())
        await savePNG(
          getCanvas(row()),
          filename(row(), current().rows.indexOf(row())),
        );
    } catch (e) {
      toast(e.message, true);
    }
  };

  $("gallery").onclick = (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      copyRow(
        current().rows.find((r) => r.id === copy.dataset.copy),
        copy,
      );
      return;
    }
    const b = e.target.closest("[data-choose]");
    if (b) selectedRow(b.dataset.choose);
  };

  $("zip").onclick = () => saveZip(false);

  $("zipSelected").onclick = () => saveZip(true);

  $("jsonExport").onclick = () => exportJSON(false);

  $("exportSets").onclick = () => exportJSON(true);

  $("jsonImport").onclick = () => chooseJSON("project");

  $("importSets").onclick = () => chooseJSON("sets");
  $("cards").addEventListener("click", (e) => {
    const button = e.target.closest('[data-action="copy"]');
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    copyRow(
      current().rows.find((r) => r.id === id),
      button,
    );
  });
  $("jsonFile").onchange = async () => {
    const file = $("jsonFile").files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("JSONは20MB以内にしてください。");
      importLibrary(JSON.parse(await file.text()), importMode);
      toast("JSONを読み込みました。既存のプロジェクトは保持されています。");
    } catch (e) {
      toast("読み込めません：" + e.message, true);
    }
  };
  subscribe(["refresh", "mutation", "render"], scheduleRender);
  subscribe(["refresh", "checked"], updateSelectionUI);
  if (location.protocol === "file:")
    toast(
      "ES ModulesのためHTTPサーバーまたはGitHub Pagesで開いてください。",
      true,
    );

  await loadFonts(undefined, [...usedFonts()]);

  if (
    [...usedFonts()].some(
      (font) =>
        !document.fonts.check(
          `${weightOf(font)} 40px "${font}"`,
          "日本語テロップ",
        ),
    )
  )
    toast(
      "一部フォントを読み込めませんでした。代替フォントで表示しています。接続後に再読み込みしてください。",
      true,
    );
}
