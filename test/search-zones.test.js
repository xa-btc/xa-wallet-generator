import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compileMatcher } from '../src/matching.js';
const config = { words:['moon','based','silver'], minLength:3, prefix:'', suffix:'', leet:false, minRank:0, onlyMatches:true };

test('first, last, and combined zones only search their intended ends', () => {
  for (const scope of ['first4','last4','ends']) {
    const match=compileMatcher('sol',{...config,scope});
    assert.equal(match('moonxzqyvbnc').keep,scope!=='last4');
    assert.equal(match('vbncxzqymoon').keep,scope!=='first4');
    assert.equal(match('vbncmoonxzqy').keep,false);
  }
});

test('last five includes its fifth character without leaking into the sixth', () => {
  const address='vbncbased';
  const last5=evaluate(address,'sol',{...config,scope:'last5'});
  assert.deepEqual(last5.hits,['based']);
  assert.deepEqual(last5.highlights[0],{start:4,end:9,reason:'Word: based'});
  assert.equal(evaluate(address,'sol',{...config,scope:'last4'}).keep,false);
  assert.equal(evaluate('vbncsilver','sol',{...config,scope:'last5'}).keep,false);
  assert.equal(evaluate('vbncsilver','sol',{...config,scope:'suffix'}).keep,true);
  assert.equal(last5.display.tail,5);
});

test('network prefix exclusion and repeat counts respect narrower zones', () => {
  const c={...config,words:[],requiredRepeat:5};
  assert.equal(evaluate('0xaaaaab12','eth',{...c,scope:'first4'}).keep,false);
  assert.equal(evaluate('0xb12aaaaa','eth',{...c,scope:'last5'}).streak,5);
  assert.equal(evaluate('0xb12aaaaa','eth',{...c,scope:'last4'}).streak,4);
  const first=evaluate('0xdead1234','eth',{...config,words:['dead'],scope:'first4'});
  assert.equal(first.highlights[0].start,2);
});

test('explicit end terms count as scored words without dictionary entries or zone/minimum-length restrictions', () => {
  for (const [chain,address,prefix,suffix] of [['sol','5o1abcdefghmoon','sol','moon'],['eth','0xcafe12345678beef','cafe','beef'],['btc','bc1qabcde12345moon','abcde','moon']]) {
    const c={...config,words:[],minLength:6,scope:'first4',leet:true,prefix,suffix};
    const actual=compileMatcher(chain,c)(address), reference=evaluate(address,chain,c);
    assert.ok(actual.keep,chain);assert.ok(actual.score>0);assert.deepEqual(actual,reference);
    assert.deepEqual(actual.hits,[prefix,suffix]);
    assert.ok(actual.highlights.some(h=>h.end===address.length && h.reason===`Word: ${suffix}`));
    assert.equal(compileMatcher(chain,{...c,requiredRepeat:10})(address).keep,false);
    assert.equal(compileMatcher(chain,{...c,minRank:6})(address).keep,true);
    assert.equal(compileMatcher(chain,{...c,minRank:6})(address).score,actual.score);
    assert.equal(compileMatcher(chain,{...c,suffix:'wrong'})(address).keep,false);
  }
});

test('explicit words and dictionary matches do not duplicate highlights or inflate score', () => {
  const c={...config,scope:'last4',prefix:'',suffix:'moon'};
  const withDictionary=compileMatcher('sol',c)('abcdefmoon');
  const onlyAnchor=compileMatcher('sol',{...c,words:[]})('abcdefmoon');
  assert.deepEqual(withDictionary.hits,['moon']);
  assert.equal(withDictionary.highlights.length,1);
  assert.equal(withDictionary.score,onlyAnchor.score);
});

test('short typed ends bypass rarity alone without upgrading scores or weakening other filters',()=>{
  const address='5o1xyzabcgm';
  for(const [prefix,suffix] of [['sol',''],['','gm'],['sol','gm']]){
    const c={...config,words:[],minLength:6,minRank:6,scope:'suffix',leet:true,prefix,suffix};
    const match=compileMatcher('sol',c)(address);
    assert.equal(match.keep,true);assert.ok(match.level<6);
    assert.equal(compileMatcher('sol',{...c,requiredRepeat:3})(address).keep,false);
  }
  assert.equal(compileMatcher('sol',{...config,words:['gm'],minLength:2,minRank:6,scope:'suffix',prefix:'',suffix:''})(address).keep,false);
});

test('ignore repeated rejects mixed-case triples within the chosen search zone, including word hits', () => {
  const c={...config,words:['sol'],scope:'suffix',ignoreRepeated:true};
  assert.equal(compileMatcher('sol',c)('xyzAAasol').keep,false);
  assert.equal(compileMatcher('sol',c)('xyzAasol').keep,true);
  assert.equal(compileMatcher('sol',c)('AAaxyzsol').keep,true);
  assert.equal(compileMatcher('sol',{...c,scope:'any'})('AAaxyzsol').keep,false);
  assert.equal(compileMatcher('sol',{...c,ignoreRepeated:false})('xyzAAasol').keep,true);
  assert.equal(compileMatcher('sol',{...c,words:[],onlyMatches:false,scope:'any'})('xyzaaaz').keep,false);
});

test('main search ignore repeats permits eight or more while overflow can still exclude all repeats',()=>{
  for(const chain of ['sol','btc','eth']){
    const prefix=chain==='btc'?'bc1q':chain==='eth'?'0x':'';
    const c={...config,chain,scope:'any',words:[],onlyMatches:false,minRank:0,ignoreRepeated:true,ignoreRepeatedMax:7};
    for(const length of [2,3,7,8,9,10]){
      const address=prefix+'xyz'+'a'.repeat(length)+'z';
      assert.equal(compileMatcher(chain,c)(address).keep,length<2||length>7,`${chain}: ${length}`);
      if(length>=8)assert.equal(compileMatcher(chain,{...c,ignoreRepeatedMax:undefined})(address).keep,false);
    }
    assert.equal(compileMatcher(chain,c)(prefix+'aaaXYZbbbbbbbb').keep,true);
  }
});


test('both ends requires independent matches and direct words on each side', () => {
  for (const chain of ['sol','eth','btc']) {
    const prefix = {sol:'',eth:'0x',btc:'bc1q'}[chain];
    const c = {...config,scope:'both',words:['dead','beef'],leet:true};
    for (const [body,keep] of [['dead12345678beef',true],['dead12345678bcdf',false],['bcdf12345678beef',false],['bcdfdeadbeefbcdf',false],['dead12345678aaaB',true]]) {
      assert.equal(evaluate(prefix+body,chain,c).keep,keep);
      assert.deepEqual(compileMatcher(chain,c)(prefix+body),evaluate(prefix+body,chain,c));
    }
    assert.equal(evaluate(prefix+'dead12345678aaaB',chain,{...c,directSearch:true}).keep,false);
    assert.equal(evaluate(prefix+'dead12345678beef',chain,{...c,directSearch:true}).keep,true);
    assert.equal(evaluate(prefix+'dead12345678bcdf',chain,{...c,onlyMatches:false}).keep,false);
    assert.equal(evaluate(prefix+'dead12345678beef',chain,{...c,words:[],prefix:'dead',suffix:'beef',minRank:6}).keep,true);
    assert.equal(evaluate(prefix+'dead12345678bcdf',chain,{...c,words:[],prefix:'dead',minRank:6}).keep,false);
  }
});


test('joined ends match and score one eight-character word with split highlights', () => {
  for (const chain of ['sol','eth','btc']) {
    const prefix = {sol:'',eth:'0x',btc:'bc1q'}[chain], offset=prefix.length;
    const c={...config,scope:'joined',words:['dead','beef','deadbeef'],leet:true};
    const address=prefix+'dead12345678beef';
    const result=compileMatcher(chain,c)(address);
    assert.equal(result.keep,true);
    assert.deepEqual(result,evaluate(address,chain,c));
    assert.deepEqual(result.hits,['deadbeef']);
    assert.deepEqual(result.highlights,[{start:offset,end:offset+4,reason:'Word: deadbeef'},{start:address.length-4,end:address.length,reason:'Word: deadbeef'}]);
    const virtual=evaluate(prefix+'deadbeef',chain,{...c,scope:'any',words:['deadbeef']});
    assert.deepEqual(result.quality,virtual.quality);
    assert.equal(result.quality.independentPatterns,1);
    for(const body of ['dead12345678bcdf','bcdfdeadbeefbcdf'])assert.equal(compileMatcher(chain,c)(prefix+body).keep,false);
    assert.equal(compileMatcher(chain,{...c,words:['dead','beef'],onlyMatches:false})(address).keep,false);
    assert.equal(compileMatcher(chain,{...c,suffix:'bcdf'})(address).keep,false);
    assert.equal(compileMatcher(chain,c)(prefix+'d3ad12345678beef').keep,true);
    assert.equal(compileMatcher(chain,{...c,leet:false})(prefix+'d3ad12345678beef').keep,false);
    const repeat={...c,words:['aaaaaaaa']};
    assert.equal(compileMatcher(chain,repeat)(prefix+'aaaa12345678aaaa').streak,8);
    assert.equal(compileMatcher(chain,{...repeat,ignoreRepeated:true})(prefix+'aaaa12345678aaaa').keep,false);
  }
});
