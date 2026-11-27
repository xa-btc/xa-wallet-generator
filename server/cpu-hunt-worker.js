import { parentPort, workerData } from 'node:worker_threads';
import { compileHunt } from '../src/discovery.js';
import { searchBatch } from '../src/search.js';

let stopped=false,ack;
parentPort.on('message',message=>{
  if(message.type==='stop')stopped=true;
  if(message.type==='ack'||stopped){ack?.();ack=null;}
});
let attempts=0,wallets=[],lastReport=performance.now();
try{
  const matcher=compileHunt(workerData.chain,workerData);
  while(!stopped){
    const batch=await searchBatch(workerData,matcher);
    attempts+=batch.attempts;wallets.push(...batch.wallets);
    if(performance.now()-lastReport>=200||wallets.length>=16){
      const received=new Promise(resolve=>{ack=resolve;});
      parentPort.postMessage({attempts,wallets});wallets=[];
      await received;lastReport=performance.now();
    }
    await new Promise(resolve=>setImmediate(resolve));
  }
  parentPort.postMessage({attempts,wallets,done:true});
}catch{parentPort.postMessage({error:'CPU generation worker failed.'});}
finally{parentPort.close();}
