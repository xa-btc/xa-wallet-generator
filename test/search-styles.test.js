import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate,compileMatcher } from '../src/matching.js';
import { compileHunt } from '../src/discovery.js';
import { validateConfig } from '../gpu/bridge.js';
const base={chain:'sol',generationMode:'private-key',scope:'last4',words:['test'],minLength:2,minRank:0,leet:true,onlyMatches:true,prefix:'',suffix:'',target:1};
test('search styles filter occurrences before accepting and scoring CPU and GPU candidates',()=>{
  const forms={caps:'TEST',proper:'Test',scattered:'tEsT',replacement:'7est',lowercase:'test'};
  for(const [style,text] of Object.entries(forms)){
    const config=validateConfig({...base,searchStyles:[style]});
    const matcher=compileMatcher('sol',config);
    for(const [other,otherText] of Object.entries(forms)){
      assert.equal(matcher('xyz'+otherText).keep,style===other);
      assert.equal(evaluate('xyz'+otherText,'sol',config).keep,style===other);
    }
    assert.ok(matcher('xyz'+text).keep);
  }
  const either=compileMatcher('sol',{...base,searchStyles:['caps','proper']});
  assert.ok(either('xyzTEST').keep);assert.ok(either('xyzTest').keep);assert.ok(!either('xyztEsT').keep);
  assert.throws(()=>validateConfig({...base,searchStyles:['invalid']}));
});
test('typed anchors, both ends, joined words and repeats respect search style',()=>{
  const caps={...base,searchStyles:['caps']};
  assert.ok(!evaluate('TestxyzTEST','sol',{...caps,prefix:'test'}).keep);
  assert.ok(!evaluate('TESTxyzTest','sol',{...caps,scope:'both'}).keep);
  assert.ok(evaluate('TESTxyzTEST','sol',{...caps,scope:'both'}).keep);
  const joined={...caps,scope:'joined',words:['testtest']};
  assert.ok(compileMatcher('sol',joined)('TESTxyzTEST').keep);
  assert.ok(!compileMatcher('sol',joined)('TESTxyzTest').keep);
  assert.ok(!compileMatcher('sol',{...caps,onlyMatches:false})('xyzabcd').keep);
  assert.ok(evaluate('xyzAAAA','sol',{...caps,words:[],requiredRepeat:4}).keep);
  assert.ok(!evaluate('xyzAaAa','sol',{...caps,words:[],requiredRepeat:4}).keep);
});
test('direct words cannot bypass styles and overflow remains independently matched',()=>{
  const hunt=compileHunt('sol',{...base,searchStyles:['caps'],directSearch:true,discoveryRank:4,discoveryOptions:{source:'custom',words:['treasures'],scope:'any',minLength:3,leet:false}});
  assert.ok(hunt('xyzTEST').primaryKeep);
  assert.ok(!hunt('xyzTest').primaryKeep);
  const rare=hunt('xyztreasuresTest');
  assert.ok(!rare.primaryKeep);assert.ok(rare.discoveryMatch?.keep);
});

test('Solana mandatory letter casing aligns search, result filtering and scoring',async()=>{
  const {matchesPosition}=await import('../src/collection-view.js');
  const {casingQuality}=await import('../src/quality.js');
  const examples=[['bitcoin','BiTCo iN'.replace(' ',''),'caps'],['solana','SoLANA','caps'],['million','MiLLioN','caps'],['silver','SiLver','proper'],['silver','siLver','lowercase'],['silver','sILver','scattered'],['bitcoin','B1TCo1N','replacement']];
  for(const [word,text,style] of examples){
    const config={...base,scope:'any',words:[word],searchStyles:[style]};
    const result=compileMatcher('sol',config)('xyz'+text+'xyz');
    assert.ok(result.keep,`${text}: ${style}`);
    const wallet={chain:'sol',address:'xyz'+text+'xyz',...result};
    assert.ok(matchesPosition(wallet,style,{showRepeated:false}),`${text}: result filter`);
    if(style==='caps')assert.equal(result.quality.casingBonus,18);
    if(style==='proper')assert.equal(result.quality.casingBonus,9);
    if(['caps','proper','lowercase'].includes(style))assert.equal(result.quality.substitutions,0);
  }
  const caps={...base,scope:'any',words:['bitcoin'],searchStyles:['caps']};
  assert.ok(!compileMatcher('sol',caps)('xyzBiTcoiNxyz').keep);
  assert.ok(!compileMatcher('sol',caps)('xyzB1TCo1Nxyz').keep);
  assert.ok(!compileMatcher('sol',{...caps,prefix:'bitcoin'})('BiTcoiNxyzBiTCoiN').keep);
  const joined={...base,scope:'joined',words:['solidity'],searchStyles:['caps']};
  const result=compileMatcher('sol',joined)('SoLiabcDiTY');
  assert.ok(result.keep);
  assert.ok(matchesPosition({chain:'sol',address:'SoLiabcDiTY',...result},'caps'));
  assert.equal(casingQuality('BiTCoiN',0,'eth').casingBonus,0);
  assert.equal(casingQuality('siLver',0,'btc').casingBonus,0);
});

test('lowercase accepts mandatory Solana L at any position without accepting substitutions',async()=>{
  const {matchesPosition,toggleMatchFilter}=await import('../src/collection-view.js');
  for(const [word,text,accepted] of [['love','Love',true],['silver','siLver',true],['hello','heLLo',true],['love','LoVe',false],['love','L0ve',false]]){
    const config={...base,scope:'any',words:[word],searchStyles:['lowercase']};
    assert.equal(compileMatcher('sol',config)('xyz'+text).keep,accepted,text);
    assert.equal(matchesPosition({chain:'sol',address:'xyz'+text,highlights:[{start:3,end:3+text.length,reason:'Word: '+word}]},'last:lowercase'),accepted,text);
  }
  assert.equal(toggleMatchFilter('last','lowercase'),'last:lowercase');
  assert.equal(toggleMatchFilter('last:lowercase','lowercase'),'last');
  assert.equal(matchesPosition({chain:'eth',address:'0xLove',highlights:[{start:2,end:6,reason:'Word: love'}]},'lowercase'),false);
});
