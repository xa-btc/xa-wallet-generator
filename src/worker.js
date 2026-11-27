import { searchBatch } from './search.js';
import { compileHunt } from './discovery.js';
let stopped = false, active = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopped = true; return; }
  if (data.type !== 'start' || active) return;
  active = true; stopped = false;
  let attempts = 0, wallets = [], lastReport = performance.now();
  try {
    const matcher = compileHunt(data.config.chain, data.config);
    while (!stopped) {
      const batch = await searchBatch(data.config, matcher);
      attempts += batch.attempts; wallets.push(...batch.wallets);
      if (performance.now() - lastReport >= 200 || wallets.length >= 16) {
        self.postMessage({ type: 'progress', attempts, wallets });
        wallets = []; lastReport = performance.now();
        // Direct-key generation can resolve entirely as microtasks. Yield a
        // task so queued stop messages are handled in this mode too.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    self.postMessage({ type: 'progress', attempts, wallets, done: true });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  } finally { active = false; }
};
