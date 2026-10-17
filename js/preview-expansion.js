import { $ } from "./ui-common.js";

// Move the existing preview and controls rather than making a second Canvas
// or duplicate form. Their listeners, reference image and placement survive.
export function initPreviewExpansion() {
  const dialog = $("expandedPreviewDialog"),
    button = $("expandPreview"),
    panel = document.querySelector(".center-panel");
  let slots = [],
    scrollTop = 0;

  button.onclick = () => {
    if (dialog.open) return;
    scrollTop = panel.scrollTop;
    const targets = [
      [$("preview"), $("expandedPreviewMain")],
      [document.querySelector(".preview-controls"), $("expandedPreviewTools")],
      [$("shortTools"), $("expandedPreviewTools")],
      [document.querySelector(".export-actions"), $("expandedPreviewTools")],
    ];
    slots = targets.map(([node, host]) => {
      const anchor = document.createComment("expanded-preview-return");
      node.before(anchor);
      host.append(node);
      return { node, anchor };
    });
    $("expandedControls").open =
      !window.matchMedia("(max-width: 800px)").matches;
    dialog.showModal();
  };
  $("closeExpandedPreview").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    for (const { node, anchor } of slots) anchor.replaceWith(node);
    slots = [];
    panel.scrollTop = scrollTop;
    button.focus({ preventScroll: true });
  });
  return {
    sync(mode) {
      button.hidden = mode !== "short";
      if (mode !== "short" && dialog.open) dialog.close();
    },
  };
}
