import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compileMatcher } from '../src/matching.js';
import { gpuWordScores } from '../src/quality.js';
import { BestKeepers } from '../src/best-keepers.js';
import { HuntCollector } from '../src/discovery.js';
import { COMMON_WORDS, selectedWords, loadExpandedWords } from '../src/word-packs.js';

const config = { scope:'suffix', words:['silver','abcdef'], minLength:3, prefix:'', suffix:'', leet:true, minRank:0, onlyMatches:true };
test('last-six quality distinguishes readability, word desirability and repeat characters', () => {
  const exact = evaluate('xxsilver','sol',config), leet = evaluate('xx5i1ver','sol',config);
  assert.ok(exact.score > leet.score); assert.equal(leet.quality.substitutions,2);
  assert.equal(exact.rank,'Legendary'); assert.equal(leet.rank,'Epic');
  assert.notEqual(evaluate('xxAAAAAA','sol',config).rank,'Godlike');
  assert.notEqual(evaluate('xx999999','sol',config).rank,'Godlike');
  assert.ok(evaluate('xxAAAAAA','sol',config).score > evaluate('xxAaAaAa','sol',config).score);
  const longerScope = evaluate('xxsilver','sol',{...config,scope:'any'});
  assert.ok(longerScope.quality.difficultyBits < exact.quality.difficultyBits);
});

test('independent matches add a bounded bonus; required repeat is an actual hunt constraint', () => {
  const c={...config,scope:'any',words:['moon','sol']};
  const two = evaluate('moonxzqysol','sol',c), one = evaluate('moonxzqyxyz','sol',c);
  assert.equal(two.quality.patternBonus,8); assert.ok(two.score > one.score);
  assert.equal(evaluate('xx999999','sol',{...config,requiredRepeat:6}).keep,true);
  assert.equal(evaluate('xx99999x','sol',{...config,requiredRepeat:6}).keep,false);
});

const keeper = (id,score) => ({chain:'sol',address:id,level:Math.min(6,Math.floor(score/20)),score});
test('bounded heap matches full sorting and retains no history of replaced keys', () => {
  const best = new BestKeepers(25);
  const inputs = Array.from({length:500},(_,i)=>keeper(String(i),(i*137)%503));
  for(const w of inputs) best.offer(w);
  const order=(a,b)=>b.level-a.level || b.score-a.score;
  assert.deepEqual([...best.heap].sort(order),[...inputs].sort(order).slice(0,25));
  assert.equal(best.ids.size,25);
  assert.equal(best.offer(best.heap[0]).accepted,false);
});

test('keep-best resumes, replaces weak entries, and still stops at overflow limit', () => {
  const existing=keeper('old',20);
  const c=new HuntCollector({target:2,keepBest:true,bestExisting:[existing],discoveryRank:4,discoveryRemaining:1},['sol:old']);
  const updates=c.accept([keeper('a',30),keeper('b',40),keeper('c',50)]);
  assert.deepEqual(updates.wallets.map(w=>w.address),['b','c']);
  assert.deepEqual(updates.removed,['sol:old','sol:a']);
  assert.equal(c.reason,'');
  const rare=c.accept([{...keeper('rare',80),primaryKeep:false,discoveryMatch:{level:4,score:90,keep:true}}]);
  assert.equal(rare.rareWallets.length,1);assert.equal(c.reason,'rare-limit');
});

test('English packs are optional, deduplicated, and compatible with the matcher', async () => {
  assert.ok(COMMON_WORDS.includes('silver'));
  const expanded=await loadExpandedWords();
  assert.ok(expanded.length>200000);assert.ok(expanded.every(w=>/^[a-z]{3,44}$/.test(w)));
  assert.deepEqual(selectedWords({}),[]);
  const words=selectedWords({common:true,expanded:true},expanded);
  assert.equal(words.length,new Set(words).size);
  const short=words.filter(w=>w.length===6);
  assert.ok(compileMatcher('sol',{...config,words:short})('xxsilver').hits.includes('silver'));
  const scores=gpuWordScores('sol',{...config,leet:false,words:['usd0','silver']});
  assert.equal(scores.usd0,0);assert.ok(Number.isFinite(scores.silver));
});


test('real spelling ranks CAPS above Proper above mixed/lowercase above substitutions', () => {
  const c={...config,words:['test'],scope:'last4'};
  const forms=['TEST','Test','tEsT','test','TES7'];
  const results=forms.map(text=>compileMatcher('sol',c)('abcxyz'+text));
  assert.ok(results.every(r=>r.keep));
  assert.ok(results[0].score>results[1].score);
  assert.ok(results[1].score>results[2].score);
  assert.equal(results[2].score,results[3].score);
  assert.ok(results[3].score>results[4].score);
  assert.deepEqual(results.map(r=>r.quality.casingBonus),[18,9,0,0,0]);
  assert.equal(results[4].quality.substitutions,1);
  const bounds=gpuWordScores('sol',c);
  assert.ok(bounds.test>=results[0].score);
  const joined={...c,scope:'joined',words:['deadbeef']};
  assert.ok(compileMatcher('sol',joined)('DEADxyzBEEF').score>compileMatcher('sol',joined)('Deadxyzbeef').score);
  assert.ok(compileMatcher('sol',joined)('Deadxyzbeef').score>compileMatcher('sol',joined)('dEAdxyzbEeF').score);
});

test('network case presentation cannot inflate Ethereum or Bitcoin scores', () => {
  for(const [chain,prefix] of [['eth','0x'],['btc','bc1q']]) {
    const c={...config,words:['dead'],scope:'last4'};
    const lower=evaluate(prefix+'abcdead',chain,c),upper=evaluate(prefix+'abcDEAD',chain,c);
    assert.equal(lower.score,upper.score);
    assert.equal(upper.quality.casingBonus,0);
  }
});
