import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunStats } from '../server/run-stats.js';
import { displayedTotals, formatRunTime } from '../src/run-stats-client.js';

test('run checkpoints are idempotent and monotonic across restarts and separate runs',()=>{
  const folder=mkdtempSync(join(tmpdir(),'wallet-run-stats-'));let db;
  try{
    const file=join(folder,'stats.sqlite');db=new DatabaseSync(file);let stats=createRunStats(db);
    const first={id:'test-run-00000001',source:'gpu',checked:1000000000,elapsedMs:3600000};
    stats.record(first);stats.record(first);stats.record({...first,checked:10,elapsedMs:1});
    assert.equal(stats.totals().checked,'1000000000');assert.equal(stats.totals().elapsedMs,'3600000');
    stats.record({...first,checked:1500000000,elapsedMs:5400000,done:true});
    stats.record({id:'test-run-00000002',source:'cpu',checked:200,elapsedMs:10000,done:true});
    db.close();db=new DatabaseSync(file);stats=createRunStats(db);
    const total=stats.totals(first.id);
    assert.equal(total.checked,'1500000200');assert.equal(total.elapsedMs,'5410000');assert.equal(total.runs,'2');
    assert.equal(total.current.done,1);
    assert.throws(()=>stats.record({...first,source:'cpu'}),/source/);
    assert.throws(()=>stats.record({...first,checked:-1}),/statistics/);
    assert.throws(()=>stats.record({...first,elapsedMs:NaN}),/statistics/);
  }finally{db?.close();rmSync(folder,{recursive:true,force:true});}
});

test('header overlays only unpersisted current-run work and formats a frozen stopwatch',()=>{
  const remote={checked:'10000000000000000',elapsedMs:'7200000',current:{checked:1000,elapsedMs:10000}};
  assert.deepEqual(displayedTotals(remote,{checked:1500,elapsedMs:15000}),{checked:10000000000000500n,elapsedMs:7205000n});
  assert.deepEqual(displayedTotals(remote,{checked:500,elapsedMs:5000}),{checked:10000000000000000n,elapsedMs:7200000n});
  assert.equal(formatRunTime(0),'00:00:00');assert.equal(formatRunTime(3661000),'01:01:01');
  assert.equal(formatRunTime(100*3600000),'100:00:00');
});
