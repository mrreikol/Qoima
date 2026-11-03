// Prepared only: no network or mutations without --run-remote-stock-fixtures.
import { randomUUID } from "node:crypto";
import { emitKeypressEvents } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
class VerificationFailure extends Error {}
function ensure(value, label) {
  if (!value) throw new VerificationFailure(label);
}
function ok(response, label) {
  ensure(!response.error, label);
  return response.data;
}
function hiddenInput(label) {
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const wasRaw = input.isRaw;
    emitKeypressEvents(input);
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    function finish(error) {
      input.removeListener("keypress", onKey);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }
    function onKey(text, key) {
      if (
        (key?.ctrl && ["c", "d"].includes(key.name)) ||
        key?.name === "escape"
      )
        finish(new VerificationFailure("Authentication canceled locally."));
      else if (key?.name === "return") finish();
      else if (key?.name === "backspace") value = value.slice(0, -1);
      else if (text && !key?.ctrl && !key?.meta) value += text;
    }
    input.on("keypress", onKey);
  });
}

async function run() {
  ensure(
    process.stdin.isTTY && process.stdout.isTTY,
    "Use an interactive terminal. Never pipe passwords or pass tokens as arguments.",
  );
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "VITE_");
  const url = env.VITE_SUPABASE_URL?.trim(),
    key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  ensure(
    url && key?.startsWith("sb_publishable_"),
    "Local public Supabase configuration is required. Values are never printed.",
  );
  ensure(
    ["http:", "https:"].includes(new URL(url).protocol),
    "Supabase URL validation failed.",
  );
  const { createClient } = await import("@supabase/supabase-js");
  const report = console.log.bind(console),
    originalConsole = { ...console };
  for (const method of ["log", "warn", "error", "info", "debug"])
    console[method] = () => {};
  const clients = [];
  const runId = `STK-${randomUUID()}`;
  const fixtures = [];
  let ownerId;
  const manifestPath = path.join(
    root,
    "artifacts",
    "stock-verification",
    `${runId}.local`,
  );
  async function recordManifest() {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          runId,
          fixtures,
          notes:
            "Isolated fixture IDs only. No credentials. Products are archived at completion; movements and operation records are retained.",
        },
        null,
        2,
      ),
    );
  }
  async function makeProduct(suffix, quantity) {
    const product = ok(
      await clients[0].rpc("create_product", {
        p_name: `${runId}-${suffix}`,
        p_sku: `${runId}-${suffix}`,
        p_initial_quantity: quantity,
      }),
      "Fixture product creation failed.",
    );
    ensure(
      product?.id &&
        product.sku === `${runId}-${suffix}` &&
        product.user_id === ownerId,
      "Fixture identity verification failed; no existing product will be used as a test target.",
    );
    fixtures.push({ productId: product.id, sku: `${runId}-${suffix}` });
    await recordManifest();
    return product.id;
  }
  async function balance(id) {
    return ok(
      await clients[0]
        .from("products")
        .select("quantity")
        .eq("id", id)
        .single(),
      "Balance read-back failed.",
    ).quantity;
  }
  async function history(id) {
    return ok(
      await clients[0]
        .from("stock_movements")
        .select("*")
        .eq("product_id", id)
        .order("id"),
      "History read-back failed.",
    );
  }
  async function operations(id, operationId) {
    return ok(
      await clients[0]
        .from("stock_operations")
        .select("operation_id,movement_id")
        .eq("product_id", id)
        .eq("operation_id", operationId),
      "Operation read-back failed.",
    );
  }
  const change = (client, productId, operationId, type, quantity) =>
    client
      .rpc("change_stock", {
        p_product_id: productId,
        p_operation_id: operationId,
        p_type: type,
        p_quantity: quantity,
        p_note: "Isolated concurrency verification",
      })
      .abortSignal(AbortSignal.timeout(30000));
  try {
    report(
      "Explicit opt-in stock concurrency run. Only newly created fixture products will be changed. No migrations or users will be created.",
    );
    const email = (
      await hiddenInput("Existing test account email (hidden): ")
    ).trim();
    const password = await hiddenInput("Password (hidden): ");
    let userId;
    for (let i = 0; i < 2; i++) {
      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          debug: false,
        },
      });
      clients.push(client);
      const response = await client.auth.signInWithPassword({
        email,
        password,
      });
      ensure(
        !response.error && response.data.session,
        "Test account sign-in failed.",
      );
      const claims = JSON.parse(
        Buffer.from(
          response.data.session.access_token.split(".")[1],
          "base64url",
        ).toString(),
      );
      const verified = await client.auth.getUser();
      ensure(
        !verified.error &&
          verified.data.user &&
          !verified.data.user.is_anonymous &&
          claims.role === "authenticated",
        "An ordinary authenticated session is required.",
      );
      if (userId)
        ensure(
          userId === verified.data.user.id,
          "Both independent sessions must belong to the same test account.",
        );
      userId = verified.data.user.id;
    }
    const [a, b] = clients;
    ownerId = userId;
    const outProduct = await makeProduct("OUT", 5);
    const outIds = [randomUUID(), randomUUID()];
    const out = await Promise.all([
      change(a, outProduct, outIds[0], "OUT", 4),
      change(b, outProduct, outIds[1], "OUT", 4),
    ]);
    ensure(
      out.filter((result) => !result.error).length === 1 &&
        out.filter((result) => result.error?.code === "P1002").length === 1,
      "Concurrent OUT requests did not produce exactly one success and one insufficient-stock failure.",
    );
    const outHistory = await history(outProduct);
    ensure(
      (await balance(outProduct)) === 1 &&
        outHistory.length === 2 &&
        outHistory.filter(
          (row) =>
            row.type === "OUT" &&
            row.quantity_change === -4 &&
            row.quantity_after === 1,
        ).length === 1,
      "Concurrent OUT balance/history assertion failed.",
    );
    report(
      "PASS: two concurrent OUT requests cannot oversell; final balance and history are correct.",
    );

    const duplicateProduct = await makeProduct("DUP", 0),
      duplicateId = randomUUID();
    const duplicate = await Promise.all([
      change(a, duplicateProduct, duplicateId, "IN", 3),
      change(b, duplicateProduct, duplicateId, "IN", 3),
    ]);
    ensure(
      duplicate.every((result) => !result.error) &&
        duplicate[0].data.id === duplicate[1].data.id,
      "Concurrent identical retries did not return the same receipt.",
    );
    const replay = ok(
      await change(a, duplicateProduct, duplicateId, "IN", 3),
      "Sequential retry after concurrent duplicate failed.",
    );
    ensure(
      replay.id === duplicate[0].data.id &&
        (await balance(duplicateProduct)) === 3 &&
        (await history(duplicateProduct)).length === 1 &&
        (await operations(duplicateProduct, duplicateId)).length === 1,
      "Duplicate UUID applied stock more than once.",
    );
    report(
      "PASS: simultaneous identical UUID requests and a later retry create exactly one movement.",
    );

    const conflictProduct = await makeProduct("CONFLICT", 0),
      conflictId = randomUUID();
    const conflict = await Promise.all([
      change(a, conflictProduct, conflictId, "IN", 2),
      change(b, conflictProduct, conflictId, "IN", 3),
    ]);
    ensure(
      conflict.filter((result) => !result.error).length === 1 &&
        conflict.filter((result) => result.error?.code === "P1004").length ===
          1,
      "Concurrent UUID input conflict was not rejected.",
    );
    const winner = conflict.find((result) => !result.error).data;
    ensure(
      (await balance(conflictProduct)) === winner.quantity_after &&
        (await history(conflictProduct)).length === 1 &&
        (await operations(conflictProduct, conflictId)).length === 1,
      "Conflicting UUID reuse changed stock twice.",
    );
    report(
      "PASS: concurrent reuse with different inputs rejects the conflicting request.",
    );

    // Different products do not share a row lock: the unique per-user UUID must arbitrate.
    const beforeA = await balance(duplicateProduct),
      beforeB = await balance(conflictProduct);
    const historyBefore =
      (await history(duplicateProduct)).length +
      (await history(conflictProduct)).length;
    const crossId = randomUUID();
    const cross = await Promise.all([
      change(a, duplicateProduct, crossId, "IN", 2),
      change(b, conflictProduct, crossId, "IN", 3),
    ]);
    ensure(
      cross.filter((result) => !result.error).length === 1 &&
        cross.filter((result) => result.error?.code === "P1004").length === 1,
      "Cross-product concurrent UUID reuse was not serialized.",
    );
    ensure(
      (await balance(duplicateProduct)) ===
        beforeA + (cross[0].error ? 0 : 2) &&
        (await balance(conflictProduct)) === beforeB + (cross[1].error ? 0 : 3),
      "Cross-product conflict changed the wrong balance.",
    );
    ensure(
      (await history(duplicateProduct)).length +
        (await history(conflictProduct)).length ===
        historyBefore + 1,
      "Cross-product UUID produced duplicate movements.",
    );
    report(
      "PASS: a UUID reused simultaneously across products is applied once.",
    );
    report(
      "Real concurrent HTTP requests completed. Controlled database lock-wait instrumentation is a separate manual check.",
    );
  } finally {
    let incomplete = false;
    for (const fixture of fixtures) {
      try {
        const response = await clients[0]
          .from("products")
          .update({ is_archived: true })
          .eq("id", fixture.productId)
          .select("id");
        if (response.error || response.data?.length !== 1) incomplete = true;
      } catch {
        incomplete = true;
      }
    }
    for (const client of clients) {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        /* Never print SDK credentials or responses. */
      }
    }
    for (const method of ["log", "warn", "error", "info", "debug"])
      console[method] = originalConsole[method];
    if (fixtures.length)
      report(
        incomplete
          ? "NOTICE: fixture archival incomplete. Inspect the local manifest."
          : "Fixture products archived; their history and operation records are retained.",
      );
    if (fixtures.length)
      report(`Fixture manifest: artifacts/stock-verification/${runId}.local`);
  }
}
if (process.argv.includes("--run-remote-stock-fixtures")) {
  run().catch((error) => {
    console.error(
      error instanceof VerificationFailure
        ? `FAIL: ${error.message}`
        : "FAIL: unexpected error; details omitted to protect credentials.",
    );
    process.exitCode = 1;
  });
} else {
  console.log(
    "Remote verification is disabled. No environment was loaded and no network requests or mutations were made.",
  );
  console.log(
    "After separate explicit authorization: node scripts/verify-stock-concurrency.mjs --run-remote-stock-fixtures",
  );
}
