import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueWallets, exportCollection, markWalletsSaved } from '../src/saved-client.js';

const fixture=(address,hits,score)=>({chain:'sol',address,hits,score,level:4,streak:0,privateKey:'PUBLIC-FIXTURE',phrase:null,created:'2026-10-30',highlights:hits.map(word=>({start:0,end:word.length,reason:`Word: ${word}`}))});
test('combined export merges duplicates and avoids reuploading already saved wallets',async()=>{
  const a=fixture('Shared',['moon'],90),b=fixture('Shared',['sol'],110),c=fixture('Other',['hodl'],95);
  const merged=uniqueWallets([a,b,c]);
  assert.equal(merged.length,2);assert.deepEqual(merged[0].hits,['moon','sol']);assert.equal(merged[0].score,110);
  assert.equal(merged[0].highlights.length,2);assert.deepEqual(a.hits,['moon']);
  assert.equal(uniqueWallets([a,{...a,chain:'eth'}]).length,2);
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({count:2})};};
  try{
    await exportCollection([a,b,c],true);
    assert.equal(calls.length,2);assert.equal(calls[0].body.wallets.length,2);
    assert.deepEqual(calls[1].body.ids,['sol:Shared','sol:Other']);assert.equal(calls[1].body.importBatch,true);
    calls.length=0;await exportCollection([a,b,c]);
    assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/export'));
    const gpu=fixture('GpuSaved',['moon'],90);markWalletsSaved([gpu]);
    calls.length=0;await exportCollection([gpu]);assert.equal(calls.length,1);
  }finally{globalThis.fetch=original;}
});
