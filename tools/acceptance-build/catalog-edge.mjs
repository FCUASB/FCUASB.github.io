import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const result=await build({absWorkingDir:fileURLToPath(root),entryPoints:['supabase/functions/catalog/index.ts'],bundle:true,format:'iife',platform:'neutral',target:'es2022',outfile:'supabase/deploy/catalog.js',write:false});
for(const output of result.outputFiles){if(process.argv.includes('--check')){if(await readFile(output.path,'utf8')!==output.text)throw Error('Catalog bundle differs from source');}else await writeFile(output.path,output.text);}
console.log('PASS: Catalog Edge bundle matches source.');
