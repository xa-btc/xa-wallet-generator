import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createSavedStore } from '../server/saved-store.js';
import { savedBridge } from '../server/saved-bridge.js';
import { DatabaseSync } from 'node:sqlite';

const wallet=(address,hits,level=4)=>({chain:'sol',address,privateKey:'PUBLIC-TEST-FIXTURE-NOT-A-REAL-KEY',phrase:null,
  hits,level,rank:['Common','Rare','Ultra','Epic','Legendary','Mythic','Godlike'][level],score:level*25,streak:0,
  highlights:hits.length?[{start:0,end:4,reason:'Word: '+hits[0]}]:[],display:{head:6,tail:6},created:'2026-10-30T12:00:00.000Z'});

test('saved position filters apply to list totals and filtered exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-position-')),store=await createSavedStore(folder);
  try{
    const first=wallet('moonAbcd',['moon']),last={...wallet('Abcdmoon',['moon']),highlights:[{start:4,end:8,reason:'Word: moon'}]};
    store.save([first,last]);
    assert.equal(store.list({position:'first'}).filtered,1);
    assert.equal(store.list({position:'last',category:'crypto'}).wallets[0].address,last.address);
    assert.equal(store.list({position:'middle'}).filtered,0);
    assert.throws(()=>store.list({position:'invalid'}),/position/);
    const exported=await store.exportFile({filters:{position:'last'}});
    assert.equal(exported.count,1);
    assert.equal(JSON.parse(readFileSync(join(folder,'exports',exported.path.split('/').at(-1)),'utf8')).wallets[0].address,last.address);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('saved matched-word counts cover every page and exact selection controls exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-word-picker-')),store=await createSavedStore(folder);
  try{
    store.save([wallet('moonAbcd',['moon','moon','sol']),wallet('moonXyz',['moon']),wallet('moonshotAbcd',['moonshot'])]);
    const all=store.list({includeWords:'true',pageSize:1});
    assert.equal(all.wallets.length,1);
    assert.deepEqual(all.words,[['moon',2,4,100,0],['moonshot',1,4,100,0],['sol',1,4,100,0]]);
    assert.equal(store.list({matchWord:'moon'}).filtered,2);
    assert.equal(store.list({matchWord:'moonshot'}).filtered,1);
    assert.equal(store.list({matchWord:'absent'}).filtered,0);
    assert.throws(()=>store.list({matchWord:"' OR 1=1"}),/matched word/);
    const exported=await store.exportFile({filters:{matchWord:'moon'}});
    assert.equal(exported.count,2);
    const rows=JSON.parse(readFileSync(join(folder,'exports',exported.path.split('/').at(-1)),'utf8')).wallets;
    assert.ok(rows.every(w=>w.hits.includes('moon')));
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('matching-word facets honor category, rarity, query and the position of each word',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-word-facets-')),store=await createSavedStore(folder);
  try{
    const mixed={...wallet('moonZzoozoo',['moon','zoozoo']),highlights:[{start:0,end:4,reason:'Word: moon'},{start:5,end:11,reason:'Word: zoozoo'}]};
    store.save([mixed,wallet('zoozooAbcd',['zoozoo'],1)]);
    const list=filters=>store.list({includeWords:'true',...filters}).words;
    assert.deepEqual(list({category:'crypto'}).map(([w])=>w),['moon']);
    assert.deepEqual(list({position:'last'}).map(([w])=>w),['zoozoo']);
    assert.deepEqual(list({position:'last',category:'crypto'}),[]);
    assert.deepEqual(list({minRank:6}),[]);
    assert.deepEqual(list({query:'nomatch'}),[]);
    assert.equal(list({minRank:4}).find(([w])=>w==='zoozoo')[1],1);
    // The picker must remain usable after selecting a word.
    assert.equal(list({matchWord:'moon'}).length,2);
    for(const [word,count] of list({category:'crypto'}))assert.equal(store.list({category:'crypto',matchWord:word}).filtered,count);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('dictionary updates reclassify saved tags without changing wallet keys or batch ownership',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-category-update-'));let store=await createSavedStore(folder);
  try{
    const batch=store.beginImport('old-export.wallets.json'),fixture=wallet('AmericaAbcd',['america']);
    store.save([fixture],batch.id);store.finishImport(batch.id);store.close();
    const old=new DatabaseSync(join(folder,'collections.sqlite'));
    old.exec("UPDATE wallets SET categories='[]',summary=json_set(summary,'$.categories',json('[]')); DELETE FROM archive_meta WHERE key='word_categories';");old.close();
    store=await createSavedStore(folder);
    assert.equal(store.list({category:'countries'}).filtered,1);
    assert.deepEqual(store.get('sol:'+fixture.address),fixture);
    assert.equal(store.listBatches()[0].id,batch.id);
    assert.deepEqual(store.deleteBatch(batch.id),{removed:1,retained:0});
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('export can optionally create an import batch and cleans up failed exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-export-import-')),store=await createSavedStore(folder);
  try{
    const fixture=wallet('ExportImportAbcd',['hodl']);store.save([fixture]);
    const ids=['sol:'+fixture.address];
    await store.exportFile({ids});assert.equal(store.listBatches().length,0);
    const result=await store.exportFile({ids,importBatch:true});
    const [batch]=store.listBatches();assert.equal(batch.id,result.batchId);
    assert.equal(batch.filename,result.path.split('/').at(-1));assert.equal(batch.wallets,1);assert.equal(batch.status,'complete');
    assert.equal(store.list().total,1);
    assert.equal(JSON.parse(readFileSync(join(folder,'exports',batch.filename),'utf8')).wallets[0].privateKey,fixture.privateKey);
    assert.deepEqual(store.deleteBatch(batch.id),{removed:0,retained:1});
    const files=readdirSync(join(folder,'exports')).length;
    await assert.rejects(store.exportFile({ids:[...ids,'sol:Missing'],importBatch:true}));
    assert.equal(store.listBatches().length,0);assert.equal(store.list().total,1);
    assert.equal(readdirSync(join(folder,'exports')).length,files);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('archive persists deduplicated wallets, filters metadata, and writes recoverable exports inside project storage', async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-archive-test-'));
  let store=await createSavedStore(folder);
  try{
    const a=wallet('Abc5enate',['senate']),b=wallet('CryptoHodl',['hodl'],6),repeat={...wallet('AAAAAAbcd',[]),streak:6};
    store.save([a,b,a,repeat]);assert.equal(store.list().total,3);
    const result=store.list({category:'politics',query:'5enate',minRank:4});
    assert.equal(result.filtered,1);assert.equal(result.wallets[0].address,a.address);
    assert.ok(!JSON.stringify(result).includes(a.privateKey));assert.ok(!('phrase' in result.wallets[0]));
    assert.equal(store.list({kind:'repeats',minRepeat:6}).filtered,1);
    assert.equal(store.list({minRank:6}).filtered,1);
    assert.equal(store.list({page:100,pageSize:2}).page,1);
    assert.equal(store.list({query:"' OR 1=1 --"}).filtered,0);
    store.close();store=await createSavedStore(folder);
    assert.equal(store.list().total,3);assert.deepEqual(store.get('sol:'+a.address),a);
    const exported=await store.exportFile({filters:{category:'politics',query:'5enate'}});
    assert.equal(exported.count,1);
    const file=JSON.parse(readFileSync(join(folder,'exports',exported.path.split('/').at(-1)),'utf8'));
    assert.deepEqual(file.wallets,[a]);
    const specific=await store.exportFile({ids:['sol:'+b.address]});assert.equal(specific.count,1);
    assert.throws(()=>store.save([a,{...b,privateKey:null}]));assert.equal(store.list().total,3);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('import batches survive restart and deletion retains shared and generated wallets', async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-batches-test-'));let store=await createSavedStore(folder);
  try{
    const first=store.beginImport('first.wallets.json'),second=store.beginImport('second.wallets.json');
    const onlyFirst=wallet('OnlyFirst',['moon']),shared=wallet('SharedAbcd',['hodl']),generated=wallet('GeneratedAbcd',['senate']);
    store.save([generated]);store.save([onlyFirst,shared,generated],first.id);store.save([shared],second.id);
    store.finishImport(first.id);store.finishImport(second.id,'partial');
    assert.equal(store.listBatches().length,2);assert.equal(store.list().total,3);
    store.close();store=await createSavedStore(folder);
    assert.equal(store.listBatches().find(b=>b.id===first.id).wallets,3);
    assert.deepEqual(store.deleteBatch(first.id),{removed:1,retained:2});
    assert.equal(store.list().total,2);assert.throws(()=>store.get('sol:'+onlyFirst.address));
    assert.deepEqual(store.deleteBatch(second.id),{removed:1,retained:0});
    assert.equal(store.get('sol:'+generated.address).privateKey,generated.privateKey);
    assert.equal(store.listBatches().length,0);assert.throws(()=>store.deleteBatch('collected'));
    assert.throws(()=>store.save([shared],first.id));
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('saved API requires local same-origin headers and blocks direct archive file access', async()=>{
  const root=mkdtempSync(join(tmpdir(),'wallet-archive-http-')),folder=join(root,'saved');
  mkdirSync(folder);writeFileSync(join(folder,'private.wallets.json'),'PRIVATE-FIXTURE');
  const store=await createSavedStore(folder);
  const server=await createServer({root,configFile:false,plugins:[savedBridge(store)],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
  await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  const headers={'X-Wallet-Forge':'local','Content-Type':'application/json'};
  try{
    assert.equal((await fetch(url+'/api/saved/list')).status,403);
    assert.equal((await fetch(url+'/api/saved/run-totals')).status,403);
    const checkpoint={id:'http-test-run-0001',source:'gpu',checked:123456,elapsedMs:42000,done:true};
    assert.equal((await fetch(url+'/api/saved/run-progress',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:JSON.stringify(checkpoint)})).status,403);
    for(let i=0;i<2;i++)assert.equal((await fetch(url+'/api/saved/run-progress',{method:'POST',headers,body:JSON.stringify(checkpoint)})).status,200);
    const totals=await(await fetch(url+'/api/saved/run-totals?id='+checkpoint.id,{headers})).json();
    assert.equal(totals.checked,'123456');assert.equal(totals.elapsedMs,'42000');assert.equal(totals.runs,'1');
    assert.throws(()=>store.recordRun({...checkpoint,checked:123457}),/source/);
    assert.equal((await fetch(url+'/api/saved/list',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
    for(const path of ['/saved/private.wallets.json','/saved/collections.sqlite','/@fs/'+folder.replaceAll('\\','/')+'/private.wallets.json'])assert.equal((await fetch(url+path)).status,403);
    const fixture=wallet('ArchiveAbcd',['hodl']);
    assert.equal((await fetch(url+'/api/saved/collect',{method:'POST',headers,body:JSON.stringify({wallets:[fixture]})})).status,200);
    const listing=await(await fetch(url+'/api/saved/list',{headers})).json();assert.equal(listing.total,1);assert.ok(!JSON.stringify(listing).includes(fixture.privateKey));
    const reveal=await(await fetch(url+'/api/saved/reveal',{method:'POST',headers,body:JSON.stringify({id:'sol:'+fixture.address})})).json();assert.equal(reveal.wallet.privateKey,fixture.privateKey);
  }finally{await server.close();store.close();rmSync(root,{recursive:true,force:true});}
});


test('saved casing filters apply to legacy matches, facets and exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-casing-')),store=await createSavedStore(folder);
  try{
    const forms=[['MOONxyz','caps'],['Moonxyz','proper'],['mOoNxyz','scattered'],['M00Nxyz','replacement'],['moonxyz','lowercase']];
    store.save(forms.map(([address])=>wallet(address,['moon'])));
    for(const [address,position] of forms.filter(([,style])=>style)){
      const result=store.list({position,includeWords:'true'});
      assert.equal(result.filtered,1);assert.equal(result.wallets[0].address,address);
      assert.equal(result.words[0][0],'moon');assert.equal(result.words[0][1],1);
      assert.equal(store.list({position,matchWord:'sol'}).filtered,0);
      const exported=await store.exportFile({filters:{position}});
      assert.equal(exported.count,1);
      assert.equal(JSON.parse(readFileSync(join(folder,'exports',exported.path.split('/').at(-1)),'utf8')).wallets[0].address,address);
    }
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});


test('saved combined position and casing filters agree for totals, facets and exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-combined-')),store=await createSavedStore(folder);
  try{
    store.save([wallet('MOONxyzmoon',['moon']),{...wallet('xyzMOON',['moon']),highlights:[{start:3,end:7,reason:'Word: moon'}]}]);
    const result=store.list({position:'last:caps',includeWords:'true'});
    assert.equal(result.filtered,1);assert.equal(result.wallets[0].address,'xyzMOON');
    assert.equal(result.words[0][1],1);
    assert.equal(store.list({position:'all:caps'}).filtered,2);
    assert.equal(store.list({position:'last:proper'}).filtered,0);
    const exported=await store.exportFile({filters:{position:'last:caps'}});
    assert.equal(exported.count,1);
    assert.throws(()=>store.list({position:'last:invalid'}),/position/);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('saved lowercase index includes mandatory Solana L and rebuilds legacy entries',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-lower-'));let store=await createSavedStore(folder);
  try{
    store.save([wallet('Lovexyz',['love']),wallet('LoVexyz',['love'])]);
    assert.equal(store.list({position:'first:lowercase',includeWords:'true'}).filtered,1);
    assert.equal(store.list({position:'first:proper'}).filtered,1);
    const result=store.list({position:'first:lowercase',includeWords:'true'});
    assert.equal(result.wallets[0].address,'Lovexyz');
    assert.equal(result.words[0][1],1);
    assert.equal((await store.exportFile({filters:{position:'first:lowercase'}})).count,1);
    store.close();
    const db=new DatabaseSync(join(folder,'collections.sqlite'));
    db.exec("DELETE FROM match_index WHERE style='lowercase'; UPDATE archive_meta SET value='legacy' WHERE key='search_index';");db.close();
    store=await createSavedStore(folder);
    assert.equal(store.list({position:'first:lowercase'}).filtered,1);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('deleting one wallet removes its batch memberships, facets and export access',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-delete-one-')),store=await createSavedStore(folder);
  try{
    const a=wallet('DeleteAbcd',['moon']),b=wallet('RetainAbcd',['hodl']);
    const first=store.beginImport('one.json'),second=store.beginImport('two.json');
    store.save([a,b]);store.save([a,b],first.id);store.save([a],second.id);
    assert.deepEqual(store.deleteWallet('sol:'+a.address),{removed:1});
    assert.equal(store.list({includeWords:'true'}).total,1);
    assert.ok(!store.list({includeWords:'true'}).words.some(([word])=>word==='moon'));
    assert.equal(store.listBatches().find(x=>x.id===first.id).wallets,1);
    assert.equal(store.listBatches().find(x=>x.id===second.id).wallets,0);
    assert.throws(()=>store.get('sol:'+a.address));
    await assert.rejects(store.exportFile({ids:['sol:'+a.address]}));
    assert.equal(store.get('sol:'+b.address).address,b.address);
    assert.throws(()=>store.deleteWallet('sol:'+a.address));
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('saved exact search uses literal address casing for results, facets and exports',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-exact-saved-')),store=await createSavedStore(folder);
  try{
    store.save([wallet('xyzSoLxyz',['sol']),wallet('xyzsolxyz',['sol']),wallet('xyz5oLxyz',['sol'])]);
    assert.equal(store.list({query:'SoL'}).filtered,3);
    const filters={query:'SoL',exactText:'true',includeWords:'true'};
    const result=store.list(filters);assert.equal(result.filtered,1);assert.equal(result.wallets[0].address,'xyzSoLxyz');
    assert.equal(result.words[0][1],1);
    assert.equal(store.list({query:'SOL',exactText:true}).filtered,0);
    assert.equal(store.list({query:'SoL,5oL',exactText:true}).filtered,2);
    const exported=await store.exportFile({filters});assert.equal(exported.count,1);
    assert.equal(store.list({query:"' OR 1=1 --",exactText:true}).filtered,0);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});
