import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gitIndexText, privateLocalPath, secretFindings } from '../scripts/check-release-files.mjs';

test('publication credential scan distinguishes assigned secrets from password autocomplete labels', () => {
  const value = 'x'.repeat(24);
  assert.deepEqual(secretFindings('password: "' + value + '"'), ['Assigned credential or session token']);
  assert.deepEqual(secretFindings('{"password":"' + value + '"}'), ['Assigned credential or session token']);
  assert.deepEqual(secretFindings('autoComplete={newPassword ? "new-password" : "current-password"}'), []);
  assert.deepEqual(secretFindings('gh' + 'p_' + value), ['GitHub token']);
  assert.deepEqual(secretFindings('AK' + 'IA' + 'X'.repeat(16)), ['Cloud access key']);
});

test('publication checks the staged blob even when the working tree has different content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'qoima-publication-'));
  try {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
    await writeFile(path.join(directory, 'public.json'), '{"stage":"reviewed"}\n');
    assert.equal(spawnSync('git', ['add', '--', 'public.json'], { cwd: directory }).status, 0);
    await writeFile(path.join(directory, 'public.json'), '{"stage":"changed after review"}\n');
    assert.deepEqual(JSON.parse(gitIndexText('public.json', directory)), { stage: 'reviewed' });
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), 'qoima-publication-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('publication allowlists only sanitized bundle metadata and excludes local tooling, artifacts and credentials', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'qoima-publication-'));
  try {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
    await writeFile(path.join(directory, '.gitignore'), await readFile('.gitignore'));
    for (const file of ['.agents/skills/tool.js', '.impeccable/config.json', 'artifacts/publication/audit-all.json',
      'artifacts/production-optimization/login-desktop.jpg', 'artifacts/production-optimization/browser-fixture.xlsx',
      'artifacts/stock-verification/fixture.local', 'credentials/config.json', '.npmrc', 'preview/index.html']) {
      assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--', file], { cwd: directory }).status, 0, file);
    }
    for (const file of ['artifacts/production-optimization/after.json', 'artifacts/production-optimization/before.json',
      'src/assets/fonts/Inter-OFL.txt', 'supabase/tests/category_concurrency.spec', 'tests/fixtures/redesign/review.jsx']) {
      assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--', file], { cwd: directory }).status, 1, file);
      assert.equal(privateLocalPath(file), false, file);
    }
    assert.equal(privateLocalPath('artifacts/production-optimization/browser-fixture.xlsx'), true);
    assert.equal(privateLocalPath('.agents/skills/tool.js'), true);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), 'qoima-publication-')));
    await rm(directory, { recursive: true, force: true });
  }
});
