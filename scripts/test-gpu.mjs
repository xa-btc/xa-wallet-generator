import { discoveryConfig } from '../src/discovery.js';
import { selectedWords, RESULT_WORD_CATEGORIES } from '../src/word-packs.js';
import { loadExpandedWords } from '../src/word-packs.js';
import { gpuWordScores } from '../src/quality.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gpuBridge } from '../gpu/bridge.js';
import { WORDS, compileMatcher } from '../src/matching.js';

const config={chain:'sol',generationMode:'private-key',words:WORDS,minLength:3,prefix:'',suffix:'',leet:true,scope:'ends',minRank:0,onlyMatches:true,target:2};
const cases=[];
for(const scope of ['ends','first4','last4','last5','suffix','any'])for(const leet of [false,true])for(const minRank of [0,1,2,3,4,5,6])cases.push({...config,scope,leet,minRank});
const fixture=base58.encode(ed25519.getPublicKey(sha256(new TextEncoder().encode('XA Wallet Generator public test fixture:0'))));
cases.push({...config,onlyMatches:false,prefix:fixture.slice(0,4).toLowerCase(),suffix:fixture.slice(-4).toLowerCase()});
cases.push({...config,words:[],onlyMatches:false});
for(const scope of ['any','suffix'])cases.push({...config,directSearch:true,minRank:0,minLength:2,scope,words:[fixture.slice(-2).toLowerCase(),fixture.slice(0,2).toLowerCase()]});

for(const minRank of [4,5,6]){
  cases.push({...config,words:[],minRank,prefix:fixture.slice(0,2).toLowerCase()});
  cases.push({...config,words:[],minRank,suffix:fixture.slice(-2).toLowerCase()});
}

for (const rank of [4,5,6]) {
  const discovery={...config,scope:'any',prefix:'',suffix:'',minLength:rank+3,minRank:rank,words:[fixture.slice(5,5+rank+3).toLowerCase()]};
  cases.push({...config,prefix:'zzzzzzzzzzzzzzzz',discovery});
  cases.push({...config,words:[],onlyMatches:false,discovery});
}

cases.push({...config,minLength:2,words:['gm','gg','111','ill','lll','sol','5ol','lfg','safu']});
for(const requiredRepeat of [3,6,10]) cases.push({...config,scope:'any',requiredRepeat});
cases.push({...config,scope:'suffix',words:(await loadExpandedWords()).filter(w=>w.length<=6),minRank:4});
cases.push({...config,scope:'suffix',minRank:4,words:selectedWords({shortEnglish:true,shortSlang:true})});
// Explicit terms must qualify even with no dictionary and a narrower/opposite zone.
for (const minRank of [0,4,6]) {
  cases.push({...config,words:[],minLength:6,scope:'first4',suffix:fixture.slice(-8).toLowerCase(),minRank});
  cases.push({...config,words:[],minLength:6,scope:'last4',prefix:fixture.slice(0,5).toLowerCase(),minRank});
}
for(const scope of ['any','suffix','first4'])cases.push({...config,scope,words:[],onlyMatches:false,minRank:0,ignoreRepeated:true});
for(const scope of ['any','suffix'])cases.push({...config,scope,minRank:4,words:selectedWords({countries:true,cities:true,companies:true,people:true})});
for(const scope of ['ends','suffix','any'])cases.push({...config,scope,minRank:4,words:selectedWords(Object.fromEntries(RESULT_WORD_CATEGORIES.filter(([id])=>id!=='all'&&id!=='expanded').map(([id])=>[id,true])))});

for(const directSearch of [false,true])for(const bothWords of [false,true])cases.push({...config,scope:'both',directSearch,minRank:0,minLength:2,words:[fixture.slice(config.chain==='btc'?4:0,(config.chain==='btc'?4:0)+4).toLowerCase(),...(bothWords?[fixture.slice(-4).toLowerCase()]:[])]});
cases.push({...config,scope:'both',words:[],prefix:fixture.slice(config.chain==='btc'?4:0,(config.chain==='btc'?4:0)+4).toLowerCase(),suffix:fixture.slice(-4).toLowerCase(),minRank:6});


for(const directSearch of [false,true])for(const complete of [false,true])cases.push({...config,scope:'joined',directSearch,minRank:0,minLength:2,words:[fixture.slice(config.chain==='btc'?4:0,(config.chain==='btc'?4:0)+4).toLowerCase()+(complete?fixture.slice(-4).toLowerCase():'')]});


for(const scope of ['any','suffix','joined'])for(const leet of [false,true]) {
  const first=fixture.slice(config.chain==='btc'?4:0,(config.chain==='btc'?4:0)+4),word=(scope==='joined'?first+fixture.slice(-4):fixture.slice(-6)).toLowerCase();
  const discovery=discoveryConfig(config.chain,4,{source:'custom',words:[word],scope,minLength:scope==='joined'?8:6,leet,ignoreRepeated:true});
  cases.push({...config,prefix:'zzzzzzzzzzzzzzzz',discovery});
}


for(const scope of ['first5','first6','first7','first8','first9','first10','last7','last8','last9','last10']){
  const length=Number(scope.replace(/\D/g,'')),offset=config.chain==='btc'?4:0;
  const word=(scope.startsWith('first')?fixture.slice(offset,offset+length):fixture.slice(-length)).toLowerCase();
  cases.push({...config,scope,words:[word],minLength:length,minRank:0,leet:false,directSearch:true});
}

for(const c of cases){c.wordScores=gpuWordScores('sol',c);if(c.discovery)c.discovery.wordScores=gpuWordScores('sol',c.discovery);}
const output=await new Promise((resolve,reject)=>{
  const child=spawn(fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe',import.meta.url)),[fileURLToPath(new URL('../gpu/verify.py',import.meta.url))],{windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  child.on('error',reject);child.on('close',code=>{try{if(code!==0)throw new Error(stderr);resolve(JSON.parse(stdout));}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify(cases));
});
for(const result of output.results){
  const matcher=compileMatcher('sol',cases[result.case]);
  const rare=cases[result.case].discovery ? compileMatcher('sol',cases[result.case].discovery) : null;
  const expected=output.pubs.flatMap((hex,i)=>{const address=base58.encode(Buffer.from(hex,'hex'));return matcher(address).keep || rare?.(address).keep ? [i] : [];});
  if(cases[result.case].ignoreRepeated || ['both','joined'].includes(cases[result.case].scope))assert.deepEqual(result.indices,expected,'GPU must exclude repeated addresses');
  const actual = new Set(result.indices);
  for(const index of expected) assert.ok(actual.has(index), `GPU ${result.device}, filter case ${result.case} dropped a scored qualifier`);
}
console.log(`GPU scoring prefilter passed: ${output.results.length} cases × ${output.pubs.length} addresses; no qualifying CPU matches dropped; CPU filters conservative extra candidates.`);

const server=await createServer({configFile:false,plugins:[gpuBridge()],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const headers={'X-Wallet-Forge':'local','Content-Type':'application/json','Origin':url};let token;
try{
  assert.equal((await fetch(url+'/api/gpu/devices')).status,403);
  assert.equal((await fetch(url+'/api/gpu/devices',{headers:{...headers,Origin:'http://untrusted.example'}})).status,403);
  const inventory=await(await fetch(url+'/api/gpu/devices',{headers})).json();assert.ok(inventory.devices.length>=2);
  const start=await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config,devices:[0,1],existing:[]})});
  const started=await start.json();assert.equal(start.status,200);token=started.token;
  assert.equal((await fetch(url+'/api/gpu/status',{headers})).status,403);
  const collected=[];let done=false;
  for(let i=0;i<200;i++){
    const response=await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}});const state=await response.json();
    assert.ok(!state.error,state.error);collected.push(...state.wallets);
    if(state.done){done=true;assert.equal(state.reason,'target');break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(done,'GPU hunt failed to stop at target');assert.equal(collected.length,2);assert.equal(new Set(collected.map(w=>w.address)).size,2);
  for(const w of collected){assert.equal(w.engine,'opencl');assert.equal(w.phrase,null);assert.equal(base58.encode(ed25519.getPublicKey(base58.decode(w.privateKey).slice(0,32))),w.address);}
  console.log('Local HTTP GPU integration passed: both GPUs, authentication/origin checks, exact collection target, key exports and automatic stop.');
  const overflowStart=await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config:{...config,prefix:'zzzzzzzzzzzzzzzz',target:999999,discoveryRank:4,discoveryRemaining:2},devices:[0,1],existing:[],rareExisting:[]})});
  const overflowJob=await overflowStart.json();assert.equal(overflowStart.status,200);token=overflowJob.token;
  const rareFound=[];let overflowDone=false;
  for(let i=0;i<600;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();
    assert.ok(!state.error,state.error);assert.equal(state.wallets.length,0);
    rareFound.push(...state.rareWallets);
    if(state.done){assert.equal(state.reason,'rare-limit');overflowDone=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(overflowDone,'Rare overflow failed to stop at its independent limit');assert.equal(rareFound.length,2);
  for(const w of rareFound){assert.ok(w.level>=4);assert.equal(base58.encode(ed25519.getPublicKey(base58.decode(w.privateKey).slice(0,32))),w.address);}
  console.log('Rare overflow integration passed: nonmatching primary filter, independent two-wallet cap, importable keys, and automatic stop.');
  const keeperMap=new Map([[`sol:${fixture}`,{chain:'sol',address:fixture,score:0,level:0}]]);
  const bestStart=await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config:{...config,target:3,keepBest:true,bestExisting:[...keeperMap.values()]},devices:[0],existing:[...keeperMap.keys()],rareExisting:[]})});
  const bestJob=await bestStart.json();assert.equal(bestStart.status,200);token=bestJob.token;
  let removedCount=0,minimum=0;
  function applyKeepers(state){
    assert.ok(!state.error,state.error);
    for(const id of state.removed || []){keeperMap.delete(id);removedCount++;}
    for(const w of state.wallets){assert.equal(base58.encode(ed25519.getPublicKey(base58.decode(w.privateKey).slice(0,32))),w.address);keeperMap.set(`sol:${w.address}`,w);}
    assert.ok(keeperMap.size<=3);
    if(keeperMap.size===3){const next=Math.min(...[...keeperMap.values()].map(w=>w.score));assert.ok(next>=minimum);minimum=next;}
  }
  let observations=0;
  for(let i=0;i<200;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();applyKeepers(state);
    assert.equal(state.done,false,'Keep-best must not stop at capacity');
    if(keeperMap.size===3 && ++observations>=5)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(keeperMap.size,3);assert.ok(removedCount>0);
  await fetch(url+'/api/gpu/stop',{method:'POST',headers:{...headers,'X-Wallet-Job':token},body:'{}'});
  let bestStopped=false;
  for(let i=0;i<200;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();applyKeepers(state);
    if(state.done){assert.equal(state.reason,'stopped');bestStopped=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(bestStopped);console.log('GPU Keep-best integration passed: resumed metadata, bounded collection, replacements, monotonically improving floor, valid keys, and manual stop.');
  const manual=await(await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config:{...config,prefix:'zzzzzzzzzzzzzzzz'},devices:[0,1],existing:[]})})).json();
  token=manual.token;assert.ok(token);
  await fetch(url+'/api/gpu/stop',{method:'POST',headers:{...headers,'X-Wallet-Job':token},body:'{}'});
  let stopped=false;
  for(let i=0;i<200;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();
    assert.ok(!state.error,state.error);
    if(state.done){assert.equal(state.reason,'stopped');stopped=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(stopped);console.log('Manual Stop during GPU startup passed; both device workers exited.');
}finally{
  if(token)await fetch(url+'/api/gpu/stop',{method:'POST',headers:{...headers,'X-Wallet-Job':token},body:'{}'}).catch(()=>{});
  await server.close();
}
