import test from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, saveSettings, chooseEngine } from '../src/settings.js';

test('settings round trip only approved settings and tolerate unavailable storage', () => {
  let data;
  const storage = { getItem: () => data, setItem: (_key, value) => { data = value; } };
  assert.deepEqual(readSettings(storage), {});
  assert.ok(saveSettings(storage, { mode: 'private-key', engine: 'all', showWords: false, target: '999999', wallets: [{ privateKey: 'secret' }], privateKey: 'secret' }));
  assert.deepEqual(readSettings(storage), { mode: 'private-key', engine: 'all', showWords: false, target: '999999' });
  assert.ok(!data.includes('secret'));
  data = '{broken'; assert.deepEqual(readSettings(storage), {});
  assert.deepEqual(readSettings(undefined), {});
  assert.equal(saveSettings(undefined, {}), false);
});

test('all GPUs default respects explicit choices and compatible modes', () => {
  const devices = [{ index: 0 }, { index: 1 }];
  assert.equal(chooseEngine('hybrid',devices,'sol','private-key'),'hybrid');
  assert.equal(chooseEngine('hybrid',devices,'btc','recovery-phrase'),'hybrid');
  assert.equal(chooseEngine('hybrid',devices,'eth','private-key'),'hybrid');
  assert.equal(chooseEngine('hybrid',[],'sol','private-key'),'cpu');
  assert.equal(chooseEngine('all', devices, 'sol', 'private-key'), 'all');
  assert.equal(chooseEngine('all', devices.slice(0, 1), 'sol', 'private-key'), '0');
  assert.equal(chooseEngine('cpu', devices, 'sol', 'private-key'), 'cpu');
  assert.equal(chooseEngine('1', devices, 'sol', 'private-key'), '1');
  assert.equal(chooseEngine('2', devices, 'sol', 'private-key'), 'cpu');
  assert.equal(chooseEngine('all', [], 'sol', 'private-key'), 'cpu');
  assert.equal(chooseEngine('all', devices, 'eth', 'private-key'), 'all');
  assert.equal(chooseEngine('all', devices, 'eth', 'recovery-phrase'), 'cpu');
  assert.equal(chooseEngine('1', devices, 'eth', 'private-key'), '1');
  assert.equal(chooseEngine('cpu', devices, 'eth', 'private-key'), 'cpu');
  assert.equal(chooseEngine('all', devices, 'sol', 'recovery-phrase'), 'all');
  assert.equal(chooseEngine('all', devices, 'btc', 'recovery-phrase'), 'all');
  assert.equal(chooseEngine('1', devices, 'btc', 'recovery-phrase'), '1');
  assert.equal(chooseEngine('all', devices, 'btc', 'private-key'), 'all');
});
