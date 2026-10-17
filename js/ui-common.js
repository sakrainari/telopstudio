import { subscribe, saveStatus, notice } from "./state.js";
let toastTimer;
export const $ = (id) => document.getElementById(id);

export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export const option = (value, label, selected) =>
  `<option value="${escape(value)}" ${selected === value ? "selected" : ""}>${escape(label)}</option>`;

export function toast(text, error = false) {
  $("toast").textContent = text;
  $("toast").className = "show" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => ($("toast").className = ""),
    error ? 9000 : 3500,
  );
}

export async function askName(title, value) {
  const dialog = $("nameDialog");
  $("nameTitle").textContent = title;
  $("nameValue").value = value;
  dialog.returnValue = "cancel";
  dialog.showModal();
  $("nameValue").focus();
  $("nameValue").select();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () =>
        resolve(
          dialog.returnValue === "ok"
            ? $("nameValue").value.trim() || "名称未設定"
            : null,
        ),
      { once: true },
    ),
  );
}
export function initCommonUI() {
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
  subscribe(["save-status"], () => {
    $("saveState").textContent = saveStatus;
  });
  subscribe(["notice"], () => {
    if (notice) toast(notice.message, notice.error);
  });
}

// Layout preferences are separate from project data and editing history.
const PANEL_KEY = "telop-studio-panels-v1";
let panelStates = {};
export function panelIsOpen(key, fallback = false) {
  const existing = document.querySelector(`details[data-panel-key="${key}"]`);
  return existing ? existing.open : (panelStates[key] ?? fallback);
}
export function initPanelFolding(root) {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_KEY) || "{}");
    panelStates = Object.fromEntries(
      Object.entries(saved || {}).filter(
        ([key, value]) =>
          /^[a-z-]{1,40}$/.test(key) && typeof value === "boolean",
      ),
    );
  } catch {
    panelStates = {};
  }
  root.querySelectorAll("details[data-panel-key]").forEach((panel) => {
    if (typeof panelStates[panel.dataset.panelKey] === "boolean")
      panel.open = panelStates[panel.dataset.panelKey];
  });
  root.addEventListener(
    "toggle",
    (event) => {
      const panel = event.target;
      if (!panel.matches("details[data-panel-key]") || !panel.isConnected)
        return;
      const key = panel.dataset.panelKey;
      if (panelStates[key] === panel.open) return;
      panelStates[key] = panel.open;
      try {
        localStorage.setItem(PANEL_KEY, JSON.stringify(panelStates));
      } catch {
        /* Folding remains usable without storage. */
      }
    },
    true,
  );
}
