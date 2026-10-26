import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const client = (await readFile(new URL('handoff-v1.1/工程檔/cloud.js', root), 'utf8')).replaceAll('\r\n', '\n');
const adapter = (await readFile(new URL('acceptance/src/app.js', root), 'utf8')).replaceAll('\r\n', '\n');
const sync = (await readFile(new URL('acceptance/src/sync.mjs', root), 'utf8')).replaceAll('\r\n', '\n').replace(/^export /gm, '');
const output = '// Generated from the shared cloud client and acceptance/src/app.js.\n' + client + '\n' + sync + '\n' + adapter;
const path = new URL('acceptance/app.js', root);
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== output) throw Error('驗收頁與來源不一致，請執行 build:acceptance');
} else await writeFile(path, output);
console.log('PASS: 驗收頁使用相同雲端收件程式，來源一致。');
