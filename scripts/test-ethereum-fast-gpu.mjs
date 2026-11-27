// GPU/HTTP integration with an isolated in-memory bridge: no archive writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { gpuBridge, verifyEthereumFastResult } from '../gpu/bridge.js';
import { compileMatcher } from '../src/matching.js';
import { SEARCH_ZONES } from '../src/search-zones.js';
import { checksumEth } from '../src/wallet.js';
import { gpuWordScores } from '../src/quality.js';

const config={chain:'eth',generationMode:'private-key',words:['dead','beef','face','cafe','fee','bad','00','ff','7e','2b'],minLength:3,prefix:'',suffix:'',leet:false,scope:'ends',minRank:0,onlyMatches:true,target:2};
const cases=[];
for(const scope of Object.keys(SEARCH_ZONES))for(const leet of [false,true])for(const minRank of [0,3,6])cases.push({...config,scope,leet,minRank});
cases.push({...config,words:[],onlyMatches:false}, {...config,prefix:'7'}, {...config,suffix:'f'}, {...config,requiredRepeat:2}, {...config,ignoreRepeated:true,ignoreRepeatedMax:7});
cases.push({...config,directSearch:true,words:['7e'],prefix:'7',discovery:{...config,onlyMatches:false,words:[]}});
for(const searchStyles of [['caps'],['proper'],['lowercase'],['scattered'],['replacement']])cases.push({...config,searchStyles});
cases.push({...config,words:[],prefix:'7e5f',exactText:true}, {...config,words:[],prefix:'7E5F',exactText:true});
for(const c of cases)c.wordScores=gpuWordScores('eth',c);
const output=await new Promise((resolve,reject)=>{
  const child=spawn(fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe',import.meta.url)),[fileURLToPath(new URL('../gpu/verify_ethereum_fast.py',import.meta.url))],{windowsHide:true});
  let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('GPU verification timed out'));},120000);
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  child.on('error',reject);child.on('close',code=>{clearTimeout(timer);try{assert.equal(code,0,stderr);resolve(JSON.parse(stdout));}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify(cases));
});
const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const scalars=[1n,2n,255n,256n,order-1n,order-2n,1n<<255n];
for(let i=0;i<output.addresses.length;i++){
  const key=i<7?scalars[i].toString(16).padStart(64,'0'):bytesToHex(sha256(new TextEncoder().encode('XA Wallet Generator ETH Fast public fixture:'+(i-7))));
  verifyEthereumFastResult({key,address:output.addresses[i]},()=>({keep:true}));
}
for(const result of output.results){
  const c=cases[result.case],primary=compileMatcher('eth',c),rare=c.discovery?compileMatcher('eth',c.discovery):null;
  const expected=output.addresses.flatMap((address,i)=>primary(checksumEth(address.slice(2))).keep||rare?.(checksumEth(address.slice(2))).keep?[i]:[]);
  for(const i of expected)assert.ok(result.indices.includes(i),`GPU ${result.device} case ${result.case} dropped qualifier ${i}`);
}
console.log(`ETH Fast: 256 JS-verified public vectors, 16,384 random vectors per GPU, partial inversion batches, ${output.results.length} filter cases passed.`);
console.log(JSON.stringify(output.rates));

const server=await createServer({configFile:false,plugins:[gpuBridge()],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const headers={'X-Wallet-Forge':'local','Content-Type':'application/json',Origin:url};let token;
async function request(path,body){const response=await fetch(url+'/api/gpu/'+path,{method:body?'POST':'GET',headers:{...headers,...(token?{'X-Wallet-Job':token}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,200,data.error);return data;}
async function finished(callback){for(let i=0;i<300;i++){const state=await request('status');assert.ok(!state.error,state.error);callback(state);if(state.done)return state;await new Promise(r=>setTimeout(r,100));}throw new Error('GPU hunt did not finish');}
try{
  const {devices}=await request('devices');const selected=devices.map(d=>d.index);
  for(const cpuWorkers of [0,1]){
    ({token}=await request('start',{config:{...config,words:[],onlyMatches:false,cpuWorkers},devices:selected,existing:[],rareExisting:[]}));
    const wallets=[];const state=await finished(s=>wallets.push(...s.wallets));
    assert.equal(state.reason,'target');assert.equal(wallets.length,2);
    for(const wallet of wallets){assert.equal(wallet.phrase,null);assert.equal(wallet.path,null);assert.equal(wallet.generationMode,'private-key');assert.ok(wallet.privateKey);}
  }
  for(const force of [false,true]){
    ({token}=await request('start',{config:{...config,prefix:'ffffffffffffffff'},devices:selected,existing:[],rareExisting:[]}));
    for(let i=0;i<300;i++){const state=await request('status');assert.ok(!state.error,state.error);if(state.attempts>0)break;assert.ok(i<299);await new Promise(r=>setTimeout(r,100));}
    await request('stop',{force});await finished(()=>{});
  }
  console.log('ETH Fast HTTP: all GPUs, hybrid CPU, exact collection target, graceful/forced stop and subsequent restart passed. No wallets saved.');
}finally{
  if(token)await request('stop',{force:true}).catch(()=>{});
  await server.close();
}
