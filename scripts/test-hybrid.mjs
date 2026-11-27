import assert from 'node:assert/strict';
import { preview } from 'vite';
import { gpuBridge } from '../gpu/bridge.js';

let lastRun;
const server=await preview({configFile:false,plugins:[gpuBridge({saveRun:data=>{lastRun=data;}})],preview:{host:'127.0.0.1',port:0},logLevel:'silent'});
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
let token;
async function request(path,data){
  const response=await fetch(base+'/api/gpu/'+path,{method:data?'POST':'GET',headers:{'X-Wallet-Forge':'local','X-Wallet-Job':token||'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await response.json();assert.equal(response.status,200,result.error);return result;
}
try{
  for(const [chain,mode] of [['sol','stop'],['btc','stop'],['sol','single'],['sol','force'],['sol','caps'],['sol','alphabet'],['sol','exact'],['sol','recovery-stop'],['sol','recovery-force']]){
    const config={chain,generationMode:chain==='sol'&&!mode.startsWith('recovery-')?'private-key':'recovery-phrase',scope:'ends',words:[],minLength:3,minRank:0,leet:true,onlyMatches:false,target:mode==='single'?1:8,keepBest:!['single','caps','alphabet','exact'].includes(mode),prefix:'',suffix:'',cpuWorkers:2};
    if(['caps','alphabet'].includes(mode))Object.assign(config,{scope:'any',words:['ab'],minLength:2,onlyMatches:true,directSearch:true,target:1,keepBest:false,searchStyles:['caps'],cpuWorkers:0});
    if(mode==='alphabet')config.words=['io'];
    if(mode==='exact')Object.assign(config,{scope:'any',words:['aB'],minLength:2,onlyMatches:true,directSearch:true,target:1,keepBest:false,exactText:true,cpuWorkers:0});
    token=(await request('start',{config,devices:[0,1],existing:[]})).token;
    let stopped=false,done=false,cpu=0,gpu=0;
    const kept=new Set();
    for(let tick=0;tick<300;tick++){
      const state=await request('status');assert.ok(!state.error,state.error);
      cpu=state.cpuAttempts;gpu=state.attempts-cpu;
      for(const id of state.removed)kept.delete(id);
      for(const wallet of state.wallets){kept.add(`${wallet.chain}:${wallet.address}`);if(mode==='exact'){assert.ok(wallet.hits.includes('aB'));assert.ok(wallet.highlights.filter(h=>h.reason==='Word: aB').every(h=>wallet.address.slice(h.start,h.end)==='aB'));}if(['caps','alphabet'].includes(mode)){const word=mode==='alphabet'?'io':'ab',text=mode==='alphabet'?'io':'AB';assert.ok(wallet.hits.includes(word));assert.ok(wallet.highlights.filter(h=>h.reason==='Word: '+word).every(h=>wallet.address.slice(h.start,h.end)===text));}}
      assert.ok(kept.size<=config.target);
      if(state.done){done=true;assert.equal(lastRun.checked,state.attempts);assert.ok(lastRun.done);break;}
      if(!['single','caps','alphabet','exact'].includes(mode)&&!stopped&&cpu>0&&gpu>0){await request('stop',{force:mode==='force'||mode==='recovery-force'});stopped=true;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(done,'combined hunt stopped');assert.ok(kept.size>0);
    if(!['single','caps','alphabet','exact'].includes(mode)){assert.ok(cpu>0);assert.ok(gpu>0);}
    else assert.equal(kept.size,1);
    console.log(`${chain} ${mode}: shared target, counters and completion passed (CPU ${cpu}, GPU ${gpu}).`);
  }
}finally{
  if(token)await request('stop',{force:true}).catch(()=>{});
  await new Promise(resolve=>server.httpServer.close(resolve));
}
