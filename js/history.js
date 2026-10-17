import { clone } from "./presets.js";
import {
  state,
  current,
  replaceProject,
  saveSoon,
  notify,
  subscribe,
} from "./state.js";
import { $, escape } from "./ui-common.js";
const histories = new Map();
function history() {
  const p = current();
  if (!histories.has(p.id))
    histories.set(p.id, {
      items: [{ name: "開始時の状態", data: clone(p) }],
      cursor: 0,
      lastKey: null,
      lastTime: 0,
    });
  return histories.get(p.id);
}

export function transaction(name, fn, key = null) {
  const h = history();
  fn();
  const time = Date.now();
  const snapshot = { name, data: clone(current()) };

  if (
    key &&
    h.lastKey === key &&
    time - h.lastTime < 900 &&
    h.cursor === h.items.length - 1 &&
    h.cursor > 0
  )
    h.items[h.cursor] = snapshot;
  else {
    h.items = h.items.slice(0, h.cursor + 1);
    h.items.push(snapshot);
    if (h.items.length > 51) h.items.shift();
    h.cursor = h.items.length - 1;
  }

  h.lastKey = key;
  h.lastTime = time;
  saveSoon();
  notify("mutation");
}

function restore(index) {
  const h = history();
  if (index < 0 || index >= h.items.length) return;
  h.cursor = index;
  h.lastKey = null;
  const p = clone(h.items[index].data);
  replaceProject(p);
  state.range = null;
  state.checked.clear();
  if (state.scope === "selection") state.scope = state.returnScope;
  notify("refresh");
  saveSoon();
  if ($("historyDialog").open) showHistory();
}

function updateHistoryButtons() {
  const h = history();
  $("undo").disabled = h.cursor === 0;
  $("redo").disabled = h.cursor === h.items.length - 1;
}

function showHistory() {
  const h = history();
  $("historyList").innerHTML = h.items
    .map(
      (item, i) =>
        `<button data-history="${i}" class="${i === h.cursor ? "active" : ""}">${i === h.cursor ? "●" : "○"} ${String(i).padStart(2, "0")}　${escape(item.name)}</button>`,
    )
    .join("");
}
export function initHistory() {
  $("undo").onclick = () => restore(history().cursor - 1);

  $("redo").onclick = () => restore(history().cursor + 1);

  $("historyButton").onclick = () => {
    showHistory();
    $("historyDialog").showModal();
  };

  $("historyList").onclick = (e) => {
    const b = e.target.closest("[data-history]");
    if (b) restore(Number(b.dataset.history));
  };

  document.addEventListener("keydown", (e) => {
    if (e.isComposing || $("nameDialog").open) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      restore(history().cursor + (e.shiftKey ? 1 : -1));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      restore(history().cursor + 1);
    }
  });
  subscribe(["mutation", "refresh"], updateHistoryButtons);
  subscribe(["selection-change"], () => {
    history().lastKey = null;
  });
}
