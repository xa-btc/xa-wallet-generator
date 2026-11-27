import { createRunStats } from './run-stats.js';
import { acquireArchiveLock } from './archive-lock.js';
import { createPayloadParts } from './payload-parts.js';
import { createArchiveIndex, indexedMatch, searchCandidate } from './archive-index.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setImmediate as yieldToServer } from 'node:timers/promises';
import { resultSearch, matchCount, matchesPosition, parseMatchFilter } from '../src/collection-view.js';
import { RESULT_WORD_CATEGORIES, resultWordFilter, loadExpandedWords, selectedWords } from '../src/word-packs.js';

export async function createSavedStore(directory, {partBytes, maintenanceLock, log=()=>{}} = {}) {
  mkdirSync(join(directory, 'exports'), { recursive: true });
  const lock=maintenanceLock||acquireArchiveLock(directory);
  let payloads,db;
  try {
  const expanded = await loadExpandedWords();
  const categories = RESULT_WORD_CATEGORIES.filter(([id]) => id !== 'all').map(([id]) => [id, resultWordFilter(id, expanded)]);
  const positionMatch=(summary,position,kind,repeat,category,matchWord)=>matchesPosition(JSON.parse(summary),position,{showWords:kind!=='repeats',showRepeated:kind!=='words',minRepeat:repeat,wordFilter:matchWord ? word=>word.toLowerCase()===matchWord&&(!category||category==='all'||categories.find(([id])=>id===category)?.[1](word)) : categories.find(([id])=>id===category)?.[1]||null})?1:0;
  payloads=createPayloadParts(directory,partBytes);
  db = new DatabaseSync(join(directory, 'collections.sqlite'));
  db.function('match_position',positionMatch);
  db.function('word_category',(word,category)=>!category||category==='all'||categories.find(([id])=>id===category)?.[1](word)?1:0);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, chain TEXT NOT NULL, address TEXT NOT NULL,
      level INTEGER NOT NULL, score REAL NOT NULL, streak INTEGER NOT NULL, created TEXT NOT NULL,
      first_word TEXT NOT NULL, word_length INTEGER NOT NULL, hit_count INTEGER NOT NULL, word_count INTEGER NOT NULL,
      categories TEXT NOT NULL, search_text TEXT NOT NULL, summary TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS saved_rarity ON wallets(level DESC, score DESC);
    CREATE INDEX IF NOT EXISTS saved_created ON wallets(created DESC);
    CREATE TABLE IF NOT EXISTS archive_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, filename TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet_sources (batch_id TEXT NOT NULL, wallet_id TEXT NOT NULL, PRIMARY KEY(batch_id,wallet_id));
    CREATE INDEX IF NOT EXISTS wallet_sources_wallet ON wallet_sources(wallet_id);
    INSERT OR IGNORE INTO batches VALUES ('collected','Generated wallets',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'complete');
    INSERT OR IGNORE INTO wallet_sources SELECT 'collected',id FROM wallets WHERE NOT EXISTS (SELECT 1 FROM wallet_sources WHERE wallet_id=wallets.id);`);
  // Reclassify existing matched words when dictionaries change, without touching keys or scores.
  const hash=createHash('sha256');
  for(const [id] of categories)hash.update(id).update(JSON.stringify(selectedWords({[id]:true},expanded)));
  const revision=hash.digest('hex');
  if(db.prepare("SELECT value FROM archive_meta WHERE key='word_categories'").get()?.value!==revision){
    const update=db.prepare('UPDATE wallets SET categories=?,summary=? WHERE id=?');
    log('Refreshing saved word categories after a dictionary change.');
    let cursor='',classified=0;
    while(true){
      const rows=db.prepare('SELECT id,summary FROM wallets WHERE id>? ORDER BY id LIMIT 500').all(cursor);
      if(!rows.length)break;
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const row of rows){
          const summary=JSON.parse(row.summary);
          summary.categories=categories.filter(([,test])=>summary.hits.some(test)).map(([id])=>id);
          update.run(JSON.stringify(summary.categories),JSON.stringify(summary),row.id);
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');db.close();throw error;}
      classified+=rows.length;
      if(classified%10000===0)log(`Updated categories for ${classified.toLocaleString()} wallets.`);
      cursor=rows.at(-1).id;await yieldToServer();
    }
    db.prepare("INSERT OR REPLACE INTO archive_meta VALUES ('word_categories',?)").run(revision);
  }
  const runStats=createRunStats(db);
  const index=createArchiveIndex(db,categories);
  const indexRevision='4:'+revision;
  if(db.prepare("SELECT value FROM archive_meta WHERE key='search_index'").get()?.value!==indexRevision){
    log('Rebuilding the saved-wallet search index.');
    index.reset();let cursor='',indexed=0;
    while(true){
      const rows=db.prepare('SELECT id,rowid,summary FROM wallets WHERE id>? ORDER BY id LIMIT 500').all(cursor);
      if(!rows.length)break;
      db.exec('BEGIN IMMEDIATE');
      try{for(const row of rows)index.update(row.id,JSON.parse(row.summary),row.rowid);db.exec('COMMIT');}
      catch(error){db.exec('ROLLBACK');payloads.close();db.close();throw error;}
      cursor=rows.at(-1).id;indexed+=rows.length;if(indexed%10000===0)log(`Indexed ${indexed.toLocaleString()} wallets.`);await yieldToServer();
    }
    db.prepare("INSERT OR REPLACE INTO archive_meta VALUES ('search_index',?)").run(indexRevision);
    db.exec('PRAGMA optimize');
  }
  let lastQuery, search;
  db.function('word_search', (text, query) => {
    if (query !== lastQuery) { lastQuery = query; search = resultSearch(query); }
    return search({address:text,hits:[]}) ? 1 : 0;
  });
  const insert = db.prepare(`INSERT INTO wallets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET level=excluded.level,score=excluded.score,streak=excluded.streak,
      first_word=excluded.first_word,word_length=excluded.word_length,hit_count=excluded.hit_count,
      word_count=excluded.word_count,categories=excluded.categories,search_text=excluded.search_text,
      summary=excluded.summary,data=excluded.data`);
  const existing = db.prepare('SELECT data FROM wallets WHERE id = ?');
  function merge(a,b) {
    if(!a)return b;
    const best=b.score>a.score?b:a;
    return {...best,privateKey:a.privateKey,phrase:a.phrase,created:a.created,
      hits:[...new Set([...a.hits,...b.hits])],streak:Math.max(a.streak,b.streak),
      highlights:[...new Map([...(a.highlights||[]),...(b.highlights||[])].map(h=>[JSON.stringify(h),h])).values()],
      display:{head:Math.max(a.display?.head||6,b.display?.head||6),tail:Math.max(a.display?.tail||6,b.display?.tail||6)}};
  }
  function save(wallets, batchId='collected') {
    if (typeof batchId !== 'string' || !db.prepare('SELECT id FROM batches WHERE id=?').get(batchId)) throw new Error('Import batch not found.');
    if (!Array.isArray(wallets) || wallets.length > 2000) throw new Error('Invalid save batch.');
    if(!wallets.length)return {saved:0};
    const rows = wallets.map(w => {
      if (!w || !['sol','eth','btc'].includes(w.chain) || !/^[a-zA-Z0-9]{1,100}$/.test(w.address) ||
        typeof w.privateKey !== 'string' || !w.privateKey.length || w.privateKey.length > 300 ||
        (w.phrase != null && (typeof w.phrase !== 'string' || w.phrase.length > 500)) ||
        !Number.isInteger(w.level) || w.level < 0 || w.level > 6 || !Number.isFinite(w.score) ||
        !Array.isArray(w.hits) || w.hits.length > 10000 || !w.hits.every(h => typeof h === 'string' && /^[a-z0-9]{1,44}$/i.test(h)) ||
        !Number.isInteger(w.streak) || w.streak < 0 || w.streak > 100 || !Number.isFinite(Date.parse(w.created))) throw new Error('Invalid wallet record.');
      // Explicit public-field allowlist: private material never enters listing responses.
      const summary = Object.fromEntries(['chain','address','level','rank','score','streak','created','hits','highlights','display','quality','discoveryElapsedMs','discoveryRunId','generationMode','engine','path','format'].filter(k => k in w).map(k => [k,w[k]]));
      summary.id = `${w.chain}:${w.address}`;
      summary.hasPhrase = !!w.phrase;
      summary.categories = categories.filter(([,test]) => w.hits.some(test)).map(([id]) => id);
      return [summary.id,w.chain,w.address,w.level,w.score,w.streak,w.created,[...w.hits].sort()[0] || '~',
        Math.max(0,...w.hits.map(h=>h.length)),matchCount(w),w.hits.length,JSON.stringify(summary.categories),
        `${w.address} ${w.hits.join(' ')}`,JSON.stringify(summary),JSON.stringify(w)];
    });
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const old=existing.get(row[0]);
        if(old){
          const combined=merge(JSON.parse(payloads.read(old.data)),JSON.parse(row[14]));
          const publicData=JSON.parse(row[13]);
          for(const key of ['level','score','rank','quality','streak','hits','highlights','display','created','discoveryElapsedMs','discoveryRunId'])if(key in combined)publicData[key]=combined[key];
          publicData.categories=categories.filter(([,test])=>combined.hits.some(test)).map(([id])=>id);
          row[3]=combined.level;row[4]=combined.score;row[5]=combined.streak;
          row[7]=[...combined.hits].sort()[0]||'~';row[8]=Math.max(0,...combined.hits.map(w=>w.length));
          row[9]=matchCount(combined);row[10]=combined.hits.length;row[11]=JSON.stringify(publicData.categories);
          row[12]=`${combined.address} ${combined.hits.join(' ')}`;row[13]=JSON.stringify(publicData);row[14]=JSON.stringify(combined);
        }
        row[14]=payloads.put(row[14]);
        insert.run(...row);
        index.update(row[0],JSON.parse(row[13]),db.prepare('SELECT rowid FROM wallets WHERE id=?').get(row[0]).rowid);
        db.prepare('INSERT OR IGNORE INTO wallet_sources VALUES (?,?)').run(batchId,row[0]);
      }
      payloads.flush();
      db.exec('COMMIT');
    }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    return {saved:rows.length};
  }
  function selection(filters = {}) {
    const parts = [], args = [];
    const rank = Number(filters.minRank || 0), repeat = Number(filters.minRepeat || 3);
    if (!Number.isInteger(rank) || rank < 0 || rank > 6 || !Number.isInteger(repeat) || repeat < 3 || repeat > 100) throw new Error('Invalid filters.');
    parts.push('level >= ?'); args.push(rank);
    if(filters.matchWord){
      if(typeof filters.matchWord!=='string'||!/^[a-z0-9]{1,44}$/.test(filters.matchWord))throw new Error('Invalid matched word.');
      parts.push("EXISTS (SELECT 1 FROM wallet_words ww WHERE ww.wallet_id=wallets.id AND ww.word = ?)");args.push(filters.matchWord);
    }
    if(filters.position && filters.position!=='all'){
      if(!parseMatchFilter(filters.position))throw new Error('Invalid match position.');
      const match=indexedMatch(filters.position,filters.kind||'all',repeat,filters.category||'all',filters.matchWord||'');parts.push(match.sql);args.push(...match.args);
    }
    if (filters.chain && filters.chain !== 'all') { if (!['sol','eth','btc'].includes(filters.chain)) throw new Error('Invalid chain.'); parts.push('chain = ?'); args.push(filters.chain); }
    if (filters.category && filters.category !== 'all') {
      if (!categories.some(([id])=>id===filters.category)) throw new Error('Invalid category.');
      parts.push('EXISTS (SELECT 1 FROM wallet_categories wc WHERE wc.wallet_id=wallets.id AND wc.category = ?)'); args.push(filters.category);
    }
    if (filters.kind === 'words') parts.push('word_count > 0');
    else if (filters.kind === 'repeats') { parts.push('streak >= ?'); args.push(repeat); }
    else if (filters.kind && filters.kind !== 'all') throw new Error('Invalid result type.');
    if (filters.query) { if (typeof filters.query !== 'string' || filters.query.length > 128) throw new Error('Invalid query.'); const candidate=searchCandidate(filters.query);if(candidate){parts.push('wallets.rowid IN (SELECT rowid FROM wallet_search WHERE wallet_search MATCH ?)');args.push(candidate);}if(filters.exactText===true||filters.exactText==='true'){
      const terms=[...new Set(filters.query.trim().split(/[\s,]+/).filter(Boolean))];
      if(terms.length){parts.push('('+terms.map(()=> 'instr(address, ?) > 0').join(' OR ')+')');args.push(...terms);}
    }else{parts.push('word_search(search_text, ?)');args.push(filters.query);} }
    const order = {score:'level DESC, score DESC, created DESC',new:'created DESC',repeat:'streak DESC, score DESC',word:'word_length DESC, score DESC',az:'first_word COLLATE NOCASE, score DESC',matches:'hit_count DESC, score DESC'}[filters.sort || 'new'];
    if (!order) throw new Error('Invalid sort.');
    return {where:parts.join(' AND '),args,order};
  }
  function list(filters = {}) {
    const {where,args,order} = selection(filters);
    const size = Math.min(100, Math.max(1, Math.trunc(Number(filters.pageSize) || 40)));
    const total = db.prepare('SELECT count(*) AS n FROM wallets').get().n;
    const filtered = db.prepare(`SELECT count(*) AS n FROM wallets WHERE ${where}`).get(...args).n;
    const page = Math.min(Math.max(0,Math.trunc(Number(filters.page) || 0)),Math.max(0,Math.ceil(filtered/size)-1));
    const wallets = db.prepare(`SELECT summary FROM wallets WHERE ${where} ORDER BY ${order}, id LIMIT ? OFFSET ?`).all(...args,size,page*size).map(row=>JSON.parse(row.summary));
    let words;
    if(filters.includeWords==='true'){
      // Facet counts respect every active filter except the selected word itself.
      const facet=selection({...filters,matchWord:''});
      const wordParts=[facet.where],wordArgs=[...facet.args];
      if(filters.category&&filters.category!=='all'){wordParts.push('EXISTS (SELECT 1 FROM word_categories wc WHERE wc.word=h.word AND wc.category=?)');wordArgs.push(filters.category);}
      if(filters.position&&filters.position!=='all'){
        const match=indexedMatch(filters.position,filters.kind||'all',Number(filters.minRepeat||3),filters.category||'all',null,'wallets','h.word');wordParts.push(match.sql);wordArgs.push(...match.args);
      }
      words=db.prepare(`SELECT h.word AS word,count(*) AS count,max(wallets.level) AS level,max(wallets.score) AS score,max(wallets.streak) AS streak FROM wallets JOIN wallet_words h ON h.wallet_id=wallets.id WHERE ${wordParts.join(' AND ')} GROUP BY h.word ORDER BY h.word`).all(...wordArgs).map(({word,count,level,score,streak})=>[word,count,level,score,streak]);
    }
    return {wallets,total,filtered,page,pageSize:size,...(words?{words}:{})};
  }
  function get(id) {
    const row = db.prepare('SELECT data FROM wallets WHERE id = ?').get(String(id));
    if (!row) throw new Error('Saved wallet not found.');
    return JSON.parse(payloads.read(row.data));
  }
  function beginImport(filename) {
    if(typeof filename!=='string' || !filename.trim() || filename.length>255 || /[\x00-\x1f]/.test(filename))throw new Error('Invalid filename.');
    const id=randomUUID();
    db.prepare('INSERT INTO batches VALUES (?,?,?,?)').run(id,filename,new Date().toISOString(),'importing');
    return {id};
  }
  function finishImport(id,status='complete') {
    if(id==='collected' || !['complete','partial'].includes(status))throw new Error('Invalid batch.');
    if(!db.prepare('UPDATE batches SET status=? WHERE id=?').run(status,id).changes)throw new Error('Import batch not found.');
    return {ok:true};
  }
  function listBatches() {
    return db.prepare(`SELECT b.id,b.filename,b.created,b.status,count(s.wallet_id) AS wallets FROM batches b
      LEFT JOIN wallet_sources s ON s.batch_id=b.id WHERE b.id!='collected' GROUP BY b.id ORDER BY b.created DESC,b.id`).all();
  }
  function deleteWallet(id){
    if(typeof id!=='string'||id.length>110||!db.prepare('SELECT 1 FROM wallets WHERE id=?').get(id))throw new Error('Saved wallet not found.');
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('DELETE FROM wallet_sources WHERE wallet_id=?').run(id);
      const removed=db.prepare('DELETE FROM wallets WHERE id=?').run(id).changes;
      db.exec('COMMIT');return {removed};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function deleteBatch(id) {
    if(typeof id!=='string' || id==='collected' || !db.prepare('SELECT id FROM batches WHERE id=?').get(id))throw new Error('Import batch not found.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const total=db.prepare('SELECT count(*) AS n FROM wallet_sources WHERE batch_id=?').get(id).n;
      const removed=db.prepare(`DELETE FROM wallets WHERE id IN (SELECT wallet_id FROM wallet_sources WHERE batch_id=?)
        AND NOT EXISTS (SELECT 1 FROM wallet_sources WHERE wallet_id=wallets.id AND batch_id!=?)`).run(id,id).changes;
      db.prepare('DELETE FROM wallet_sources WHERE batch_id=?').run(id);
      db.prepare('DELETE FROM batches WHERE id=?').run(id);
      db.exec('COMMIT');return {removed,retained:total-removed};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  async function exportFile({ids,filters,importBatch=false} = {}) {
    if(typeof importBatch!=='boolean')throw new Error('Invalid import option.');
    let rows, reader;
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.length > 1999998 || !ids.every(id=>typeof id==='string' && id.length <= 110)) throw new Error('Invalid export selection.');
      const unique=[...new Set(ids)];
      rows = (function*(){ for(const id of unique)yield {data:JSON.stringify(get(id))}; })();
    } else {
      const {where,args,order} = selection(filters);
      // A separate WAL reader keeps exports stable while a live hunt keeps saving.
      reader = new DatabaseSync(join(directory,'collections.sqlite'),{readOnly:true});
      reader.function('match_position',positionMatch);
      const matchQuery=resultSearch(filters?.query || '');
      reader.function('word_search',(text,_query)=>matchQuery({address:text,hits:[]})?1:0);
      reader.exec('BEGIN');
      rows = reader.prepare(`SELECT data FROM wallets WHERE ${where} ORDER BY ${order}, id`).iterate(...args);
    }
    const name = `xa-wallet-generator-${Date.now()}-${randomUUID().slice(0,8)}.wallets.json`;
    const path = join(directory,'exports',name);
    let fd,batch;
    let pending=[];
    let count = 0;
    try {
      fd = openSync(path,'wx',0o600);
      if(importBatch)batch=beginImport(name);
      writeSync(fd,'{"app":"XA Wallet Generator","version":1,"network":"mainnet","warning":"SECRET: unencrypted private keys and recovery phrases","wallets":[');
      for (const row of rows) {
        const data=payloads.read(row.data);
        writeSync(fd,(count ? ',' : '')+data);
        if(batch){pending.push(JSON.parse(data));if(pending.length>=500){save(pending,batch.id);pending=[];}}
        if (++count % 100 === 0) await yieldToServer();
      }
      writeSync(fd,']}');
      if(batch){if(pending.length)save(pending,batch.id);finishImport(batch.id);}
    } catch (error) { if(fd!==undefined){closeSync(fd);fd=undefined;unlinkSync(path);}if(batch)deleteBatch(batch.id);throw error; }
    finally { if(fd!==undefined)closeSync(fd);if(reader){reader.exec('ROLLBACK');reader.close();} }
    return {count,path:`saved/exports/${name}`,...(batch?{batchId:batch.id}:{})};
  }
  let closed=false;
  return {recordRun:runStats.record,runTotals:runStats.totals,save,list,get,exportFile,beginImport,finishImport,listBatches,deleteBatch,deleteWallet,close:()=>{if(closed)return;closed=true;payloads.close();db.close();if(!maintenanceLock)lock.release();}};
  } catch(error) {
    try{payloads?.close();}catch{}try{db?.close();}catch{}
    if(!maintenanceLock)lock.release();throw error;
  }
}
