import { VOCABULARY_ADDITIONS } from './vocabulary-additions.js';
import shortEnglish from './data/short-english.json' with { type: 'json' };
import shortSlang from './data/short-slang.json' with { type: 'json' };
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { WORDS } from './matching.js';
import { WORD_GROUPS } from './word-library.js';
import { ENTITY_WORD_PACKS } from './entity-words.js';
import { THEME_CATEGORIES } from './theme-words.js';

const group = name => [...new Set(WORD_GROUPS[name].trim().split(/\s+/))];
export const POLITICAL_WORDS = group('politics');
export const JEWISH_WORDS = group('jewish');
const other = new Set([...POLITICAL_WORDS, ...JEWISH_WORDS]);
export const CRYPTO_WORDS = [...new Set([...WORDS.filter(word => !other.has(word)),...VOCABULARY_ADDITIONS.crypto])];
// A curated familiar-English vocabulary, not a frequency ranking. Reusing this
// public word list has no connection to the random phrases of generated wallets.
export const COMMON_WORDS = [...new Set([...wordlist.filter(word => word.length >= 3),...VOCABULARY_ADDITIONS.common])];
export const SHORT_ENGLISH_WORDS = [...new Set([...shortEnglish,...VOCABULARY_ADDITIONS.shortEnglish])];
export const SHORT_SLANG_WORDS = [...new Set([...shortSlang,...VOCABULARY_ADDITIONS.shortSlang])];
export const RESULT_WORD_CATEGORIES = [
  ['all', 'All word categories'], ['common', 'Common English'], ['crypto', 'Crypto & vanity'],
  ['politics', 'Political'], ['jewish', 'Jewish / Hebrew'], ['shortEnglish', 'Broad English (4–10)'],
  ['shortSlang', 'Slang, abbreviations & typos'],
  ['expanded', 'Expanded English'],
  ['countries', 'Countries'], ['cities', 'Major cities'], ['companies', 'Companies'], ['people', 'Public figures'],
  ['pokemon', 'Pokémon'],
  ...THEME_CATEGORIES,
];
const categorySets = new WeakMap();
export function resultWordFilter(category = 'all', expandedWords = []) {
  const words = { common: COMMON_WORDS, crypto: CRYPTO_WORDS, politics: POLITICAL_WORDS,
    jewish: JEWISH_WORDS, shortEnglish: SHORT_ENGLISH_WORDS, shortSlang: SHORT_SLANG_WORDS,
    expanded: expandedWords, ...ENTITY_WORD_PACKS }[category];
  if (!words) return null;
  if (!categorySets.has(words)) categorySets.set(words, new Set(words));
  const members = categorySets.get(words);
  return word => members.has(word.toLowerCase());
}
let expanded;
export async function loadExpandedWords() {
  if (!expanded) expanded = import('./expanded-words.js').then(module => module.default).catch(error => {
    expanded = undefined;
    throw error;
  });
  return expanded;
}
export function selectedWords(selection, expandedWords = []) {
  return [...new Set([
    ...(selection.common ? COMMON_WORDS : []), ...(selection.crypto ? CRYPTO_WORDS : []),
    ...(selection.politics ? POLITICAL_WORDS : []), ...(selection.jewish ? JEWISH_WORDS : []),
    ...(selection.expanded ? expandedWords : []),
    ...(selection.shortEnglish ? SHORT_ENGLISH_WORDS : []),
    ...(selection.shortSlang ? SHORT_SLANG_WORDS : []),
    ...Object.entries(ENTITY_WORD_PACKS).flatMap(([id,words])=>selection[id]?words:[]),
  ])];
}
