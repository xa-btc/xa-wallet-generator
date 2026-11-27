import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { validateConfig,verifySolanaRecoveryResult } from '../gpu/bridge.js';
import { compileHunt } from '../src/discovery.js';
const config=validateConfig({chain:'sol',generationMode:'recovery-phrase',scope:'ends',words:[],minLength:2,minRank:0,leet:true,onlyMatches:false,target:2,prefix:'',suffix:''});
const matcher=compileHunt('sol',config);
const child=spawn(fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe',import.meta.url)),[fileURLToPath(new URL('../gpu/engine.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
child.stderr.resume();
const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Recovery worker failed')));});
const timeout=setTimeout(()=>child.stdin.write('{"type":"stop"}\n'),30000);
const checked=new Set();
child.stdin.write(JSON.stringify({config,devices:[0,1]})+'\n');
try{
  for await(const line of createInterface({input:child.stdout})){
    const message=JSON.parse(line);
    assert.notEqual(message.type,'error',message.message);
    if(message.type==='progress'){
      if(message.matches.length&&!checked.has(message.device)){
        const raw=message.matches[0],wallet=verifySolanaRecoveryResult(raw,matcher);
        assert.equal(wallet.phrase.split(' ').length,12);
        assert.equal(wallet.path,"m/44'/501'/0'/0'");
        assert.throws(()=>verifySolanaRecoveryResult({...raw,entropy:'00'.repeat(16)},matcher),/verification/);
        checked.add(message.device);
      }
      child.stdin.write(JSON.stringify({type:checked.size===2?'stop':'ack',device:message.device})+'\n');
    }
  }
  await completed;assert.equal(checked.size,2);
  console.log('Both GPUs independently produced verified Solana private keys and 12-word Phantom-path recovery phrases; mismatched phrases rejected.');
}finally{clearTimeout(timeout);child.stdin.end();}
