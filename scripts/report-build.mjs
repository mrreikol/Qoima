import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Metadata only: never write bundle source, environment values or source maps.
const label = process.argv[2];
if (!['before', 'after'].includes(label)) throw new Error('Choose before or after.');
const directory = path.resolve('artifacts/production-optimization');
await mkdir(directory, { recursive: true });
let report;
await build({
  plugins: [{
    name: 'qoima-bundle-report',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
      const files = chunks.map(chunk => ({
        file: chunk.fileName,
        entry: chunk.isEntry,
        dynamicEntry: chunk.isDynamicEntry,
        bytes: Buffer.byteLength(chunk.code),
        gzipBytes: gzipSync(chunk.code).length,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        modules: Object.entries(chunk.modules).map(([id, info]) => ({
          id: path.relative(process.cwd(), id).replaceAll('\\', '/'),
          bytes: info.renderedLength,
        })).sort((a, b) => b.bytes - a.bytes),
      }));
      const initial = new Set();
      function visit(file) {
        if (initial.has(file)) return;
        initial.add(file);
        files.find(item => item.file === file)?.imports.forEach(visit);
      }
      files.filter(file => file.entry).forEach(file => visit(file.file));
      const initialFiles = files.filter(file => initial.has(file.file));
      report = {
        initialBytes: initialFiles.reduce((sum, file) => sum + file.bytes, 0),
        initialGzipBytes: initialFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
        initialFiles: initialFiles.map(file => file.file),
        files,
      };
    },
    async writeBundle(options) {
      // Later build hooks can still transform code; measure the emitted bytes.
      for (const file of report.files) {
        const content = await readFile(path.resolve(options.dir, file.file));
        file.bytes = content.length;
        file.gzipBytes = gzipSync(content).length;
      }
      const initial = report.files.filter(file => report.initialFiles.includes(file.file));
      report.initialBytes = initial.reduce((sum, file) => sum + file.bytes, 0);
      report.initialGzipBytes = initial.reduce((sum, file) => sum + file.gzipBytes, 0);
      await writeFile(path.join(directory, `${label}.json`), JSON.stringify(report, null, 2) + '\n');
    },
  }],
});
