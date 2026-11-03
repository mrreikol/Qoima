// Prepared only. No remote access occurs without the explicit --run-remote-fixtures flag.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

class VerificationFailure extends Error {}
function ensure(condition, label) {
  if (!condition) throw new VerificationFailure(label);
}
function ok(response, label) {
  ensure(!response.error, label);
  return response.data;
}
function denied(response, code, label) {
  ensure(response.error?.code === code, label);
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
    "Use an interactive local terminal. Do not pipe credentials or pass them as command-line arguments.",
  );
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "VITE_");
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  ensure(
    url && key?.startsWith("sb_publishable_"),
    "Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY locally. Values are never printed.",
  );
  let validUrl = false;
  try {
    validUrl = ["https:", "http:"].includes(new URL(url).protocol);
  } catch {
    /* Report validation only. */
  }
  ensure(validUrl, "VITE_SUPABASE_URL did not pass URL validation.");
  const { createClient } = await import("@supabase/supabase-js");
  const report = console.log.bind(console);
  const originalConsole = { ...console };
  // Never expose SDK responses, URLs, tokens, raw exceptions, or assertion diffs.
  for (const method of ["log", "error", "warn", "info", "debug"])
    console[method] = () => {};
  const clients = [];
  const runId = `AUTHZ-${randomUUID()}`;
  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    fixtures: [],
    notes:
      "Test fixtures only. No credentials or tokens. Products are archived during cleanup; categories/history remain.",
  };
  const manifestPath = path.join(
    root,
    "artifacts",
    "authorization",
    `${runId}.local`,
  );
  async function saveManifest() {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
  async function track(account, table, row) {
    if (row?.id) {
      manifest.fixtures.push({ account, table, id: row.id });
      await saveManifest();
    }
  }
  async function product(account, id) {
    return ok(
      await account.client.from("products").select("*").eq("id", id).single(),
      "Owner product read-back failed.",
    );
  }
  async function category(account, id) {
    return ok(
      await account.client.from("categories").select("*").eq("id", id).single(),
      "Owner category read-back failed.",
    );
  }
  async function movements(account, id) {
    return ok(
      await account.client
        .from("stock_movements")
        .select("*")
        .eq("product_id", id)
        .order("id"),
      "Owner movement read-back failed.",
    );
  }
  async function snapshot(account) {
    return {
      product: await product(account, account.product.id),
      category: await category(account, account.category.id),
      movements: await movements(account, account.product.id),
    };
  }
  try {
    report(
      "Explicit remote fixture run. Only isolated test rows will be mutation targets. No users or migrations will be created.",
    );
    for (const label of ["A", "B"]) {
      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          debug: false,
        },
      });
      clients.push({ client, label });
      const email = (
        await hiddenInput(`Account ${label} email (hidden): `)
      ).trim();
      const password = await hiddenInput(
        `Account ${label} password (hidden): `,
      );
      const response = await client.auth.signInWithPassword({
        email,
        password,
      });
      ensure(
        !response.error && response.data.session,
        `Account ${label}: sign-in failed. Check credentials, email confirmation, and project settings locally.`,
      );
      const claims = JSON.parse(
        Buffer.from(
          response.data.session.access_token.split(".")[1],
          "base64url",
        ).toString(),
      );
      ensure(
        claims.role === "authenticated",
        "The session must use the ordinary authenticated database role.",
      );
      const verified = await client.auth.getUser();
      ensure(
        !verified.error &&
          verified.data.user &&
          !verified.data.user.is_anonymous,
        `Account ${label}: server session verification failed.`,
      );
      clients.at(-1).userId = verified.data.user.id;
    }
    const [a, b] = clients;
    ensure(
      a.userId !== b.userId,
      "A and B must be different existing authenticated users.",
    );
    await saveManifest();
    for (const account of clients) {
      const categoryRow = ok(
        await account.client
          .from("categories")
          .insert({ name: `${runId}-${account.label}` })
          .select("*")
          .single(),
        "Own fixture category creation failed.",
      );
      account.category = categoryRow;
      await track(account.label, "categories", categoryRow);
      ensure(
        categoryRow.user_id === account.userId,
        "Category owner was not derived from the signed-in account.",
      );
      const row = ok(
        await account.client.rpc("create_product", {
          p_name: `${runId}-${account.label}`,
          p_sku: `${runId}-${account.label}`,
          p_category_id: categoryRow.id,
          p_initial_quantity: 5,
          p_min_stock: 2,
          p_cost_price: 10,
          p_selling_price: 15,
        }),
        "Own fixture product creation failed.",
      );
      account.product = row;
      await track(account.label, "products", row);
      ensure(
        row.user_id === account.userId && row.quantity === 5,
        "Fixture product ownership/quantity assertion failed.",
      );
      const history = await movements(account, row.id);
      ensure(
        history.length === 1 &&
          history[0].type === "IN" &&
          history[0].quantity_change === 5 &&
          history[0].quantity_after === 5,
        "Own initial stock movement assertion failed.",
      );
      await track(account.label, "stock_movements", history[0]);
      account.movement = history[0];
      const renamed = ok(
        await account.client
          .from("categories")
          .update({ name: `${runId}-${account.label}-renamed` })
          .eq("id", categoryRow.id)
          .select("*")
          .single(),
        "Own category rename failed.",
      );
      ensure(
        renamed.name.endsWith("-renamed"),
        "Own category rename did not persist.",
      );
      const edited = ok(
        await account.client
          .from("products")
          .update({
            name: `${runId}-${account.label}-edited`,
            description: "Authorization test fixture",
            min_stock: 3,
            cost_price: 12.5,
            selling_price: 19.5,
            category_id: categoryRow.id,
          })
          .eq("id", row.id)
          .select("*")
          .single(),
        "Own product metadata edit failed.",
      );
      ensure(
        edited.name.endsWith("-edited") &&
          edited.description === "Authorization test fixture" &&
          edited.min_stock === 3 &&
          Number(edited.cost_price) === 12.5 &&
          Number(edited.selling_price) === 19.5 &&
          edited.quantity === 5,
        "Own metadata edit read-back assertion failed.",
      );
      account.baseline = await snapshot(account);
      ensure(
        isDeepStrictEqual(account.baseline.movements, history),
        "Metadata edit changed movement history.",
      );
    }
    report(
      "PASS: A and B can create and edit their own allowed data, with an initial movement.",
    );

    for (const [actor, owner] of [
      [b, a],
      [a, b],
    ]) {
      for (const [table, id] of [
        ["products", owner.product.id],
        ["categories", owner.category.id],
        ["stock_movements", owner.movement.id],
      ]) {
        const byId = ok(
          await actor.client.from(table).select("*").eq("id", id),
          "Known-ID isolation request failed unexpectedly.",
        );
        ensure(
          byId.length === 0,
          "Cross-account known-ID read returned a row.",
        );
        const list = ok(
          await actor.client
            .from(table)
            .select("id")
            .eq("user_id", owner.userId)
            .in("id", [id]),
          "Owner-filtered isolation request failed unexpectedly.",
        );
        ensure(
          list.length === 0,
          "Cross-account listing returned a fixture row.",
        );
      }
      for (const changes of [
        { name: `${runId}-unauthorized-edit` },
        { is_archived: true },
      ]) {
        const response = await actor.client
          .from("products")
          .update(changes)
          .eq("id", owner.product.id)
          .select("*");
        ensure(
          response.error?.code === "42501" ||
            (!response.error &&
              Array.isArray(response.data) &&
              response.data.length === 0),
          "Cross-account update/archive returned an affected row.",
        );
        ensure(
          isDeepStrictEqual(
            await product(owner, owner.product.id),
            owner.baseline.product,
          ),
          "Owner read-back detected a changed product after cross-account update/archive.",
        );
      }
      const crossSku = `${runId}-CROSS-${actor.label}`;
      const crossCreate = await actor.client.rpc("create_product", {
        p_name: crossSku,
        p_sku: crossSku,
        p_category_id: owner.category.id,
        p_initial_quantity: 1,
      });
      // If protection regresses, retain the new fixture ID for scoped cleanup.
      if (!crossCreate.error)
        await track(actor.label, "products", crossCreate.data);
      denied(
        crossCreate,
        "23503",
        "create_product did not reject the other account category.",
      );
      const leftovers = ok(
        await actor.client.from("products").select("id").eq("sku", crossSku),
        "Rejected create read-back failed.",
      );
      ensure(
        leftovers.length === 0,
        "Rejected create_product left a fixture product.",
      );
      denied(
        await actor.client
          .from("products")
          .update({ category_id: owner.category.id })
          .eq("id", actor.product.id)
          .select("*"),
        "23503",
        "Direct metadata update did not reject the other account category.",
      );
      ensure(
        isDeepStrictEqual(
          await product(actor, actor.product.id),
          actor.baseline.product,
        ),
        "Denied category reassignment changed the product.",
      );

      for (const changes of [{ quantity: 6 }, { user_id: owner.userId }]) {
        denied(
          await actor.client
            .from("products")
            .update(changes)
            .eq("id", actor.product.id)
            .select("*"),
          "42501",
          "Direct quantity/product ownership write was not denied by SQL privileges.",
        );
      }
      denied(
        await actor.client
          .from("categories")
          .update({ user_id: owner.userId })
          .eq("id", actor.category.id)
          .select("*"),
        "42501",
        "Direct category ownership write was not denied.",
      );
      denied(
        await actor.client
          .from("stock_movements")
          .insert({
            product_id: actor.product.id,
            user_id: actor.userId,
            type: "IN",
            quantity_change: 1,
            quantity_after: 6,
            note: `${runId}-prohibited-insert`,
          })
          .select("*"),
        "42501",
        "Direct movement insert was not denied.",
      );
      denied(
        await actor.client
          .from("stock_movements")
          .update({ note: `${runId}-prohibited-update` })
          .eq("id", actor.movement.id)
          .select("*"),
        "42501",
        "Direct movement update was not denied.",
      );
      denied(
        await actor.client
          .from("stock_movements")
          .delete()
          .eq("id", actor.movement.id)
          .select("*"),
        "42501",
        "Direct movement delete was not denied.",
      );
      ensure(
        isDeepStrictEqual(await snapshot(actor), actor.baseline),
        "Owner snapshot changed after denied writes.",
      );
      ensure(
        isDeepStrictEqual(await snapshot(owner), owner.baseline),
        "Other owner snapshot changed after denied writes.",
      );
    }
    report(
      "PASS: known-ID reads, owner read-back after edit/archive, category ownership, and protected writes for both accounts.",
    );
    report(
      "PASS: real Supabase HTTP authorization assertions completed for this explicit run.",
    );
  } finally {
    let cleanupIncomplete = false;
    for (const fixture of manifest.fixtures.filter(
      (item) => item.table === "products",
    )) {
      const owner = clients.find((item) => item.label === fixture.account);
      try {
        const response = await owner.client
          .from("products")
          .update({ is_archived: true })
          .eq("id", fixture.id)
          .select("id,is_archived");
        if (
          response.error ||
          response.data?.length !== 1 ||
          !response.data[0].is_archived
        )
          cleanupIncomplete = true;
      } catch {
        cleanupIncomplete = true;
      }
    }
    for (const account of clients) {
      try {
        await account.client.auth.signOut({ scope: "local" });
      } catch {
        /* Do not expose SDK errors. */
      }
    }
    for (const method of ["log", "error", "warn", "info", "debug"])
      console[method] = originalConsole[method];
    if (manifest.fixtures.length)
      report(
        cleanupIncomplete
          ? "NOTICE: fixture archival incomplete. Review the local fixture manifest manually."
          : "Fixture products archived. Test categories and history retained.",
      );
    if (manifest.fixtures.length)
      report(`Fixture manifest: artifacts/authorization/${runId}.local`);
  }
}

if (process.argv.includes("--run-remote-fixtures")) {
  run().catch((error) => {
    console.error(
      error instanceof VerificationFailure
        ? `FAIL: ${error.message}`
        : "FAIL: unexpected local/network error. Details omitted to protect credentials.",
    );
    process.exitCode = 1;
  });
} else {
  console.log(
    "Remote verification is disabled. No environment was loaded and no network requests or mutations were made.",
  );
  console.log(
    "After separate explicit authorization, use: node scripts/verify-authorization.mjs --run-remote-fixtures",
  );
  console.log(
    "Authenticate two existing test accounts in the local terminal. Never share credentials or tokens in chat.",
  );
}
