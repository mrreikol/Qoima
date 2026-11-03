import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

test("actual product routes render active/archive/unavailable/empty/error states without browser credentials", async () => {
  const server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    resolve: {
      alias: [
        {
          find: /.*lib\/supabase$/,
          replacement: fileURLToPath(
            new URL("./fixtures/offlineSupabase.js", import.meta.url),
          ),
        },
      ],
    },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { default: Products } = await server.ssrLoadModule(
      "/src/pages/Products.jsx",
    );
    const { default: ProductDetails } = await server.ssrLoadModule(
      "/src/components/ProductDetails.jsx",
    );
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const product = {
      id,
      name: "Notebook",
      sku: "A-001",
      description: "Line one\nLine two",
      category_id: null,
      quantity: 0,
      min_stock: 0,
      cost_price: "0.10",
      selling_price: "0.20",
      created_at: "2026-11-03T00:00:00Z",
      updated_at: "2026-11-03T00:00:00Z",
      is_archived: false,
    };
    const inventory = {
      userId: "local-fixture",
      products: [product],
      categories: [],
      recentMovements: [],
      loading: false,
      error: "",
      refresh() {},
    };
    const render = (entry, data = inventory) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: "/products",
              element: React.createElement(Products, { inventory: data }),
            }),
            React.createElement(Route, {
              path: "/products/:id",
              element: React.createElement(Products, {
                inventory: data,
                detailMode: true,
              }),
            }),
          ),
        ),
      );
    let html = render(`/products/${id}`);
    assert.match(html, /Product details/);
    assert.match(html, /Out of stock/);
    assert.match(html, /View product history/);
    assert.match(html, /Line one\nLine two/);
    assert.match(html, /Stock in/);
    html = render(`/products/${id}`, {
      ...inventory,
      products: [{ ...product, is_archived: true }],
    });
    assert.match(html, /Archived · Read only/);
    assert.doesNotMatch(html, />Stock in</);
    assert.doesNotMatch(html, />Edit product</);
    for (const unknown of ["bad-id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]) {
      html = render(`/products/${unknown}`);
      assert.match(html, /Product unavailable/);
      assert.doesNotMatch(html, /A-001/);
    }
    html = render("/products", { ...inventory, products: [] });
    assert.match(html, /No products yet/);
    html = render("/products", {
      ...inventory,
      products: [{ ...product, is_archived: true }],
    });
    assert.match(html, /No active products/);
    assert.match(html, /View archived products/);
    html = render("/products?status=attention", {
      ...inventory,
      products: [{ ...product, quantity: 10 }],
    });
    assert.match(html, /No matching products/);
    assert.match(html, /Clear filters/);
    html = render(`/products/${id}`, {
      ...inventory,
      products: [],
      error: "Request failed",
    });
    assert.match(html, /Inventory unavailable/);
    assert.doesNotMatch(html, /Product unavailable/);
    assert.doesNotMatch(html, /0 units/);
    assert.match(render("/products"), new RegExp(`/products/${id}`));
    const tableMarkup = render("/products");
    assert.match(tableMarkup, /products-mobile-list/);
    assert.match(tableMarkup, /More actions for Notebook/);
    assert.match(tableMarkup, /Stock changes/);
    assert.match(tableMarkup, /1 active product/);
    assert.doesNotMatch(tableMarkup, /Scroll horizontally for stock/);
    // Render the real detail component with no pending recovery record: active
    // stock actions are enabled, while its archived version has no stock controls.
    const details = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ProductDetails, {
          product,
          categories: [],
          stockDisabled: false,
        }),
      ),
    );
    assert.match(details, />Stock out</);
    assert.match(details, />Adjust stock</);
    assert.doesNotMatch(details, /disabled/);
    const { default: Dashboard } = await server.ssrLoadModule(
      "/src/pages/Dashboard.jsx",
    );
    const dashboard = (data) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(Dashboard, {
            inventory: { ...data, revision: 0 },
          }),
        ),
      );
    assert.match(
      dashboard({
        ...inventory,
        products: [{ ...product, is_archived: true }],
      }),
      /No active products/,
    );
    const failedDashboard = dashboard({
      ...inventory,
      products: [],
      error: "Read failed",
    });
    assert.match(failedDashboard, /Inventory unavailable/);
    assert.doesNotMatch(failedDashboard, /\$0\.00|stat-value/);
    const { default: Settings } = await server.ssrLoadModule(
      "/src/pages/Settings.jsx",
    );
    const settings = renderToStaticMarkup(
      React.createElement(Settings, {
        user: { email: "local@example.test" },
        signingOut: false,
      }),
    );
    assert.match(settings, /local@example.test/);
    assert.match(settings, /Send password reset email/);
    assert.match(settings, /Sign out/);
    assert.doesNotMatch(settings, /Apply preview|Business name|Supabase/);
    assert.match(settings, /<h2[^>]*>Appearance<\/h2>/);
    assert.match(settings, /<legend[^>]*>Color theme<\/legend>/);
    const appearanceRadios = settings.match(/<input[^>]+type="radio"[^>]*>/g) || [];
    assert.equal(appearanceRadios.length, 3);
    for (const value of ["light", "dark", "system"])
      assert.equal(appearanceRadios.filter((input) => input.includes(`value="${value}"`)).length, 1);
    assert.match(appearanceRadios.find((input) => input.includes('value="system"')), /checked=""/);
    assert.match(settings, /Light|Dark|System/);
    assert.match(settings, /Follows your device\. Currently light\./);
    const { AuthLayout } = await server.ssrLoadModule("/src/auth/AuthRoutes.jsx");
    const authLayout = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: ["/login"] },
        React.createElement(AuthLayout, { title: "Sign in" }, "Form fixture")),
    );
    assert.match(authLayout, /Qoima/);
    assert.doesNotMatch(authLayout, /appearance-options|type="radio"|Color theme/);
    const { default: PasswordField } = await server.ssrLoadModule(
      "/src/components/PasswordField.jsx",
    );
    const password = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PasswordField, {
          name: "password",
          label: "New password",
          autoComplete: "new-password",
          minLength: 8,
          guidance: "Use at least 8 characters.",
          error: "Use a longer password.",
        }),
      ),
    );
    assert.match(password, /autocomplete="new-password"/i);
    assert.match(password, /aria-label="Show new password"/);
    assert.match(password, /aria-invalid="true"/);
    assert.match(password, /aria-describedby=/);
    const { default: Navigation } = await server.ssrLoadModule(
      "/src/components/AppNavigation.jsx",
    );
    const navigation = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/products"] },
        React.createElement(Navigation, {
          user: { email: "local@example.test" },
          open: false,
          onClose() {},
          onSignOut() {},
          signingOut: false,
        }),
      ),
    );
    assert.match(navigation, /Main navigation/);
    assert.match(navigation, /local@example.test/);
    assert.doesNotMatch(
      navigation,
      /Personal workspace|My inventory|workspace-nav-count/,
    );
    assert.doesNotMatch(navigation, /appearance-options|type="radio"|Color theme/);
  } finally {
    await server.close();
  }
});
