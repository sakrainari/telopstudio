import { $ } from "./ui-common.js";
import { initPreviewReference } from "./preview-reference.js";

const STORAGE_KEY = "telop-studio-preview-v1";
const BACKGROUNDS = ["checker", "black", "scene"];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback, low, high) =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, low, high)
    : fallback;

// Placement is a viewing preference. It never changes the exported bitmap.
export function initShortPreview() {
  const view = {
    mode: "short",
    background: "checker",
    guides: true,
    scale: 100,
    x: 50,
    y: 72,
  };
  let initializedScale = false,
    caption = null,
    drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (["single", "short"].includes(saved?.mode)) view.mode = saved.mode;
    if (BACKGROUNDS.includes(saved?.background))
      view.background = saved.background;
    if (typeof saved?.guides === "boolean") view.guides = saved.guides;
    view.scale = finite(saved?.scale, 100, 5, 200);
    view.x = finite(saved?.x, 50, 0, 100);
    view.y = finite(saved?.y, 72, 0, 100);
    initializedScale =
      saved?.initializedScale === true &&
      typeof saved?.scale === "number" &&
      Number.isFinite(saved.scale);
  } catch {
    /* The preview also works without preference storage. */
  }
  const reference = initPreviewReference({
    onChange: () => updatePlacement(),
    onChoose: () => {
      view.mode = "short";
      mount();
      persist();
    },
  });

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...view, initializedScale }),
      );
    } catch {}
  }

  function fitWidth() {
    if (!caption) return;
    view.scale = Math.min(
      view.scale,
      clamp(Math.floor(((1080 * 0.88) / caption.width) * 100), 5, 200),
    );
    view.x = 50;
    initializedScale = true;
    updatePlacement();
    persist();
  }

  function updatePlacement() {
    $("shortScale").value = view.scale;
    $("shortScaleValue").value = `${Math.round(view.scale)}%`;
    $("shortGuides").checked = view.guides;
    const stage = $("shortStage");
    reference.update(stage, stage?.querySelector(".short-guide"));
    if (!caption || !stage) return;
    stage.classList.toggle("show-guides", view.guides);
    const width = ((caption.width * view.scale) / 100 / 1080) * 100;
    const height = ((caption.height * view.scale) / 100 / 1920) * 100;
    caption.style.width = `${width}%`;
    caption.style.left = `${view.x}%`;
    caption.style.top = `${view.y}%`;
    $("shortPosition").textContent =
      `位置 ${Math.round(view.x)}% / ${Math.round(view.y)}%`;
    const overflow =
      view.x - width / 2 < 0 ||
      view.x + width / 2 > 100 ||
      view.y - height / 2 < 0 ||
      view.y + height / 2 > 100;
    $("shortOverflow").hidden = !overflow;
  }

  function updateChrome() {
    const short = view.mode === "short";
    $("preview").classList.toggle("short-mode", short);
    $("preview").classList.remove(...BACKGROUNDS);
    $("preview").classList.add(view.background);
    $("shortTools").hidden = !short;
    document.querySelectorAll("[data-preview-mode]").forEach((button) => {
      const active = button.dataset.previewMode === view.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-bg]").forEach((button) => {
      button.classList.toggle("active", button.dataset.bg === view.background);
    });
    $("shortFit").disabled = !caption;
    $("shortScale").disabled = !caption;
    document
      .querySelectorAll("[data-short-position]")
      .forEach((button) => (button.disabled = !caption));
  }

  function mount() {
    drag = null;
    updateChrome();
    if (!caption) {
      $("shortOverflow").hidden = true;
      return;
    }
    $("preview").replaceChildren();
    caption.removeAttribute("style");
    if (view.mode === "single") {
      caption.classList.remove("short-caption");
      caption.removeAttribute("tabindex");
      caption.removeAttribute("role");
      caption.removeAttribute("aria-label");
      $("preview").append(caption);
      return;
    }
    if (!initializedScale) {
      view.scale = Math.min(
        100,
        clamp(Math.floor(((1080 * 0.88) / caption.width) * 100), 5, 200),
      );
      initializedScale = true;
    }
    const stage = document.createElement("div");
    stage.id = "shortStage";
    stage.className = `short-stage ${view.background}`;
    stage.setAttribute("aria-label", "1080×1920の縦動画プレビュー");
    const guide = document.createElement("div");
    guide.className = "short-guide";
    guide.setAttribute("aria-hidden", "true");
    guide.innerHTML = "<span>余白の目安</span>";
    caption.classList.add("short-caption");
    caption.tabIndex = 0;
    caption.setAttribute("role", "img");
    caption.setAttribute(
      "aria-label",
      "テロップをドラッグ、または矢印キーで移動",
    );
    stage.append(guide, caption);
    $("preview").append(stage);
    updatePlacement();
  }

  // Delegate to the stable preview host: the displayed canvas changes on edits.
  $("preview").addEventListener("pointerdown", (event) => {
    if (view.mode !== "short" || event.target !== caption || event.button !== 0)
      return;
    const rect = $("shortStage").getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    caption.focus({ preventScroll: true });
    caption.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: view.x,
      y: view.y,
      rect,
    };
  });
  $("preview").addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    view.x = clamp(
      drag.x + ((event.clientX - drag.startX) / drag.rect.width) * 100,
      0,
      100,
    );
    view.y = clamp(
      drag.y + ((event.clientY - drag.startY) / drag.rect.height) * 100,
      0,
      100,
    );
    updatePlacement();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    $("preview").addEventListener(type, () => {
      if (drag) {
        drag = null;
        persist();
      }
    });
  }
  $("preview").addEventListener("keydown", (event) => {
    if (
      view.mode !== "short" ||
      event.target !== caption ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 0.5;
    view.x = clamp(view.x + direction[0] * step, 0, 100);
    view.y = clamp(view.y + direction[1] * step, 0, 100);
    updatePlacement();
    persist();
  });
  document.querySelectorAll("[data-preview-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        view.mode = button.dataset.previewMode;
        mount();
        persist();
      }),
  );
  document.querySelectorAll("[data-bg]").forEach(
    (button) =>
      (button.onclick = () => {
        view.background = button.dataset.bg;
        updateChrome();
        if ($("shortStage"))
          $("shortStage").className = `short-stage ${view.background}`;
        updatePlacement();
        persist();
      }),
  );
  $("shortScale").oninput = () => {
    view.scale = Number($("shortScale").value);
    initializedScale = true;
    updatePlacement();
    persist();
  };
  $("shortFit").onclick = fitWidth;
  $("shortGuides").onchange = () => {
    view.guides = $("shortGuides").checked;
    updatePlacement();
    persist();
  };
  document.querySelectorAll("[data-short-position]").forEach(
    (button) =>
      (button.onclick = () => {
        view.x = 50;
        view.y = Number(button.dataset.shortPosition);
        updatePlacement();
        persist();
      }),
  );
  updateChrome();
  updatePlacement();
  return {
    show(canvas) {
      caption = canvas;
      mount();
    },
    clear() {
      caption = null;
      mount();
    },
  };
}
