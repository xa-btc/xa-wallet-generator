import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mnemonicToSeedSync } from '@scure/bip39';
import { generateWallet, generateWalletAsync, mnemonicToNativeSeed, CHAINS } from '../src/wallet.js';
import { compileMatcher, evaluate, WORDS } from '../src/matching.js';
import { SearchPool, recommendedWorkers } from '../src/worker-pool.js';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const config = { chain: 'sol', scope: 'ends', words: WORDS, minLength: 3, prefix: '', suffix: '', leet: true, minRank: 0, onlyMatches: true, target: 2 };
test('native BIP39 seed matches reference including Unicode passphrase normalization', async () => {
  for (const pass of ['', 'TREZOR', 'café\u334d\u30ac']) {
    assert.deepEqual(await mnemonicToNativeSeed(phrase, pass), mnemonicToSeedSync(phrase, pass));
  }
});
test('native generation recovers identical addresses, private keys, phrases and paths on every chain', async () => {
  for (const chain of Object.keys(CHAINS)) {
    const original = generateWallet(chain, phrase); const optimized = await generateWalletAsync(chain, phrase);
    for (const field of ['address','privateKey','phrase','path','format']) assert.equal(optimized[field], original[field]);
    const fresh = await generateWalletAsync(chain); const recovered = generateWallet(chain, fresh.phrase);
    assert.equal(fresh.privateKey, recovered.privateKey); assert.equal(fresh.address, recovered.address);
  }
});
test('compiled matcher preserves word hits, scoring and highlight offsets across chains and scopes', () => {
  for (const chain of Object.keys(CHAINS)) for (const scope of ['ends','first4','last4','last5','suffix','any']) for (const leet of [false,true]) {
    const c = { ...config, chain, scope, leet }; const match = compileMatcher(chain,c);
    const alphabet = CHAINS[chain].alphabet; const prefix = CHAINS[chain].prefix;
    // Deterministic test address strings only; not key generation.
    let n = 1741;
    for (let i=0;i<20;i++) {
      const body = Array.from({length:40}, () => { n = (n * 1664525 + 1013904223) >>> 0; return alphabet[n % alphabet.length]; }).join('');
      const address = prefix + body;
      assert.deepEqual(match(address), evaluate(address,chain,c));
    }
    const fixtures = chain === 'eth' ? ['dead'+'a'.repeat(32)+'beef'] : chain === 'btc' ? ['s0lq'+'q'.repeat(32)+'m00n'] : ['5oLx'+'x'.repeat(32)+'m00n', '1111'+'x'.repeat(32)+'5555'];
    for (const fixture of fixtures) assert.deepEqual(match(prefix+fixture), evaluate(prefix+fixture,chain,c));
  }
});
test('compiled matcher respects required filters and overlapping leet aliases', () => {
  const c = { ...config, words: ['ill','lll','111','sol','m00n'], prefix: '1', suffix: 'moon' };
  const match = compileMatcher('sol',c);
  const address = '1111'+'x'.repeat(32)+'m00n';
  assert.deepEqual(match(address),evaluate(address,'sol',c));
  assert.equal(match('5555'+'x'.repeat(32)+'m00n').keep,false);
});
function fixturePool() {
  const workers = [], accepted = [], counts = [], results = [], errors = [];
  const pool = new SearchPool({
    createWorker: () => { const w = { messages: [], terminated: false, postMessage(m) { this.messages.push(m); }, terminate() { this.terminated = true; } }; workers.push(w); return w; },
    onProgress: data => { accepted.push(...data.wallets); counts.push(data.attempts); },
    onFinish: reason => results.push(reason), onError: error => errors.push(error),
  });
  return { pool, workers, accepted, counts, results, errors };
}
const wallet = address => ({chain:'sol',address});
test('worker pool deduplicates across workers, caps the collection and aggregates final counters', () => {
  const f=fixturePool(); f.pool.start(config,2,['sol:existing']);
  f.workers[0].onmessage({ data:{type:'progress', attempts:8, wallets:[wallet('existing'),wallet('a')]} });
  f.workers[1].onmessage({ data:{type:'progress', attempts:12, wallets:[wallet('a'),wallet('b'),wallet('c')]} });
  assert.deepEqual(f.accepted.map(w=>w.address),['a','b']);
  assert.ok(f.workers.every(w=>w.messages.at(-1).type==='stop'));
  for(const [i,w] of f.workers.entries()) w.onmessage({data:{type:'progress', attempts:16+i*4, wallets:[wallet('extra')], done:true}});
  assert.equal(f.counts.at(-1),36); assert.deepEqual(f.results,['target']); assert.equal(f.pool.active,false);
  assert.ok(f.workers.every(w=>w.terminated));
});
test('manual stop flushes in-flight matches and worker errors terminate the pool', () => {
  const f=fixturePool(); f.pool.start({...config,target:4},2); f.pool.stop();
  f.workers[0].onmessage({data:{type:'progress',attempts:4,wallets:[wallet('late')],done:true}});
  f.workers[1].onmessage({data:{type:'progress',attempts:4,wallets:[],done:true}});
  assert.equal(f.accepted[0].address,'late'); assert.deepEqual(f.results,['stopped']);
  f.pool.start(config,1); f.workers[2].onmessage({data:{type:'error',message:'test failure'}});
  assert.equal(f.pool.active,false); assert.deepEqual(f.errors,['test failure']); assert.ok(f.workers[2].terminated);
  assert.equal(recommendedWorkers(32),12); assert.equal(recommendedWorkers(1),1);
});
test('actual worker runs the native pipeline and flushes on stop', { timeout: 10000 }, async () => {
  const worker = new Worker(new URL('../scripts/benchmark-worker.mjs', import.meta.url));
  try {
    await new Promise((resolve,reject) => { worker.once('message',resolve); worker.once('error',reject); });
    await new Promise((resolve,reject) => {
      let stopping = false;
      worker.on('error',reject);
      worker.on('message', data => {
        try {
          if (data.type==='error') throw new Error(data.message);
          if(data.type!=='progress') return;
          assert.ok(data.attempts>0);
          if(!stopping) {
            assert.ok(data.wallets.length>0);
            const w=data.wallets[0]; assert.equal(generateWallet(w.chain,w.phrase).address,w.address);
            stopping=true; worker.postMessage({type:'stop'});
          }
          if(data.done) resolve();
        } catch(error) { reject(error); }
      });
      worker.postMessage({type:'start',config:{...config,words:[],onlyMatches:false}});
    });
  } finally { await worker.terminate(); }
});

test('force stop terminates every CPU worker and ignores late messages', () => {
  const workers=[];let finishes=0;
  const pool=new SearchPool({createWorker:()=>{const worker={postMessage(){},terminate(){this.terminated=true;}};workers.push(worker);return worker;},onProgress(){throw Error('Late progress');},onFinish:reason=>{assert.equal(reason,'forced');finishes++;},onError:message=>{throw Error(message);}});
  pool.start(config,2);pool.stop();pool.forceStop();pool.forceStop();
  for(const worker of workers){assert.ok(worker.terminated);worker.onmessage({data:{type:'progress',attempts:1,wallets:[],done:true}});}
  assert.equal(pool.active,false);assert.equal(finishes,1);
});
