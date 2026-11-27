import { generateCandidate, finalizeCandidate, checksumEth } from './wallet.js';
import { compileHunt } from './discovery.js';

// Shared by the browser worker and the benchmark. Discarded keys never cross
// the worker boundary. Four native derivations overlap with JS address work.
export async function searchBatch(config, matcher = compileHunt(config.chain, config), size = 4) {
  const results = await Promise.allSettled(Array.from({ length: size }, () => generateCandidate(config.chain, config.generationMode)));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) {
    for (const result of results) if (result.status === 'fulfilled') result.value.key.fill(0);
    throw failed.reason;
  }
  const candidates = results.map(result => result.value);
  const wallets = [];
  try {
    for (const candidate of candidates) {
      const match = matcher(candidate.chain === 'eth' ? checksumEth(candidate.address.slice(2)) : candidate.address);
      if (match.keep) wallets.push({ ...finalizeCandidate(candidate), ...match });
    }
  } finally { for (const candidate of candidates) candidate.key.fill(0); }
  return { attempts: candidates.length, wallets };
}
