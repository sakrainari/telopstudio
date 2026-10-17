// Optional development test runner. The app itself needs no Node.js or build.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.TELOP_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." +
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
        /\/$/,
        "/index.html",
      ),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(error ? "" : data);
  });
});
const cases = [];
const test = (name, run) => cases.push({ name, run });
const state = (page, expression) =>
  page.evaluate(async (expression) => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    return new Function("s", `return (${expression})`)(s);
  }, expression);

test("1: bulk textarea uses native Undo without reverting a card", async (page) => {
  await page.locator("#editor").fill("カード編集を保持");
  await page.locator(".bulk > summary").click();
  await page.locator("#script").fill("");
  await page.locator("#script").pressSequentially("bulk typing");
  await page.locator("#script").press("Control+z");
  assert.equal(await page.locator("#editor").inputValue(), "カード編集を保持");
  assert.notEqual(await page.locator("#script").inputValue(), "bulk typing");
  await page.locator("#script").press("Control+Shift+z");
  assert.equal(await page.locator("#editor").inputValue(), "カード編集を保持");
  assert.equal(await page.locator("#script").inputValue(), "bulk typing");
});

test("2: Undo and Redo synchronize the design role with the restored card", async (page) => {
  const original = await page.locator("#editorRole").inputValue();
  await page.locator("#editorRole").selectOption("B");
  await page.locator("#undo").click();
  assert.equal(await page.locator("#editorRole").inputValue(), original);
  assert.equal(await state(page, "s.state.role"), original);
  await page.locator("#redo").click();
  assert.equal(await page.locator("#editorRole").inputValue(), "B");
  assert.equal(await state(page, "s.state.role"), "B");
  await page.locator("#undo").click();
  const bSize = await state(page, "s.current().roles.B.size");
  await page.locator("#setting-size").fill("140");
  assert.equal(await state(page, "s.current().roles.B.size"), bSize);
  await page.locator("#undo").click();
  await page.locator("#redo").click();
  assert.equal(await state(page, "s.state.role"), original);
});

test("3: exported JSON larger than 20 MiB can be imported again", async (page) => {
  await page.evaluate(async () => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    const { parseBlock } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    s.current().rows = Array.from({ length: 300 }, () => {
      const r = parseBlock("あ".repeat(600));
      r.marks = Array.from(r.text, () => ({
        font: "Noto Sans JP",
        color: "#ff545f",
        color2: "#ffffff",
        size: 90,
        gradient: false,
      }));
      return r;
    });
    s.current().selected = s.current().rows[0].id;
  });
  const downloaded = page.waitForEvent("download");
  await page.locator("#jsonExport").click();
  const bytes = fs.readFileSync(await (await downloaded).path());
  const payload = bytes;
  assert(payload.length > 20 * 1024 * 1024);
  console.log(
    "  JSON round trip:",
    (payload.length / 1024 / 1024).toFixed(1),
    "MiB",
  );
  // Avoid rendering 180,000 glyphs: count import before queued work starts.
  await page.locator("#jsonFile").setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: payload,
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#toast").textContent.includes("読み込みました"),
    null,
    { timeout: 5000 },
  );
  assert.equal(await state(page, "s.library.projects.length"), 2);
  assert.equal(await state(page, "s.current().rows.length"), 300);
  assert.equal(await state(page, "s.row().marks[599].color"), "#ff545f");
  await page.locator("#jsonFile").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2,"projects":[{"rows":null}]}'),
  });
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("読み込めません"),
  );
  assert.equal(await state(page, "s.library.projects.length"), 2);
});

test("4: editing one of 300 cards retains unchanged thumbnails and yields to input", async (page) => {
  await page.evaluate(async () => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    const { parseBlock } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    s.current().rows = Array.from({ length: 300 }, (_, i) =>
      parseBlock("A: テロップ" + i),
    );
    s.current().selected = s.current().rows[0].id;
    s.state.role = "A";
    s.notify("refresh");
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#gallery img").length === 300,
    null,
    { timeout: 60000 },
  );
  const result = await page.evaluate(async () => {
    const images = [...document.querySelectorAll("#gallery img")];
    const before = images[0].src;
    let maxGap = 0,
      last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 16);
    const editor = document.querySelector("#editor");
    const start = performance.now();
    editor.value += "追記";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    while (
      document.querySelector("#gallery img")?.src === before &&
      performance.now() - start < 15000
    )
      await new Promise((r) => setTimeout(r, 30));
    clearInterval(interval);
    return {
      elapsed: performance.now() - start,
      maxGap,
      retained: images
        .slice(1)
        .filter(
          (img, i) => img === document.querySelectorAll("#gallery img")[i + 1],
        ).length,
    };
  });
  console.log("  300-card edit:", JSON.stringify(result));
  assert.equal(result.retained, 299);
  assert(result.maxGap < 1000, `main-thread gap ${result.maxGap}ms`);
  assert(result.elapsed < 2500, `edit update ${result.elapsed}ms`);
});

test("5: grapheme rendering and partial selection keep emoji and combining marks together", async (page) => {
  const actual = await page.evaluate(async () => {
    const { tokens, parseBlock, selectionRange, markRange } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    const { defaults } = await import(
      new URL("./js/presets.js", document.baseURI).href
    );
    const { layout, render } = await import(
      new URL("./js/renderer.js", document.baseURI).href
    );
    const r = parseBlock("A: 👨‍👩‍👧‍👦か\u3099🇯🇵👍🏽");
    const list = tokens(r, defaults().A);
    const range = selectionRange(r.text, 2, 3);
    markRange(r, range, { color: "#ff545f" });
    const measured = layout(r, defaults());
    const painted = [],
      original = CanvasRenderingContext2D.prototype.fillText;
    let output;
    try {
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        painted.push(text);
        return original.call(this, text, ...args);
      };
      output = render(r, defaults());
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
    const { updateText } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    updateText(r, r.text + "追加");
    const valid = (
      await import(new URL("./js/presets.js", document.baseURI).href)
    ).validateLibrary({
      version: 2,
      projects: [
        {
          id: "test",
          name: "test",
          roles: defaults(),
          rows: [r],
          selected: r.id,
        },
      ],
      sets: [],
      active: "test",
    });
    return {
      chars: list.map((t) => t.char),
      range,
      marks: r.marks.slice(0, 7).every((m) => m?.color === "#ff545f"),
      drawn: measured.lines[0].items.map((t) => t.char),
      painted,
      width: output.width,
      preserved: valid.projects[0].rows[0].marks
        .slice(0, 7)
        .every((m) => m?.color === "#ff545f"),
    };
  });
  assert.deepEqual(actual.chars, ["👨‍👩‍👧‍👦", "か\u3099", "🇯🇵", "👍🏽"]);
  assert.deepEqual(actual.range, { start: 0, end: 7 });
  assert(actual.marks);
  assert.deepEqual(actual.drawn, actual.chars);
  assert(
    actual.width > 24 &&
      actual.painted.every((char) => actual.chars.includes(char)),
  );
  assert(actual.preserved);
  await page.locator("#editor").fill("👨‍👩‍👧‍👦か\u3099");
  await page.locator("#editor").evaluate((e) => {
    e.focus();
    e.setSelectionRange(2, 3);
    e.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator("#editSelection").click();
  assert.match(await page.locator("#targetHint").innerText(), /選択した1文字/);
});

test("6: first enlarge action scales the effective automatic emphasis size", async (page) => {
  await page.locator("#editorRole").selectOption("A");
  await page.locator("#editor").fill("3つ");
  const size = () =>
    page.evaluate(async () => {
      const s = await import(new URL("./js/state.js", document.baseURI).href);
      const { tokens } = await import(
        new URL("./js/parser.js", document.baseURI).href
      );
      return tokens(s.row(), s.rowStyle(s.row()))[0].style.size;
    });
  const before = await size();
  await page.locator("#editor").evaluate((e) => {
    e.focus();
    e.setSelectionRange(0, 2);
    e.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator('[data-quick="large"]').click();
  assert(Math.abs((await size()) - before * 1.3) < 0.001);
  await page.locator('[data-quick="small"]').click();
  assert(Math.abs((await size()) - before) < 0.001);
});

test("7: rejected bulk add keeps the error notice and creates no history", async (page) => {
  await page.locator(".bulk > summary").click();
  await page
    .locator("#script")
    .fill(Array.from({ length: 296 }, () => "A: 追加").join("\n\n"));
  await page.locator("#importScript").click();
  assert.equal(await state(page, "s.current().rows.length"), 5);
  assert.match(await page.locator("#toast").innerText(), /300枚まで/);
  assert(await page.locator("#undo").isDisabled());
});

test("8: render jobs cancel on project change and role/mark changes invalidate thumbnails", async (page) => {
  await page.waitForFunction(
    () => document.querySelectorAll("#gallery img").length === 5,
  );
  await page.evaluate(async () => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    const { parseBlock } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    const p = s.current();
    p.rows = Array.from({ length: 300 }, (_, i) => parseBlock("A: 大量" + i));
    p.selected = p.rows[0].id;
    s.state.role = "A";
    s.notify("refresh");
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#gallery img").length > 10,
  );
  await page.evaluate(async () => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    const { parseBlock } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    const p = s.project("切り替え先", [
      parseBlock("A: 同じ話者1"),
      parseBlock("A: 同じ話者2"),
      parseBlock("B: 別の話者"),
    ]);
    s.library.projects.push(p);
    s.library.active = p.id;
    s.state.role = "A";
    s.notify("refresh");
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#gallery img").length === 3,
  );
  const before = await page
    .locator("#gallery img")
    .evaluateAll((images) => images.map((img) => img.src));
  await page.locator("#setting-color-palette").click();
  await page.locator('#paletteBasic [data-palette-color="#ff545f"]').click();
  await page.locator("#paletteDone").click();
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll("#gallery img")]
        .slice(0, 2)
        .every((img, i) => img.src !== before[i]),
    before,
  );
  assert.equal(
    await page.locator("#gallery img").nth(2).getAttribute("src"),
    before[2],
  );
  const markedBefore = await page
    .locator("#gallery img")
    .first()
    .getAttribute("src");
  await page.locator("#editor").evaluate((e) => {
    e.focus();
    e.setSelectionRange(0, 2);
    e.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator('[data-quick="blue"]').click();
  await page.waitForFunction(
    (old) => document.querySelector("#gallery img").src !== old,
    markedBefore,
  );
  await page.locator("#undo").click();
  await page.waitForFunction(
    (old) => document.querySelector("#gallery img").src === old,
    markedBefore,
  );
  assert.equal(await page.locator("#gallery .thumb").count(), 3);
});

test("9: all sample sets restore v1.4 appearance without changing new-project defaults", async (page) => {
  const differences = await page.evaluate(async () => {
    const { defaults, designSet, SET_NAMES } = await import(
      new URL("./js/presets.js", document.baseURI).href
    );
    const { parseBlock } = await import(
      new URL("./js/parser.js", document.baseURI).href
    );
    const { render, loadFonts } = await import(
      new URL("./js/renderer.js", document.baseURI).href
    );
    const expected = await (
      await fetch(
        new URL("./tests/fixtures/design-sets-v1.4.json", document.baseURI),
      )
    ).json();
    const sample = "サンプルのテロップ";
    await loadFonts(sample, [
      ...new Set(
        Object.values(expected).flatMap((roles) =>
          Object.values(roles).map((s) => s.font),
        ),
      ),
    ]);
    const differences = [];
    for (const key of Object.keys(SET_NAMES))
      for (const role of Object.keys(expected[key])) {
        const row = parseBlock(sample);
        row.role = role;
        if (
          render(row, designSet(key)).toDataURL() !==
          render(row, expected[key]).toDataURL()
        )
          differences.push(`${key}/${role}`);
      }
    const counts = Object.values(defaults()).map(
      (s) => s.edges.filter((e) => e.on).length,
    );
    return { differences, counts };
  });
  assert.deepEqual(differences.counts, [1, 1, 1, 0, 1]);
  assert.deepEqual(
    differences.differences,
    [],
    "sample pixels differ from v1.4",
  );
  await page.locator("#editorRole").selectOption("A");
  await page.locator("#editor").fill("サンプルのテロップ");
  await page.locator(".sample-panel > summary").click();
  await page.locator("#keepFont").uncheck();
  for (const key of ["standard", "explain", "gaming", "serious", "mystery"]) {
    const expected = await page.evaluate(async (key) => {
      const { render } = await import(
        new URL("./js/renderer.js", document.baseURI).href
      );
      const s = await import(new URL("./js/state.js", document.baseURI).href);
      const sets = await (
        await fetch(
          new URL("./tests/fixtures/design-sets-v1.4.json", document.baseURI),
        )
      ).json();
      return render({ ...s.row(), override: {} }, sets[key]).toDataURL();
    }, key);
    await page.locator("#designSet").selectOption(key);
    await page.locator("#applySet").click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#preview canvas")?.toDataURL() === expected,
      expected,
      { timeout: 5000 },
    );
  }
});

test("10: large JSON asks before reading and can still be intentionally restored", async (page) => {
  const payload = await page.evaluate(async () => {
    const s = await import(new URL("./js/state.js", document.baseURI).href);
    return JSON.stringify({
      version: 2,
      projects: [s.current()],
      sets: [],
      active: s.current().id,
    });
  });
  const choose = (size) =>
    page.evaluate(
      ({ size, payload }) => {
        const input = document.querySelector("#jsonFile");
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([payload], "backup.json", { type: "application/json" }),
        );
        input.files = transfer.files;
        const file = input.files[0],
          read = file.text.bind(file);
        window.__testJSONReads = 0;
        Object.defineProperty(file, "size", { value: size });
        Object.defineProperty(file, "text", {
          value: () => {
            window.__testJSONReads++;
            return read();
          },
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { size, payload },
    );
  let prompts = 0;
  const cancel = async (dialog) => {
    prompts++;
    assert.match(dialog.message(), /JSON/);
    await dialog.dismiss();
  };
  page.on("dialog", cancel);
  await choose(201 * 1024 * 1024);
  assert.equal(prompts, 1);
  assert.equal(await page.evaluate(() => window.__testJSONReads), 0);
  assert.equal(await state(page, "s.library.projects.length"), 1);
  page.off("dialog", cancel);
  const accept = async (dialog) => {
    prompts++;
    await dialog.accept();
  };
  page.on("dialog", accept);
  await choose(200 * 1024 * 1024);
  await page.waitForFunction(
    async () =>
      (await import(new URL("./js/state.js", document.baseURI).href)).library
        .projects.length === 2,
  );
  assert.equal(prompts, 1, "200 MiB is below the confirmation threshold");
  assert.equal(await page.evaluate(() => window.__testJSONReads), 1);
  await choose(201 * 1024 * 1024);
  await page.waitForFunction(
    async () =>
      (await import(new URL("./js/state.js", document.baseURI).href)).library
        .projects.length === 3,
  );
  assert.equal(prompts, 2);
  assert.equal(await page.evaluate(() => window.__testJSONReads), 1);
  page.off("dialog", accept);
});

test("11: real-screen references and guides persist without entering PNG or project data", async (page) => {
  assert.equal(
    await page
      .locator('[data-preview-mode="short"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  const original = await page
    .locator("#preview canvas")
    .evaluate((canvas) => canvas.toDataURL());
  const baselineDownload = page.waitForEvent("download");
  await page.locator("#png").click();
  const baselinePNG = fs.readFileSync(await (await baselineDownload).path());
  const project = await state(page, "JSON.stringify(s.current())");
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#20415c";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#a42d45";
    ctx.fillRect(920, 300, 160, 1200);
    ctx.fillRect(0, 1550, 1080, 370);
    ctx.fillStyle = "#fff";
    ctx.font = "50px sans-serif";
    ctx.fillText("REFERENCE TEST", 80, 160);
    return canvas.toDataURL();
  });
  await page.locator(".reference-tools > summary").first().click();
  await page.locator("#referenceFile").setInputFiles({
    name: "reference-screen.png",
    mimeType: "image/png",
    buffer: Buffer.from(data.split(",")[1], "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector(".reference-image")?.naturalWidth === 1080,
  );
  assert.match(
    await page.locator("#referenceName").innerText(),
    /reference-screen.png/,
  );
  assert.equal(
    await page
      .locator(".reference-image")
      .evaluate((image) => image.style.objectFit),
    "contain",
  );
  await page.locator("#referenceFit").selectOption("cover");
  await page.locator("#referenceOpacity").fill("40");
  assert.equal(
    await page
      .locator(".reference-image")
      .evaluate((image) => image.style.opacity),
    "0.4",
  );
  await page.locator(".reference-tools > summary").nth(1).click();
  await page.locator("#guide-top").fill("20");
  await page.locator("#guide-right").fill("25");
  assert.equal(
    await page
      .locator(".short-guide")
      .evaluate((el) => el.style.getPropertyValue("--guide-top")),
    "20%",
  );
  assert.equal(
    await page
      .locator("#preview canvas")
      .evaluate((canvas) => canvas.toDataURL()),
    original,
  );
  assert.equal(await state(page, "JSON.stringify(s.current())"), project);
  const downloaded = page.waitForEvent("download");
  await page.locator("#png").click();
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    hash(fs.readFileSync(await (await downloaded).path())),
    hash(baselinePNG),
    "reference does not alter the source PNG",
  );
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("telop-studio-reference", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("images");
          const read = tx.objectStore("images").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(Boolean(read.result?.blob));
          };
        };
      }),
  );
  if (process.env.TELOP_REFERENCE_SCREENSHOT)
    await page
      .locator("#shortStage")
      .screenshot({ path: process.env.TELOP_REFERENCE_SCREENSHOT });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector(".reference-image")?.naturalWidth === 1080,
  );
  assert.equal(
    await page
      .locator(".reference-image")
      .evaluate((image) => image.style.opacity),
    "0.4",
  );
  assert.equal(await page.locator("#guide-top").inputValue(), "20");
  await page.locator(".reference-tools > summary").first().click();
  await page.locator("#referenceVisible").uncheck();
  assert.equal(await page.locator(".reference-image").count(), 0);
  await page.locator("#referenceVisible").check();
  await page.locator("#editor").fill("変更後も画面画像は残る");
  await page.waitForFunction(() =>
    document.querySelector("#dimensions").textContent.includes("px"),
  );
  assert.equal(await page.locator(".reference-image").count(), 1);
  await page.locator("#referenceFile").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("読み込めません"),
  );
  assert.match(
    await page.locator("#referenceName").innerText(),
    /reference-screen.png/,
  );
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `reference layout ${width}`,
    );
  }
  await page.locator("#referenceRemove").click();
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("telop-studio-reference", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("images");
          const read = tx.objectStore("images").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(!read.result);
          };
        };
      }),
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".reference-image").count(), 0);
  assert(await page.locator("#referenceRemove").isDisabled());
});

test("12: portrait preview grows vertically and expands without duplicating or changing output", async (page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stage = () => page.locator("#shortStage").boundingBox();
  const initial = await stage();
  assert(
    initial.height >= 650,
    `normal portrait is only ${initial.height}px high`,
  );
  assert(
    initial.y + initial.height <= 1000,
    `normal frame fits vertically: ${JSON.stringify(initial)}`,
  );
  assert(Math.abs(initial.width / initial.height - 9 / 16) < 0.005);
  if (process.env.TELOP_NORMAL_SCREENSHOT)
    await page.screenshot({ path: process.env.TELOP_NORMAL_SCREENSHOT });
  const original = await page
    .locator("#preview canvas")
    .evaluate((canvas) => canvas.toDataURL());
  const baselineDownload = page.waitForEvent("download");
  await page.locator("#png").click();
  const baselinePNG = fs.readFileSync(await (await baselineDownload).path());
  await page
    .locator("#preview")
    .evaluate((node) => (window.__originalPreview = node));
  await page
    .locator("#shortTools")
    .evaluate((node) => (window.__originalShortTools = node));
  const project = await state(page, "JSON.stringify(s.current())");
  await page.locator("#expandPreview").click();
  await page.locator("#expandedPreviewDialog").waitFor({ state: "visible" });
  let large = await stage();
  assert(
    large.height > initial.height + 100,
    `expanded portrait should grow: ${JSON.stringify({ initial, large })}`,
  );
  assert(large.y >= 0 && large.y + large.height <= 1000);
  assert(Math.abs(large.width / large.height - 9 / 16) < 0.005);
  assert.equal(await page.locator("#preview").count(), 1);
  assert.equal(await page.locator("#shortTools").count(), 1);
  assert.equal(await page.locator("#copy").count(), 1);
  assert(
    await page.evaluate(
      () =>
        document.querySelector("#preview") === window.__originalPreview &&
        document.querySelector("#shortTools") === window.__originalShortTools,
    ),
  );
  await page.locator(".short-caption").focus();
  await page.keyboard.press("Shift+ArrowUp");
  assert.match(await page.locator("#shortPosition").innerText(), /67%/);
  await page.locator("#shortScale").fill("75");
  assert.equal(await page.locator("#shortScaleValue").innerText(), "75%");
  assert.equal(
    await page
      .locator("#preview canvas")
      .evaluate((canvas) => canvas.toDataURL()),
    original,
  );
  assert.equal(await state(page, "JSON.stringify(s.current())"), project);
  if (process.env.TELOP_LARGE_SCREENSHOT)
    await page.screenshot({ path: process.env.TELOP_LARGE_SCREENSHOT });
  await page.locator(".reference-tools > summary").first().click();
  await page.locator("#referenceFile").setInputFiles({
    name: "test-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(original.split(",")[1], "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector(".reference-image")?.naturalWidth > 0,
  );
  assert(
    await page
      .locator("#expandedPreviewDialog")
      .evaluate((dialog) => dialog.open),
  );
  const download = page.waitForEvent("download");
  await page.locator("#png").click();
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    hash(fs.readFileSync(await (await download).path())),
    hash(baselinePNG),
  );
  await page.keyboard.press("Escape");
  await page.locator("#expandedPreviewDialog").waitFor({ state: "hidden" });
  assert(
    await page
      .locator("#preview")
      .evaluate((node) => Boolean(node.closest(".center-panel"))),
  );
  assert(
    await page
      .locator("#shortTools")
      .evaluate((node) => Boolean(node.closest(".center-panel"))),
  );
  assert(
    await page
      .locator("#expandPreview")
      .evaluate((node) => document.activeElement === node),
  );
  assert.equal(await page.locator("#shortScale").inputValue(), "75");
  assert.equal(await page.locator(".reference-image").count(), 1);
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .locator(".center-panel")
      .evaluate((panel) => (panel.scrollTop = 0));
    const normal = await stage();
    assert(
      normal.y + normal.height <= 900,
      `normal frame fits vertically at ${width}`,
    );
    assert(
      Math.abs(normal.width / normal.height - 9 / 16) < 0.005,
      `normal aspect at ${width}`,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `normal width ${width}`,
    );
    await page.locator("#expandPreview").click();
    const expanded = await stage();
    assert(
      Math.abs(expanded.width / expanded.height - 9 / 16) < 0.005,
      `expanded aspect at ${width}`,
    );
    assert(
      expanded.y + expanded.height <= 900 &&
        expanded.x + expanded.width <= width,
      `expanded frame fits ${width}`,
    );
    await page.locator("#closeExpandedPreview").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#expandPreview").click();
  assert(
    !(await page
      .locator("#expandedControls")
      .evaluate((details) => details.open)),
  );
  const small = await stage();
  assert(Math.abs(small.width / small.height - 9 / 16) < 0.005);
  assert(small.y + small.height <= 844 && small.x + small.width <= 390);
  await page.locator("#expandedControls > summary").click();
  assert(await page.locator("#shortScale").isVisible());
  await page.locator("#closeExpandedPreview").click();
  await page.locator('[data-preview-mode="single"]').click();
  assert(await page.locator("#expandPreview").isHidden());
});

test("13: portrait and one live editor share space, including the expanded dialog", async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const bounds = (id) => page.locator(`#${id}`).boundingBox();
  const portrait = await bounds("shortStage");
  const editor = await bounds("editor");
  const tools = await bounds("shortTools");
  const copy = await bounds("copy");
  assert(
    editor.x > portrait.x + portrait.width,
    "editor sits beside the portrait",
  );
  assert(
    tools.y < portrait.y + 20,
    "placement controls start beside the portrait",
  );
  assert(
    editor.y + editor.height <= 1080 && copy.y + copy.height <= 1080,
    "typing and export are visible without scrolling the center panel",
  );
  for (const id of ["preview", "editor", "shortTools", "copy", "png"])
    assert.equal(await page.locator(`#${id}`).count(), 1, `one ${id}`);

  const outerScroll = await page
    .locator(".center-panel")
    .evaluate((node) => node.scrollTop);
  await page
    .locator(".reference-tools")
    .evaluateAll((items) => items.forEach((item) => (item.open = true)));
  await page
    .locator("#editorColumn")
    .evaluate((node) => (node.scrollTop = node.scrollHeight));
  assert(
    await page.locator("#editorColumn").evaluate((node) => node.scrollTop > 0),
    "long controls scroll independently",
  );
  assert.deepEqual(
    await bounds("shortStage"),
    portrait,
    "portrait stays visible while controls scroll",
  );
  assert.equal(
    await page.locator(".center-panel").evaluate((node) => node.scrollTop),
    outerScroll,
  );
  await page
    .locator(".reference-tools")
    .evaluateAll((items) => items.forEach((item) => (item.open = false)));
  await page.locator("#editorColumn").evaluate((node) => (node.scrollTop = 0));

  await page.locator("#editorRole").selectOption("A");
  await page.locator("#editor").fill("隣で入力して確認\n続けて文字を装飾");
  const selectTwo = async () => {
    await page.locator("#editor").evaluate((node) => {
      node.focus();
      node.setSelectionRange(0, 2);
      node.dispatchEvent(new Event("select", { bubbles: true }));
    });
  };
  await selectTwo();
  await page.locator('[data-quick="red"]').click();
  await page.locator('[data-quick="large"]').click();
  assert.equal(await state(page, "s.row().marks[0].color"), "#ff545f");
  assert(await state(page, "s.row().marks[0].size > s.rowStyle(s.row()).size"));
  assert.deepEqual(
    await page
      .locator("#editor")
      .evaluate((node) => [node.selectionStart, node.selectionEnd]),
    [0, 2],
  );
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  if (process.env.TELOP_SIDE_SCREENSHOT)
    await page.screenshot({ path: process.env.TELOP_SIDE_SCREENSHOT });

  await page
    .locator("#editor")
    .evaluate((node) => (window.__sameEditor = node));
  await page.locator("#expandPreview").click();
  assert(
    await page
      .locator("#editor")
      .evaluate(
        (node) =>
          node === window.__sameEditor &&
          Boolean(node.closest("#expandedPreviewDialog")),
      ),
  );
  const before = await page
    .locator("#shortStage canvas")
    .evaluate((node) => node.toDataURL());
  await page.locator("#editor").fill("拡大画面からも直接入力できる");
  await page.waitForFunction(
    (before) =>
      document.querySelector("#shortStage canvas").toDataURL() !== before,
    before,
  );
  await selectTwo();
  await page.locator('[data-quick="blue"]').click();
  assert.equal(await state(page, "s.row().marks[0].color"), "#70a5ff");
  await page.locator("#editSelection").click();
  await page.locator("#expandedPreviewDialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#scope").inputValue(), "selection");
  assert(
    await page
      .locator("#scope")
      .evaluate((node) => document.activeElement === node),
  );
  assert.equal(
    await page.locator("#editor").inputValue(),
    "拡大画面からも直接入力できる",
  );
  for (const [id, scope] of [
    ["editRole", "role"],
    ["editCard", "row"],
  ]) {
    await page.locator("#expandPreview").click();
    await page.locator(`#${id}`).click();
    await page.locator("#expandedPreviewDialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#scope").inputValue(), scope);
    assert(
      await page
        .locator("#scope")
        .evaluate((node) => document.activeElement === node),
    );
  }
  await page.locator('[data-preview-mode="single"]').click();
  assert(
    (await bounds("editor")).y > (await bounds("preview")).y,
    "single mode retains the stacked layout",
  );
  await page.locator('[data-preview-mode="short"]').click();
  assert((await bounds("editor")).x > (await bounds("shortStage")).x);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert(
    (await bounds("editor")).x > (await bounds("shortStage")).x,
    "ordinary desktop also shows editing beside the portrait",
  );
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      (await bounds("editorColumn")).y > (await bounds("previewColumn")).y,
      `narrow layout stacks at ${width}`,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `no horizontal overflow at ${width}`,
    );
  }
});

test("14: oversized original PNG is explained even when the portrait preview fits", async (page) => {
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  const source = await page
    .locator("#preview canvas")
    .evaluate((node) => ({ width: node.width, height: node.height }));
  assert(source.width > 1080, "fixture exceeds short-video width");
  const download = page.waitForEvent("download");
  await page.locator("#png").click();
  const png = fs.readFileSync(await (await download).path());
  assert.equal(
    png.readUInt32BE(16),
    source.width,
    "existing original export is preserved",
  );
  assert.equal(
    await page.locator("#exportSizeWarning").count(),
    1,
    "original-size warning exists",
  );
  assert(await page.locator("#exportSizeWarning").isVisible());
  assert.match(
    await page.locator("#exportSizeWarning").innerText(),
    /1080|原寸/,
  );
  assert.match(
    await page.locator("#exportSizeWarning").innerText(),
    new RegExp(String(source.width)),
  );
  await page.locator("#shortScale").fill("50");
  assert(
    await page.locator("#exportSizeWarning").isVisible(),
    "display scaling cannot hide the warning",
  );
  await page.locator('[data-preview-mode="single"]').click();
  assert(
    await page.locator("#exportSizeWarning").isVisible(),
    "single mode also explains the output",
  );
  await page.locator("#editor").fill("短い文");
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  assert(await page.locator("#exportSizeWarning").isHidden());
  await page.locator("#editor").fill(Array(20).fill("あ").join("\n"));
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  assert(await page.locator("#exportSizeWarning").isVisible());
  assert.match(await page.locator("#exportSizeWarning").innerText(), /1920/);
});

test("15: ZIP export works with every external request blocked", async (page) => {
  const origin = new URL(page.url()).origin;
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  assert.equal(
    await page.evaluate(() => typeof window.JSZip),
    "function",
    "ZIP dependency is available offline",
  );
  const download = page.waitForEvent("download");
  await page.locator("#zip").click();
  const bytes = fs.readFileSync(await (await download).path());
  const entries = await page.evaluate(async (bytes) => {
    const zip = await window.JSZip.loadAsync(new Uint8Array(bytes));
    return Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => {
          const data = await entry.async("uint8array");
          return { name: entry.name, signature: Array.from(data.slice(0, 8)) };
        }),
    );
  }, Array.from(bytes));
  assert.equal(entries.length, 5);
  for (const entry of entries) {
    assert.match(entry.name, /^\d{3}_.*\.png$/);
    assert.deepEqual(entry.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("16: Source Han Heavy loads lazily from a compact WOFF2", async (page) => {
  const file = path.join(root, "assets/fonts/SourceHanSans-Heavy.woff2");
  assert(fs.existsSync(file), "compressed font is bundled");
  assert(
    fs.statSync(file).size < 17644704 * 0.8,
    "font saves at least 20% against the original OTF",
  );
  const requests = [];
  page.on("request", (request) => {
    if (/SourceHanSans-Heavy/.test(request.url())) requests.push(request.url());
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    requests.length,
    0,
    "unused bundled font does not load at startup",
  );
  await page.locator("#setting-font").selectOption("Source Han Sans Heavy");
  await page.waitForFunction(() => !document.querySelector("#copy").disabled);
  assert(requests.some((url) => url.includes("SourceHanSans-Heavy.woff2")));
  assert(!requests.some((url) => url.includes(".otf")));
  assert(
    await page.evaluate(() =>
      document.fonts.check(
        '900 40px "Source Han Sans Heavy"',
        "源ノ角ゴシック",
      ),
    ),
  );
});

test("17: project selector remains readable on narrow windows", async (page) => {
  for (const width of [740, 600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const field = await page.locator("#projects").boundingBox();
    assert(
      field.width >= 170,
      `project name has room at ${width}: ${field.width}px`,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `no horizontal overflow at ${width}`,
    );
  }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TELOP_CHROME_PATH
      ? { executablePath: process.env.TELOP_CHROME_PATH }
      : {}),
  });
  let failures = 0;
  try {
    for (const item of cases.filter(
      (item) =>
        !process.env.TELOP_TEST_FILTER ||
        item.name.match(process.env.TELOP_TEST_FILTER),
    )) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      try {
        await page.goto(
          process.env.TELOP_TEST_URL ||
            `http://127.0.0.1:${server.address().port}/`,
          {
            waitUntil: "networkidle",
          },
        );
        await page.waitForSelector("#preview canvas");
        await item.run(page);
        assert.deepEqual(runtimeErrors, [], "no runtime errors");
        console.log("PASS", item.name);
      } catch (error) {
        failures++;
        console.error("FAIL", item.name, "\n ", error.message);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
