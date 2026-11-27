import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, preview } from 'vite';
import { gpuBridge } from '../gpu/bridge.js';
import { savedBridge } from '../server/saved-bridge.js';
import { createSavedStore } from '../server/saved-store.js';

const folder=mkdtempSync(join(tmpdir(),'wallet-saved-gpu-'));
const store=await createSavedStore(folder);
const usePreview=process.argv.includes('--preview');
const options={configFile:false,plugins:[savedBridge(store),gpuBridge({saveWallets:store.save,saveRun:store.recordRun})],server:{host:'127.0.0.1',port:0},preview:{host:'127.0.0.1',port:0},logLevel:'silent'};
const server=usePreview?await preview(options):await createServer(options);
if(!usePreview)await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
let token;
const target=process.argv.includes('--single')?1:2;
let expectedChecked=0;
async function request(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'X-Wallet-Forge':'local','X-Wallet-Job':token||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();assert.equal(response.status,200,data.error);return data;
}
try{
  for(const chain of ['sol','btc']){
    const config={chain,generationMode:chain==='sol'&&!process.argv.includes('--recovery')?'private-key':'recovery-phrase',words:[],minLength:3,prefix:'',suffix:'',leet:true,scope:'ends',minRank:0,onlyMatches:false,target};
    token=(await request('/api/gpu/start',{config,devices:[0,1],existing:[]})).token;
    let done=false,received=0;
    for(let n=0;n<400;n++){
      const state=await request('/api/gpu/status');assert.ok(!state.error,state.error);
      for(const wallet of state.wallets){
        const saved=store.get(`${wallet.chain}:${wallet.address}`);
        assert.ok(Number.isFinite(wallet.discoveryElapsedMs)&&wallet.discoveryElapsedMs>=0);
        assert.equal(saved.discoveryElapsedMs,wallet.discoveryElapsedMs);
        assert.equal(saved.discoveryRunId,state.runId);
        assert.equal(store.list({chain}).wallets.find(w=>w.address===wallet.address).discoveryElapsedMs,wallet.discoveryElapsedMs);
        assert.equal(saved.privateKey,wallet.privateKey);assert.equal(saved.phrase,wallet.phrase);received++;
      }
      if(state.done){done=true;expectedChecked+=state.attempts;assert.equal(store.runTotals(state.runId).current.checked,state.attempts);assert.equal(store.runTotals(state.runId).current.done,1);break;}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(done);assert.equal(received,target);assert.equal(store.list({chain}).filtered,target);
    console.log(`${chain}: both GPUs persisted verified keys before delivery; archive metadata and exact target passed.`);
  }
  assert.equal(store.list().total,target*2);assert.equal(store.runTotals().checked,String(expectedChecked));assert.equal(store.runTotals().runs,'2');console.log('Lifetime GPU totals match cumulative attempts across both runs without double-counting.');
}finally{
  if(token)await request('/api/gpu/stop',{force:true}).catch(()=>{});
  if(usePreview)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close();store.close();rmSync(folder,{recursive:true,force:true});
}
