// Standalone release build: leaves the homepage and its package scripts untouched.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const check = process.argv.includes('--check');
process.chdir(fileURLToPath(root));
const result = await build({ absWorkingDir: fileURLToPath(root), entryPoints: ['admin/src/app.js'], bundle: true, minify: true, format: 'esm', target: 'es2022', supported: { 'template-literal': false },
  alias: { '@supabase/supabase-js': fileURLToPath(import.meta.resolve('@supabase/supabase-js')) },
  outfile: 'admin/app.js', write: false, legalComments: 'inline' });
const outputs = result.outputFiles.map(output => ({ path: output.path, text: output.text }));
const version = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const adminHTML = (await readFile(new URL('admin/index.html', root), 'utf8')).replaceAll('\r\n', '\n')
  .replace(/src="\.\/app\.js(?:\?v=[^"]*)?"/, `src="./app.js?v=${version(result.outputFiles[0].text)}"`)
  .replace(/href="\.\/style\.css(?:\?v=[^"]*)?"/, `href="./style.css?v=${version((await readFile(new URL('admin/style.css', root), 'utf8')).replaceAll('\r\n', '\n'))}"`);
outputs.push({ path: 'admin/index.html', text: adminHTML });
outputs.push({ path: 'acceptance/app.js', text: '// Generated from the shared cloud client and acceptance/src/app.js.\n' +
  (await readFile(new URL('handoff-v1.1/工程檔/cloud.js', root), 'utf8')).replaceAll('\r\n', '\n') + '\n' + (await readFile(new URL('acceptance/src/sync.mjs', root), 'utf8')).replaceAll('\r\n', '\n').replace(/^export /gm, '') + '\n' + (await readFile(new URL('acceptance/src/app.js', root), 'utf8')).replaceAll('\r\n', '\n') });
for (const output of outputs) {
  if (check) { if (await readFile(output.path, 'utf8') !== output.text) throw Error(`發布檔與來源不一致：${output.path}`); }
  else await writeFile(output.path, output.text);
}
console.log('PASS: 獨立驗收頁與管理後台發布檔一致。');
