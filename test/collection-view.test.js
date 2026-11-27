import { resultWordFilter, RESULT_WORD_CATEGORIES, selectedWords, loadExpandedWords } from '../src/word-packs.js';
import { qualityLevel, QUALITY_THRESHOLDS } from '../src/quality.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionView, resultSearch, matchCount, matchesPosition, toggleMatchFilter, matchFilterSelected } from '../src/collection-view.js';
import { evaluate } from '../src/matching.js';
import { RARITIES } from '../src/rarity.js';

test('position filters use highlighted matches, network boundaries, selected categories and repeat lengths',()=>{
  const make=(chain,address,start,end,reason)=>({chain,address,hits:reason.startsWith('Word: ')?[reason.slice(6)]:[],highlights:[{start,end,reason}],streak:reason.startsWith('Word: ')?0:end-start,level:4,score:90,created:'2026-10-30'});
  const first=make('sol','moonXYZ',0,4,'Word: moon'),last=make('sol','XYZmoon',3,7,'Word: moon'),middle=make('sol','XmoonYZ',1,5,'Word: moon');
  for(const [position,wallet] of [['first',first],['last',last],['middle',middle]])assert.deepEqual(collectionView([first,last,middle],{position}),[wallet]);
  assert.ok(matchesPosition(make('eth','0xdead1234',2,6,'Word: dead'),'first'));
  assert.ok(matchesPosition(make('btc','bc1qmoonxyz',4,8,'Word: moon'),'first'));
  assert.equal(matchesPosition(last,'last',{wordFilter:w=>w==='sol'}),false);
  const repeated=make('sol','XYZ5555',3,7,'4 repeated characters');
  assert.ok(matchesPosition(repeated,'last',{showWords:false,minRepeat:4}));
  assert.equal(matchesPosition(repeated,'last',{minRepeat:5}),false);
  assert.equal(matchesPosition(repeated,'last',{showRepeated:false}),false);
  assert.equal(matchesPosition({...last,highlights:[]},'last'),false);
});

test('most matches counts separate regions instead of nested or overlapping highlights', () => {
  const make = (highlights, level) => ({ highlights, level, hits: ['moon'], streak: 0, score: 20, created: '2026-10-30T01:00:00Z' });
  const nested = make([{ start: 0, end: 6 }, { start: 0, end: 4 }, { start: 3, end: 8 }], 6);
  const multiple = make([{ start: 10, end: 14 }, { start: 0, end: 4 }, { start: 4, end: 8 }], 1);
  assert.equal(matchCount(nested), 1);
  assert.equal(matchCount(multiple), 3);
  assert.equal(matchCount({}), 0);
  assert.deepEqual(collectionView([nested, multiple], { sort: 'matches' }), [multiple, nested]);
  assert.equal(multiple.highlights[0].start, 10);
});

test('rarity uses score thresholds instead of fixed word length', () => {
  for (let level = 0; level < QUALITY_THRESHOLDS.length; level++) {
    assert.equal(qualityLevel(QUALITY_THRESHOLDS[level]), level);
    if (level) assert.equal(qualityLevel(QUALITY_THRESHOLDS[level] - 0.01), level - 1);
  }
});

test('result toggles filter by either kind and sort by tier before score', () => {
  const word = { hits: ['moon'], streak: 0, level: 1, score: 100, created: '2026-10-30T01:00:00Z' };
  const repeated = { hits: [], streak: 6, level: 3, score: 30, created: '2026-10-30T02:00:00Z' };
  const both = { hits: ['sol'], streak: 3, level: 0, score: 50, created: '2026-10-30T03:00:00Z' };
  const fresh = { hits: [], streak: 0, level: 0, score: 0, created: '2026-10-30T04:00:00Z' };
  const wallets = [word, repeated, both, fresh];
  assert.deepEqual(collectionView(wallets), [repeated, word, both]);
  assert.deepEqual(collectionView(wallets, { showRepeated: false }), [word, both]);
  assert.deepEqual(collectionView(wallets, { showWords: false, sort: 'new' }), [both, repeated]);
  assert.deepEqual(collectionView(wallets, { showWords: false, showRepeated: false }), []);
  assert.equal(wallets.length, 4);
});

test('repeat sorting uses run length even within Godlike and filters apply before sorting', () => {
  const make = (streak, hits, level, score) => ({ streak, hits, level, score, created: '2026-10-30T01:00:00Z' });
  const short = make(9, ['abcdefghijk'], 6, 200);
  const long = make(12, [], 6, 60);
  const low = make(4, ['moon'], 1, 60);
  assert.deepEqual(collectionView([short, long, low], { sort: 'repeat' }), [long, short, low]);
  assert.deepEqual(collectionView([long, low, short], { sort: 'word' }), [short, low, long]);
  assert.deepEqual(collectionView([short, long, low], { showWords: false, minRepeat: 10 }), [long]);
  assert.deepEqual(collectionView([short, long, low], { minRank: 6 }), [short, long]);
});

test('nested dictionary words do not inflate rarity or score', () => {
  const config = { scope: 'any', words: ['moon'], minLength: 2, prefix: '', suffix: '', leet: false, minRank: 0, onlyMatches: true };
  const single = evaluate('xmoonx', 'sol', config);
  const nested = evaluate('xmoonx', 'sol', { ...config, words: ['moon', 'moo', 'oo', 'on'] });
  assert.equal(nested.hits.length, 4);
  assert.equal(nested.rank, single.rank);
  assert.equal(nested.score, single.score);
});

test('result search uses symmetric case-insensitive aliases and alternative terms', () => {
  assert.ok(resultSearch('SOL')({ address: 'abc5o1xyz', hits: [] }));
  assert.ok(resultSearch('5o1')({ address: 'abcSoLxyz', hits: [] }));
  assert.ok(resultSearch('hodl')({ address: 'xxH0D1yy', hits: [] }));
  assert.ok(resultSearch('absent, moon')({ address: 'xyz', hits: ['moon'] }));
  assert.ok(resultSearch('absent moon')({ address: 'xxM00Nyy', hits: [] }));
  assert.ok(resultSearch('  ')({ address: 'xyz', hits: [] }));
  assert.equal(resultSearch('moon')({ address: 'xyz', hits: [], privateKey: 'moon', phrase: 'moon' }), false);
  for (const literal of ['.', '*', '[', '(', '\\', '$']) {
    assert.equal(resultSearch(literal)({ address: 'abc', hits: [] }), false);
  }
});

test('search combines with filters and preserves rarity ordering without altering collection', () => {
  const make = (address, streak, level) => ({ address, streak, level, hits: ['sol'], score: 10, created: '2026-10-30T01:00:00Z' });
  const low = make('abc5o1', 3, 0), high = make('5OLxyz', 6, 3), unrelated = make('moon', 9, 6);
  unrelated.hits = ['moon'];
  const wallets = [low, unrelated, high];
  assert.deepEqual(collectionView(wallets, { query: 'sol' }), [high, low]);
  assert.deepEqual(collectionView(wallets, { query: 'sol', minRank: 3 }), [high]);
  assert.deepEqual(collectionView(wallets, { query: 'sol', showWords: false, minRepeat: 6 }), [high]);
  assert.equal(wallets.length, 3);
});


test('result categories combine with rarity and alias search without repeat bypass or data mutation', () => {
  const make = (hits, level=3) => ({hits, level, score:level*20, streak:8, created:'2026-10-30', address:'xx5enatex'});
  const political=make(['senate']), low=make(['senate'],0), crypto=make(['hodl']), repeat=make([]);
  const input=[political,low,crypto,repeat];
  const options={wordFilter:resultWordFilter('politics'),minRank:2,query:'5enate'};
  assert.deepEqual(collectionView(input,options),[political]);
  assert.deepEqual(collectionView(input,{...options,query:'missing'}),[]);
  assert.equal(input.length,4);
  assert.deepEqual(political.hits,['senate']);
  assert.equal(collectionView(input,{wordFilter:resultWordFilter('all')}).length,4);
});

test('each result category uses its own vocabulary including lazily loaded expanded English', async () => {
  const expanded=await loadExpandedWords();
  for (const [category] of RESULT_WORD_CATEGORIES.filter(([id])=>id!=='all')) {
    const words=selectedWords({[category]:true},expanded);
    assert.ok(words.length>0,category);
    assert.ok(resultWordFilter(category,expanded)(words[0].toUpperCase()),category);
  }
  assert.equal(resultWordFilter('expanded',[])('aardvark'),false);
  assert.equal(resultWordFilter('expanded',expanded)('aardvark'),true);
});

test('alphabetical word sorting follows the selected category for multiple-hit wallets', () => {
  const make=hits=>({hits,level:1,score:50,streak:0,created:'2026-10-30'});
  const senate=make(['aaa','senate']), congress=make(['zzz','congress']);
  assert.deepEqual(collectionView([senate,congress],{sort:'az',wordFilter:resultWordFilter('politics')}),[congress,senate]);
  assert.deepEqual(senate.hits,['aaa','senate']);
});


test('casing buttons inspect matched text, substitutions, joined words and selected words',()=>{
  const c={scope:'last4',words:['test'],minLength:3,prefix:'',suffix:'',leet:true,minRank:0,onlyMatches:true};
  for(const [text,style] of [['TEST','caps'],['Test','proper'],['tEsT','scattered'],['TES7','replacement'],['test','lowercase']]) {
    const address='AAAxyz'+text,w={...evaluate(address,'sol',c),address,chain:'sol'};
    for(const filter of ['caps','proper','lowercase','scattered','replacement'])assert.equal(matchesPosition(w,filter),filter===style,text+filter);
    assert.equal(matchesPosition(w,style||'caps',{wordFilter:word=>word==='moon'}),false);
    assert.equal(matchesPosition(w,style||'caps',{showWords:false}),false);
  }
  for(const [address,style] of [['DEADxyzBEEF','caps'],['Deadxyzbeef','proper'],['dEAdxyzbEeF','scattered'],['D3ADxyzBEEF','replacement']]) {
    const w={...evaluate(address,'sol',{...c,scope:'joined',words:['deadbeef']}),address,chain:'sol'};
    for(const filter of ['caps','proper','scattered','replacement'])assert.equal(matchesPosition(w,filter),filter===style);
  }
});


test('position and style toggle independently with an explicit reset',()=>{
  let value=toggleMatchFilter('all','last');
  value=toggleMatchFilter(value,'caps');
  assert.equal(value,'last:caps');
  assert.equal(matchFilterSelected(value,'last'),true);
  assert.equal(matchFilterSelected(value,'caps'),true);
  assert.equal(matchFilterSelected(value,'all'),false);
  assert.equal(toggleMatchFilter(value,'last'),'all:caps');
  assert.equal(toggleMatchFilter(value,'caps'),'last');
  assert.equal(toggleMatchFilter(value,'proper'),'last:proper');
  assert.equal(toggleMatchFilter(value,'middle'),'middle:caps');
  assert.equal(toggleMatchFilter(value,'all'),'all');
});

test('combined filters must qualify on the same matched occurrence',()=>{
  const address='MOONxyzmoon',wallet={chain:'sol',address,hits:['moon'],highlights:[{start:0,end:4,reason:'Word: moon'},{start:7,end:11,reason:'Word: moon'}]};
  assert.equal(matchesPosition(wallet,'first:caps'),true);
  assert.equal(matchesPosition(wallet,'last:caps'),false);
  assert.equal(matchesPosition(wallet,'all:caps'),true);
  assert.equal(matchesPosition(wallet,'last:proper'),false);
});
