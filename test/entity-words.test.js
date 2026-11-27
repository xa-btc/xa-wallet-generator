import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENTITY_WORD_PACKS, ENTITY_WORDS } from '../src/entity-words.js';
import { selectedWords, loadExpandedWords, RESULT_WORD_CATEGORIES, resultWordFilter } from '../src/word-packs.js';
import { compileMatcher } from '../src/matching.js';
import { discoveryConfig } from '../src/discovery.js';

test('every source country/territory has an address-safe searchable name',()=>{
  const source=JSON.parse(readFileSync(new URL('../src/data/country-names-source.json',import.meta.url),'utf8'));
  const normalize=s=>s.normalize('NFKD').replace(/[^\x00-\x7F]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  assert.ok(Object.keys(source.countries).length>=249);
  for(const [code,names] of Object.entries(source.countries))assert.ok([names].flat().some(n=>ENTITY_WORD_PACKS.countries.includes(normalize(n))),code);
  for(const words of Object.values(ENTITY_WORD_PACKS)){
    assert.equal(words.length,new Set(words).size);assert.ok(words.every(w=>/^[a-z0-9]{2,44}$/.test(w)));
  }
});

test('entity packs match aliases, retain long names, and participate in rare discovery',async()=>{
  const examples={countries:'america',cities:'newyorkcity',companies:'nvidia',people:'elonmusk',pokemon:'pikachu'};
  for(const [id,word] of Object.entries(examples)){
    const words=selectedWords({[id]:true});assert.ok(words.includes(word));assert.ok(resultWordFilter(id)(word.toUpperCase()));
    const matcher=compileMatcher('sol',{scope:'any',words,minLength:3,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0});
    assert.ok(matcher('xyz'+word.replaceAll('i','1')+'xyz').hits.includes(word));
    assert.ok(discoveryConfig('sol',4).words.includes(word));
  }
  assert.ok(selectedWords({politics:true}).includes('groyper'));
  assert.ok(selectedWords({common:true}).includes('first'));
  const words=selectedWords(Object.fromEntries(RESULT_WORD_CATEGORIES.map(([id])=>[id,true])),await loadExpandedWords());
  assert.ok(words.length<400000);assert.equal(words.length,new Set(words).size);
  assert.ok(ENTITY_WORDS.length>9000);
});

test('Pokemon pack covers every sourced species and form with normalized matching names',()=>{
  const words=selectedWords({pokemon:true});
  for(const name of ['species','forms']){
    const source=JSON.parse(readFileSync(new URL(`../src/data/pokemon-${name}-source.json`,import.meta.url),'utf8').replace(/^\uFEFF/,''));
    assert.equal(source.results.length,source.count);
    for(const entry of source.results)assert.ok(words.includes(entry.name.replace(/[^a-z0-9]/g,'')),entry.name);
  }
  assert.ok(words.includes('pecharunt'));assert.ok(words.includes('mrmime'));assert.ok(words.includes('nidoranfemale'));
  assert.ok(words.includes('charizardmegax'));
  const matcher=compileMatcher('sol',{scope:'suffix',words,minLength:3,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0});
  assert.ok(matcher('x'.repeat(38)+'33v33').hits.includes('eevee'));
  assert.ok(RESULT_WORD_CATEGORIES.some(([id])=>id==='pokemon'));
});
