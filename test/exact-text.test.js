import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMatcher,evaluate} from '../src/matching.js';
import {compileHunt} from '../src/discovery.js';
import {validateConfig} from '../gpu/bridge.js';
const base={chain:'sol',generationMode:'private-key',scope:'any',words:['SoL','TeST'],minLength:2,minRank:0,leet:false,onlyMatches:true,directSearch:true,prefix:'',suffix:'',target:1,exactText:true};
test('exact words preserve case and reject aliases in compiled and reference matching',()=>{
  const c=validateConfig(base),matcher=compileMatcher('sol',c);
  for(const text of ['SoL','TeST']){assert.ok(matcher('xx'+text+'xx').keep);assert.ok(evaluate('xx'+text+'xx','sol',c).keep);}
  for(const text of ['SOL','sol','test','TEST','7357']){assert.ok(!matcher('xx'+text+'xx').keep);assert.ok(!evaluate('xx'+text+'xx','sol',c).keep);}
  assert.throws(()=>validateConfig({...base,words:['SOL']}),/unavailable/);
  assert.equal(validateConfig({...base,leet:true}).leet,false);
});
test('exact typed ends, split words, short zones and independent overflow',()=>{
  const anchored=compileMatcher('sol',{...base,prefix:'SoL',suffix:'TeST'});
  assert.ok(anchored('SoLxyzTeST').keep);assert.ok(!anchored('soLxyzTeST').keep);assert.ok(!anchored('SoLxyztest').keep);
  const joined=compileMatcher('sol',{...base,scope:'joined',words:['SoLiDiTY']});
  assert.ok(joined('SoLixyzDiTY').keep);assert.ok(!joined('SoLixyzdity').keep);
  assert.ok(!compileMatcher('sol',{...base,scope:'last4',words:['whalepool']})('xyzpool').keep);
  const hunt=compileHunt('sol',{...base,discoveryRank:4,discoveryOptions:{source:'custom',words:['treasures'],scope:'any',minLength:3,leet:false}});
  const rare=hunt('xyztreasuresxyz');assert.ok(!rare.primaryKeep);assert.ok(rare.discoveryMatch?.keep);
});
