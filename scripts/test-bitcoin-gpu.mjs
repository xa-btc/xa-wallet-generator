import { discoveryConfig } from '../src/discovery.js';
import { selectedWords } from '../src/word-packs.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gpuBridge, validateConfig } from '../gpu/bridge.js';
import { WORDS, compileMatcher } from '../src/matching.js';
import { generateWallet } from '../src/wallet.js';
import { gpuWordScores } from '../src/quality.js';
import { SEARCH_ZONES } from '../src/search-zones.js';

const config={chain:'btc',generationMode:'recovery-phrase',words:WORDS,minLength:3,prefix:'',suffix:'',leet:true,scope:'ends',minRank:0,onlyMatches:true,target:2};
const cases=[];
for(const scope of Object.keys(SEARCH_ZONES))for(const leet of [false,true])for(const minRank of [0,3,4,5,6])cases.push({...config,scope,leet,minRank});
const fixture=generateWallet('btc',entropyToMnemonic(new Uint8Array(16),wordlist)).address;
cases.push({...config,onlyMatches:false,prefix:fixture.slice(4,8),suffix:fixture.slice(-4)});
cases.push({...config,words:[],onlyMatches:false});
for(const scope of ['any','suffix'])cases.push({...config,directSearch:true,minRank:0,minLength:2,scope,words:[fixture.slice(-2).toLowerCase(),fixture.slice(4,6).toLowerCase()]});

for(const minRank of [4,5,6]){
  cases.push({...config,words:[],minRank,prefix:fixture.slice(4,6).toLowerCase()});
  cases.push({...config,words:[],minRank,suffix:fixture.slice(-2).toLowerCase()});
}

for(const requiredRepeat of [3,6,10])cases.push({...config,scope:'any',requiredRepeat});
cases.push(validateConfig({...config,prefix:'zzzzzzzzzzzzzzzz',discoveryRank:4,discoveryRemaining:2}));
cases.push({...config,scope:'suffix',minRank:4,words:selectedWords({shortEnglish:true,shortSlang:true})});
// Explicit terms must qualify even with no dictionary and a narrower/opposite zone.
for (const minRank of [0,4,6]) {
  cases.push({...config,words:[],minLength:6,scope:'first4',suffix:fixture.slice(-8).toLowerCase(),minRank});
  cases.push({...config,words:[],minLength:6,scope:'last4',prefix:fixture.slice(4,9).toLowerCase(),minRank});
}
for(const scope of ['any','suffix','first4'])cases.push({...config,scope,words:[],onlyMatches:false,minRank:0,ignoreRepeated:true});
for(const scope of ['any','suffix'])cases.push({...config,scope,minRank:4,words:selectedWords({countries:true,cities:true,companies:true,people:true})});

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

for(const c of cases){c.wordScores=gpuWordScores('btc',c);if(c.discovery)c.discovery.wordScores=gpuWordScores('btc',c.discovery);}
const output=await new Promise((resolve,reject)=>{
  const child=spawn(fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe',import.meta.url)),[fileURLToPath(new URL('../gpu/verify_bitcoin.py',import.meta.url))],{windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  child.on('error',reject);child.on('close',code=>{try{if(code!==0)throw new Error(stderr);resolve(JSON.parse(stdout));}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify(cases));
});
for(let i=0;i<output.addresses.length;i++){
  const entropy=i===0?new Uint8Array(16):i===1?new Uint8Array(16).fill(255):sha256(new TextEncoder().encode('XA Wallet Generator BTC public fixture:'+(i-2))).slice(0,16);
  assert.equal(generateWallet('btc',entropyToMnemonic(entropy,wordlist)).address,output.addresses[i]);
}
for(const result of output.results){
  const c=cases[result.case],primary=compileMatcher('btc',c),rare=c.discovery?compileMatcher('btc',c.discovery):null;
  const expected=output.addresses.flatMap((address,i)=>primary(address).keep||rare?.(address).keep?[i]:[]);
  if(c.ignoreRepeated || ['both','joined'].includes(c.scope))assert.deepEqual(result.indices,expected,'GPU must exclude repeated addresses');
  for(const index of expected)assert.ok(result.indices.includes(index),`GPU ${result.device}, case ${result.case} dropped a BTC qualifier`);
}
console.log(`Bitcoin GPU: ${output.addresses.length} independent BIP39/BIP84 vectors and ${output.results.length} filter cases passed across both GPUs.`);

const server=await createServer({configFile:false,plugins:[gpuBridge()],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const headers={'X-Wallet-Forge':'local','Content-Type':'application/json',Origin:url};let token;
try{
  const response=await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config:{...config,onlyMatches:false,words:[]},devices:[0,1],existing:[],rareExisting:[]})});
  const started=await response.json();assert.equal(response.status,200);token=started.token;
  const wallets=[];let done=false;
  for(let i=0;i<300;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();
    assert.ok(!state.error,state.error);wallets.push(...state.wallets);
    if(state.done){assert.equal(state.reason,'target');done=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(done,'Bitcoin GPU hunt did not finish');assert.equal(wallets.length,2);
  for(const w of wallets){
    assert.equal(w.engine,'opencl-bip39');assert.equal(w.path,"m/84'/0'/0'/0/0");
    assert.ok(validateMnemonic(w.phrase,wordlist));assert.equal(w.phrase.split(' ').length,12);
    const recovered=generateWallet('btc',w.phrase);assert.equal(recovered.address,w.address);assert.equal(recovered.privateKey,w.privateKey);
  }
  console.log('Bitcoin GPU HTTP integration passed: both cards, exact target, 12-word recovery, BIP84 addresses and WIF exports.');
  const manual=await(await fetch(url+'/api/gpu/start',{method:'POST',headers,body:JSON.stringify({config:{...config,prefix:'zzzzzzzzzzzzzzzz'},devices:[0,1],existing:[]})})).json();
  token=manual.token;assert.ok(token);
  await fetch(url+'/api/gpu/stop',{method:'POST',headers:{...headers,'X-Wallet-Job':token},body:'{}'});
  let stopped=false;
  for(let i=0;i<300;i++){
    const state=await(await fetch(url+'/api/gpu/status',{headers:{...headers,'X-Wallet-Job':token}})).json();assert.ok(!state.error,state.error);
    if(state.done){assert.equal(state.reason,'stopped');stopped=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(stopped);console.log('Bitcoin GPU manual stop passed.');
}finally{
  if(token)await fetch(url+'/api/gpu/stop',{method:'POST',headers:{...headers,'X-Wallet-Job':token},body:'{}'}).catch(()=>{});
  await server.close();
}
