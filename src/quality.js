import { searchStyle } from './search-styles.js';
import { CHAINS } from './wallet.js';
import { matches } from './text-match.js';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { EXTRA_WORDS } from './word-library.js';

const common = new Set(wordlist), themed = new Set(EXTRA_WORDS);
export const QUALITY_THRESHOLDS = [0, 45, 60, 75, 90, 105, 150];
export function qualityLevel(score) {
  return QUALITY_THRESHOLDS.findLastIndex(threshold => score >= threshold);
}
export const desirability = word => common.has(word.toLowerCase()) ? 8 : themed.has(word.toLowerCase()) ? 4 : 0;

export const MAX_CASING_BONUS = 18;
// Reward actual alphabetic spelling, never digit look-alikes or checksum casing.
export function casingQuality(text, substitutions, chain) {
  if (substitutions) return { casing:'substituted', casingBonus:0 };
  if (chain !== 'sol' || !/^[A-Za-z]+$/.test(text)) return { casing:'standard', casingBonus:0 };
  const style=searchStyle(text,null,chain);
  if(style==='caps')return {casing:'caps',casingBonus:MAX_CASING_BONUS};
  if(style==='proper')return {casing:'proper',casingBonus:9};
  return {casing:style==='lowercase'?'lowercase':'mixed',casingBonus:0};
}

const alphabetWeights = new Map();
export function wordBits(word, chain, leet) {
  const key = `${chain}:${!!leet}`;
  if (!alphabetWeights.has(key)) {
    const alphabet = [...CHAINS[chain].alphabet];
    alphabetWeights.set(key, new Map([...'0123456789abcdefghijklmnopqrstuvwxyz'].map(c => [c, Math.log2(alphabet.length / alphabet.filter(a => matches(a, c, leet)).length)])));
  }
  const weights = alphabetWeights.get(key);
  return [...word.toLowerCase()].reduce((bits, c) => bits + (weights.get(c) ?? Infinity), 0);
}

export function createScorer(chain, config) {
  const alphabet = [...CHAINS[chain].alphabet], weights = new Map();
  const bitsFor = word => {
    if (!weights.has(word)) weights.set(word, wordBits(word, chain, config.leet));
    return weights.get(word);
  };
  return (address, highlights, zones) => {
    const opportunities = length => Math.max(1, zones.reduce((sum, z) => sum + Math.max(0, z.text.length - length + 1), 0));
    const patterns = highlights.flatMap(h => {
      const text = address.slice(h.start, h.end);
      if (h.reason.startsWith('Word: ')) {
        const word = h.reason.slice(6), substitutions = [...word].filter((c, i) => c.toLowerCase() !== text[i]?.toLowerCase()).length;
        const bits = Math.max(0, bitsFor(word) - Math.log2(opportunities(word.length)));
        const casing = casingQuality(text, substitutions, chain);
        const readability = (substitutions === 0 ? 6 : -3 * substitutions) + casing.casingBonus;
        const premium = substitutions===0 && bits>=38 && /^[a-z]+$/i.test(text) && (casing.casing==='caps'?word.length>=8:casing.casing==='proper'?word.length>=9:casing.casing==='lowercase'||chain!=='sol'?word.length>=10:false);
        return [{ ...h, premium, ...casing, bits, substitutions, readability, desirability: desirability(word), score: bits * 3 + readability + desirability(word) }];
      }
      if (h.reason.endsWith('repeated characters')) {
        const variants = alphabet.filter(c => c.toLowerCase() === text[0].toLowerCase()).length;
        const bits = Math.max(0, text.length * Math.log2(alphabet.length / variants) - Math.log2(opportunities(text.length)));
        const casing = casingQuality(text, 0, chain);
        const readability = ([...text].every(c => c === text[0]) ? 8 : 0) + casing.casingBonus;
        const premium = text.length>=10 && bits>=40 && [...text].every(c=>c===text[0]);
        return [{ ...h, premium, ...casing, bits, substitutions: 0, readability, desirability: 16, score: bits * 3 + 16 + readability }];
      }
      return [];
    });
    let best = null;
    for (const anchor of patterns) {
      // Select nonoverlapping regions outside the strongest candidate. Nested
      // words and a word/repeat over the same characters cannot inflate score.
      const outside = patterns.filter(p => p.end <= anchor.start || p.start >= anchor.end).sort((a, b) => a.end - b.end || a.start - b.start);
      let end = -1, independent = 1;
      for (const p of outside) if (p.start >= end) { independent++; end = p.end; }
      const bonus = Math.min(3, independent - 1) * 8;
      const premium=anchor.premium && anchor.score>=QUALITY_THRESHOLDS[6];
      const rawScore=anchor.score+bonus;
      // Preserve ordering without allowing incidental matches to buy the top tier.
      const adjusted=!premium&&rawScore>105 ? 105+44*(1-Math.exp(-(rawScore-105)/44)) : rawScore;
      const score = Math.max(0, Math.round(adjusted * 100) / 100);
      if (!best || score > best.score) best = { score, premium, difficultyBits: Math.round(anchor.bits * 100) / 100, readability: anchor.readability, casing: anchor.casing, casingBonus: anchor.casingBonus, desirability: anchor.desirability, substitutions: anchor.substitutions, independentPatterns: independent, patternBonus: bonus };
    }
    return best || { score: 0, difficultyBits: 0, readability: 0, casing:'none', casingBonus:0, desirability: 0, substitutions: 0, independentPatterns: 0, patternBonus: 0 };
  };
}

// Conservative GPU bounds omit placement penalties and assume perfect spelling
// plus the maximum independent-pattern bonus. Final scoring always runs on CPU.
export function gpuWordScores(chain, config) {
  return Object.fromEntries(config.words.map(word => {
    const bits = wordBits(word, chain, config.leet);
    return [word.toLowerCase(), Number.isFinite(bits) ? Math.ceil(bits * 3 + desirability(word) + 6 + MAX_CASING_BONUS + 24) : 0];
  }));
}
