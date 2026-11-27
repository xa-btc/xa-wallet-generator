import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWallet } from '../src/wallet.js';
import { matches, possible, evaluate } from '../src/matching.js';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base58, base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ed25519 } from '@noble/curves/ed25519.js';
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
test('standard mnemonic derives expected first-account addresses', () => {
  assert.equal(generateWallet('sol', phrase).address, 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  assert.equal(generateWallet('eth', phrase).address, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  // BIP84 published first receiving-address vector.
  assert.equal(generateWallet('btc', phrase).address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
});
test('Solana exported secret signs for the displayed public key', () => {
  const wallet = generateWallet('sol'); const key = base58.decode(wallet.privateKey);
  assert.equal(key.length, 64); assert.equal(base58.encode(key.slice(32)), wallet.address);
  const message = new TextEncoder().encode('wallet-forge-test');
  assert.ok(ed25519.verify(ed25519.sign(message,key.slice(0,32)),message,base58.decode(wallet.address)));
});
test('Bitcoin export contains a valid compressed mainnet WIF', () => {
  const key = base58check(sha256).decode(generateWallet('btc').privateKey);
  assert.equal(key.length, 34); assert.equal(key[0], 128); assert.equal(key[33], 1);
  assert.equal(secp256k1.getPublicKey(key.slice(1,33),true).length, 33);
});
test('random phrases are valid, unique in the sample, and recover exact addresses and keys', () => {
  const addresses = new Set();
  for (const chain of ['sol','eth','btc']) for (let i=0;i<3;i++) {
    const wallet = generateWallet(chain); assert.ok(validateMnemonic(wallet.phrase,wordlist));
    const recovered = generateWallet(chain,wallet.phrase);
    assert.equal(recovered.address,wallet.address); assert.equal(recovered.privateKey,wallet.privateKey);
    assert.ok(!addresses.has(wallet.address)); addresses.add(wallet.address);
  }
});
test('case folding, leet alternatives, and alphabet limits', () => {
  assert.ok(matches('H0D1','hodl')); assert.ok(matches('5OL','sol')); assert.ok(matches('1','i')); assert.ok(matches('1','l'));
  assert.ok(matches('SoL','sol',false)); assert.ok(!matches('501','sol',false));
  assert.ok(possible('dead','eth',false)); assert.ok(!possible('moon','eth',true));
  assert.ok(possible('based','eth',true)); assert.ok(!possible('!','sol',true));
});
const config = {scope:'ends',words:['moon','sol','abcdef'],minLength:3,prefix:'',suffix:'',leet:true,minRank:0,onlyMatches:true};
test('zone boundaries, network-prefix exclusion, rank, and required filters', () => {
  assert.equal(evaluate('ABCDxxxmoon','sol',config).rank,'Epic');
  assert.equal(evaluate('ABCDmoonxyzZ','sol',config).keep,false);
  assert.equal(evaluate('ABCDxxxabcdef','sol',{...config,scope:'suffix'}).rank,'Epic');
  assert.equal(evaluate('SoLxxxxxmoon','sol',config).rank,'Epic');
  assert.equal(evaluate('bc1qxyzxyz','btc',{...config,words:['bc1']}).keep,false);
  assert.equal(evaluate('abcxxxmoon','sol',{...config,prefix:'sol'}).keep,false);
  assert.equal(evaluate('abcxxxmoon','sol',{...config,minRank:6}).keep,false);
  assert.equal(evaluate('AbCxxx999999','sol',{...config,scope:'suffix',words:[]}).rank,'Mythic');
});
