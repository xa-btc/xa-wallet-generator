import { SEARCH_STYLES } from '../src/search-styles.js';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateWallet, checksumEth, CHAINS } from '../src/wallet.js';
import { SEARCH_ZONES } from '../src/search-zones.js';
import { setImmediate as yieldToServer } from 'node:timers/promises';
import { gpuWordScores } from '../src/quality.js';
import { compileHunt, discoveryConfig, HuntCollector, RARE_CAPACITY } from '../src/discovery.js';
import { RARITIES, MAX_COLLECTION } from '../src/rarity.js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { base58, base58check, bech32 } from '@scure/base';
import { possible } from '../src/matching.js';

const python = fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe', import.meta.url));
const script = fileURLToPath(new URL('./engine.py', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const pkcs8 = Buffer.from('302e020100300506032b657004220420','hex');
const launch = args => spawn(python,[script,...args],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});

// The Windows venv executable launches another Python process. Kill the owned tree.
function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.on('error',()=>child.kill());
  } else child.kill('SIGKILL');
}

export function validateConfig(c) {
  if (!c || !((['sol','btc'].includes(c.chain) && ['private-key','recovery-phrase'].includes(c.generationMode)) || (c.chain === 'eth' && c.generationMode === 'private-key'))) throw new Error('GPU requires Fast mode for Ethereum, or Fast/recovery-phrase mode for Solana and Bitcoin.');
  if (!Object.hasOwn(SEARCH_ZONES,c.scope)) throw new Error('Invalid search zone.');
  if (!Array.isArray(c.words) || c.words.length > 400000 || !c.words.every(w => typeof w==='string' && /^[a-z0-9]{1,44}$/i.test(w))) throw new Error('Invalid dictionary.');
  if (!Number.isInteger(c.minLength) || c.minLength<2 || c.minLength>10) throw new Error('Minimum word length must be 2–10 characters. Restart XA Wallet Generator if the page shows newer options than the server.');
  if (!Number.isInteger(c.minRank) || c.minRank<0 || c.minRank>=RARITIES.length) throw new Error('Choose a valid minimum rarity from Common through Godlike.');
  if (typeof c.leet!=='boolean' || typeof c.onlyMatches!=='boolean') throw new Error('Invalid match flags.');
  if(c.directSearch !== undefined && typeof c.directSearch!=='boolean')throw new Error('Invalid direct-word mode.');
  if(c.directSearch && (!c.words.length || c.words.some(w=>w.length<2)))throw new Error('Direct words must contain 2–44 letters or digits.');
  if (!Number.isInteger(c.target) || c.target<1 || c.target>MAX_COLLECTION) throw new Error('Collection target must be 1–999999.');
  if (![c.prefix,c.suffix].every(s => typeof s==='string' && s.length<=16 && possible(s,c.chain,c.leet))) throw new Error('Invalid address filter.');
  if (c.discoveryRank !== undefined && ![0,4,5,6].includes(c.discoveryRank)) throw new Error('Invalid rare-find threshold.');
  if (c.discoveryRank && (!Number.isInteger(c.discoveryRemaining) || c.discoveryRemaining < 1 || c.discoveryRemaining > RARE_CAPACITY)) throw new Error('Invalid rare-find capacity.');
  if (c.keepBest !== undefined && typeof c.keepBest !== 'boolean') throw new Error('Invalid collection mode.');
  if (c.requiredRepeat !== undefined && (!Number.isInteger(c.requiredRepeat) || c.requiredRepeat < 0 || c.requiredRepeat > 44)) throw new Error('Invalid required repeat.');
  if (c.ignoreRepeated !== undefined && typeof c.ignoreRepeated !== 'boolean') throw new Error('Invalid ignore repeated flag.');
  if (c.ignoreRepeatedMax !== undefined && c.ignoreRepeatedMax !== 7) throw new Error('Invalid ignored repeat maximum.');
  if (c.ignoreRepeated && c.requiredRepeat) throw new Error('Ignore repeated conflicts with required repeat.');
  const bestExisting = c.bestExisting ?? [];
  if (!Array.isArray(bestExisting) || bestExisting.length > c.target || !bestExisting.every(w => w && ['sol','eth','btc'].includes(w.chain) && typeof w.address === 'string' && /^[a-zA-Z0-9]{1,100}$/.test(w.address) && Number.isFinite(w.score) && w.score >= 0 && Number.isInteger(w.level) && w.level >= 0 && w.level <= 6)) throw new Error('Invalid keeper metadata.');
  const validated = {ignoreRepeatedMax:c.ignoreRepeatedMax,ignoreRepeated:!!c.ignoreRepeated,requiredRepeat:c.requiredRepeat || 0,keepBest:!!c.keepBest,bestExisting:bestExisting.map(({chain,address,score,level})=>({chain,address,score,level})),discoveryRank:c.discoveryRank || 0, discoveryRemaining:c.discoveryRemaining, discoveryOptions:c.discoveryOptions, discovery:discoveryConfig(c.chain,c.discoveryRank,c.discoveryOptions),chain:c.chain,generationMode:c.generationMode,scope:c.scope,words:[...new Set(c.words)],minLength:c.minLength,minRank:c.minRank,leet:c.leet,onlyMatches:c.onlyMatches,target:c.target,prefix:c.prefix,suffix:c.suffix};
  if(c.runId!==undefined&&(typeof c.runId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(c.runId)))throw new Error('Invalid run ID.');
  if(c.cpuWorkers!==undefined&&(!Number.isInteger(c.cpuWorkers)||c.cpuWorkers<0||c.cpuWorkers>32))throw new Error('CPU workers must be 0–32.');
  validated.cpuWorkers=c.cpuWorkers||0;
  if(c.searchStyles!==undefined&&(!Array.isArray(c.searchStyles)||c.searchStyles.length>5||!c.searchStyles.every(style=>SEARCH_STYLES.some(([id])=>id===style))))throw new Error('Invalid search styles.');
  validated.searchStyles=[...new Set(c.searchStyles||[])];
  if(c.exactText!==undefined&&typeof c.exactText!=='boolean')throw new Error('Invalid exact-text option.');
  validated.exactText=!!c.exactText;
  if(validated.exactText){
    validated.leet=false;
    if(![...validated.words,validated.prefix,validated.suffix].every(word=>[...word].every(char=>CHAINS[validated.chain].alphabet.includes(char))))throw new Error('Exact text contains unavailable address characters.');
  }
  validated.runId=c.runId;
  validated.directSearch=!!c.directSearch;
  if(validated.directSearch){validated.minRank=0;validated.minLength=2;validated.onlyMatches=true;}
  validated.wordScores=gpuWordScores(validated.chain,validated);
  if(validated.discovery)validated.discovery.wordScores=gpuWordScores(validated.chain,validated.discovery);
  return validated;
}

export function verifyResult(result, matcher, allowFiltered = false) {
  if (!/^[0-9a-f]{64}$/.test(result.seed) || !/^[0-9a-f]{64}$/.test(result.pub)) throw new Error('Malformed GPU result.');
  // Reject conservative filter candidates before expensive key reconstruction.
  // No wallet is retained until the claimed public key is independently verified.
  const claimedPub=Buffer.from(result.pub,'hex'), address=base58.encode(claimedPub), match=matcher(address);
  if (!match.keep) { if (allowFiltered) return null; throw new Error('GPU matching disagrees with the CPU reference.'); }
  const seed=Buffer.from(result.seed,'hex');
  try {
    const key=createPrivateKey({key:Buffer.concat([pkcs8,seed]),format:'der',type:'pkcs8'});
    const pub=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32);
    if (!timingSafeEqual(pub,claimedPub)) throw new Error('GPU key verification failed.');
    return {chain:'sol',address,privateKey:base58.encode(Buffer.concat([seed,pub])),format:'Base58 secret key (64 bytes)',phrase:null,path:null,generationMode:'private-key',engine:'opencl',created:new Date().toISOString(),...match};
  } finally {seed.fill(0);}
}

export function verifySolanaRecoveryResult(result,matcher,allowFiltered=false){
  if(typeof result.entropy!=='string'||!/^[0-9a-f]{32}$/.test(result.entropy))throw new Error('Malformed Solana recovery result.');
  const verified=verifyResult(result,matcher,allowFiltered);
  if(!verified)return null;
  const entropy=Buffer.from(result.entropy,'hex');
  try{
    const phrase=entropyToMnemonic(entropy,wordlist),wallet=generateWallet('sol',phrase);
    if(wallet.address!==verified.address||wallet.privateKey!==verified.privateKey)throw new Error('Solana phrase/address verification failed.');
    return {...verified,phrase,path:wallet.path,generationMode:'recovery-phrase',engine:'opencl-bip39'};
  }finally{entropy.fill(0);}
}

export function verifyBitcoinResult(result, matcher, allowFiltered = false) {
  if (!/^[0-9a-f]{32}$/.test(result.entropy) || !/^[0-9a-f]{64}$/.test(result.key) || typeof result.address !== 'string') throw new Error('Malformed Bitcoin GPU result.');
  const match = matcher(result.address);
  if(!match.keep){if(allowFiltered)return null;throw new Error('Bitcoin matching disagrees with CPU scoring.');}
  const entropy = Buffer.from(result.entropy,'hex'), key = Buffer.from(result.key,'hex');
  try {
    const phrase = entropyToMnemonic(entropy, wordlist);
    const wallet = generateWallet('btc',phrase);
    const recovered = base58check(sha256).decode(wallet.privateKey);
    try {
      if(wallet.address !== result.address || !timingSafeEqual(key,recovered.slice(1,33))) throw new Error('Bitcoin phrase/address verification failed.');
    } finally { recovered.fill(0); }
    return {...wallet,generationMode:'recovery-phrase',engine:'opencl-bip39',...match};
  } finally { entropy.fill(0);key.fill(0); }
}

export function verifyBitcoinFastResult(result, matcher, allowFiltered = false) {
  if (typeof result.key !== 'string' || !/^[0-9a-f]{64}$/.test(result.key) || typeof result.address !== 'string') throw new Error('Malformed Bitcoin Fast GPU result.');
  const key = Buffer.from(result.key, 'hex');
  try {
    if (!secp256k1.utils.isValidSecretKey(key)) throw new Error('Invalid Bitcoin Fast private key.');
    const address = bech32.encode('bc', [0, ...bech32.toWords(ripemd160(sha256(secp256k1.getPublicKey(key, true))))]);
    if (address !== result.address) throw new Error('Bitcoin Fast address verification failed.');
    const match = matcher(address);
    if (!match.keep) { if (allowFiltered) return null; throw new Error('Bitcoin matching disagrees with CPU scoring.'); }
    const payload = Buffer.concat([Buffer.from([128]), key, Buffer.from([1])]);
    try {
      return {chain:'btc',address,privateKey:base58check(sha256).encode(payload),format:'Compressed mainnet WIF',phrase:null,path:null,generationMode:'private-key',engine:'opencl',created:new Date().toISOString(),...match};
    } finally { payload.fill(0); }
  } finally { key.fill(0); }
}

export function verifyEthereumFastResult(result, matcher, allowFiltered = false) {
  if (typeof result.key !== 'string' || !/^[0-9a-f]{64}$/.test(result.key) || typeof result.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(result.address)) throw new Error('Malformed Ethereum Fast GPU result.');
  const key = Buffer.from(result.key, 'hex');
  try {
    if (!secp256k1.utils.isValidSecretKey(key)) throw new Error('Invalid Ethereum Fast private key.');
    const hex = bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20));
    if ('0x' + hex !== result.address) throw new Error('Ethereum Fast address verification failed.');
    // Apply exact-case and style filters to the real EIP-55 address, never lowercase GPU output.
    const address = checksumEth(hex), match = matcher(address);
    if (!match.keep) { if (allowFiltered) return null; throw new Error('Ethereum matching disagrees with CPU scoring.'); }
    return {chain:'eth',address,privateKey:'0x'+bytesToHex(key),format:'Hex private key',phrase:null,path:null,generationMode:'private-key',engine:'opencl',created:new Date().toISOString(),...match};
  } finally { key.fill(0); }
}

export function localRequest(req) {
  const host=req.headers.host;
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    [`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(host) &&
    (!req.headers.origin || req.headers.origin===`http://${host}`) && req.headers['x-wallet-forge']==='local';
}

export function gpuBridge({saveWallets = () => {},saveRun = () => {}} = {}) {
  let job, inventory;
  async function getDevices() {
    if (!inventory) inventory=new Promise((resolve,reject)=>{
      const child=launch(['--devices']);let output='';
      const timer=setTimeout(()=>{terminateTree(child);reject(new Error('GPU detection timed out.'));},10000);
      child.stdout.on('data',data=>{output+=data;}); child.stderr.resume();child.stdin.end();
      child.on('error',()=>{clearTimeout(timer);reject(new Error('GPU helper unavailable. Run Setup GPU.cmd.'));});
      child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw new Error('GPU detection failed.');resolve(JSON.parse(output).devices);}catch(error){reject(error);}});
    }).catch(error=>{inventory=undefined;throw error;});
    return inventory;
  }
  function forceStop(current) {
    if (!current || current.done || current.forced) return;
    clearTimeout(current.killTimer);current.stopping=true;current.forced=true;current.reason='forced';
    for(const entry of current.cpuEntries){entry.done=true;void entry.worker.terminate();}
    terminateTree(current.child);complete(current);
  }
  function stop(current,reason='stopped') {
    if (!current || current.done || current.stopping) return;
    current.stopping=true; current.reason=reason;
    for(const entry of current.cpuEntries)if(!entry.done)entry.worker.postMessage({type:'stop'});
    if (!current.child.stdin.destroyed) current.child.stdin.write(JSON.stringify({type:'stop'})+'\n');
    current.killTimer=setTimeout(()=>forceStop(current),10000);
  }
  function complete(current){
    current.done=!!current.exited&&!!current.outputDone&&current.cpuEntries.every(entry=>entry.done);
    if(current.done)clearTimeout(current.killTimer);
    publishRun(current,true);
  }
  function collect(current,candidates){
    if(current.forced||current.collector.reason)return;
    const accepted=current.collector.accept(candidates);
    for(const wallet of [...accepted.wallets,...accepted.rareWallets]){wallet.discoveryElapsedMs=runElapsed(current);wallet.discoveryRunId=current.runId;}
    try{saveWallets([...accepted.wallets,...accepted.rareWallets]);}
    catch{current.error='Could not save results to the project folder. Free disk space and export retained results.';stop(current);}
    current.queue.push(...accepted.wallets);current.rareQueue.push(...accepted.rareWallets);current.removed.push(...accepted.removed);
    if(current.collector.reason)stop(current,current.collector.reason);
  }
  function runElapsed(current){return Math.max(0,Math.round((current.runEnded??performance.now())-current.runStarted));}
  function publishRun(current,force=false){
    if(!current)return;
    if(current.done&&current.runEnded===undefined)current.runEnded=performance.now();
    if(!force&&performance.now()-(current.lastStats||0)<2000)return;
    try{saveRun({id:current.runId,source:'gpu',checked:[...current.counts.values()].reduce((a,b)=>a+b,0),elapsedMs:runElapsed(current),done:current.done});current.lastStats=performance.now();}
    catch{current.error='Could not save generation totals. Check available disk space.';stop(current);}
  }
  function start(config,selected,existing,rareExisting) {
    const current={cpuEntries:[],runId:config.runId||randomUUID(),runStarted:performance.now(),token:randomBytes(32).toString('hex'),config,collector:new HuntCollector(config,existing,rareExisting),queue:[],rareQueue:[],removed:[],counts:new Map(),ready:new Set(),done:false,stopping:false,reason:'',error:null,lastPoll:Date.now()};
    const child=launch([]);current.child=child;job=current;
    const matcher=compileHunt(config.chain,config),lines=createInterface({input:child.stdout});
    child.stderr.resume(); // Compiler diagnostics are not wallet output; avoid retaining logs.
    child.stdin.on('error',()=>{});
    (async()=>{
      try {
        for await(const line of lines) {
          const message=JSON.parse(line);
          if(message.type==='ready'){current.ready.add(message.device);continue;}
          if(message.type==='error'){current.error=String(message.message).slice(0,1000);stop(current);continue;}
          if(message.type==='progress'||message.type==='done') {
            current.counts.set(message.device,Math.max(current.counts.get(message.device)||0,message.attempts));publishRun(current);
            // Large GPU batches must not monopolize the HTTP event loop.
            // Drain verified updates before advertising final completion.
            for(let offset=0;offset<message.matches.length;offset+=32){
              if(current.forced || current.collector.reason) break;
              collect(current,message.matches.slice(offset,offset+32).map(raw=>(config.chain==='eth' ? verifyEthereumFastResult(raw,matcher,true) : config.chain==='btc' ? (config.generationMode==='private-key' ? verifyBitcoinFastResult(raw,matcher,true) : verifyBitcoinResult(raw,matcher,true)) : config.generationMode==='recovery-phrase' ? verifySolanaRecoveryResult(raw,matcher,true) : verifyResult(raw,matcher,true))).filter(Boolean));
              if(current.collector.reason)break;
              await yieldToServer();
            }
          }
          if(message.type==='progress'&&!child.stdin.destroyed)child.stdin.write(JSON.stringify({type:'ack',device:message.device})+'\n');
          await yieldToServer();
        }
      } catch {if(!current.forced)current.error='GPU output validation failed. Hunt stopped.';stop(current);}
      finally {current.outputDone=true;complete(current);}
    })();
    child.on('error',()=>{current.error='Unable to start GPU helper. Run Setup GPU.cmd.';stop(current);});
    child.on('close',code=>{current.exited=true;if(code!==0&&!current.error&&!current.forced)current.error='GPU worker exited unexpectedly.';stop(current,current.reason||'stopped');complete(current);});
    for(let index=0;index<config.cpuWorkers;index++){
      try{
        const worker=new Worker(new URL('../server/cpu-hunt-worker.js',import.meta.url),{workerData:config});
        const entry={worker,done:false};current.cpuEntries.push(entry);
        worker.on('message',message=>{
          if(entry.done)return;
          if(message.error){current.error=message.error;stop(current);return;}
          current.counts.set('cpu'+index,Math.max(current.counts.get('cpu'+index)||0,message.attempts));
          collect(current,message.wallets.map(wallet=>({...wallet,engine:'cpu'})));
          if(message.done){entry.done=true;complete(current);}else{worker.postMessage({type:'ack'});publishRun(current);}
        });
        worker.on('error',()=>{current.error='CPU generation worker failed.';stop(current);});
        worker.on('exit',()=>{if(!entry.done&&!current.forced){current.error||='CPU worker exited before its final checkpoint.';stop(current);}entry.done=true;complete(current);});
      }catch{current.error='Unable to start CPU worker.';stop(current);break;}
    }
    publishRun(current,true);
    child.stdin.write(JSON.stringify({config,devices:selected})+'\n');
    return current;
  }
  async function body(req) {
    let data='';for await(const chunk of req){data+=chunk;if(data.length>110000000)throw new Error('Request too large.');}
    return JSON.parse(data);
  }
  function attach(server) {
    const watchdog=setInterval(()=>{if(job&&!job.done)publishRun(job);if(job&&!job.done&&Date.now()-job.lastPoll>30000)stop(job);if(job?.done&&Date.now()-job.lastPoll>120000)job=undefined;},5000);
    watchdog.unref();
    server.httpServer?.once('close',()=>{clearInterval(watchdog);if(job&&!job.done){publishRun(job,true);for(const entry of job.cpuEntries)void entry.worker.terminate();terminateTree(job.child);}});
    server.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith('/api/gpu/'))return next();
      const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
      if(!localRequest(req))return reply(403,{error:'Only same-origin local requests are allowed.'});
      try {
        if(req.url==='/api/gpu/devices'&&req.method==='GET')return reply(200,{devices:await getDevices(),hybridSupported:true});
        if(req.url==='/api/gpu/start'&&req.method==='POST') {
          if(job&&!job.done)return reply(409,{error:'A GPU hunt is already running in another tab.'});
          const data=await body(req),config=validateConfig(data.config),available=await getDevices();
          if(!Array.isArray(data.devices)||!data.devices.length||data.devices.length>available.length||new Set(data.devices).size!==data.devices.length||!data.devices.every(i=>available.some(d=>d.index===i)))throw new Error('Invalid GPU selection.');
          if(!Array.isArray(data.existing)||data.existing.length>MAX_COLLECTION||!data.existing.every(s=>typeof s==='string'&&s.length<=100))throw new Error('Invalid collection.');
          if(job&&!job.done)return reply(409,{error:'A GPU hunt is already running in another tab.'});
          const rareExisting=data.rareExisting ?? [];
          if(!Array.isArray(rareExisting)||rareExisting.length>RARE_CAPACITY||!rareExisting.every(s=>typeof s==='string'&&s.length<=100))throw new Error('Invalid rare collection.');
          const current=start(config,data.devices,data.existing,rareExisting);return reply(200,{token:current.token});
        }
        if(!job||req.headers['x-wallet-job']!==job.token)return reply(403,{error:'Invalid GPU job token.'});
        job.lastPoll=Date.now();
        if(req.url==='/api/gpu/stop'&&req.method==='POST'){const data=await body(req);if(data.force===true)forceStop(job);else stop(job);return reply(200,{stopping:true});}
        if(req.url==='/api/gpu/status'&&req.method==='GET') {
          const wallets=job.queue.splice(0).filter(w=>!job.collector.best || job.collector.best.ids.has(`${w.chain}:${w.address}`));
          return reply(200,{runId:job.runId,elapsedMs:runElapsed(job),attempts:[...job.counts.values()].reduce((a,b)=>a+b,0),wallets,removed:job.removed.splice(0),rareWallets:job.rareQueue.splice(0),done:job.done,reason:job.reason,error:job.error,ready:job.ready.size,cpuWorkers:job.config.cpuWorkers,cpuAttempts:[...job.counts].filter(([key])=>typeof key==='string').reduce((sum,[,count])=>sum+count,0)});
        }
        reply(404,{error:'Unknown GPU endpoint.'});
      } catch(error){reply(400,{error:error.message});}
    });
  }
  return {name:'xa-wallet-generator-local-gpu',configureServer:attach,configurePreviewServer:attach};
}
