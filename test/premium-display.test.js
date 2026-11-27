import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/matching.js';
import { highlightedAddress,matchTags } from '../src/address-view.js';

test('Godlike requires a difficult pristine anchor rather than incidental bonuses',()=>{
  const config={scope:'any',words:['adventures','decentralized','moon','sol'],minLength:3,prefix:'',suffix:'',leet:false,minRank:0,onlyMatches:true};
  const score=text=>evaluate('xx'+text+'xx','sol',config);
  assert.equal(score('ADVENTURES').rank,'Godlike');
  assert.equal(score('Adventures').rank,'Godlike');
  assert.ok(score('ADVENTURES').score>score('Adventures').score);
  assert.notEqual(score('aDvEnTuReSmoonsol').rank,'Godlike');
  assert.notEqual(evaluate('xxd3centralizedmoonsolxx','sol',{...config,leet:true}).rank,'Godlike');
  assert.equal(score('9999999999').rank,'Godlike');
  assert.notEqual(score('999999').rank,'Godlike');
  assert.notEqual(score('AaAaAaAaAa').rank,'Godlike');
});

test('compact addresses reveal complete middle and boundary-crossing matches',()=>{
  const address='abcdeTREASURESxyzMOONqrstuvwxyz';
  const wallet={address,display:{head:6,tail:6},highlights:[{start:5,end:14,reason:'Word: treasures'},{start:17,end:21,reason:'Word: moon'}]};
  const html=highlightedAddress(wallet);
  assert.ok(html.includes('>TREASURES</mark>'));assert.ok(html.includes('>MOON</mark>'));
  assert.ok(html.includes('…'));assert.ok(!html.includes('xyzMOONqrstuvwxyz'));
  assert.equal(highlightedAddress(wallet,false).replace(/<[^>]+>/g,''),address);
  const tags=matchTags({hits:['moon','moon','<unsafe>'],streak:10});
  assert.equal(tags.match(/>moon</g).length,1);assert.ok(tags.includes('&lt;unsafe&gt;'));assert.ok(tags.includes('10 repeats'));
});
