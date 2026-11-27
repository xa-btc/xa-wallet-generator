import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createSavedStore } from '../server/saved-store.js';
import { createPayloadParts } from '../server/payload-parts.js';
import { partitionArchive } from '../server/archive-maintenance.js';
import { collectionView } from '../src/collection-view.js';

const fixture=(i,text='MOON')=>({chain:'sol',address:`abc${i}xyz${text}`,privateKey:`PUBLIC-FIXTURE-KEY-${i}`,phrase:null,hits:['moon'],level:4,rank:'Legendary',score:90,streak:0,created:'2026-10-30T12:00:00.000Z',highlights:[{start:`abc${i}xyz`.length,end:`abc${i}xyz${text}`.length,reason:'Word: moon'}]});

test('payload parts roll over, preserve deduplication, reopen, and exclude keys from catalog',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'wallet-parts-'));let store;
  try{
    store=await createSavedStore(dir,{partBytes:1024});
    const wallets=Array.from({length:12},(_,i)=>fixture(i));store.save(wallets);
    store.save([{...wallets[0],privateKey:'DO-NOT-REPLACE-ORIGINAL',score:120}]);
    assert.equal(store.list().total,12);assert.equal(store.get('sol:'+wallets[0].address).privateKey,wallets[0].privateKey);
    const files=readdirSync(join(dir,'parts'));assert.ok(files.length>1);
    assert.ok(files.every(f=>statSync(join(dir,'parts',f)).size<=1024));
    const db=new DatabaseSync(join(dir,'collections.sqlite'),{readOnly:true});
    assert.ok(db.prepare('SELECT data FROM wallets').all().every(r=>JSON.parse(r.data).$payload&&!r.data.includes('PUBLIC-FIXTURE')));db.close();
    await assert.rejects(()=>createSavedStore(dir),/already open/);
    store.close();store=await createSavedStore(dir,{partBytes:1024});
    for(const w of wallets)assert.equal(store.get('sol:'+w.address).privateKey,w.privateKey);
    const result=await store.exportFile({filters:{position:'last:caps'}});
    assert.equal(result.count,12);assert.equal(JSON.parse(readFileSync(join(dir,'exports',result.path.split('/').at(-1)),'utf8')).wallets.length,12);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('offline migration backs up inline payloads, verifies them and can resume mixed storage',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'wallet-migration-'));let store;
  try{
    const wallets=Array.from({length:8},(_,i)=>fixture(i));
    store=await createSavedStore(dir,{partBytes:1024});store.save(wallets);store.close();store=undefined;
    const db=new DatabaseSync(join(dir,'collections.sqlite'));
    for(const w of wallets.slice(0,4))db.prepare('UPDATE wallets SET data=? WHERE id=?').run(JSON.stringify(w),'sol:'+w.address);
    db.close();
    const result=await partitionArchive(dir,{partBytes:1024});assert.equal(result.wallets,8);assert.equal(result.moved,4);
    const backupDb=new DatabaseSync(join(result.backup,'collections.sqlite'),{readOnly:true}),backupParts=createPayloadParts(result.backup);
    for(const row of backupDb.prepare('SELECT data FROM wallets').all())assert.ok(JSON.parse(backupParts.read(row.data)).privateKey.startsWith('PUBLIC-FIXTURE'));
    backupParts.close();backupDb.close();
    store=await createSavedStore(dir);for(const w of wallets)assert.deepEqual(store.get('sol:'+w.address),w);
    store.close();store=undefined;
    const second=await partitionArchive(dir,{partBytes:1024});assert.equal(second.moved,0);assert.equal(second.payloadDigest,result.payloadDigest);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('indexed position/style and alias searches retain exact filter semantics',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'wallet-index-'));let store;
  try{
    store=await createSavedStore(dir);
    const wallets=['MOON','Moon','mOoN','M00N','moon'].map((text,i)=>fixture(i,text));store.save(wallets);
    for(const position of ['all','first','last','middle','caps','last:caps','last:proper','all:replacement'])for(const query of ['','moon','m00n','moo','mo','ill','1ll','oo, mo','x.y']){
      const expected=collectionView(wallets,{position,query});
      assert.equal(store.list({position,query}).filtered,expected.length,position+':'+query);
    }
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('failed catalog transactions retain prior keys and payload corruption is rejected',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'wallet-atomic-'));let store;
  try{
    store=await createSavedStore(dir);const a=fixture(1),b=fixture(2);store.save([a]);
    const db=new DatabaseSync(join(dir,'collections.sqlite'));
    db.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON wallet_words WHEN new.wallet_id='sol:abc2xyzMOON' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    assert.throws(()=>store.save([{...a,score:120},b]),/fixture failure/);
    assert.deepEqual(store.get('sol:'+a.address),a);assert.equal(store.list().total,1);
    db.exec('DROP TRIGGER reject_fixture');
    const pointer=JSON.parse(db.prepare('SELECT data FROM wallets WHERE id=?').get('sol:'+a.address).data);db.close();
    store.close();store=undefined;
    const path=join(dir,'parts',pointer.$payload),bytes=readFileSync(path);bytes[pointer.offset]^=1;writeFileSync(path,bytes);
    store=await createSavedStore(dir);assert.throws(()=>store.get('sol:'+a.address),/checksum/);
    await assert.rejects(()=>store.exportFile({ids:['sol:'+a.address]}),/checksum/);
    assert.equal(readdirSync(join(dir,'exports')).length,0);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
