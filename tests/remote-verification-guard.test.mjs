import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const script of [
  "verify-authorization.mjs",
  "verify-stock-concurrency.mjs",
]) {
  test(`prepared remote runner ${script} defaults to a no-network, no-mutation mode`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(`../scripts/${script}`, import.meta.url))],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Remote verification is disabled/);
    assert.match(
      result.stdout,
      /No environment was loaded and no network requests or mutations were made/,
    );
    assert.doesNotMatch(result.stdout, /PASS:/);
  });
}
