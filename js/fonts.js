// =============================================================
// fonts.js
// フォント一覧の管理（最初から入っている6書体 ＋ 自分で追加したフォント）
//
// 追加の方法は2つ：
//   1. フォントファイル（.ttf .otf .woff .woff2）を読み込む
//      → ファイルごとこのブラウザ（IndexedDB）に保存。次回も使える
//   2. PCに入っているフォントを名前で登録する
//      → 名前だけ保存。そのPCでしか表示されない
// =============================================================
import { FONTS } from './presets.js';

const BUILTIN_WEIGHTS = {
  'Noto Sans JP': 900,
  'Source Han Sans Heavy': 900,
  'M PLUS Rounded 1c': 800,
  'Shippori Mincho B1': 800,
};

const DB_NAME = 'telop-studio-fonts';
const STORE = 'fonts';
const MAX_FILE_MB = 30;

/** 追加フォント：[{family, source:'file'|'local', fileName?}] */
let userFonts = [];
/** ファイルから読み込んだ FontFace（一覧から外すときに使う） */
const faces = new Map();

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'family' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ---------- 便利関数 ----------
/** フォント名として使えない文字を取り除く */
function cleanName(name) {
  return String(name || '').replace(/["'\\<>;{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function exists(family) {
  return FONTS.includes(family) || userFonts.some((f) => f.family === family);
}

/** PCにそのフォントが入っているか（文字幅が代わりのフォントと変わるかで判定） */
export function isInstalled(family) {
  const ctx = document.createElement('canvas').getContext('2d');
  const text = 'あいう永テロップABCabc123';
  for (const fallback of ['monospace', 'serif', 'sans-serif']) {
    ctx.font = `40px ${fallback}`;
    const a = ctx.measureText(text).width;
    ctx.font = `40px "${family}", ${fallback}`;
    if (ctx.measureText(text).width !== a) return true;
  }
  return false;
}

async function registerFace(family, data) {
  const face = new FontFace(family, data);
  await face.load(); // 壊れたファイルならここで失敗する
  document.fonts.add(face);
  faces.set(family, face);
}

// ---------- 公開する関数 ----------
/** 起動時に、保存してある追加フォントを読み込む */
export async function initUserFonts() {
  userFonts = [];
  if (!window.indexedDB) return { error: true };
  try {
    const items = (await withStore('readonly', (st) => st.getAll())) || [];
    for (const item of items) {
      if (item.source === 'file') {
        try { await registerFace(item.family, item.data); } catch { continue; }
      }
      userFonts.push({ family: item.family, source: item.source, fileName: item.fileName });
    }
    return { error: false };
  } catch {
    return { error: true };
  }
}

/** 選べるフォントすべて（内蔵 → 追加の順） */
export function allFonts() {
  return [
    ...FONTS.map((family) => ({ family, source: 'builtin', label: family === 'Source Han Sans Heavy' ? '源ノ角ゴシック Heavy' : family })),
    ...userFonts.map((f) => ({ ...f })),
  ];
}

/** 描画で使うフォントの太さ */
export function weightOf(family) {
  return BUILTIN_WEIGHTS[family] || 400;
}

/** フォントファイルを追加して、付けた名前を返す */
export async function addFontFile(file) {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw Error('.ttf / .otf / .woff / .woff2 のファイルを選んでください。');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw Error(`${MAX_FILE_MB}MB以下のファイルにしてください。`);
  const base = cleanName(file.name.replace(/\.[^.]+$/, '')) || '追加フォント';
  let family = base;
  for (let n = 2; exists(family); n++) family = `${base} ${n}`;

  const data = await file.arrayBuffer();
  try {
    await registerFace(family, data);
  } catch {
    throw Error('フォントとして読み込めませんでした。ファイルが壊れていないか確認してください。');
  }
  try {
    await withStore('readwrite', (st) => st.put({ family, source: 'file', fileName: file.name, data }));
  } catch {
    // 保存できなくても、今開いている間は使える
    userFonts.push({ family, source: 'file', fileName: file.name });
    throw Error(`「${family}」は今だけ使えます。ブラウザの容量不足で保存できませんでした。`);
  }
  userFonts.push({ family, source: 'file', fileName: file.name });
  return family;
}

/** PCに入っているフォントを名前で追加して、その名前を返す */
export async function addLocalFont(name, { skipCheck = false } = {}) {
  const family = cleanName(name);
  if (!family) throw Error('フォント名を入力してください。');
  if (exists(family)) throw Error(`「${family}」はもう一覧にあります。`);
  if (!skipCheck && !isInstalled(family)) {
    throw Error(`「${family}」がこのPCで見つかりません。名前を確認してください（例：メイリオ、Yu Gothic）。`);
  }
  try {
    await withStore('readwrite', (st) => st.put({ family, source: 'local' }));
  } catch { /* 保存できなくても今は使える */ }
  userFonts.push({ family, source: 'local' });
  return family;
}

/** 追加フォントを一覧から外す */
export async function removeFont(family) {
  userFonts = userFonts.filter((f) => f.family !== family);
  const face = faces.get(family);
  if (face) { document.fonts.delete(face); faces.delete(family); }
  try { await withStore('readwrite', (st) => st.delete(family)); } catch { /* 無視 */ }
}

/** PCのフォント一覧を読めるブラウザか（Chrome / Edge） */
export function hasLocalFontAccess() {
  return typeof window.queryLocalFonts === 'function';
}

/** PCに入っているフォントの名前一覧（重複なし・並べ替え済み） */
export async function systemFontFamilies() {
  const list = await window.queryLocalFonts();
  return [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'ja'));
}
