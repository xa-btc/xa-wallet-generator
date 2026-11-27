import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { gpuBridge } from '../gpu/bridge.js';
const server=await createServer({configFile:false,plugins:[gpuBridge()],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`;
let token;
async function request(path,body){
 const response=await fetch(url+'/api/gpu/'+path,{method:body?'POST':'GET',headers:{'X-Wallet-Forge':'local','X-Wallet-Job':token??'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const data=await response.json();assert.equal(response.status,200,data.error);return data;
}
async function until(predicate){const deadline=Date.now()+60000;while(Date.now()<deadline){const state=await request('status');assert.ok(!state.error,state.error);if(predicate(state))return state;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out');}
try {
 for(const chain of ['sol','btc'])for(const force of [false,true]){
  const config={chain,generationMode:chain==='btc'?'recovery-phrase':'private-key',words:[],minLength:3,prefix:'',suffix:'',leet:true,scope:'ends',minRank:0,onlyMatches:false,target:999999,keepBest:true};
  token=(await request('start',{config,devices:[0,1],existing:[]})).token;
  await until(s=>s.ready===2&&s.wallets.length>0);
  await new Promise(r=>setTimeout(r,1200));
  const start=Date.now();await request('stop',{force});const ack=Date.now()-start;
  const final=await until(s=>s.done);
  assert.equal(final.reason,force?'forced':'stopped');
  console.log(`${chain} ${force?'forced':'graceful'} active-load stop: acknowledgement ${ack}ms, completed ${Date.now()-start}ms`);
 }
} finally {if(token)await request('stop',{force:true}).catch(()=>{});await server.close();}
