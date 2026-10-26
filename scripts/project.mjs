import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'handoff-v1.1', '工程檔');
const data = JSON.parse(fs.readFileSync(path.join(source, 'content.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(`v${manifest.version.replace(/\.0$/, '')}`, data.version, '網站與 package.json 版本不一致');
for (const file of ['.nojekyll', 'handoff-v1.1/.nojekyll']) {
  assert(fs.existsSync(path.join(root, file)), `缺少 ${file}`);
}
const run = file => {
  const result = spawnSync(process.execPath, [path.join(source, file)], { cwd: source, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const mode = process.argv[2];
if (!['build', 'check', 'proofread'].includes(mode)) {
  throw new Error('Usage: node scripts/project.mjs build|check|proofread');
}
if (mode === 'proofread') {
  run('proofread-v11.mjs');
  const { version } = JSON.parse(fs.readFileSync(path.join(source, 'content.json'), 'utf8'));
  const name = `大呂的音樂，未完待續 ${version}－生涯與音樂歷史校對.txt`;
  fs.copyFileSync(path.join(source, name), path.join(root, 'handoff-v1.1', name));
} else {
  run('build.mjs');
  run('verify-v11.mjs');
  run('proofread-v11.mjs');
  const proof = `大呂的音樂，未完待續 ${data.version}－生涯與音樂歷史校對.txt`;
  const normalizeText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(normalizeText(path.join(source, proof)), normalizeText(path.join(root, 'handoff-v1.1', proof)), '校對 TXT 已過期，請執行 npm run proofread');
  const generated = fs.readFileSync(path.join(source, 'dist', 'index.html'));
  for (const target of ['index.html', 'handoff-v1.1/index.html']) {
    const destination = path.join(root, target);
    if (mode === 'build') fs.writeFileSync(destination, generated);
    else if (!generated.equals(fs.readFileSync(destination))) {
      throw new Error(`${target} 與來源建置結果不同；請執行 npm run build 並提交兩份發布 HTML。`);
    }
  }
  console.log(mode === 'build' ? 'PASS: 已同步兩份發布 HTML。' : 'PASS: 兩份發布 HTML 與重新建置結果完全一致。');
}
