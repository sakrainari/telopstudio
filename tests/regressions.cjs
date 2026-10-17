// Optional development test runner. The app itself needs no Node.js or build.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.TELOP_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".otf": "font/otf",
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
