import { matchStyle, parseMatchFilter } from '../src/collection-view.js';

const aliases={0:'o',1:'i',l:'i',2:'z',3:'e',4:'a',5:'s',6:'g',9:'g',7:'t',8:'b'};
export const normalizedSearch=text=>text.toLowerCase().replace(/[0123456789l]/g,c=>aliases[c]||c);
export function searchCandidate(query){
  const terms=[...new Set(query.trim().split(/[\s,]+/).filter(Boolean))];
  // Short queries retain the exact fallback. FTS is only a superset prefilter;
  // the existing symmetric look-alike matcher makes the final decision.
  return terms.length&&terms.every(t=>/^[a-z0-9]{3,}$/i.test(t))?terms.map(t=>'"'+normalizedSearch(t)+'"').join(' OR '):null;
}
export function indexedMatch(position,kind,repeat,category,word,alias='wallets',wordExpression){
  const selected=parseMatchFilter(position||'all');if(!selected)throw new Error('Invalid match position.');
  const parts=wordExpression?[`mi.wallet_id=${alias}.id`]:[],args=[];
  if(selected.position!=='all'){parts.push('mi.position=?');args.push(selected.position);}
  if(selected.style!=='all'){parts.push('mi.style=?');args.push(selected.style);}
  const words=["mi.word!=''"];
  if(wordExpression)words.push(`mi.word=${wordExpression}`);
  else if(word){words.push('mi.word=?');args.push(word);}
  if(category&&category!=='all'){words.push('EXISTS (SELECT 1 FROM word_categories wc WHERE wc.word=mi.word AND wc.category=?)');args.push(category);}
  if(kind==='repeats'){
    if(word||wordExpression||(category&&category!=='all'))return {sql:'0',args:[]};
    parts.push("mi.word='' AND mi.repeat_length>=?");args.push(repeat);
  }else if(kind==='words'||word||wordExpression||(category&&category!=='all'))parts.push('('+words.join(' AND ')+')');
  else{parts.push(`((${words.join(' AND ')}) OR (mi.word='' AND mi.repeat_length>=?))`);args.push(repeat);}
  return {sql:wordExpression?`EXISTS (SELECT 1 FROM match_index mi WHERE ${parts.join(' AND ')})`:`${alias}.id IN (SELECT mi.wallet_id FROM match_index mi WHERE ${parts.length?parts.join(' AND '):'1'})`,args};
}
export function createArchiveIndex(db,categories){
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_words(wallet_id TEXT,word TEXT,PRIMARY KEY(wallet_id,word)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS word_wallet ON wallet_words(word,wallet_id);
    CREATE TABLE IF NOT EXISTS wallet_categories(wallet_id TEXT,category TEXT,PRIMARY KEY(wallet_id,category)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS category_wallet ON wallet_categories(category,wallet_id);
    CREATE TABLE IF NOT EXISTS word_categories(word TEXT,category TEXT,PRIMARY KEY(word,category)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS match_index(wallet_id TEXT,word TEXT,position TEXT,style TEXT,repeat_length INTEGER,PRIMARY KEY(wallet_id,word,position,style,repeat_length)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS match_position_style ON match_index(position,style,wallet_id,word);
    CREATE INDEX IF NOT EXISTS match_style ON match_index(style,wallet_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS wallet_search USING fts5(text, tokenize='trigram');
    CREATE INDEX IF NOT EXISTS saved_chain ON wallets(chain);
    CREATE INDEX IF NOT EXISTS saved_repeat ON wallets(streak DESC,score DESC);
    CREATE INDEX IF NOT EXISTS saved_word ON wallets(word_length DESC,score DESC);
    CREATE INDEX IF NOT EXISTS saved_matches ON wallets(hit_count DESC,score DESC);
    CREATE INDEX IF NOT EXISTS saved_az ON wallets(first_word COLLATE NOCASE,score DESC);
    CREATE TRIGGER IF NOT EXISTS archive_index_delete AFTER DELETE ON wallets BEGIN
      DELETE FROM wallet_words WHERE wallet_id=old.id;
      DELETE FROM wallet_categories WHERE wallet_id=old.id;
      DELETE FROM match_index WHERE wallet_id=old.id;
      DELETE FROM wallet_search WHERE rowid=old.rowid;
    END;`);
  const clearWords=db.prepare('DELETE FROM wallet_words WHERE wallet_id=?'),clearCategories=db.prepare('DELETE FROM wallet_categories WHERE wallet_id=?'),clearMatches=db.prepare('DELETE FROM match_index WHERE wallet_id=?');
  const putWord=db.prepare('INSERT OR IGNORE INTO wallet_words VALUES (?,?)'),putCategory=db.prepare('INSERT OR IGNORE INTO wallet_categories VALUES (?,?)'),putWordCategory=db.prepare('INSERT OR IGNORE INTO word_categories VALUES (?,?)'),putMatch=db.prepare('INSERT OR IGNORE INTO match_index VALUES (?,?,?,?,?)');
  const clearSearch=db.prepare('DELETE FROM wallet_search WHERE rowid=?'),putSearch=db.prepare('INSERT INTO wallet_search(rowid,text) VALUES (?,?)');
  const wordCategories=new Map();
  function update(id,w,rowid){
    clearWords.run(id);clearCategories.run(id);clearMatches.run(id);clearSearch.run(rowid);
    for(const word of new Set(w.hits.map(w=>w.toLowerCase()))){
      putWord.run(id,word);
      if(!wordCategories.has(word))wordCategories.set(word,categories.filter(([,test])=>test(word)).map(([id])=>id));
      for(const category of wordCategories.get(word)){putCategory.run(id,category);putWordCategory.run(word,category);}
    }
    const start=w.chain==='eth'?2:w.chain==='btc'?4:0,end=w.address.length;
    for(const h of w.highlights||[]){
      if(!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<start||h.end>end||h.end<=h.start)continue;
      const word=h.reason?.startsWith('Word: ')?h.reason.slice(6).toLowerCase():'';
      if(!word&&!h.reason?.endsWith('repeated characters'))continue;
      const positions=[];if(h.start===start)positions.push('first');if(h.end===end)positions.push('last');if(h.start>start&&h.end<end)positions.push('middle');
      const style=matchStyle(w,h,word||null,start,end)||'plain';
      for(const position of positions)putMatch.run(id,word,position,style,word?0:h.end-h.start);
      // Mandatory Solana L can qualify as both Proper/CAPS and lowercase.
      if(style!=='lowercase'&&matchStyle(w,h,word||null,start,end,'lowercase')==='lowercase'){
        for(const position of positions)putMatch.run(id,word,position,'lowercase',word?0:h.end-h.start);
      }
    }
    putSearch.run(rowid,normalizedSearch(`${w.address} ${w.hits.join(' ')}`));
  }
  return {update,reset(){db.exec('DELETE FROM wallet_words; DELETE FROM wallet_categories; DELETE FROM word_categories; DELETE FROM match_index; DELETE FROM wallet_search;');wordCategories.clear();}};
}
