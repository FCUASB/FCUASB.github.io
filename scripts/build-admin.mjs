import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const check = process.argv.includes('--check');
const result = await build({ entryPoints: ['admin/src/app.js'], bundle: true, minify: true, format: 'esm', target: 'es2022',
  outfile: 'admin/app.js', write: false, legalComments: 'inline' });
for (const output of result.outputFiles) {
  if (check) {
    if (await readFile(output.path, 'utf8') !== output.text) throw new Error('後台發布 JavaScript 與來源不一致，請執行 npm run build:admin');
  } else await writeFile(output.path, output.text);
}
console.log(check ? 'PASS: 管理後台 JavaScript 與來源一致。' : '管理後台已建置。');
