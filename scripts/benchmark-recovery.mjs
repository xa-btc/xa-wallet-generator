import { createServer } from 'vite';
import { gpuBridge } from '../gpu/bridge.js';

const server=await createServer({configFile:false,plugins:[gpuBridge()],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const headers={'X-Wallet-Forge':'local','Content-Type':'application/json',Origin:url};let token;
const request=async(path,options={})=>{
  const response=await fetch(url+'/api/gpu/'+path,{...options,headers:{...headers,'X-Wallet-Job':token||''}});
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
};
try{
  const {devices}=await request('devices');
  const config={chain:'sol',generationMode:'recovery-phrase',scope:'last10',words:[],minLength:3,prefix:'',suffix:'ZZZZZZZZZZ',leet:false,onlyMatches:true,minRank:6,target:999999};
  for(const selected of [[0],[1],[0,1]]){
    token=(await request('start',{method:'POST',body:JSON.stringify({config,devices:selected,existing:[]})})).token;
    let readyAt,start,initial=0,final,kept=0,requestedStop=false;
    const deadline=performance.now()+60000;
    while(performance.now()<deadline){
      const state=await request('status');
      if(state.error)throw new Error(state.error);
      kept+=state.wallets.length;
      if(!readyAt&&state.ready===selected.length)readyAt=performance.now();
      if(!start&&readyAt&&performance.now()-readyAt>=1500){start=performance.now();initial=state.attempts;}
      if(start&&performance.now()-start>=4000&&!requestedStop){requestedStop=true;await request('stop',{method:'POST',body:'{}'});}
      if(state.done){final=state;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!final||!start)throw new Error('GPU benchmark timed out');
    const elapsedMs=performance.now()-start,attempts=final.attempts-initial;
    console.log(JSON.stringify({devices:selected.map(i=>({index:i,name:devices.find(d=>d.index===i).name})),mode:'Solana Recovery GPU derivation',scope:'last 10',minRank:'Godlike',words:config.words.length,attempts,elapsedMs:Math.round(elapsedMs),addressesPerSecond:Math.round(attempts*1000/elapsedMs),verifiedWallets:kept,includes:'OS randomness, BIP39 packing, GPU PBKDF2/account derivation/Ed25519/filtering, HTTP transport and stop drain; excludes startup and warmup; rare target produces no retained-match verification or storage load'}));
    token=undefined;
  }
}finally{
  if(token)await request('stop',{method:'POST',body:'{}'}).catch(()=>{});
  await server.close();
}
