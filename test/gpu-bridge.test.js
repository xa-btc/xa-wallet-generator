import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, localRequest, verifyResult, verifyBitcoinResult, verifyBitcoinFastResult, verifyEthereumFastResult } from '../gpu/bridge.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { compileMatcher } from '../src/matching.js';
import { generateWallet } from '../src/wallet.js';

const config={chain:'sol',generationMode:'private-key',scope:'ends',words:['sol'],minLength:3,minRank:0,leet:true,onlyMatches:false,target:2,prefix:'',suffix:''};
test('GPU bridge restricts requests to supported modes and bounded filters',()=>{
  assert.equal(validateConfig(config).chain,'sol');
  assert.equal(validateConfig({...config,cpuWorkers:2}).cpuWorkers,2);
  for(const cpuWorkers of [-1,33,1.5,'2'])assert.throws(()=>validateConfig({...config,cpuWorkers}));
  assert.equal(validateConfig({...config,target:999999,minRank:6}).target,999999);
  for(const change of [{chain:'invalid'},{chain:'eth',generationMode:'recovery-phrase'},{generationMode:'invalid'},{target:1000000},{scope:'invalid'},{words:['<script>']},{prefix:'!'}])assert.throws(()=>validateConfig({...config,...change}));
});
test('GPU bridge rejects cross-origin, unauthenticated and DNS-rebinding requests',()=>{
  const req={headers:{host:'127.0.0.1:5173','x-wallet-forge':'local',origin:'http://127.0.0.1:5173'},socket:{remoteAddress:'127.0.0.1',localPort:5173}};
  assert.ok(localRequest(req));
  for(const headers of [{...req.headers,origin:'http://evil.example'},{...req.headers,host:'evil.example:5173'},{host:'127.0.0.1:5173'}])assert.equal(localRequest({...req,headers}),false);
});
test('GPU bridge independently rejects incorrect public keys and mismatched filters',()=>{
  const seed=new Uint8Array(32).fill(42),pub=ed25519.getPublicKey(seed),result={seed:bytesToHex(seed),pub:bytesToHex(pub)};
  const wallet=verifyResult(result,()=>({keep:true}));assert.equal(wallet.address,base58.encode(pub));
  assert.equal(base58.decode(wallet.privateKey).length,64);assert.equal(wallet.phrase,null);
  assert.throws(()=>verifyResult({...result,pub:'00'.repeat(32)},()=>({keep:true})),/verification/);
  assert.throws(()=>verifyResult({...result,pub:'00'.repeat(32)},()=>({keep:true}),true),/verification/);
  assert.equal(verifyResult(result,()=>({keep:false}),true),null);
  assert.throws(()=>verifyResult(result,()=>({keep:false})),/matching/);
});

test('Bitcoin recovery GPU independently recovers every exported key',()=>{
  assert.equal(validateConfig({...config,chain:'btc',generationMode:'recovery-phrase'}).chain,'btc');
  assert.equal(validateConfig({...config,chain:'btc',generationMode:'private-key'}).generationMode,'private-key');
  const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const reference=generateWallet('btc',phrase);
  const raw={entropy:'00'.repeat(16),key:bytesToHex(base58check(sha256).decode(reference.privateKey).slice(1,33)),address:reference.address};
  const wallet=verifyBitcoinResult(raw,()=>({keep:true}));
  assert.equal(wallet.phrase,phrase);assert.equal(wallet.privateKey,reference.privateKey);
  assert.equal(wallet.path,"m/84'/0'/0'/0/0");assert.equal(wallet.engine,'opencl-bip39');
  assert.throws(()=>verifyBitcoinResult({...raw,key:'01'.repeat(32)},()=>({keep:true})),/verification/);
  assert.throws(()=>verifyBitcoinResult({...raw,key:'01'.repeat(32)},()=>({keep:true}),true),/verification/);
  assert.throws(()=>verifyBitcoinResult({...raw,address:'bc1qwrong'},()=>({keep:true})),/verification/);
  assert.equal(verifyBitcoinResult(raw,()=>({keep:false}),true),null);
});

// Public test scalar 1, never a funded wallet.
test('Bitcoin Fast bridge validates key, address, filters and WIF independently',()=>{
  const raw={key:'0'.repeat(63)+'1',address:'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'};
  const wallet=verifyBitcoinFastResult(raw,()=>({keep:true}));
  assert.equal(wallet.phrase,null);assert.equal(wallet.path,null);assert.equal(wallet.generationMode,'private-key');
  assert.equal(bytesToHex(base58check(sha256).decode(wallet.privateKey).slice(1,33)),raw.key);
  assert.throws(()=>verifyBitcoinFastResult({...raw,address:'bc1qwrong'},()=>({keep:true})),/verification/);
  assert.throws(()=>verifyBitcoinFastResult({...raw,key:'00'.repeat(32)},()=>({keep:true})),/Invalid/);
  assert.throws(()=>verifyBitcoinFastResult({...raw,key:'ff'.repeat(32)},()=>({keep:true})),/Invalid/);
  assert.throws(()=>verifyBitcoinFastResult({...raw,key:undefined},()=>({keep:true})),/Malformed/);
  assert.equal(verifyBitcoinFastResult(raw,()=>({keep:false}),true),null);
  assert.throws(()=>verifyBitcoinFastResult(raw,()=>({keep:false})),/matching/);
});

// Public scalar 1, with the independently known Ethereum EIP-55 address.
test('Ethereum GPU Fast verifies address, hex key and checksum before matching',()=>{
  assert.equal(validateConfig({...config,chain:'eth',words:['dead']}).chain,'eth');
  const raw={key:'0'.repeat(63)+'1',address:'0x7e5f4552091a69125d5dfcb7b8c2659029395bdf'};
  const expected='0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  const wallet=verifyEthereumFastResult(raw,address=>({keep:address===expected}));
  assert.equal(wallet.address,expected);assert.equal(wallet.privateKey,'0x'+raw.key);
  assert.equal(wallet.phrase,null);assert.equal(wallet.path,null);assert.equal(wallet.chain,'eth');
  assert.throws(()=>verifyEthereumFastResult({...raw,address:'0x'+'00'.repeat(20)},()=>({keep:true})),/verification/);
  for(const key of ['00'.repeat(32),'ff'.repeat(32)])assert.throws(()=>verifyEthereumFastResult({...raw,key},()=>({keep:true})),/Invalid/);
  assert.throws(()=>verifyEthereumFastResult({...raw,key:undefined},()=>({keep:true})),/Malformed/);
  assert.equal(verifyEthereumFastResult(raw,()=>({keep:false}),true),null);
  assert.throws(()=>verifyEthereumFastResult(raw,()=>({keep:false})),/matching/);
  const matcher=compileMatcher('eth',{...config,chain:'eth',words:[],prefix:'7E5F',leet:false,exactText:true});
  assert.ok(verifyEthereumFastResult(raw,matcher).keep);
  const lower=compileMatcher('eth',{...config,chain:'eth',words:[],prefix:'7e5f',leet:false,exactText:true});
  assert.equal(verifyEthereumFastResult(raw,lower,true),null);
});
