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
const LARGE_JSON_BYTES = 200 * 1024 * 1024;
let renderTimer,
  galleryTimer,
  renderVersion = 0,
  zipBusy = false,
  fontReady = false;
const cache = new Map();
const thumbnails = new Map();
let galleryProject,
  fontVersion = 0,
  fontRequestKey,
  fontRequest;
let viewportPreview;
function renderKey(r) {
  return JSON.stringify([
    fontVersion,
    r.text,
    r.role,
    r.override,
    r.marks,
    current().roles[r.role],
  ]);
}
function getCanvas(r) {
  const key = renderKey(r),
    saved = cache.get(r.id);
  if (saved?.key === key) return saved.canvas;
  const canvas = render(r, current().roles);
  // Full-size canvases are expensive. Only retain the currently selected one;
  // other cards retain their small thumbnail and its dependency key instead.
  if (r.id === current().selected) {
    cache.clear();
    cache.set(r.id, { key, canvas });
  }
  return canvas;
}

function scheduleRender(topics) {
  clearTimeout(renderTimer);
  clearTimeout(galleryTimer);
  if (topics?.has("render")) {
    fontVersion++;
    fontRequestKey = null;
  }
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
    const families = [...usedFonts()],
      key = JSON.stringify([families, text]);
    if (key !== fontRequestKey) {
      fontRequestKey = key;
      fontRequest = loadFonts(text, families);
    }
    await fontRequest;
    if (version !== renderVersion) return;
    fontReady = true;
    drawPreview();
    galleryTimer = setTimeout(() => drawGallery(version), 160);
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

async function drawGallery(version) {
  if (!fontReady) return;
  const p = current();
  if (galleryProject !== p.id) {
    thumbnails.clear();
    galleryProject = p.id;
  }
  const ids = new Set(p.rows.map((r) => r.id));
  for (const id of thumbnails.keys()) if (!ids.has(id)) thumbnails.delete(id);
  const fragment = document.createDocumentFragment();
  p.rows.forEach((r, i) => {
    let entry = thumbnails.get(r.id);
    if (!entry) {
      const box = document.createElement("article"),
        button = document.createElement("button"),
        info = document.createElement("div");
      box.dataset.id = r.id;
      button.className = "thumb-view checker";
      button.dataset.choose = r.id;
      button.textContent = "プレビュー準備中…";
      info.className = "thumb-info";
      info.innerHTML = `<span></span><button data-copy="${r.id}" title="画像をコピー">▣ コピー</button>`;
      box.append(button, info);
      entry = { box, button, info, key: null };
      thumbnails.set(r.id, entry);
    }
    const { box, button, info } = entry;
    box.className = "thumb" + (r.id === p.selected ? " active" : "");
    button.title = `${i + 1}: ${r.text}`;
    info.querySelector("span").textContent =
      `${String(i + 1).padStart(2, "0")} / ${ROLES[r.role]}`;
    fragment.append(box);
  });
  $("gallery").replaceChildren(fragment);
  for (const r of p.rows) {
    if (version !== renderVersion) return;
    const entry = thumbnails.get(r.id),
      key = renderKey(r);
    if (entry.key === key) continue;
    // Yield between images so typing, Undo, project switches and cancellation
    // can run even while hundreds of thumbnails are being generated.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (version !== renderVersion) return;
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
      entry.button.replaceChildren(img);
    } catch (e) {
      entry.button.textContent = "描画できません：" + e.message;
    }
    entry.key = key;
  }
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
    if (
      file.size > LARGE_JSON_BYTES &&
      !confirm(
        `サイズの大きいJSON（約${Math.round(file.size / 1024 / 1024)}MB）です。読み込みに時間がかかり、タブが応答しなくなることがあります。読み込みますか？`,
      )
    )
      return;
    try {
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
