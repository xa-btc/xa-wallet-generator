import { BestKeepers } from './best-keepers.js';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { WORDS, possible, compileMatcher } from './matching.js';
import { SEARCH_ZONES } from './search-zones.js';
import { ENTITY_WORDS } from './entity-words.js';

export const RARE_CAPACITY = 999999;
export function discoveryConfig(chain, rank, options = {}) {
  if (![4, 5, 6].includes(rank)) return null;
  const {source='builtin',minLength=3,scope='any',leet=true,ignoreRepeated=false}=options;
  if(!['builtin','library','search','custom'].includes(source))throw new Error('Invalid overflow word source.');
  if(!Number.isInteger(minLength)||minLength<2||minLength>12)throw new Error('Overflow minimum length must be 2–12.');
  if(!Object.hasOwn(SEARCH_ZONES,scope)||minLength>SEARCH_ZONES[scope].length)throw new Error('Overflow minimum length exceeds its search zone.');
  if(typeof leet!=='boolean'||typeof ignoreRepeated!=='boolean')throw new Error('Invalid overflow matching options.');
  const words=source==='builtin'?[...WORDS,...wordlist,...ENTITY_WORDS]:options.words;
  if(!Array.isArray(words)||words.length>400000||!words.every(w=>typeof w==='string'&&/^[a-z0-9]{1,44}$/.test(w)))throw new Error('Invalid overflow words.');
  return { chain, scope, prefix: '', suffix: '', leet, onlyMatches: true, ignoreRepeated,
    minLength, minRank: rank,
    words:[...new Set(words)].filter(word=>word.length>=minLength&&word.length<=SEARCH_ZONES[scope].length&&(scope!=='joined'||word.length===8)&&possible(word,chain,leet)) };
}

export function compileHunt(chain, config) {
  const primary = compileMatcher(chain, config);
  const rareConfig = discoveryConfig(chain, config.discoveryRank, config.discoveryOptions);
  if (!rareConfig) return primary;
  const rare = compileMatcher(chain, rareConfig);
  return address => {
    const match = primary(address), discovery = rare(address);
    return { ...match, primaryKeep: match.keep, discoveryMatch: discovery.keep ? discovery : null, keep: match.keep || discovery.keep };
  };
}

// Each collection owns its count and duplicate set. A rare-only find must never
// consume the primary target, and a wallet may legitimately belong to both.
export class HuntCollector {
  constructor(config, existing = [], rareExisting = []) {
    this.remaining = config.target;
    this.best = config.keepBest ? new BestKeepers(config.target, config.bestExisting || []) : null;
    this.rareRemaining = config.discoveryRank ? (config.discoveryRemaining ?? RARE_CAPACITY) : 0;
    this.discoveryEnabled = !!config.discoveryRank;
    this.seen = new Set(existing); this.rareSeen = new Set(rareExisting);
  }
  accept(candidates) {
    const wallets = [], rareWallets = [], removed = [];
    for (const candidate of candidates) {
      const { primaryKeep, discoveryMatch, ...wallet } = candidate;
      const id = `${wallet.chain}:${wallet.address}`;
      if (discoveryMatch && this.discoveryEnabled && this.rareRemaining > 0 && !this.rareSeen.has(id)) {
        this.rareSeen.add(id); this.rareRemaining--;
        rareWallets.push({ ...wallet, ...discoveryMatch });
      }
      if (primaryKeep !== false && this.best) {
        const offered = this.best.offer(wallet);
        if (offered.accepted) { wallets.push(wallet); if (offered.removed) removed.push(offered.removed); }
        continue;
      }
      if (primaryKeep !== false && this.remaining > 0 && !this.seen.has(id)) {
        this.seen.add(id); this.remaining--; wallets.push(wallet);
      }
    }
    // A wallet inserted and replaced in this same batch must not reappear at
    // the client after removals are applied.
    return { wallets: this.best ? wallets.filter(w => this.best.ids.has(`${w.chain}:${w.address}`)) : wallets, rareWallets, removed };
  }
  get reason() { return this.discoveryEnabled && this.rareRemaining === 0 ? 'rare-limit' : !this.best && this.remaining === 0 ? 'target' : ''; }
}
