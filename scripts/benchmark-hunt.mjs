// Full local pipeline with a temporary archive. Prints counters/timing only.
import { createServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gpuBridge } from '../gpu/bridge.js';
import { createSavedStore } from '../server/saved-store.js';
import { selectedWords, RESULT_WORD_CATEGORIES } from '../src/word-packs.js';

const folder=mkdtempSync(join(tmpdir(),'wallet-hunt-benchmark-'));
const store=await createSavedStore(folder);
let saveMs=0,saved=0,token;
const saveWallets=wallets=>{const start=performance.now();store.save(wallets);saveMs+=performance.now()-start;saved+=wallets.length;};
const server=await createServer({configFile:false,plugins:[gpuBridge({saveWallets})],server:{host:'127.0.0.1',port:0,watch:null},logLevel:'silent'});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
async function request(path,body){
  const response=await fetch(url+'/api/gpu/'+path,{method:body?'POST':'GET',headers:{'X-Wallet-Forge':'local','X-Wallet-Job':token||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
const words=selectedWords(Object.fromEntries(RESULT_WORD_CATEGORIES.filter(([id])=>id!=='all'&&id!=='expanded').map(([id])=>[id,true]))).filter(w=>w.length>=3&&w.length<=6);
try{
  for(const rank of [4,5]){
    const config={chain:'sol',generationMode:'private-key',words,minLength:3,prefix:'',suffix:'',scope:'suffix',leet:true,onlyMatches:true,minRank:rank,target:999999,discoveryRank:rank,discoveryRemaining:999999};
    token=(await request('start',{config,devices:[1],existing:[]})).token;
    let start,initial=0,stopRequested=false,done=false;
    const deadline=performance.now()+90000;
    while(performance.now()<deadline){
      const state=await request('status');if(state.error)throw new Error(state.error);
      if(!start&&state.ready===1){start=performance.now();initial=state.attempts;saveMs=0;saved=0;}
      if(start&&!stopRequested&&performance.now()-start>5000){stopRequested=true;await request('stop',{});}
      if(state.done){
        if(!start)throw new Error('Hunt ended before ready');
        const elapsed=performance.now()-start;
        console.log(JSON.stringify({device:1,rank:rank===4?'Legendary':'Mythic',scope:'last6 plus full-address overflow',addressesPerSecond:Math.round((state.attempts-initial)*1000/elapsed),elapsedMs:Math.round(elapsed),savedWalletRecords:saved,archiveWriteMs:Math.round(saveMs),includes:'GPU filtering, CPU verification, archive writes, HTTP delivery, graceful stop; excludes startup'}));
        done=true;break;
      }
      await new Promise(r=>setTimeout(r,100));
    }
    if(!done)throw new Error('Hunt benchmark timed out');
  }
}finally{
  if(token)await request('stop',{force:true}).catch(()=>{});
  await server.close();store.close();rmSync(folder,{recursive:true,force:true});
}
