import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Report only paths and finding categories, never matching values or lines.
export function secretFindings(text) {
  const findings = [];
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) findings.push('Supabase secret key');
  if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(text)) findings.push('GitHub token');
  if (/(?:AKIA|ASIA)[A-Z0-9]{16}/.test(text)) findings.push('Cloud access key');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push('Private key');
  if (/(?<![\w-])(?:access_token|refresh_token|client_secret|service_role_key|api_key|apiKey|secret_key|password)["']?\s*[:=]\s*["'][^"'\s]{16,}["']/.test(text)) findings.push('Assigned credential or session token');
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString());
      // Anon/public keys can be public, but user sessions and privileged JWTs cannot.
      if (payload.role === 'service_role' || payload.role === 'authenticated' || payload.session_id)
        findings.push('Privileged JWT or authenticated session');
    } catch { /* Not a parseable JWT. */ }
  }
  return [...new Set(findings)];
}

export function privateLocalPath(file) {
  if (file.startsWith('artifacts/') && ![
    'artifacts/production-optimization/before.json',
    'artifacts/production-optimization/after.json',
  ].includes(file)) return true;
  return /(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example'
    || /\.local$|\.pem$|\.key$|(?:^|\/)(?:storage-state|storageState).*\.json$/.test(file)
    || /^(?:\.auth|\.playwright|\.vercel|\.agents|\.impeccable|\.codex|\.aws|\.ssh|credentials|node_modules|dist|dist-ssr|coverage|playwright-report|test-results|playwright\/\.auth|supabase\/\.temp)\//.test(file)
    || file === '.npmrc';
}

export function gitIndexText(file, cwd = process.cwd()) {
  const blob = spawnSync('git', ['show', `:${file}`], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (blob.status !== 0) throw new Error(`Unable to read the index entry for ${file}.`);
  return blob.stdout;
}

async function fallbackFiles(directory = '.') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory.replaceAll('\\', '/'), entry.name);
    if (['node_modules', 'dist', 'dist-ssr', '.git', '.agents', '.impeccable', '.idea'].includes(entry.name) || privateLocalPath(file)) continue;
    if (entry.isDirectory()) result.push(...await fallbackFiles(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

async function main() {
  const staged = process.argv.includes('--staged');
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  const hasGit = git.status === 0;
  if (staged && !hasGit) throw new Error('Staged verification requires a Git repository.');
  let files;
  if (hasGit) {
    const args = staged ? ['ls-files', '-z', '--cached']
      : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
    const listed = spawnSync('git', args, { encoding: 'utf8' });
    if (listed.status !== 0) throw new Error('Git file inventory failed.');
    files = [...new Set(listed.stdout.split('\0').filter(Boolean))];
  } else files = await fallbackFiles();
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    if (privateLocalPath(file)) {
      findings.push({ file, category: 'Private local file in Git inventory' });
      continue;
    }
    if (!/\.(?:[cm]?js|jsx|json|md|sql|txt|html|css|svg|ya?ml|toml|spec|example)$/.test(file) && !['.gitignore', '.gitattributes', 'LICENSE'].includes(file)) continue;
    const contents = staged ? gitIndexText(file) : await readFile(file, 'utf8');
    scanned++;
    for (const category of secretFindings(contents)) findings.push({ file, category });
  }
  const example = (staged ? gitIndexText('.env.example') : await readFile('.env.example', 'utf8')).replaceAll('\r', '').trim();
  const exampleValid = example === 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=';
  console.log(JSON.stringify({
    gitInventory: staged ? 'exact Git index snapshot (all tracked paths)' : hasGit
      ? 'tracked and untracked nonignored files' : 'unavailable: this folder has no Git repository; eligible working-tree files only',
    scannedTextFiles: scanned,
    environmentExample: exampleValid ? 'expected variable names; empty values' : 'unexpected content; inspect locally',
    findings,
    limitation: 'Heuristic current-file check, not a historical or complete secret audit.',
  }, null, 2));
  process.exitCode = findings.length || !exampleValid ? 1 : hasGit ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
