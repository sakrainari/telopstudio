import { uid, mergeStyle } from "./presets.js";
// Keep the saved marks indexed by code point for existing JSON compatibility,
// but select, measure and paint complete visible characters (graphemes).
const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
let lastText, lastSegments;
export function graphemes(text) {
  if (text === lastText) return lastSegments;
  let offset = 0;
  const result = Array.from(segmenter.segment(text), ({ segment: char }) => {
    const start = offset;
    offset += Array.from(char).length;
    return { char, start, end: offset };
  });
  lastText = text;
  lastSegments = result;
  return result;
}
function expandRange(text, range) {
  const segments = graphemes(text);
  const start =
    segments.find((s) => s.start <= range.start && range.start < s.end)
      ?.start ?? range.start;
  if (range.start === range.end) return { start, end: start };
  const end =
    segments.find((s) => s.start < range.end && range.end <= s.end)?.end ??
    range.end;
  return { start, end };
}
export function parseBlock(block) {
  let text = block.trim(),
    role = "A";
  const prefix = text.match(/^([ABNＡＢＮ])[:：]\s*/i);
  if (prefix) {
    role = prefix[1].normalize("NFKC").toUpperCase();
    text = text.slice(prefix[0].length);
  } else if (text.startsWith("※")) role = "※";
  else if (/^[!！]/.test(text)) {
    role = "!";
    text = text.slice(1).trimStart();
  }
  return {
    id: uid(),
    role,
    text,
    override: {},
    marks: Array.from(text, () => null),
  };
}
export function parseScript(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .filter((s) => s.trim())
    .map(parseBlock);
}
export function updateText(row, text) {
  const a = graphemes(row.text),
    b = graphemes(text);
  let start = 0,
    end = 0;
  while (
    start < Math.min(a.length, b.length) &&
    a[start].char === b[start].char
  )
    start++;
  while (
    end < Math.min(a.length - start, b.length - start) &&
    a[a.length - 1 - end].char === b[b.length - 1 - end].char
  )
    end++;
  const prefix = start ? a[start - 1].end : 0;
  const oldTail = end ? a[a.length - end].start : Array.from(row.text).length;
  const newTail = end ? b[b.length - end].start : Array.from(text).length;
  row.marks = [
    ...row.marks.slice(0, prefix),
    ...Array(Math.max(0, newTail - prefix)).fill(null),
    ...row.marks.slice(oldTail),
  ];
  row.text = text;
}
export function selectionRange(text, start, end) {
  return expandRange(text, {
    start: Array.from(text.slice(0, start)).length,
    end: Array.from(text.slice(0, end)).length,
  });
}
export function markRange(row, range, patch, mode = "merge") {
  range = expandRange(row.text, range);
  for (let i = range.start; i < range.end; i++) {
    if (mode === "inherit") row.marks[i] = null;
    else if (mode === "clear") row.marks[i] = { noAuto: true };
    else {
      const old = row.marks[i] || {};
      const next = { ...old, ...patch };
      for (const k of ["shadow", "auto"])
        if (patch[k]) next[k] = { ...old[k], ...patch[k] };
      if (patch.edges)
        next.edges = Array.from({ length: 3 }, (_, j) => ({
          ...old.edges?.[j],
          ...patch.edges[j],
        }));
      row.marks[i] = next;
    }
  }
}
export function tokens(row, style) {
  const flags = new Set();
  if (style.auto.on) {
    const pattern =
      /[0-9０-９]+(?:[.,．，][0-9０-９]+)*(?:万円|億円|万|億|円|[%％]|つ|個|人|回|秒|分|時間|年|日|倍|本|歳|点|位|km|cm|mm|kg|m|g)|[!！?？]+|『[^』\n]*』|【[^】\n]*】/gu;
    for (const m of row.text.matchAll(pattern)) {
      const from = Array.from(row.text.slice(0, m.index)).length;
      for (let i = from; i < from + Array.from(m[0]).length; i++) flags.add(i);
    }
  }
  return graphemes(row.text).map(({ char, start, end }) => {
    const mark = row.marks[start] || {};
    let s = style;
    const automatic = Array.from(
      { length: end - start },
      (_, i) => start + i,
    ).some((i) => flags.has(i));
    if (automatic && !mark.noAuto)
      s = mergeStyle(s, {
        size: s.size * s.auto.scale,
        color: s.auto.color,
        gradient: false,
      });
    return { char, start, end, style: mergeStyle(s, mark) };
  });
}
