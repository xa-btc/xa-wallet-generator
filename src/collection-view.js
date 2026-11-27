import { searchStyle, isLowercaseMatch } from './search-styles.js';
import { matches } from './matching.js';

export const MATCH_POSITIONS = [['all','All positions'],['first','Starts with'],['last','Ends with'],['middle','Middle'],['caps','CAPS'],['proper','Proper'],['lowercase','lower'],['scattered','sCaTter'],['replacement','r2Pl4c3']];
const POSITION_IDS = ['all','first','last','middle'];
const STYLE_IDS = ['all','caps','proper','lowercase','scattered','replacement'];
export function parseMatchFilter(value='all') {
  if(STYLE_IDS.includes(value) && value!=='all')return {position:'all',style:value};
  const [position,style='all',extra]=value.split(':');
  return POSITION_IDS.includes(position)&&STYLE_IDS.includes(style)&&extra===undefined ? {position,style} : null;
}
export function toggleMatchFilter(value, button) {
  const current=parseMatchFilter(value)||{position:'all',style:'all'};
  if(button==='all')return 'all';
  if(POSITION_IDS.includes(button))current.position=current.position===button?'all':button;
  else if(STYLE_IDS.includes(button))current.style=current.style===button?'all':button;
  return current.style==='all'?current.position:`${current.position}:${current.style}`;
}
export function matchFilterSelected(value, button) {
  const current=parseMatchFilter(value)||{position:'all',style:'all'};
  return button==='all'?current.position==='all'&&current.style==='all':current.position===button||current.style===button;
}
export function sortMatchingWords(counts, order = 'az') {
  return [...counts].sort(([a,ac,al=0,as=0,ar=0],[b,bc,bl=0,bs=0,br=0]) => (order==='length' ? b.length-a.length || bl-al || bs-as || bc-ac : order==='repeat' ? br-ar || bl-al || bs-as || bc-ac : order==='rarity' ? bl-al || bs-as || bc-ac : order==='count' ? bc-ac : 0) || (a<b?-1:a>b?1:0));
}
export function matchingWordCounts(wallets, {wordFilter=null,position='all',showWords=true} = {}) {
  const counts=new Map();
  for(const wallet of wallets)for(const word of new Set((wallet.hits||[]).map(w=>w.toLowerCase()))){
    if(!showWords||(wordFilter&&!wordFilter(word))||!matchesPosition(wallet,position,{showRepeated:false,wordFilter:w=>w.toLowerCase()===word}))continue;
    const entry=counts.get(word)||[word,0,0,0,0];
    entry[1]++;entry[2]=Math.max(entry[2],wallet.level||0);entry[3]=Math.max(entry[3],wallet.score||0);entry[4]=Math.max(entry[4],wallet.streak||0);counts.set(word,entry);
  }
  return sortMatchingWords([...counts.values()]);
}
// Inspect the matched characters, including legacy saved entries without casing metadata.
export function matchStyle(wallet, highlight, word, start, end, requestedStyle=null) {
  let text=wallet.address.slice(highlight.start,highlight.end);
  if(word && text.length<word.length) {
    // Joined-end words have two highlights carrying the same complete word.
    const pair=(wallet.highlights||[]).filter(h=>h.reason===highlight.reason &&
      (h.start===start || h.end===end)).sort((a,b)=>a.start-b.start);
    if(pair.length!==2 || pair[0].end>pair[1].start || pair.reduce((n,h)=>n+h.end-h.start,0)!==word.length)return null;
    text=pair.map(h=>wallet.address.slice(h.start,h.end)).join('');
  }
  if(word && text.toLowerCase()!==word.toLowerCase())return matches(text,word,true)?'replacement':null;
  if(requestedStyle==='lowercase'&&isLowercaseMatch(text,word,wallet.chain))return 'lowercase';
  return searchStyle(text,null,wallet.chain);
}
export function matchesPosition(wallet, position = 'all', {showWords=true,showRepeated=true,minRepeat=3,wordFilter=null} = {}) {
  const selection=parseMatchFilter(position);
  if(!selection)return false;
  const style=selection.style;position=selection.position;
  if(position==='all'&&style==='all')return true;
  const start=wallet.chain==='eth'?2:wallet.chain==='btc'?4:0;
  const end=(wallet.address || '').length;
  return (wallet.highlights || []).some(h=>{
    if(!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<start||h.end>end||h.end<=h.start)return false;
    const word=h.reason?.startsWith('Word: ') ? h.reason.slice(6) : null;
    const eligible=word ? showWords&&(!wordFilter||wordFilter(word)) : showRepeated&&!wordFilter&&h.reason?.endsWith('repeated characters')&&h.end-h.start>=minRepeat;
    if(style!=='all'&&matchStyle(wallet,h,word,start,end,style)!==style)return false;
    return eligible&&(position==='all'?true:position==='first'?h.start===start:position==='last'?h.end===end:position==='middle'?h.start>start&&h.end<end:false);
  });
}

// Compile once per query. Using the shared matcher keeps aliases symmetric:
// either the query or the address may contain the digit spelling.
export function resultSearch(query = '') {
  const terms = [...new Set(query.trim().toLowerCase().split(/[\s,]+/).filter(Boolean))];
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const patterns = terms.map(term => new RegExp([...term].map(character => {
    const equivalents = [...alphabet].filter(candidate => matches(candidate, character, true)).join('');
    return equivalents ? `[${equivalents}]` : character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join(''), 'i'));
  return wallet => !patterns.length || patterns.some(pattern =>
    pattern.test(wallet.address || '') || wallet.hits.some(word => pattern.test(word)));
}

export const longestWord = w => w.hits.reduce((length, word) => Math.max(length, word.length), 0);
const matchCounts = new WeakMap();
export function matchCount(wallet) {
  if (matchCounts.has(wallet)) return matchCounts.get(wallet);
  const regions = [...(wallet.highlights || [])].sort((a, b) => a.start - b.start || b.end - a.end);
  let count = 0, end = -1;
  for (const region of regions) {
    if (region.end <= region.start) continue;
    if (region.start >= end) count++;
    end = Math.max(end, region.end);
  }
  matchCounts.set(wallet, count);
  return count;
}
export function collectionView(wallets, { showWords = true, showRepeated = true, sort = 'score', minRepeat = 3, minRank = 0, query = '', wordFilter = null, position = 'all' } = {}) {
  const search = resultSearch(query);
  const filtered = wallets.filter(w => w.level >= minRank && ((showWords && w.hits.length > 0) || (showRepeated && w.streak >= minRepeat)) && (!wordFilter || w.hits.some(wordFilter)) && search(w) && matchesPosition(w,position,{showWords,showRepeated,minRepeat,wordFilter}));
  const sortWords = w => wordFilter ? w.hits.filter(wordFilter) : w.hits;
  const rarity = (a, b) => b.level - a.level || b.score - a.score || b.created.localeCompare(a.created);
  // Use dictionary words (not their leet address spellings); repeat-only rows go last.
  const wordKeys = sort === 'az' ? new Map(filtered.map(w => [w, sortWords(w).reduce((first, word) => {
    const lower = word.toLowerCase();
    return first === null || lower < first ? lower : first;
  }, null)])) : null;
  const comparators = {
    az: (a, b) => {
      const left = wordKeys.get(a), right = wordKeys.get(b);
      if (left === null || right === null) return left === right ? rarity(a, b) : left === null ? 1 : -1;
      return (left < right ? -1 : left > right ? 1 : 0) || rarity(a, b);
    },
    new: (a, b) => b.created.localeCompare(a.created),
    repeat: (a, b) => b.streak - a.streak || rarity(a, b),
    matches: (a, b) => matchCount(b) - matchCount(a) || rarity(a, b),
    word: (a, b) => longestWord({hits:sortWords(b)}) - longestWord({hits:sortWords(a)}) || rarity(a, b),
    score: rarity,
  };
  return filtered.sort(comparators[sort] || rarity);
}
