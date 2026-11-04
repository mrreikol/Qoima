import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const preferenceKey = "qoima.appearance";
const recoveryKey = "stockmate:pending-stock:fixture-account";
const source = await readFile(
  new URL("../public/appearance.js", import.meta.url),
  "utf8",
);

// Run the actual pre-paint browser script in an isolated DOM/storage/media
// fixture. No real browser preference, authentication or inventory is touched.
function browserFixture({
  preference,
  osDark = false,
  readFails = false,
  writeFails = false,
  storageAccessFails = false,
  mediaAvailable = true,
  entries,
} = {}) {
  const values = entries || new Map([[recoveryKey, "original-operation-uuid"]]);
  if (preference !== undefined) values.set(preferenceKey, preference);
  const reads = [];
  const writes = [];
  const removals = [];
  let clears = 0;
  const storage = {
    getItem(key) {
      reads.push(key);
      if (readFails) throw new Error("Storage is unavailable");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      if (writeFails) throw new Error("Storage is unavailable");
      values.set(key, value);
    },
    removeItem(key) {
      removals.push(key);
      values.delete(key);
    },
    clear() {
      clears++;
      values.clear();
    },
  };
  const attributes = new Map();
  const root = {
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name === "data-theme") this.dataset.theme = value;
    },
    getAttribute(name) {
      return name === "data-theme" ? this.dataset.theme : attributes.get(name);
    },
  };
  const themeMeta = {
    setAttribute(name, value) { this[name] = value; },
  };
  const mediaListeners = new Set();
  const media = {
    matches: osDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener(name, fn) {
      assert.equal(name, "change");
      mediaListeners.add(fn);
    },
    removeEventListener(name, fn) {
      assert.equal(name, "change");
      mediaListeners.delete(fn);
    },
    addListener(fn) { mediaListeners.add(fn); },
    removeListener(fn) { mediaListeners.delete(fn); },
  };
  const events = new Map();
  const document = {
    documentElement: root,
    querySelector(selector) {
      return selector.includes("theme-color") ? themeMeta : null;
    },
  };
  const window = {
    document,
    localStorage: storage,
    addEventListener(name, fn) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(fn);
    },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); },
  };
  if (storageAccessFails) Object.defineProperty(window, "localStorage", {
    get() { throw new Error("Browser storage access is blocked"); },
  });
  if (mediaAvailable) window.matchMedia = (query) => {
    assert.equal(query, "(prefers-color-scheme: dark)");
    return media;
  };
  const context = vm.createContext({ window, document, console });
  vm.runInContext(source, context, { filename: "public/appearance.js" });
  const controller = window.QoimaAppearance;
  assert.ok(controller, "The blocking script initializes the appearance controller");
  return {
    controller,
    root,
    values,
    reads,
    writes,
    removals,
    get clears() { return clears; },
    setOs(dark) {
      media.matches = dark;
      for (const fn of mediaListeners) fn({ matches: dark, media: media.media });
    },
    storageEvent(value, key = preferenceKey) {
      for (const fn of events.get("storage") || [])
        fn({ key, newValue: value, storageArea: storage });
    },
    rerunBootstrap() {
      vm.runInContext(source, context, { filename: "public/appearance.js" });
      return window.QoimaAppearance;
    },
  };
}

function assertApplied(fixture, preference, resolvedTheme) {
  assert.equal(fixture.controller.getSnapshot().preference, preference);
  assert.equal(fixture.controller.getSnapshot().resolvedTheme, resolvedTheme);
  assert.equal(fixture.root.dataset.theme, resolvedTheme);
  assert.equal(fixture.root.style.colorScheme, resolvedTheme);
}

test("appearance defaults to System and resolves the OS before React starts", () => {
  for (const dark of [false, true]) {
    const fixture = browserFixture({ osDark: dark });
    assertApplied(fixture, "system", dark ? "dark" : "light");
    assert.equal(fixture.values.has(preferenceKey), false);
    assert.deepEqual(fixture.writes, []);
  }
});

test("saved Light, Dark and System restore the preference instead of only a resolved theme", () => {
  for (const preference of ["light", "dark", "system"])
    for (const osDark of [false, true]) {
      const fixture = browserFixture({ preference, osDark });
      assertApplied(fixture, preference,
        preference === "system" ? (osDark ? "dark" : "light") : preference);
      assert.equal(fixture.values.get(preferenceKey), preference);
      assert.deepEqual(fixture.writes, []);
    }
});

test("System changes immediately with the OS without rewriting the saved preference", () => {
  const fixture = browserFixture({ preference: "system" });
  let updates = 0;
  fixture.controller.subscribe(() => updates++);
  fixture.setOs(true);
  assertApplied(fixture, "system", "dark");
  fixture.setOs(false);
  assertApplied(fixture, "system", "light");
  assert.equal(updates, 2);
  assert.equal(fixture.values.get(preferenceKey), "system");
  assert.deepEqual(fixture.writes, []);
});

test("explicit Light/Dark choices override subsequent OS changes", () => {
  for (const preference of ["light", "dark"]) {
    const fixture = browserFixture({ preference });
    const before = fixture.controller.getSnapshot();
    let updates = 0;
    fixture.controller.subscribe(() => updates++);
    fixture.setOs(true);
    fixture.setOs(false);
    assertApplied(fixture, preference, preference);
    assert.equal(fixture.controller.getSnapshot(), before);
    assert.equal(updates, 0);
  }
});

test("selecting each preference persists its literal value and survives a new page load", () => {
  const fixture = browserFixture({ osDark: true });
  for (const preference of ["light", "dark", "system"]) {
    fixture.controller.setPreference(preference);
    assert.equal(fixture.values.get(preferenceKey), preference);
    const reloaded = browserFixture({ entries: fixture.values, osDark: false });
    assertApplied(reloaded, preference, preference === "system" ? "light" : preference);
  }
  assert.deepEqual(fixture.writes.map(([key]) => key),
    [preferenceKey, preferenceKey, preferenceKey]);
  assert.equal(fixture.values.get(recoveryKey), "original-operation-uuid");
  assert.deepEqual(fixture.removals, []);
  assert.equal(fixture.clears, 0);
});

test("corrupt preference values fall back to System without clearing browser data", () => {
  for (const preference of ["", "DARK", "null", '{"theme":"dark"}', "unexpected"]) {
    const fixture = browserFixture({ preference, osDark: true });
    assertApplied(fixture, "system", "dark");
    assert.equal(fixture.values.get(preferenceKey), preference);
    assert.equal(fixture.values.get(recoveryKey), "original-operation-uuid");
    assert.deepEqual(fixture.removals, []);
    assert.equal(fixture.clears, 0);
  }
});

test("unavailable storage does not prevent initial System rendering or a live selection", () => {
  const fixture = browserFixture({ readFails: true, writeFails: true, osDark: true });
  assertApplied(fixture, "system", "dark");
  fixture.controller.setPreference("light");
  assertApplied(fixture, "light", "light");
  assert.equal(fixture.controller.getSnapshot().storageAvailable, false);
  assert.equal(fixture.values.get(recoveryKey), "original-operation-uuid");
  assert.deepEqual(fixture.removals, []);
  assert.equal(fixture.clears, 0);
});

test("write failures keep the live choice while accurately reporting that it was not saved", () => {
  const fixture = browserFixture({ preference: "dark", writeFails: true });
  fixture.controller.setPreference("light");
  assertApplied(fixture, "light", "light");
  assert.equal(fixture.controller.getSnapshot().storageAvailable, false);
  assert.equal(fixture.values.get(preferenceKey), "dark");
  assert.ok(fixture.reads.every((key) => key === preferenceKey));
  assert.ok(fixture.writes.every(([key]) => key === preferenceKey));
});

test("a SecurityError-style localStorage getter cannot crash theme initialization", () => {
  const fixture = browserFixture({ storageAccessFails: true, osDark: true });
  assertApplied(fixture, "system", "dark");
  fixture.controller.setPreference("light");
  assertApplied(fixture, "light", "light");
  assert.equal(fixture.controller.getSnapshot().storageAvailable, false);
  assert.equal(fixture.values.get(recoveryKey), "original-operation-uuid");
});

test("missing media-query support resolves System safely and still allows explicit Dark", () => {
  const fixture = browserFixture({ mediaAvailable: false });
  assertApplied(fixture, "system", "light");
  fixture.controller.setPreference("dark");
  assertApplied(fixture, "dark", "dark");
});

test("appearance subscriptions have stable snapshots, clean up and bootstrap only once", () => {
  const fixture = browserFixture();
  const initial = fixture.controller.getSnapshot();
  assert.equal(fixture.controller.getSnapshot(), initial);
  let updates = 0;
  const unsubscribe = fixture.controller.subscribe(() => updates++);
  fixture.controller.setPreference("dark");
  assert.equal(updates, 1);
  unsubscribe();
  fixture.controller.setPreference("light");
  assert.equal(updates, 1);
  assert.equal(fixture.rerunBootstrap(), fixture.controller);
});

test("cross-tab appearance changes apply without reacting to unrelated account/recovery storage", () => {
  const fixture = browserFixture({ osDark: true });
  fixture.storageEvent("light");
  assertApplied(fixture, "light", "light");
  fixture.storageEvent("dark", recoveryKey);
  assertApplied(fixture, "light", "light");
  fixture.storageEvent("system");
  assertApplied(fixture, "system", "dark");
  fixture.storageEvent("corrupt");
  assertApplied(fixture, "system", "dark");
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.values.get(recoveryKey), "original-operation-uuid");
});

test("the actual HTML uses a blocking appearance bootstrap before body and the application module", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const canvas = html.match(/<link rel="stylesheet" href="(?:\/|%BASE_URL%)appearance-bootstrap\.css"\s*\/>/);
  const bootstrap = html.match(/<script\b[^>]*src="(?:\/|%BASE_URL%)appearance\.js"[^>]*><\/script>/);
  assert.ok(canvas, "Load the canvas colors from a same-origin stylesheet");
  assert.ok(bootstrap, "Load the appearance initializer synchronously in the head");
  assert.ok(canvas.index < bootstrap.index);
  assert.doesNotMatch(html, /<style\b/);
  assert.doesNotMatch(bootstrap[0], /\b(?:async|defer)\b|type="module"/);
  assert.ok(bootstrap.index < html.indexOf("<body"));
  assert.ok(bootstrap.index < html.indexOf('src="/src/main.jsx"'));
});
