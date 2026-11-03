import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import React, { lazy } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { secretFindings, privateLocalPath } from '../scripts/check-release-files.mjs';

test('Git ignores local credentials, session state and test manifests while preserving the environment example', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'qoima-release-'));
  try {
    await writeFile(path.join(directory, '.gitignore'), await readFile('.gitignore'));
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
    const ignored = ['.env', '.env.local', '.env.production', 'fixture.local', '.auth/state.json',
      'playwright/.auth/session.json', 'tests/storage-state.json', 'tests/storageState.json',
      'artifacts/authorization/report.json', 'artifacts/stock-verification/fixture.local', '.vercel/project.json', 'private.pem'];
    for (const file of ignored) assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--', file], { cwd: directory }).status, 0, file);
    for (const file of ['.env.example', 'tests/session.test.mjs', 'src/App.jsx'])
      assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--', file], { cwd: directory }).status, 1, file);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), 'qoima-release-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('release scan classifies secrets and private session paths without returning matching values', () => {
  assert.deepEqual(secretFindings('sb_' + 'secret_' + 'x'.repeat(24)), ['Supabase secret key']);
  assert.deepEqual(secretFindings('refresh_token: "' + 'x'.repeat(24) + '"'), ['Assigned credential or session token']);
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'authenticated', session_id: 'fixture-session' })).toString('base64url'), 'x'.repeat(24)].join('.');
  assert.deepEqual(secretFindings(token), ['Privileged JWT or authenticated session']);
  assert.deepEqual(secretFindings('VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY='), []);
  assert.equal(privateLocalPath('.env.local'), true);
  assert.equal(privateLocalPath('.env.example'), false);
  assert.equal(privateLocalPath('artifacts/authorization/test.local'), true);
});

test('production chunk graph excludes inventory/chart/Excel from boot and contains no static cycles', async () => {
  const report = JSON.parse(await readFile('artifacts/production-optimization/after.json', 'utf8'));
  const boot = report.files.filter(file => report.initialFiles.includes(file.file));
  for (const file of boot) {
    assert.ok(!file.modules.some(module => /src\/(?:Workspace|pages\/(?:Dashboard|Products)|components\/StockActivityChart|data\/inventoryXlsx)|devextreme-exceljs/.test(module.id)), file.file);
  }
  const dashboard = report.files.find(file => file.modules.some(module => module.id === 'src/components/StockActivityChart.jsx'));
  const excel = report.files.find(file => file.modules.some(module => module.id === 'src/data/inventoryXlsx.js'));
  assert.ok(dashboard?.dynamicEntry);
  assert.ok(excel?.dynamicEntry);
  assert.ok(excel.modules.some(module => module.id.endsWith('dx-exceljs-fork.bare.min.js')));
  const excelDependencies = new Set();
  function collect(file) {
    if (excelDependencies.has(file)) return;
    excelDependencies.add(file);
    report.files.find(item => item.file === file)?.imports.forEach(collect);
  }
  collect(excel.file);
  assert.ok(!report.files.filter(file => excelDependencies.has(file.file)).some(file =>
    file.modules.some(module => /src\/(?:pages\/|App\.jsx|lib\/supabase)/.test(module.id))), 'standalone Excel writer must not boot the application');
  assert.ok(report.files.length <= 14, 'avoid excessive fragmentation');
  function visit(file, ancestors = []) {
    assert.ok(!ancestors.includes(file), `Static chunk cycle at ${file}`);
    report.files.find(item => item.file === file)?.imports.forEach(dependency => visit(dependency, [...ancestors, file]));
  }
  report.files.forEach(file => visit(file.file));
  const config = await readFile('vite.config.js', 'utf8');
  assert.doesNotMatch(config, /chunkSizeWarningLimit/);
});

test('route boundary provides accessible loading and explicit reload failure states', async () => {
  const server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, ws: false, hmr: false } });
  try {
    const { default: Boundary } = await server.ssrLoadModule('/src/components/RouteBoundary.jsx');
    const Pending = lazy(() => new Promise(() => {}));
    const loading = renderToStaticMarkup(React.createElement(Boundary, {}, React.createElement(Pending)));
    assert.match(loading, /role="status"/); assert.match(loading, /Loading page/);
    const boundary = new Boundary({ children: 'Ready' });
    boundary.state = Boundary.getDerivedStateFromError(new Error('Fixture import failure'));
    const failed = renderToStaticMarkup(boundary.render());
    assert.match(failed, /role="alert"/); assert.match(failed, /Reload page/);
    assert.match(failed, /Unsaved form entries will be lost/);
    assert.doesNotMatch(failed, /Fixture import failure/);
  } finally { await server.close(); }
});

test('Vercel routes serve real files first, reject missing chunks and fall back for direct application URLs', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.routes[0].handle, 'filesystem');
  const routeFor = url => config.routes.find(route => route.src && new RegExp(`^${route.src}$`).test(url));
  for (const url of ['/products/a-product-id', '/reset-password', '/dashboard', '/login']) assert.equal(routeFor(url).dest, '/index.html');
  assert.equal(routeFor('/assets/old-chunk.js').status, 404);
  assert.ok(config.headers.some(rule => rule.source === '/appearance.js' && rule.headers.some(header => header.value === 'no-cache')));
  const example = (await readFile('.env.example', 'utf8')).trim().replaceAll('\r', '');
  assert.equal(example, 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=');
});
