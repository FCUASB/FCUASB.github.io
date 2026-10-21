import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');
const data=JSON.parse(read('content.json')),html=read('dist/index.html'),archive=read('archive.js');
new vm.Script(read('app-check.js'));
assert.equal(new Set(data.concerts.map(c=>c.id)).size,data.concerts.length);
assert.equal(data.career[0].label,'1977');
assert(html.includes('<title>大呂的音樂，未完待續 v1.1</title>'));
assert.equal(html,read('dist/大呂的音樂，未完待續 v1.1.html'));
const music=archive.slice(archive.indexOf('function setupBackgroundMusic'));
assert(music.includes('playlist=n7mhsJLAsVk'));assert(!music.includes('RDn7mhsJLAsVk'));assert(!music.includes('openMem(300016)'));
const context=vm.createContext({Intl,Set});
vm.runInContext('const expandedMemories=new Set();\n'+archive.slice(archive.indexOf('function storyCharacters'),archive.indexOf('function renderMem')),context);
for(const n of [0,99,100,101,123]){const result=vm.runInContext(`memoryExcerpt({id:1,story:'字'.repeat(${n})})`,context);assert.equal(result.remaining,Math.max(0,n-100));assert.equal(Array.from(result.text).length,n>100?101:n)}
assert.equal(vm.runInContext("storyCharacters('❤️👨‍👩‍👦甲').length",context),3);
assert.equal(vm.runInContext("expandedMemories.add(1);memoryExcerpt({id:1,story:'字'.repeat(123)}).text.length",context),123);
for(const c of data.concerts){assert(c.date&&c.ens&&c.place&&c.source);assert(Number.isFinite(c.timelineOrder));for(const r of c.rows)assert(r.zh||r.orig)}
assert(!data.memories.some(m=>/測試|本機驗證/.test(m.n)));
console.log('PASS: JavaScript, versioned output, 100-character boundaries, emoji, expansion, single music ID, timeline/data integrity, no test posts in release.');
