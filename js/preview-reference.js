import { $, toast } from "./ui-common.js";

const STORAGE_KEY = "telop-studio-reference-v1";
const DEFAULT_GUIDE = { top: 8, right: 12, bottom: 18, left: 6 };
const clamp = (value, fallback, min, max) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

async function imageStore(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("telop-studio-reference", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("images", mode);
    const request = action(tx.objectStore("images"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// A private reference screen and guide only affect the display DOM. Neither
// the source Canvas nor project data ever receive this image or these margins.
export function initPreviewReference({ onChange, onChoose }) {
  const view = {
    visible: true,
    fit: "contain",
    opacity: 100,
    guide: { ...DEFAULT_GUIDE },
  };
  let record = null,
    imageURL = null,
    generation = 0,
    writes = Promise.resolve();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (typeof saved.visible === "boolean") view.visible = saved.visible;
    if (["contain", "cover"].includes(saved.fit)) view.fit = saved.fit;
    view.opacity = clamp(saved.opacity, 100, 20, 100);
    for (const side of Object.keys(DEFAULT_GUIDE))
      view.guide[side] = clamp(saved.guide?.[side], DEFAULT_GUIDE[side], 0, 45);
  } catch {
    /* Reference preferences must not block the editor. */
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
    } catch {}
  }

  function saveImage(next) {
    // Preserve ordering when a new image is immediately replaced or removed.
    writes = writes
      .catch(() => {})
      .then(() =>
        imageStore("readwrite", (store) =>
          next ? store.put(next, "current") : store.delete("current"),
        ),
      )
      .catch(() =>
        toast(
          "参考画面を保存できませんでした。今回の画面では引き続き使えます。",
          true,
        ),
      );
  }

  function syncControls() {
    $("referenceName").textContent = record
      ? `${record.name} · ${record.width} × ${record.height}`
      : "画面画像は未選択です";
    $("referenceName").title = record?.name || "";
    $("referenceVisible").checked = view.visible;
    $("referenceFit").value = view.fit;
    $("referenceOpacity").value = view.opacity;
    $("referenceOpacityValue").value = `${view.opacity}%`;
    for (const id of [
      "referenceVisible",
      "referenceFit",
      "referenceOpacity",
      "referenceRemove",
    ])
      $(id).disabled = !record;
    for (const side of Object.keys(DEFAULT_GUIDE))
      $("guide-" + side).value = view.guide[side];
  }

  async function decode(blob) {
    const url = URL.createObjectURL(blob),
      probe = new Image();
    try {
      probe.src = url;
      await probe.decode();
      if (
        !probe.naturalWidth ||
        probe.naturalWidth * probe.naturalHeight > 32_000_000
      )
        throw Error("画像は3200万画素以内にしてください。");
      return { url, width: probe.naturalWidth, height: probe.naturalHeight };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  function replace(next, decoded) {
    const previous = imageURL;
    record = next;
    imageURL = decoded?.url || null;
    syncControls();
    onChange();
    if (previous) URL.revokeObjectURL(previous);
  }

  $("referenceChoose").onclick = () => {
    $("referenceFile").value = "";
    $("referenceFile").click();
  };
  $("referenceFile").onchange = async () => {
    const file = $("referenceFile").files[0];
    if (!file) return;
    if (!(
      /^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) ||
      (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name))
    ))
      return toast("PNG・JPEG・WebPの画面画像を選んでください。", true);
    if (file.size > 20 * 1024 * 1024)
      return toast("参考画面は20MB以内にしてください。", true);
    const version = ++generation;
    try {
      const decoded = await decode(file);
      if (version !== generation) {
        URL.revokeObjectURL(decoded.url);
        return;
      }
      view.visible = true;
      const next = {
        blob: file,
        name: file.name,
        width: decoded.width,
        height: decoded.height,
      };
      replace(next, decoded);
      persist();
      saveImage(next);
      onChoose();
    } catch (error) {
      if (version === generation)
        toast("参考画面を読み込めません：" + error.message, true);
    }
  };
  $("referenceRemove").onclick = () => {
    generation++;
    replace(null, null);
    saveImage(null);
  };
  $("referenceVisible").onchange = () => {
    view.visible = $("referenceVisible").checked;
    persist();
    onChange();
  };
  $("referenceFit").onchange = () => {
    view.fit = $("referenceFit").value;
    persist();
    onChange();
  };
  $("referenceOpacity").oninput = () => {
    view.opacity = Number($("referenceOpacity").value);
    $("referenceOpacityValue").value = `${view.opacity}%`;
    persist();
    onChange();
  };
  for (const side of Object.keys(DEFAULT_GUIDE)) {
    $("guide-" + side).oninput = (event) => {
      if (event.target.value === "") return;
      view.guide[side] = clamp(
        Number(event.target.value),
        DEFAULT_GUIDE[side],
        0,
        45,
      );
      event.target.value = view.guide[side];
      persist();
      onChange();
    };
  }
  $("guideReset").onclick = () => {
    view.guide = { ...DEFAULT_GUIDE };
    syncControls();
    persist();
    onChange();
  };

  const version = generation;
  imageStore("readonly", (store) => store.get("current"))
    .then(async (saved) => {
      if (generation !== version || !(saved?.blob instanceof Blob)) return;
      const decoded = await decode(saved.blob);
      if (generation !== version) {
        URL.revokeObjectURL(decoded.url);
        return;
      }
      replace(saved, decoded);
    })
    .catch(() => {
      /* No saved reference is also a valid starting state. */
    });
  syncControls();

  return {
    update(stage, guide) {
      if (!stage) return;
      const visible = Boolean(imageURL && view.visible);
      stage.classList.toggle("has-reference", visible);
      let image = stage.querySelector(".reference-image");
      if (visible) {
        if (!image) {
          image = document.createElement("img");
          image.className = "reference-image";
          image.alt = "";
          image.setAttribute("aria-hidden", "true");
          stage.prepend(image);
        }
        if (image.src !== imageURL) image.src = imageURL;
        image.style.objectFit = view.fit;
        image.style.opacity = view.opacity / 100;
      } else image?.remove();
      for (const side of Object.keys(DEFAULT_GUIDE))
        guide?.style.setProperty("--guide-" + side, view.guide[side] + "%");
    },
  };
}
