import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const check=process.argv.includes('--check');
for(const name of ['intake','admin','media','archive-worker']){
  const result=await build({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,format:'iife',platform:'neutral',target:'es2022',
    outfile:`supabase/deploy/${name}.js`,write:false,legalComments:'inline',banner:{js:'// Generated from supabase/functions. Do not edit; run npm run build:edge.'}});
  for(const output of result.outputFiles){
    if(check){if(await readFile(output.path,'utf8')!==output.text)throw new Error(`${name} Edge bundle differs from source`);}
    else {await mkdir(new URL('../supabase/deploy/',import.meta.url),{recursive:true});await writeFile(output.path,output.text);}
  }
}
console.log(check?'PASS: 四個 Edge 部署檔與來源一致。':'四個 Edge 部署檔已建置。');
