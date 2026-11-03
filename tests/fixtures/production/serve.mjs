import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Local, GET-only failure/export checks against the actual production build.
// No environment loading, auth stub, Supabase request or inventory mutation.
const root = path.resolve('dist');
const report = JSON.parse(await readFile('artifacts/production-optimization/after.json', 'utf8'));
const excel = report.files.find(file => file.file.includes('inventoryXlsx')).file;
let failAuth = process.argv.includes('--fail-auth-once');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const exportPage = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Qoima production export check</title>
<h1>Isolated production Excel check</h1><p>Fictional rows only. No authentication or remote data.</p>
<button id="download">Download fixture workbook</button><p id="result" role="status">Ready</p>
<script type="module">
import { buildInventoryXlsx } from '/${excel}';
document.querySelector('#download').onclick = async () => {
  const status = document.querySelector('#result');
  try {
    const bytes = await buildInventoryXlsx([['0000123', 'Café 東京', '=SUM(A1:A2)', 'Office', 4, 2, 1.25, 2.50, 'In stock', 'No']]);
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link = document.createElement('a'); link.href=url; link.download='qoima-production-fixture.xlsx'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); status.textContent='Workbook generated; download requested.';
  } catch { status.textContent='Workbook generation failed.'; }
};
</script></html>`;
http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5418');
    if (url.pathname === '/export-check.html') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(exportPage); return; }
    if (failAuth && /\/AuthPage-[^/]+\.js$/.test(url.pathname)) {
      failAuth = false; response.writeHead(404).end('Deliberately missing route chunk'); return;
    }
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403).end(); return; }
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const content = await readFile(file);
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end(); }
}).listen(5418, '127.0.0.1', () => console.log('Read-only production fixture: http://127.0.0.1:5418/login; /export-check.html'));
