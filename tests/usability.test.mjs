import assert from "node:assert/strict";
import test from "node:test";
import { downloadInventoryCsv } from "../src/data/downloadCsv.js";
import { trapDialogFocus } from "../src/components/dialogFocus.js";

test("CSV download requests the documented file/type, preserves BOM and releases browser resources", async () => {
  const events = [];
  let blob, link, release;
  const browser = {
    Blob,
    URL: {
      createObjectURL(value) {
        blob = value;
        return "blob:local-test";
      },
      revokeObjectURL(url) {
        events.push(["revoke", url]);
      },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "a");
        link = {
          click() {
            events.push("click");
          },
          remove() {
            events.push("remove");
          },
        };
        return link;
      },
      body: {
        appendChild(value) {
          assert.equal(value, link);
          events.push("append");
        },
      },
    },
    setTimeout(callback, delay) {
      assert.equal(delay, 30000);
      release = callback;
    },
  };
  downloadInventoryCsv('\ufeffSKU,Name\r\n"A","Café"\r\n', browser);
  assert.match(link.download, /^qoima-products-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(link.href, "blob:local-test");
  assert.equal(blob.type, "text/csv;charset=utf-8");
  assert.deepEqual(
    [...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)],
    [239, 187, 191],
  );
  assert.deepEqual(events, ["append", "click", "remove"]);
  release();
  assert.deepEqual(events.at(-1), ["revoke", "blob:local-test"]);
  browser.document.createElement = () => ({
    click() {
      throw new Error("Download blocked");
    },
    remove() {
      events.push("removed after error");
    },
  });
  browser.document.body.appendChild = () => {};
  assert.throws(
    () => downloadInventoryCsv("test", browser),
    /Download blocked/,
  );
  assert.equal(events.at(-1), "removed after error");
  release();
  assert.deepEqual(events.at(-1), ["revoke", "blob:local-test"]);
});

test("dialog Tab and reverse Tab wrap visible enabled controls and tolerate a busy dialog", () => {
  const previous = globalThis.document;
  const focused = [];
  const control = (name, disabled = false, visible = true) => ({
    tabIndex: 0,
    matches: () => disabled,
    getClientRects: () => (visible ? [{}] : []),
    focus: () => focused.push(name),
  });
  const first = control("first"),
    last = control("last");
  const controls = [
    first,
    control("disabled", true),
    control("hidden", false, false),
    last,
  ];
  let prevented = 0;
  const event = {
    key: "Tab",
    shiftKey: false,
    currentTarget: { querySelectorAll: () => controls },
    preventDefault: () => prevented++,
  };
  try {
    globalThis.document = { activeElement: last };
    trapDialogFocus(event);
    assert.deepEqual(focused, ["first"]);
    globalThis.document.activeElement = first;
    trapDialogFocus({ ...event, shiftKey: true });
    assert.deepEqual(focused, ["first", "last"]);
    trapDialogFocus({
      ...event,
      currentTarget: { querySelectorAll: () => [] },
    });
    assert.equal(prevented, 3);
    trapDialogFocus({ ...event, key: "Escape" });
    assert.equal(
      prevented,
      3,
      "Escape remains the native modal's cancel responsibility",
    );
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
