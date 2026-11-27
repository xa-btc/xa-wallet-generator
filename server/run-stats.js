export function createRunStats(db){
  db.exec(`CREATE TABLE IF NOT EXISTS generation_runs (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, checked INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL, done INTEGER NOT NULL, updated TEXT NOT NULL);`);
  const upsert=db.prepare(`INSERT INTO generation_runs VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET checked=max(checked,excluded.checked),
    elapsed_ms=max(elapsed_ms,excluded.elapsed_ms),done=max(done,excluded.done),updated=excluded.updated
    WHERE source=excluded.source`);
  const aggregate=db.prepare('SELECT coalesce(sum(checked),0) AS checked,coalesce(sum(elapsed_ms),0) AS elapsedMs,count(*) AS runs FROM generation_runs');
  aggregate.setReadBigInts(true);
  function record({id,source,checked,elapsedMs,done=false}){
    if(typeof id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(id)||!['cpu','gpu'].includes(source)||
      !Number.isSafeInteger(checked)||checked<0||!Number.isSafeInteger(elapsedMs)||elapsedMs<0||typeof done!=='boolean')throw new Error('Invalid run statistics.');
    if(!upsert.run(id,source,checked,elapsedMs,Number(done),new Date().toISOString()).changes)throw new Error('Run source mismatch.');
  }
  function totals(id){
    const total=aggregate.get(),current=id?db.prepare('SELECT checked,elapsed_ms AS elapsedMs,done FROM generation_runs WHERE id=?').get(id):null;
    return {checked:String(total.checked),elapsedMs:String(total.elapsedMs),runs:String(total.runs),current:current||null};
  }
  return {record,totals};
}
