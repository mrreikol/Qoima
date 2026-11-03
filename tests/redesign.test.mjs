import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { authFieldErrors } from "../src/data/authForm.js";

test("auth field feedback preserves the existing login/registration/recovery requirements", () => {
  assert.deepEqual(
    authFieldErrors("login", { email: "a@example.test", password: "short" }),
    {},
  );
  assert.deepEqual(authFieldErrors("forgot", { email: "a@example.test" }), {});
  assert.equal(
    authFieldErrors("register", {
      email: "a@example.test",
      password: "1234567",
      confirmPassword: "1234567",
    }).password,
    "Use at least 8 characters for your password.",
  );
  assert.equal(
    authFieldErrors("register", {
      email: "a@example.test",
      password: "12345678",
      confirmPassword: "different",
    }).confirmPassword,
    "The passwords do not match.",
  );
  assert.deepEqual(
    authFieldErrors("reset", {
      password: "12345678",
      confirmPassword: "12345678",
    }),
    {},
  );
  const missing = authFieldErrors("register", {});
  assert.deepEqual(Object.keys(missing), [
    "email",
    "password",
    "confirmPassword",
  ]);
});

test("Light and Dark semantic palettes preserve text, action, brand and control contrast", async () => {
  const css = await readFile(
    new URL("../src/design-tokens.css", import.meta.url), "utf8",
  );
  const blocks = [...css.matchAll(/:root(?:\[data-theme="(dark)"\])?\s*\{([\s\S]*?)\}/g)];
  const readTokens = (block) => Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
  const light = readTokens(blocks.find((block) => !block[1])[2]);
  const dark = { ...light, ...readTokens(blocks.find((block) => block[1] === "dark")[2]) };
  const luminance = (hex) => {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const rgb = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const [theme, tokens] of [["light", light], ["dark", dark]]) {
    const color = (name) => tokens[name].startsWith("var(")
      ? color(tokens[name].slice(6, -1)) : tokens[name];
    const contrast = (a, b) => {
      const values = [luminance(color(a)), luminance(color(b))].sort((a, b) => a - b);
      return (values[1] + 0.05) / (values[0] + 0.05);
    };
    for (const pair of [
      ["text", "surface"], ["text", "surface-soft"],
      ["text-secondary", "canvas"], ["text-secondary", "surface"],
      ["text-secondary", "surface-soft"], ["text-secondary", "surface-selected"],
      ["primary-text", "accent"], ["primary-text", "accent-hover"],
      ["danger-action-text", "danger-action"],
      ["text-on-dark-secondary", "nav-surface"],
      ["accent-text", "surface-selected"], ["link", "surface"],
      ["link", "surface-soft"], ["success-text", "success-surface"],
      ["warning-text", "warning-surface"], ["danger-text", "danger-surface"],
    ]) assert.ok(contrast(...pair) >= 4.5,
      `${theme} ${pair.join("/")}: ${contrast(...pair).toFixed(2)}`);
    for (const foreground of ["control-border", "focus", "chart-in", "chart-out", "chart-adjustment", "brand-symbol", "selected-indicator"])
      for (const surface of ["surface", "surface-soft"])
        assert.ok(contrast(foreground, surface) >= 3,
          `${theme} ${foreground}/${surface}: ${contrast(foreground, surface).toFixed(2)}`);
    assert.ok(contrast("primary-border", "surface") >= 3);
    assert.ok(contrast("primary-hover-border", "surface") >= 3);
    assert.ok(contrast("control-border", "canvas") >= 3);
    assert.equal(tokens["color-scheme"], theme);
  }
  assert.deepEqual(
    ["canvas", "surface", "text", "text-secondary", "accent", "accent-hover"].map((name) => dark[name]),
    ["#08090a", "#0f1011", "#f3f4f5", "#a1a5ad", "#e4f222", "#cad71a"],
  );
});


test("one self-hosted Inter face supplies licensed WOFF2, swap and used variable weights to app and fixture", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const css = await read("../src/fonts.css");
  assert.equal((css.match(/@font-face/g) || []).length, 1);
  assert.equal((css.match(/font-display: swap/g) || []).length, 1);
  assert.match(css, /font-family: "Inter Variable"/);
  assert.match(css, /font-weight: 400 590/);
  const bytes = await readFile(new URL("../src/assets/fonts/inter-variable.woff2", import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
  assert.match(await read("../src/assets/fonts/Inter-OFL.txt"), /SIL OPEN FONT LICENSE Version 1.1/);
  assert.match(await read("../src/main.jsx"), /import ".\/fonts.css"/);
  assert.match(await read("./fixtures/redesign/review.jsx"), /import "\/src\/fonts.css"/);
  assert.doesNotMatch(css, /Geist|Manrope|https?:/);
  assert.doesNotMatch(await read("../src/main.jsx"), /fontsource|Geist|Manrope/);
  assert.doesNotMatch(await read("../src/workspace.css"), /--(?:forest|olive|sage)/);
});

test("brand and shared navigation retain accessible destinations, detail selection and sign-out state", async () => {
  const server = await createServer({
    configFile: false,
    envDir: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { default: Brand } = await server.ssrLoadModule("/src/components/Brand.jsx");
    const { default: Navigation } = await server.ssrLoadModule("/src/components/AppNavigation.jsx");
    const { default: Header } = await server.ssrLoadModule("/src/components/AppHeader.jsx");
    const render = (element) => renderToStaticMarkup(
      React.createElement(MemoryRouter, {
        initialEntries: ["/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      }, element),
    );
    const brand = renderToStaticMarkup(React.createElement(Brand));
    assert.match(brand, /Qoima/);
    assert.doesNotMatch(brand, /StockMate/);
    assert.match(brand, /<svg[^>]+aria-hidden="true"/);
    assert.doesNotMatch(brand, /<button|<a /);
    const lockup = renderToStaticMarkup(React.createElement(Brand, { tagline: true }));
    assert.match(lockup, /Qoima/);
    assert.match(lockup, /Digital Warehouse/);
    const symbol = renderToStaticMarkup(React.createElement(Brand, { variant: "symbol" }));
    assert.match(symbol, /<svg[^>]+role="img"[^>]+aria-label="Qoima"/);
    assert.match(symbol, /<use[^>]+#qoima-symbol/);
    assert.doesNotMatch(symbol, /qoima-wordmark|Digital Warehouse|<image/);
    const vector = await readFile(new URL("../src/assets/branding/qoima-symbol.svg", import.meta.url), "utf8");
    const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
    assert.match(vector, /id="qoima-symbol"/);
    assert.match(vector, /fill="currentColor"/);
    assert.doesNotMatch(vector + favicon, /<image|data:image|https?:.*\.(png|jpe?g)/);
    assert.match(favicon, /fill="#08090a"/);
    assert.match(favicon, /fill="#e4f222"/);
    const navigation = render(React.createElement(Navigation, {
      user: { email: "member@example.test" },
      signingOut: true,
      open: false,
      onClose() {},
      onSignOut() {},
    }));
    assert.match(navigation, /aria-label="Main navigation"/);
    for (const destination of ["products", "dashboard", "history", "categories", "settings"])
      assert.match(navigation, new RegExp(`href="/${destination}"`));
    assert.match(navigation, /<a[^>]+aria-current="page"[^>]+href="\/products"/);
    assert.match(navigation, /Account settings for member@example.test/);
    assert.match(navigation, /<button[^>]+disabled=""[^>]+aria-busy="true"/);
    assert.match(navigation, /Signing out\.\.\./);
    const header = render(React.createElement(Header, { menuOpen: true, onOpenMenu() {} }));
    assert.match(header, /aria-label="Open navigation"/);
    assert.match(header, /aria-haspopup="dialog"/);
    assert.match(header, /aria-expanded="true"/);
  } finally {
    await server.close();
  }
});
