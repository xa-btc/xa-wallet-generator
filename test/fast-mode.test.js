import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { base58, base58check, bech32 } from '@scure/base';
import { generateCandidate, finalizeCandidate, solanaPublicNative, checksumEth } from '../src/wallet.js';
import { searchBatch } from '../src/search.js';

test('native Ed25519 matches the reference for fixed and random seeds', async () => {
  for (const seed of [new Uint8Array(32), new Uint8Array(32).fill(255), ...Array.from({length:8},()=>crypto.getRandomValues(new Uint8Array(32)))]) {
    assert.deepEqual(await solanaPublicNative(seed), ed25519.getPublicKey(seed));
  }
});
test('unsupported native Ed25519 uses the existing reference implementation', async t => {
  const fallbackModule = await import('../src/wallet.js?fallback-test');
  let calls=0;
  t.mock.method(crypto.subtle,'importKey', async () => { calls++; throw new DOMException('Ed25519 unsupported','NotSupportedError'); });
  const seed=crypto.getRandomValues(new Uint8Array(32));
  assert.deepEqual(await fallbackModule.solanaPublicNative(seed),ed25519.getPublicKey(seed));
  assert.deepEqual(await fallbackModule.solanaPublicNative(seed),ed25519.getPublicKey(seed));
  assert.equal(calls,1);
});
test('fast Solana exports sign for their displayed address and have no recovery phrase', async () => {
  const addresses = new Set();
  for(let i=0;i<8;i++) {
    const candidate=await generateCandidate('sol','private-key');
    const wallet=finalizeCandidate(candidate);
    assert.ok(candidate.key.every(b=>b===0));
    assert.equal(wallet.phrase,null); assert.equal(wallet.path,null); assert.equal(wallet.generationMode,'private-key');
    const key=base58.decode(wallet.privateKey), message=new Uint8Array([1,2,3]);
    assert.equal(key.length,64); assert.equal(base58.encode(key.slice(32)),wallet.address);
    assert.ok(ed25519.verify(ed25519.sign(message,key.slice(0,32)),message,base58.decode(wallet.address)));
    assert.ok(!addresses.has(wallet.address)); addresses.add(wallet.address);
  }
});
test('fast Ethereum exports recover their checksummed address', async () => {
  const addresses = new Set();
  for(let i=0;i<8;i++) {
    const candidate=await generateCandidate('eth','private-key');
    const wallet=finalizeCandidate(candidate);
    const key=hexToBytes(wallet.privateKey.slice(2));
    assert.ok(secp256k1.utils.isValidSecretKey(key));
    const reference=checksumEth(bytesToHex(keccak_256(secp256k1.getPublicKey(key,false).slice(1)).slice(-20)));
    assert.equal(wallet.address,reference); assert.equal(wallet.phrase,null); assert.equal(wallet.path,null);
    assert.ok(candidate.key.every(b=>b===0));
    assert.ok(!addresses.has(wallet.address)); addresses.add(wallet.address);
  }
});
test('Bitcoin Fast exports native SegWit WIF with no recovery phrase', async () => {
  for(let i=0;i<8;i++){
    const candidate=await generateCandidate('btc','private-key'), wallet=finalizeCandidate(candidate);
    const wif=base58check(sha256).decode(wallet.privateKey);
    assert.equal(wif.length,34);assert.equal(wif[0],128);assert.equal(wif[33],1);
    const key=wif.slice(1,33),pub=secp256k1.getPublicKey(key,true);
    assert.equal(wallet.address,bech32.encode('bc',[0,...bech32.toWords(ripemd160(sha256(pub)))]));
    assert.equal(wallet.phrase,null);assert.equal(wallet.path,null);assert.equal(wallet.generationMode,'private-key');
    assert.ok(candidate.key.every(b=>b===0));
    const message=sha256(new Uint8Array([1,2,3]));
    assert.ok(secp256k1.verify(secp256k1.sign(message,key),message,pub));
  }
  await assert.rejects(generateCandidate('sol','unknown'),/Unknown generation mode/);
});
test('search only serializes matching candidates and preserves exact attempt counts', async () => {
  const config={chain:'sol',generationMode:'private-key'};
  const discarded=await searchBatch(config,()=>({keep:false}),8);
  assert.equal(discarded.attempts,8); assert.deepEqual(discarded.wallets,[]);
  const collected=await searchBatch(config,()=>({keep:true}),8);
  assert.equal(collected.attempts,8); assert.equal(collected.wallets.length,8);
  assert.ok(collected.wallets.every(w=>w.privateKey && w.phrase===null && !('key' in w) && !('pub' in w)));
});
test('direct-key workers handle Stop even without asynchronous PBKDF2', { timeout:15000 }, async () => {
  for (const chain of ['sol','eth','btc']) {
    const worker=new Worker(new URL('../scripts/benchmark-worker.mjs',import.meta.url));
    try {
      await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
      await new Promise((resolve,reject)=>{
        let stopping=false;
        worker.on('error',reject);
        worker.on('message',data=>{
          try {
            if(data.type==='error') throw new Error(data.message);
            if(data.type!=='progress') return;
            assert.ok(data.attempts>0);
            if(!stopping){
              assert.ok(data.wallets.length>0);assert.equal(data.wallets[0].phrase,null);
              stopping=true;worker.postMessage({type:'stop'});
            }
            if(data.done)resolve();
          } catch(error){reject(error);}
        });
        worker.postMessage({type:'start',config:{chain,generationMode:'private-key',scope:'ends',words:[],minLength:3,prefix:'',suffix:'',leet:true,minRank:0,onlyMatches:false}});
      });
    } finally { await worker.terminate(); }
  }
});

test('CPU Ethereum matching sees the same checksummed address as the export',async()=>{
  const seen=[];
  const result=await searchBatch({chain:'eth',generationMode:'private-key'},address=>{seen.push(address);return {keep:true};},16);
  assert.deepEqual(result.wallets.map(w=>w.address),seen);
  for(const address of seen)assert.equal(address,checksumEth(address.slice(2).toLowerCase()));
});
