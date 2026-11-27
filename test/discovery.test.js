import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHunt, discoveryConfig, HuntCollector } from '../src/discovery.js';
import { SearchPool } from '../src/worker-pool.js';
import { searchBatch } from '../src/search.js';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519.js';
import { validateConfig } from '../gpu/bridge.js';

const config = { chain: 'sol', generationMode: 'private-key', scope: 'suffix', prefix: 'zzzzzzzz', suffix: 'xyz', leet: false, onlyMatches: true, words: [], minLength: 3, minRank: 3, target: 2, discoveryRank: 4, discoveryRemaining: 2 };

test('direct words are alternatives, bypass primary rarity, and leave overflow independent',()=>{
  const c={...config,directSearch:true,prefix:'',suffix:'',words:['testie','testee'],minLength:2,minRank:6,leet:true};
  const match=compileHunt('sol',c);
  for(const word of ['testie','testee','t35t13']){
    const result=match('xyz'+word);
    assert.equal(result.primaryKeep,true,word);assert.ok(result.level<6);
  }
  assert.equal(match('testiexyz').primaryKeep,false);
  assert.equal(match('xyzAAAAAA').primaryKeep,false);
  const rare=match('xxshabbatxx123xyz');
  assert.equal(rare.primaryKeep,false);assert.equal(rare.discoveryMatch.rank,'Legendary');
  assert.equal(compileHunt('sol',{...c,discoveryRank:0})('xxshabbatxx123xyz').keep,false);
  const normalized=validateConfig(c);assert.equal(normalized.directSearch,true);assert.equal(normalized.minRank,0);assert.equal(normalized.discovery.minRank,4);
});
test('rare discovery scans the whole address with its own dictionary despite primary filters', () => {
  const match = compileHunt('sol', config);
  const word = match('xxshabbatxx123xyz');
  assert.equal(word.primaryKeep, false); assert.equal(word.keep, true);
  assert.equal(word.discoveryMatch.rank, 'Legendary');
  const repeat = match('xxAAAAAAAAAAxx123xyz');
  assert.equal(repeat.primaryKeep, false); assert.equal(repeat.discoveryMatch.streak, 10);
  assert.equal(compileHunt('sol', { ...config, discoveryRank: 0 })('xxshabbatxx123xyz').keep, false);
  assert.equal(compileHunt('sol', { ...config, discoveryRank: 5 })('xxshabbatxx123xyz').keep, false);
  assert.equal(match('xyz123xyz').keep, false);
  assert.equal(discoveryConfig('sol', 4).scope, 'any');
});

const candidate = (address, primaryKeep, rare = true) => ({ chain: 'sol', address, primaryKeep, keep: true, rank: 'Common', discoveryMatch: rare ? { keep: true, rank: 'Legendary', level: 4 } : null });
test('independent limits, duplicates, both-category finds, and resumed collections', () => {
  const collector = new HuntCollector(config, ['sol:old'], ['sol:oldrare']);
  let output = collector.accept([candidate('oldrare', false), candidate('rare', false), candidate('rare', false)]);
  assert.equal(output.wallets.length, 0); assert.equal(output.rareWallets.length, 1);
  assert.equal(collector.remaining, 2); assert.equal(collector.reason, '');
  output = collector.accept([candidate('both', true), candidate('overflow', false)]);
  assert.equal(output.wallets.length, 1); assert.equal(output.rareWallets.length, 1);
  assert.equal(output.rareWallets[0].rank, 'Legendary');
  assert.equal(collector.reason, 'rare-limit');
  const primary = new HuntCollector(config);
  primary.accept([candidate('a', true, false), candidate('b', true, false)]);
  assert.equal(primary.reason, 'target'); assert.equal(primary.rareRemaining, 2);
});

test('CPU pool requests stop on overflow and flushes pending primary matches', () => {
  const workers = [], messages = [], finished = [];
  const pool = new SearchPool({ createWorker: () => { const w = { postMessage: m => messages.push(m), terminate() {} }; workers.push(w); return w; }, onProgress: () => {}, onFinish: r => finished.push(r), onError: assert.fail });
  pool.start({ ...config, discoveryRemaining: 1 }, 2);
  workers[0].onmessage({ data: { type: 'progress', attempts: 100, wallets: [candidate('rare', false)] } });
  assert.equal(messages.filter(m => m.type === 'stop').length, 2);
  workers[0].onmessage({ data: { type: 'progress', attempts: 104, wallets: [], done: true } });
  workers[1].onmessage({ data: { type: 'progress', attempts: 100, wallets: [candidate('primary', true, false)], done: true } });
  assert.deepEqual(finished, ['rare-limit']); assert.equal(pool.collector.remaining, 1);
});

test('rare-only candidate finalization preserves a valid importable key', async () => {
  const batch = await searchBatch(config, () => ({ keep: true, primaryKeep: false, discoveryMatch: { keep: true, rank: 'Legendary' } }), 2);
  assert.equal(batch.wallets.length, 2);
  for (const wallet of batch.wallets) assert.equal(base58.encode(ed25519.getPublicKey(base58.decode(wallet.privateKey).slice(0, 32))), wallet.address);
});

test('GPU bridge validates overflow limits and derives its own rare dictionary', () => {
  const validated = validateConfig({ ...config, discovery: { words: ['injected'] } });
  assert.ok(validated.discovery.words.includes('shabbat'));
  assert.equal(validated.discovery.prefix, '');
  for (const change of [{ discoveryRank: 3 }, { discoveryRemaining: 0 }, { discoveryRemaining: 1000000 }]) assert.throws(() => validateConfig({ ...config, ...change }));
});


test('overflow source, length, zone and aliases are independent and survive GPU validation',()=>{
  const discoveryOptions={source:'library',words:['shabbat','moon','SHABBAT'],minLength:7,scope:'any',leet:false,ignoreRepeated:true};
  assert.throws(()=>discoveryConfig('sol',4,discoveryOptions),/words/);
  discoveryOptions.words=['shabbat','moon'];
  const c={...config,discoveryOptions};
  const rare=discoveryConfig('sol',4,discoveryOptions);
  assert.deepEqual(rare.words,['shabbat']);assert.equal(rare.minLength,7);assert.equal(rare.leet,false);
  assert.equal(rare.ignoreRepeated,true);
  const validated=validateConfig(c);
  assert.deepEqual(validated.discovery.words,rare.words);
  assert.deepEqual(validated.discoveryOptions,discoveryOptions);
  assert.equal(compileHunt('sol',c)('xxshabbatxx123xyz').discoveryMatch?.keep,true);
  assert.equal(compileHunt('sol',c)('xx5habbatxx123xyz').discoveryMatch,null);
  assert.equal(compileHunt('sol',c)('xxAAAAAAAAAAxx123xyz').discoveryMatch,null);
  assert.equal(compileHunt('sol',{...c,discoveryOptions:{...discoveryOptions,words:['another']}})('xxshabbatxx123xyz').discoveryMatch,null);
  assert.throws(()=>discoveryConfig('sol',4,{...discoveryOptions,scope:'last4'}),/zone/);
  for(const source of ['library','search','custom'])assert.deepEqual(discoveryConfig('sol',4,{source,words:['moon','shabbat'],minLength:4,scope:'last4'}).words,['moon']);
  assert.equal(discoveryConfig('sol',4,{minLength:2}).minLength,2);
  assert.equal(discoveryConfig('sol',4).minLength,3);
});
