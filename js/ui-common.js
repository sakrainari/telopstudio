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
