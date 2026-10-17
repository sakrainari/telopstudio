export const FONTS = [
  "Noto Sans JP",
  "Dela Gothic One",
  "RocknRoll One",
  "M PLUS Rounded 1c",
  "Shippori Mincho B1",
  "Source Han Sans Heavy",
];
export const ROLES = {
  A: "話者A",
  B: "話者B",
  N: "ナレーション",
  "※": "注釈",
  "!": "衝撃",
};
export const clone = (value) => structuredClone(value);
export const uid = () => crypto.randomUUID();
const edge = (on, color, width) => ({ on, color, width, position: "outside" });
const base = () => ({
  font: FONTS[0],
  size: 88,
  letterSpacing: 0,
  lineGap: 24,
  color: "#ffffff",
  color2: "#ffcf59",
  gradient: false,
  fillOn: true,
  joinOutlines: false,
  lineJoin: "round",
  lineCap: "butt",
  miterLimit: 2,
  edges: [
    edge(true, "#11131b", 7),
    edge(false, "#427cff", 7),
    edge(false, "#ff434f", 6),
  ],
  shadow: {
    on: true,
    blur: 10,
    distance: 11.313708498984761,
    angle: 45,
    opacity: 1,
    color: "#000000",
  },
  box: {
    on: false,
    color: "#000000",
    opacity: 0.65,
    radius: 18,
    padding: 22,
    border: 0,
    borderColor: "#111111",
    mode: "all",
    padTop: null,
    padRight: null,
    padBottom: null,
    padLeft: null,
    sizeMode: "auto",
    width: 1000,
    height: 300,
    alignX: "center",
    alignY: "center",
    offsetX: 0,
    offsetY: 0,
  },
  auto: { on: true, scale: 1.3, color: "#ffcf59" },
  align: "center",
});
export function defaults() {
  const A = base(),
    B = base(),
    N = base(),
    note = base(),
    bang = base();
  Object.assign(B, {
    font: FONTS[2],
    gradient: true,
    color: "#ffed6a",
    color2: "#ff902b",
  });
  B.edges[1].color = "#e64343";
  Object.assign(N, { font: FONTS[3], size: 68 });
  N.edges = [
    edge(true, "#10121a", 3),
    edge(false, "#ffffff", 0),
    edge(false, "#000000", 0),
  ];
  N.box.on = true;
  Object.assign(note, { size: 44, color: "#17191f" });
  note.edges.forEach((e) => (e.on = false));
  note.shadow.on = false;
  Object.assign(note.box, {
    on: true,
    color: "#ffffff",
    opacity: 1,
    border: 2,
  });
  note.auto.on = false;
  Object.assign(bang, {
    font: FONTS[1],
    size: 112,
    gradient: true,
    color: "#fff5a1",
    color2: "#e7a322",
  });
  bang.edges = [
    edge(true, "#16151c", 6),
    edge(false, "#ffffff", 5),
    edge(false, "#df304b", 8),
  ];
  Object.assign(bang.shadow, { blur: 15, distance: 16.97056274847714 });
  return { A, B, N, "※": note, "!": bang };
}
export const SET_NAMES = {
  standard: "標準",
  explain: "解説",
  gaming: "実況",
  serious: "シリアス",
  mystery: "謎解き",
};
export function designSet(key) {
  const roles = defaults();
  // Samples are complete authored designs. Their outlines must not inherit
  // the one-outline starting point used for a new project since v1.5.
  for (const role of ["A", "B", "!"]) roles[role].edges[1].on = true;
  roles["!"].edges[2].on = true;
  if (key === "standard") return roles;
  for (const [r, s] of Object.entries(roles)) {
    if (key === "explain") {
      s.font = FONTS[3];
      s.edges[1].color = "#238b81";
      s.color2 = "#79e7cf";
      s.shadow.blur = 5;
    }
    if (key === "gaming") {
      s.edges[1].color = "#8e47e6";
      s.color2 = "#fc6baa";
      s.shadow.distance = 14.142135623730951;
    }
    if (key === "serious") {
      s.font = FONTS[4];
      s.gradient = false;
      s.color = r === "※" ? "#111111" : "#f2eee5";
      s.edges[1].on = false;
      s.shadow.blur = 8;
      s.auto.color = "#d65252";
    }
    if (key === "mystery") {
      s.font = FONTS[4];
      s.color = "#f6eac8";
      s.color2 = "#b48e4d";
      s.gradient = true;
      s.edges[1].color = "#264f49";
      s.auto.color = "#f5ae53";
      Object.assign(s.box, { on: true, color: "#11231f", opacity: 0.85 });
    }
  }
  return roles;
}
export function mergeStyle(base, patch = {}) {
  const out = { ...base, ...patch };
  for (const k of ["shadow", "box", "auto"])
    out[k] = { ...base[k], ...patch[k] };
  out.edges = base.edges.map((e, i) => ({ ...e, ...patch.edges?.[i] }));
  return out;
}
export function cleanStyle(input, partial = false) {
  const b = base(),
    out = {};
  if (!input || typeof input !== "object") return partial ? {} : b;
  const color = (v) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
  const number = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(min, Math.min(max, v))
      : undefined;
  if (
    typeof input.font === "string" &&
    /^[^"'\\<>;{}]{1,100}$/.test(input.font)
  )
    out.font = input.font;
  if (["left", "center", "right"].includes(input.align))
    out.align = input.align;
  for (const k of ["color", "color2"]) if (color(input[k])) out[k] = input[k];
  if (typeof input.gradient === "boolean") out.gradient = input.gradient;
  if (typeof input.fillOn === "boolean") out.fillOn = input.fillOn;
  if (typeof input.joinOutlines === "boolean")
    out.joinOutlines = input.joinOutlines;
  if (["round", "miter", "bevel"].includes(input.lineJoin))
    out.lineJoin = input.lineJoin;
  if (["butt", "round", "square"].includes(input.lineCap))
    out.lineCap = input.lineCap;
  const miter = number(input.miterLimit, 1, 10);
  if (miter !== undefined) out.miterLimit = miter;
  const size = number(input.size, 12, 240);
  if (size !== undefined) out.size = size;
  for (const [k, min, max] of [
    ["letterSpacing", -100, 200],
    ["lineGap", -100, 300],
  ]) {
    const n = number(input[k], min, max);
    if (n !== undefined) out[k] = n;
  }
  for (const [section, limits] of Object.entries({
    shadow: {
      blur: [0, 50],
      distance: [0, 120],
      angle: [0, 360],
      opacity: [0, 1],
    },
    box: {
      opacity: [0, 1],
      radius: [0, 100],
      padding: [0, 100],
      border: [0, 12],
      padTop: [0, 300],
      padRight: [0, 300],
      padBottom: [0, 300],
      padLeft: [0, 300],
      width: [24, 4096],
      height: [24, 4096],
      offsetX: [-500, 500],
      offsetY: [-500, 500],
    },
    auto: { scale: [1, 2] },
  })) {
    const p = input[section];
    if (!p || typeof p !== "object") continue;
    out[section] = {};
    if (typeof p.on === "boolean") out[section].on = p.on;
    if (section === "box") {
      for (const [k, values] of Object.entries({
        mode: ["all", "line"],
        sizeMode: ["auto", "fixed"],
        alignX: ["left", "center", "right"],
        alignY: ["top", "center", "bottom"],
      }))
        if (values.includes(p[k])) out.box[k] = p[k];
    }
    for (const k of ["color", "borderColor"])
      if (color(p[k])) out[section][k] = p[k];
    for (const [k, range] of Object.entries(limits)) {
      const n = number(p[k], ...range);
      if (n !== undefined) out[section][k] = n;
    }
  }
  if (Array.isArray(input.edges))
    out.edges = b.edges.map((e, i) => {
      const p = input.edges[i] || {},
        o = {};
      if (typeof p.on === "boolean") o.on = p.on;
      if (color(p.color)) o.color = p.color;
      if (["outside", "center", "inside"].includes(p.position))
        o.position = p.position;
      const w = number(p.width, 0, 24);
      if (w !== undefined) o.width = w;
      return o;
    });
  if (input.noAuto === true) out.noAuto = true;
  return partial ? out : mergeStyle(b, out);
}
export const STORAGE_KEY = "telop-studio-v1";
export function saveLibrary(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 2 }));
}
export function readLibrary() {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return null;
  return validateLibrary(JSON.parse(text));
}
export function validateLibrary(data) {
  if (
    !data ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.projects) ||
    data.projects.length > 100
  )
    throw Error("対応するプロジェクトJSONではありません。");
  const legacy = data.version === 1;
  const migrate = (style, partial = false) => {
    const out = cleanStyle(style, partial);
    if (legacy && typeof style?.shadow?.distance === "number")
      out.shadow = {
        ...out.shadow,
        distance: Math.min(120, style.shadow.distance * Math.SQRT2),
        angle: 45,
        opacity: 1,
      };
    return out;
  };
  const projects = data.projects.map((p) => {
    if (!p || !Array.isArray(p.rows) || p.rows.length > 300)
      throw Error("台本の形式が不正です（最大300枚）。");
    const roles = defaults();
    for (const r of Object.keys(roles))
      if (p.roles?.[r]) roles[r] = migrate(p.roles[r]);
    const rows = p.rows.map((row) => {
      if (typeof row.text !== "string" || row.text.length > 5000)
        throw Error("テロップは1枚5000文字以内にしてください。");
      const chars = Array.from(row.text);
      return {
        id: uid(),
        text: row.text,
        role: Object.hasOwn(ROLES, row.role) ? row.role : "A",
        override: migrate(row.override, true),
        marks: chars.map((_, i) =>
          row.marks?.[i] ? migrate(row.marks[i], true) : null,
        ),
      };
    });
    const index = Math.max(
      0,
      p.rows.findIndex((r) => r.id === p.selected),
    );
    return {
      id: uid(),
      name: String(p.name || "名称未設定").slice(0, 80),
      roles,
      rows,
      selected: rows[index]?.id || null,
    };
  });
  const sets = Array.isArray(data.sets)
    ? data.sets.slice(0, 100).map((s) => ({
        id: uid(),
        name: String(s.name || "マイセット").slice(0, 80),
        roles: Object.fromEntries(
          Object.keys(ROLES).map((r) => [r, migrate(s.roles?.[r])]),
        ),
      }))
    : [];
  const active = Math.max(
    0,
    data.projects.findIndex((p) => p.id === data.active),
  );
  return { projects, sets, active: projects[active]?.id || null };
}
