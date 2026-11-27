import { Worker } from 'node:worker_threads';
import { availableParallelism, cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { generateWallet } from '../src/wallet.js';
import { WORDS, evaluate, possible } from '../src/matching.js';

const duration = 3000;
const compareModes = process.argv.includes('--compare-modes');
function config(chain) {
  return { chain, scope: 'ends', words: WORDS.filter(w => w.length >= 3 && w.length <= 4 && possible(w, chain, true)), minLength: 3, prefix: '', suffix: '', leet: true, minRank: 0, onlyMatches: true, target: 500 };
}
function baseline(c) {
  let attempts = 0; const start = performance.now();
  while (performance.now() - start < 1000) {
    const w = generateWallet(c.chain); evaluate(w.address, c.chain, c); attempts++;
  }
  return Math.round(attempts * 1000 / (performance.now() - start));
}
async function parallel(c, count) {
  const workers = Array.from({ length: count }, () => new Worker(new URL('./benchmark-worker.mjs', import.meta.url)));
  const attempts = new Array(count).fill(0); let matchCount = 0;
  let timer;
  try {
    await Promise.all(workers.map(w => new Promise((resolve, reject) => {
      w.once('message', resolve); w.once('error', reject);
    })));
    const completions = workers.map((w, index) => new Promise((resolve, reject) => {
      w.on('error', reject);
      w.on('message', data => {
        if (data.type === 'error') { reject(new Error(data.message)); return; }
        if (data.type !== 'progress') return;
        attempts[index] = data.attempts; matchCount += data.wallets.length;
        if (data.done) resolve();
      });
    }));
    const start = performance.now();
    for (const w of workers) w.postMessage({ type: 'start', config: c });
    timer = setTimeout(() => workers.forEach(w => w.postMessage({ type: 'stop' })), duration);
    await Promise.all(completions);
    const elapsedMs = performance.now() - start;
    return { workers: count, attempts: attempts.reduce((a,b) => a+b, 0), perSecond: Math.round(attempts.reduce((a,b) => a+b, 0) * 1000 / elapsedMs), elapsedMs: Math.round(elapsedMs), matches: matchCount };
  } finally { clearTimeout(timer); await Promise.all(workers.map(w => w.terminate())); }
}
console.log(JSON.stringify({ runtime: process.version, cpu: cpus()[0]?.model, logicalCores: availableParallelism(), nativeCryptoThreads: process.env.UV_THREADPOOL_SIZE || 'Node default (4)', note: 'Node benchmark of browser worker source; browser throughput can differ. Keys never logged or saved.' }));
for (const chain of ['sol', 'eth', 'btc']) {
  const c = config(chain); const oldPerSecond = baseline(c);
  const modes = compareModes && chain !== 'btc' ? ['recovery-phrase','private-key'] : ['recovery-phrase'];
  for (const generationMode of modes) for (const count of !compareModes && chain === 'sol' ? [1, 4, 12] : [12]) {
    const result = await parallel({ ...c, generationMode }, count);
    console.log(JSON.stringify({ chain, generationMode, baselinePerSecond: oldPerSecond, ...result, speedupVsOriginal: +(result.perSecond / oldPerSecond).toFixed(2) }));
  }
}
