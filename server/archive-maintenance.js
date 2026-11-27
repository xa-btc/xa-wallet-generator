import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readdirSync, copyFileSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as yieldToServer } from 'node:timers/promises';
import { acquireArchiveLock } from './archive-lock.js';
import { createPayloadParts } from './payload-parts.js';
import { createSavedStore } from './saved-store.js';

export async function partitionArchive(directory,{partBytes,log=()=>{}}={}){
  const lock=acquireArchiveLock(directory);
  let db,parts;
  try{
    const catalog=join(directory,'collections.sqlite'),size=statSync(catalog).size;
    const space=statfsSync(directory);
    mkdirSync(join(directory,'parts'),{recursive:true});
    const partFiles=readdirSync(join(directory,'parts'),{withFileTypes:true}).filter(e=>e.isFile()&&/^wallets-\d{6}\.jsonl$/.test(e.name));
    const payloadSize=partFiles.reduce((n,e)=>n+statSync(join(directory,'parts',e.name)).size,0);
    if(space.bavail*space.bsize<size*3+payloadSize*2+256*1024*1024)throw new Error('Not enough free space for a backup, parts and catalog compaction.');
    const destination=join(directory,'backups','partition-'+new Date().toISOString().replace(/[:.]/g,'-'));
    mkdirSync(join(destination,'parts'),{recursive:true});
    db=new DatabaseSync(catalog,{readOnly:true});
    await backup(db,join(destination,'collections.sqlite'));db.close();db=undefined;
    for(const entry of partFiles)copyFileSync(join(directory,'parts',entry.name),join(destination,'parts',entry.name));
    log('Backup complete. Building search indexes.');
    const store=await createSavedStore(directory,{partBytes,maintenanceLock:lock,log});store.close();
    db=new DatabaseSync(catalog);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    parts=createPayloadParts(directory,partBytes);
    const original=createHash('sha256');let cursor='',count=0,moved=0;
    const update=db.prepare('UPDATE wallets SET data=? WHERE id=?');
    while(true){
      const rows=db.prepare('SELECT id,data FROM wallets WHERE id>? ORDER BY id LIMIT 500').all(cursor);
      if(!rows.length)break;
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const row of rows){
          const data=parts.read(row.data);
          original.update(JSON.stringify([row.id,data]));
          const stored=JSON.parse(row.data);
          if(!stored.$payload||stored.chain){update.run(parts.put(data),row.id);moved++;}
        }
        parts.flush();db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      cursor=rows.at(-1).id;count+=rows.length;
      if(count%10000===0)log(`Partitioned/checked ${count.toLocaleString()} records.`);
      await yieldToServer();
    }
    const verified=createHash('sha256');let checked=0;
    for(const row of db.prepare('SELECT id,data FROM wallets ORDER BY id').iterate()){
      verified.update(JSON.stringify([row.id,parts.read(row.data)]));checked++;
      if(checked%5000===0)await yieldToServer();
    }
    const digest=original.digest('hex');
    if(count!==checked||digest!==verified.digest('hex'))throw new Error('Archive verification failed. Original backup retained.');
    log('Every wallet payload verified. Compacting the catalog.');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');
    const integrity=db.prepare('PRAGMA integrity_check').all();
    if(integrity.some(row=>row.integrity_check!=='ok'))throw new Error('Catalog integrity verification failed.');
    const result={wallets:count,moved,payloadDigest:digest,catalogBefore:size,catalogAfter:statSync(catalog).size,backup:destination};
    writeFileSync(join(destination,'verification.json'),JSON.stringify(result,null,2)+'\n');
    return result;
  }finally{parts?.close();db?.close();lock.release();}
}
