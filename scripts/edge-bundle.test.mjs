import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
for(const name of ['intake','admin','media','archive-worker'])test(`${name} deployment artifact refuses requests without explicit configuration`,async()=>{
  let handler,network=false;
  const context=vm.createContext({Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,Request,URL,URLSearchParams,AbortSignal,TextEncoder,TextDecoder,crypto,
    fetch:async()=>{network=true;throw Error('Unexpected network');}});
  vm.runInContext(await readFile(new URL(`../supabase/deploy/${name}.js`,import.meta.url),'utf8'),context);
  const response=await handler(new Request(`https://example.test/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
  assert.equal(response.status,503);assert.equal(network,false);
});
