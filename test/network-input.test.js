import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCharacters, searchCharacterError, typedSearchError } from '../src/network-input.js';

const bad = (text,chain,options) => searchCharacters(text,chain,options).filter(c=>c.invalid).map(c=>c.char).join('');
test('typed network characters follow BTC, ETH and exact Solana alphabet restrictions',()=>{
  assert.equal(bad('abcdefghijklmnopqrstuvwxyz0123456789','btc'),'bio1');
  assert.equal(bad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789','btc'),'BIO1');
  assert.equal(bad('abcdefghijklmnopqrstuvwxyz0123456789','eth'),'ghijklmnopqrstuvwxyz');
  assert.equal(bad('ABCDEFabcdef0123456789','eth'),'');
  assert.equal(bad('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789','sol'),'lIO0');
  assert.equal(bad('ioL1','sol'),'');
});
test('list separators stay neutral; punctuation, unicode and interior anchor spaces are rejected',()=>{
  assert.equal(bad('dead, beef\ncafe\tface','eth',{list:true}),'');
  assert.equal(bad('  dead  ','eth'),'');
  assert.equal(bad('de ad,','eth'),' ,');
  assert.equal(bad('de<ad🙂','eth',{list:true}),'<🙂');
  assert.equal(searchCharacters('a🙂b','btc')[2].index,3);
  assert.match(searchCharacterError('go','eth'),/Ethereum.*"g".*"o"/);
});
test('strict submission checks originals before zone fitting or case folding can hide invalid input',()=>{
  assert.equal(typedSearchError({chain:'eth',prefix:'deadmoon'}).id,'prefix');
  assert.equal(typedSearchError({chain:'sol',directWords:'SOL'}).id,'directWords');
  assert.equal(typedSearchError({chain:'sol',directWords:'soL'}),null);
  assert.equal(typedSearchError({chain:'btc',directWords:'moon',leet:true}).id,'directWords');
  assert.equal(typedSearchError({chain:'btc',directWords:'m00n',leet:true}),null);
  assert.equal(typedSearchError({chain:'eth',directWords:'dead, moon'}).id,'directWords');
});
test('only custom fields actually used by the hunt block submission',()=>{
  assert.equal(typedSearchError({chain:'eth',custom:'moon'}).id,'custom');
  assert.equal(typedSearchError({chain:'eth',directWords:' , ',custom:'moon'}).id,'custom');
  assert.equal(typedSearchError({chain:'eth',directWords:'dead',custom:'moon'}),null);
  assert.equal(typedSearchError({chain:'eth',directWords:'dead',custom:'moon',discoveryRank:4,discoverySource:'library'}).id,'custom');
  assert.equal(typedSearchError({chain:'eth',discoveryCustom:'moon',discoveryRank:0,discoverySource:'custom'}),null);
  assert.equal(typedSearchError({chain:'eth',discoveryCustom:'moon',discoveryRank:4,discoverySource:'builtin'}),null);
  assert.equal(typedSearchError({chain:'eth',discoveryCustom:'moon',discoveryRank:4,discoverySource:'custom'}).id,'discoveryCustom');
});
