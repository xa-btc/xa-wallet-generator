import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTypedWord, collectionTarget } from '../src/hunt-options.js';
import { estimatePattern, trialsForChance, chanceAfterTrials } from '../src/probability.js';
import { evaluate, compileMatcher } from '../src/matching.js';
import { HuntCollector } from '../src/discovery.js';
import { validateConfig } from '../gpu/bridge.js';
import { selectedWords, resultWordFilter } from '../src/word-packs.js';
import { VOCABULARY_ADDITIONS } from '../src/vocabulary-additions.js';

const base={chain:'sol',generationMode:'private-key',scope:'suffix',words:['test'],minLength:2,prefix:'',suffix:'',leet:false,minRank:0,onlyMatches:true,target:1};
test('typed long words fit the chosen end while full-word zones retain them',()=>{
  assert.equal(fitTypedWord('whalepool','suffix'),'lepool');
  assert.equal(fitTypedWord('whalepool','first4'),'whal');
  assert.equal(fitTypedWord('whalepool','first6'),'whalep');
  assert.equal(fitTypedWord('whalepool','last7'),'alepool');
  assert.equal(fitTypedWord('whalepool','any'),'whalepool');
  assert.equal(fitTypedWord('whalepool','suffix',false),'whalepool');
  assert.equal(fitTypedWord('deadbeef','joined'),'deadbeef');
  assert.equal(fitTypedWord('whalepool','ends',true,'first'),'whal');
  assert.equal(fitTypedWord('whalepool','ends',true,'last'),'pool');
  const fragment=fitTypedWord('whalepool','suffix');
  const result=compileMatcher('sol',{...base,words:[fragment],directSearch:true})('abcxyzlepool');
  assert.equal(result.keep,true);assert.deepEqual(result.hits,['lepool']);
  assert.ok(result.highlights.every(h=>h.end-h.start===6));
});
test('7–10 character zones search the intended end on all networks',()=>{
  for(const chain of ['sol','eth','btc'])for(const n of [7,8,9,10]){
    const word='abcdefabcd'.slice(0,n),prefix={sol:'',eth:'0x',btc:'bc1q'}[chain];
    for(const side of ['first','last']){
      const c={...base,chain,scope:side+n,words:[word],minLength:n};
      const address=prefix+(side==='first'?word+'123456xyz':'xyz123456'+word);
      assert.equal(evaluate(address,chain,c).keep,true);
      assert.deepEqual(compileMatcher(chain,c)(address),evaluate(address,chain,c));
    }
  }
  assert.equal(validateConfig({...base,scope:'last10',words:['abcdefghij'],minLength:10}).minLength,10);
});
test('single result takes one new primary match while rare finds stay independent',()=>{
  assert.equal(collectionTarget('single',500,120),1);
  assert.equal(collectionTarget('fill',500,120),380);
  assert.equal(collectionTarget('best',500,120),500);
  const collector=new HuntCollector({target:1,discoveryRank:4,discoveryRemaining:10});
  const rare={chain:'sol',address:'rare',primaryKeep:false,discoveryMatch:{keep:true,level:4,score:90}};
  assert.equal(collector.accept([rare]).rareWallets.length,1);assert.equal(collector.reason,'');
  const primary=i=>({chain:'sol',address:'found'+i,primaryKeep:true,keep:true,level:4,score:90});
  assert.equal(collector.accept([primary(1),primary(2)]).wallets.length,1);assert.equal(collector.reason,'target');
});
test('pattern odds respect characters, aliases, positions and confidence without guaranteeing a hit',()=>{
  const exact=estimatePattern({...base,scope:'last4'});
  assert.ok(Math.abs(exact.probability-(2/58)**4)<1e-15);assert.equal(exact.unionBound,false);
  assert.ok(estimatePattern({...base,scope:'last4',leet:true}).probability>exact.probability);
  assert.ok(estimatePattern({...base,scope:'any'}).probability>exact.probability);
  assert.equal(estimatePattern({...base,chain:'eth',words:['xyz']}).probability,0);
  assert.equal(trialsForChance(.5,.5),1);assert.equal(trialsForChance(0),Infinity);
  assert.ok(trialsForChance(exact.probability,.95)>trialsForChance(exact.probability,.5));
  assert.equal(estimatePattern({...base,scope:'both'}).unavailable.length>0,true);
  assert.ok(Math.abs(estimatePattern({...base,words:[],prefix:'test',suffix:'',scope:'any'}).probability-exact.probability)<1e-15);
});
test('supplemental 7–10 character terms remain searchable and categorized',()=>{
  for(const [id,words] of Object.entries(VOCABULARY_ADDITIONS)){
    assert.ok(words.length>0,id);const selected=new Set(selectedWords({[id]:true})),filter=resultWordFilter(id);
    for(const word of words){assert.match(word,/^[a-z0-9]{7,10}$/);assert.ok(selected.has(word),id+':'+word);assert.ok(filter(word),id+':'+word);}
  }
});


test('probability bar accumulates independent trials stably and starts empty',()=>{
  assert.equal(chanceAfterTrials(.5,0),0);
  assert.equal(chanceAfterTrials(.5,1),.5);
  assert.ok(Math.abs(chanceAfterTrials(.5,2)-.75)<1e-15);
  assert.equal(chanceAfterTrials(0,1000000),0);
  assert.equal(chanceAfterTrials(1,1),1);
  const rare=chanceAfterTrials(1e-15,1e12);
  assert.ok(rare>0&&rare<.001);
  assert.ok(chanceAfterTrials(1e-6,1000000)>chanceAfterTrials(1e-6,1000));
  assert.equal(chanceAfterTrials(NaN,10),0);
  assert.equal(chanceAfterTrials(.5,-1),0);
});
