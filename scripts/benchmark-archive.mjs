import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { createSavedStore } from '../server/saved-store.js';
import { matchesPosition, resultSearch } from '../src/collection-view.js';

const count=Number(process.argv[2]||50000);
if(!Number.isInteger(count)||count<1||count>1000000)throw new Error('Use 1–1000000 synthetic records.');
const directory=mkdtempSync(join(tmpdir(),'wallet-archive-benchmark-'));
let store,reader;
try{
  store=await createSavedStore(directory);
  for(let first=0;first<count;first+=1000){
    const rows=Array.from({length:Math.min(1000,count-first)},(_,j)=>{
      const i=first+j,word=i%1000===0?'whalepool':'moon',text=i%7===0?word.toUpperCase():word;
      const prefix=`abc${i}xyz`,address=prefix+text;
      return {chain:'sol',address,privateKey:'PUBLIC-SYNTHETIC-FIXTURE',phrase:null,hits:[word],level:4,rank:'Legendary',score:90,streak:0,created:'2026-10-30T12:00:00.000Z',highlights:[{start:prefix.length,end:address.length,reason:'Word: '+word}]};
    });
    store.save(rows);if((first+1000)%10000===0)console.log(`Prepared ${Math.min(first+1000,count)} synthetic records.`);
  }
  reader=new DatabaseSync(join(directory,'collections.sqlite'),{readOnly:true});
  reader.function('old_position',summary=>matchesPosition(JSON.parse(summary),'last:caps')?1:0);
  const match=resultSearch('whalepool');reader.function('old_search',text=>match({address:text,hits:[]})?1:0);
  const results=[];
  for(const [name,filters,sql] of [
    ['Ends with + CAPS',{position:'last:caps'},'SELECT count(*) AS n FROM wallets WHERE old_position(summary)'],
    ['Word search',{query:'whalepool'},'SELECT count(*) AS n FROM wallets WHERE old_search(search_text)'],
  ]){
    const t=performance.now(),expected=reader.prepare(sql).get().n,oldMs=performance.now()-t;
    const start=performance.now(),actual=store.list(filters),indexedMs=performance.now()-start;
    assert.equal(actual.filtered,expected);
    results.push({name,matches:expected,oldCountMs:+oldMs.toFixed(2),indexedCountAndPageMs:+indexedMs.toFixed(2)});
  }
  console.log(JSON.stringify({syntheticRecords:count,results},null,2));
}finally{reader?.close();store?.close();rmSync(directory,{recursive:true,force:true});}
