import { acceptsStyle } from './search-styles.js';
import { SEARCH_ZONES, searchZones } from './search-zones.js';
import { RARITIES } from './rarity.js';
import { qualityLevel, createScorer } from './quality.js';
import { matches } from './text-match.js';
export { matches } from './text-match.js';
import { CHAINS } from './wallet.js';
import { EXTRA_WORDS } from './word-library.js';
const ORIGINAL_WORDS = `gm gn wagmi ngmi hodl hold moon moooon lunar mars ape apes aped apein degen degens based chad giga gigachad bull bulls bullish bear bears bearish pump pumped dump dip dips buy sell bid ask bag bags bagger whale whales whalepool shark alpha beta sigma omega gem gems rare ultra god godlike godline king queen boss goat legend elite epic win winner rich wealth cash money profit gains green red gold diamond hands paper rocket lambo ferrari yacht rekt rekts rug rugged safe safu fud fomo yolo cope hopium copium ser fren frens anon anons pleb laser maxi maxis mint minted token coin coins chain block blocks hash node miner mining gas gwei sats satoshi sat nakamoto bitcoin btc eth ether ethereum sol solana phantom phantomdao dao defi dexs dex swap pool yield farm stake staker airdrop drop drops nft nfts punk punks pepe doge shib bonk wif floki meme memes memecoin cat dog frog toad woof meow mew popcat mog brett turbo bobo ponke jup jito ray orca drift sonic sui apt avax base arb op optimism polygon matic bnb bsc link uni aave crv curve sushi cake bal wbtc usdc usdt dai tether dollar stable vault ledger trezor cold hot wallet seed nonce proof work pow pos zk rollup l2 bridge blast zora rune runes ordinals ordinal inscribe flip flipper floor sweep swept sweepfloor snip snipe sniper snipebot bot mev bundle jito tip tips arb arbitrage lend borrow loan debt liquid liquidate leverage perp perps spot limit market order book chart candle wick breakout support resist rally cycle supercycle halving halvening genesis genesisblock merge burn burned supply float cap mc mcap tvl ath atl roi pnl apr apy volume vol liquidity lock locked unlock vest team dev devs build builder buidl ship shipped wen soon early send sendit fullsend moonshot moonbag moonboy mooning baghold bagholder breakout breakoutgod exit entry dca dyor nfa lfg lfgg letsgo trust trustless verify verified valid validator consensus protocol network mainnet testnet faucet dust whalealert smart moneyprinter printer print moneybag millionaire billionaire freedom future digital cyber crypt crypto cryptography encryption permissionless decentralized immutable antifragile fungible nonfungible collectible collect art artist pixel pixels meta metaverse game gamer gaming play earn playtoearn web3 webthree internet magic wizard dragon phoenix tiger lion wolf wolves eagle cobra ninja samurai pirate viking angel demon devil lucky luck seven triple royal crown ace aces fire flame blaze lit hype vibes vibing chill chillguy zen zero one two three four five six nine ten leet dead beef cafe face fade feed deed babe bad dad add fee cab bed deaf decade decaf faded abba abcd aaaa bbbb cccc dddd eeee ffff`.split(/\s+/);
export const WORDS = [...new Set([...ORIGINAL_WORDS, ...EXTRA_WORDS])];
const availableCharacters = new Map();
export function possible(word, chain, leet) {
  const key = `${chain}:${!!leet}`;
  if (!availableCharacters.has(key)) availableCharacters.set(key, new Set([...'0123456789abcdefghijklmnopqrstuvwxyz'].filter(c => [...CHAINS[chain].alphabet].some(a => matches(a, c, leet)))));
  const available = availableCharacters.get(key);
  return [...word.toLowerCase()].every(c => available.has(c));
}
export function body(address, chain) { return address.slice(CHAINS[chain].prefix.length); }
// Score the eight visible characters as one word, then map highlights back to
// their two real address ranges. Never score the hidden middle as part of it.
function joinedConfig(config) {
  return {...config, scope:'any', words:config.words.filter(w => w.length === 8), minLength:8,
    prefix:'', suffix:'', minRank:0, directSearch:false, onlyMatches:true};
}
function evaluateJoined(address, chain, config, matcher) {
  const raw = body(address, chain), offset = address.length - raw.length;
  if (raw.length < 8) return {keep:false};
  const virtual = CHAINS[chain].prefix + raw.slice(0,4) + raw.slice(-4);
  const result = matcher ? matcher(virtual) : evaluate(virtual, chain, joinedConfig(config));
  const wordMatch = result.hits.some(w => w.length === 8);
  const anchorsOk = (!config.prefix || matches(raw.slice(0,config.prefix.length),config.prefix,config.leet) && (!config.exactText||raw.slice(0,config.prefix.length)===config.prefix) && acceptsStyle(raw.slice(0,config.prefix.length),config.prefix,config.searchStyles,chain)) &&
    (!config.suffix || matches(raw.slice(-config.suffix.length),config.suffix,config.leet) && (!config.exactText||raw.slice(-config.suffix.length)===config.suffix) && acceptsStyle(raw.slice(-config.suffix.length),config.suffix,config.searchStyles,chain));
  const highlights = result.highlights.flatMap(h => {
    const start = h.start-offset, end = h.end-offset, parts = [];
    if (start < 4) parts.push({...h,start:offset+start,end:offset+Math.min(4,end)});
    if (end > 4) parts.push({...h,start:address.length-4+Math.max(0,start-4),end:address.length-4+end-4});
    return parts;
  });
  return {...result, highlights, display:{head:offset+4,tail:4}, keep:result.keep && wordMatch && anchorsOk &&
    (config.directSearch || !!config.prefix || !!config.suffix || result.level >= config.minRank)};
}

export function evaluate(address, chain, config, findWords, scorer = createScorer(chain, config)) {
  if (config.scope === 'joined') return evaluateJoined(address, chain, config);
  const raw = body(address, chain);
  const offset = address.length - raw.length;
  const zones = searchZones(raw, config.scope);
  const highlights = [];
  const hits = [];
  if (findWords) {
    const found = findWords(zones, offset);
    hits.push(...found.hits); highlights.push(...found.highlights);
  } else for (const word of config.words) {
    if (word.length < config.minLength) continue;
    for (const zone of zones) {
      for (let i = 0; i <= zone.text.length - word.length; i++) {
        if (matches(zone.text.slice(i, i + word.length), word, config.leet)) {
          hits.push(word);
          highlights.push({ start: offset + zone.start + i, end: offset + zone.start + i + word.length, reason: `Word: ${word}` });
        }
      }
    }
  }
  if(config.searchStyles?.length||config.exactText){
    const accepted=highlights.filter(h=>(!config.exactText||address.slice(h.start,h.end)===h.reason.slice(6))&&acceptsStyle(address.slice(h.start,h.end),h.reason.slice(6),config.searchStyles,chain));
    highlights.splice(0,highlights.length,...accepted);
    hits.splice(0,hits.length,...accepted.map(h=>h.reason.slice(6)));
  }
  const directWordMatch = hits.length > 0;
  const directHighlights = [...highlights];
  const prefixOk = !config.prefix || (matches(raw.slice(0, config.prefix.length), config.prefix, config.leet) && (!config.exactText||raw.slice(0,config.prefix.length)===config.prefix) && acceptsStyle(raw.slice(0,config.prefix.length),config.prefix,config.searchStyles,chain));
  const suffixOk = !config.suffix || (matches(raw.slice(-config.suffix.length), config.suffix, config.leet) && (!config.exactText||raw.slice(-config.suffix.length)===config.suffix) && acceptsStyle(raw.slice(-config.suffix.length),config.suffix,config.searchStyles,chain));
  // Explicit end filters are searched and scored even outside the dictionary's
  // selected zone/minimum length, or when all word packs are disabled.
  for (const [word, ok, start] of [[config.prefix, prefixOk, offset], [config.suffix, suffixOk, address.length - config.suffix.length]]) {
    if (!word || !ok) continue;
    hits.push(word);
    const end = start + word.length, reason = `Word: ${word}`;
    if (!highlights.some(h => h.start === start && h.end === end && h.reason === reason)) highlights.push({start, end, reason});
  }
  const unique = [...new Set(hits)];
  const longest = Math.max(0, ...unique.map(w => w.length));
  let rawStreak=0;
  const repeats = zones.flatMap(z => [...z.text.toLowerCase().matchAll(/(.)\1{1,}/g)].map(m => {
    rawStreak=Math.max(rawStreak,m[0].length);
    if(m[0].length<3)return 0;
    if(!acceptsStyle(z.text.slice(m.index,m.index+m[0].length),null,config.searchStyles,chain))return 0;
    highlights.push({ start: offset + z.start + m.index, end: offset + z.start + m.index + m[0].length, reason: `${m[0].length} repeated characters` });
    return m[0].length;
  }));
  const streak = Math.max(0, ...repeats);
  const bothEndsOk = config.scope !== 'both' || zones.every(z =>
    (config.directSearch ? directHighlights : highlights).some(h => h.start < offset + z.start + z.text.length && h.end > offset + z.start));
  const quality = scorer(address, highlights, zones);
  const level = qualityLevel(quality.score);
  const rank = RARITIES[level];
  const score = quality.score;
  const display = { head: offset + Math.max(config.scope === 'any' ? 6 : 4, config.prefix.length), tail: Math.max(config.scope === 'any' ? 6 : SEARCH_ZONES[config.scope].length, config.suffix.length) };
  return { hits: unique, highlights, display, streak, rank, level, score, quality, scoringVersion: 5, keep: (!config.searchStyles?.length || highlights.length>0) && bothEndsOk && prefixOk && suffixOk && (!config.ignoreRepeated || rawStreak < (config.ignoreRepeatedMax === 7 ? 2 : 3) || rawStreak > (config.ignoreRepeatedMax ?? 44)) && streak >= (config.requiredRepeat || 0) && (config.directSearch ? directWordMatch : !config.onlyMatches || unique.length > 0 || streak >= 3) && (config.directSearch || !!config.prefix || !!config.suffix || level >= config.minRank) };
}

// Build character transitions once per hunt instead of comparing every word
// against every address. The original evaluator remains the scoring oracle.
export function compileMatcher(chain, config) {
  if (config.scope === 'joined') {
    const matcher = compileMatcher(chain, joinedConfig(config));
    return address => evaluateJoined(address, chain, config, matcher);
  }
  const scorer = createScorer(chain, config);
  const nodes = [{ children: new Map(), words: [] }];
  config.words.forEach((word, index) => {
    if (word.length < config.minLength) return;
    let node = 0;
    for (const character of word.toLowerCase()) {
      let child = nodes[node].children.get(character);
      if (child === undefined) {
        child = nodes.length; nodes[node].children.set(character, child);
        nodes.push({ children: new Map(), words: [] });
      }
      node = child;
    }
    nodes[node].words.push(index);
  });
  const alphabet = [...'0123456789abcdefghijklmnopqrstuvwxyz'];
  const letters = new Map(alphabet.map(char => [char, alphabet.filter(letter => matches(char, letter, config.leet))]));
  // Cache alias-expanded transitions across addresses in this hunt.
  const transitions = new Map();
  const childrenFor = (node, char) => {
    const key = node * 128 + char.charCodeAt(0);
    let children = transitions.get(key);
    if (children === undefined) {
      children = [];
      for (const letter of letters.get(char) || []) {
        const child = nodes[node].children.get(letter);
        if (child !== undefined) children.push(child);
      }
      transitions.set(key, children);
    }
    return children;
  };
  const findWords = (zones, offset) => {
    const found = [];
    zones.forEach((zone, z) => {
      const text = zone.text.toLowerCase();
      for (let start = 0; start < text.length; start++) {
        let states = [0];
        for (let i = start; i < text.length && states.length; i++) {
          const next = [];
          for (const node of states) for (const child of childrenFor(node, text[i])) {
            next.push(child);
            for (const word of nodes[child].words) found.push({ word, z, start, end: i + 1 });
          }
          states = next;
        }
      }
    });
    found.sort((a, b) => a.word - b.word || a.z - b.z || a.start - b.start);
    return {
      hits: found.map(f => config.words[f.word]),
      highlights: found.map(f => ({ start: offset + zones[f.z].start + f.start, end: offset + zones[f.z].start + f.end, reason: `Word: ${config.words[f.word]}` })),
    };
  };
  return address => {
    const raw = body(address, chain);
    if (config.prefix && !matches(raw.slice(0, config.prefix.length), config.prefix, config.leet)) return { keep: false };
    if (config.suffix && !matches(raw.slice(-config.suffix.length), config.suffix, config.leet)) return { keep: false };
    return evaluate(address, chain, config, findWords, scorer);
  };
}
