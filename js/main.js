import { initState, notify, saveOnExit, reportStartupError } from "./state.js";
import { $, initCommonUI } from "./ui-common.js";
import { initHistory } from "./history.js";
import { initScriptEditor } from "./script-edit.js";
import {
  initFontPanel,
  fontOptions,
  showMissingFontWarning,
} from "./font-panel.js";
import { initDesignPanel } from "./design-panel.js";
import { initPreviewExport } from "./preview-export.js";

initCommonUI();
initState($("script").value);
window.addEventListener("pagehide", saveOnExit);
initHistory();
initScriptEditor();
await initFontPanel();
initDesignPanel({ fontOptions });
const previewReady = initPreviewExport();
notify("refresh");
await previewReady;
showMissingFontWarning();
reportStartupError();
