const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function highlightedAddress(wallet, compact = true) {
  const { address, highlights = [], display = { head: 6, tail: 6 } } = wallet;
  function segment(start, end) {
    let html = '', run = '', previous = '';
    function flush() {
      if (run) html += previous ? `<mark title="${escape(previous)}">${escape(run)}</mark>` : escape(run);
      run = '';
    }
    for (let i = start; i < end; i++) {
      const reason = [...new Set(highlights.filter(h => h.start <= i && h.end > i).map(h => h.reason))].join(' · ');
      if (reason !== previous) flush();
      previous = reason; run += address[i];
    }
    flush(); return html;
  }
  if (!compact || display.head + display.tail >= address.length) return segment(0, address.length);
  const ranges=[{start:0,end:display.head},{start:address.length-display.tail,end:address.length},...highlights.map(h=>({start:Math.max(0,h.start-1),end:Math.min(address.length,h.end+1)}))].sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
  return merged.map(range=>segment(range.start,range.end)).join('<span class="address-gap" title="Unmatched characters hidden">…</span>');
}

export function discoveryMeta(wallet) {
  const elapsed=wallet.discoveryElapsedMs;
  const time=Number.isFinite(elapsed)&&elapsed>=0 ? `${(elapsed/60000).toFixed(2)} min` : 'Time unknown';
  const bits=wallet.quality?.difficultyBits;
  const odds=Number.isFinite(bits)&&bits>=0 ? formatOdds(2**bits) : 'Odds unknown';
  return `<small class="discovery-time" title="Elapsed time from run start until this result was received">${time}</small><small class="discovery-odds" title="Approximate odds of the scored anchor pattern in its search zone; includes allowed case and look-alike variants, not the entire address or rarity tier">${odds}</small>`;
}
export function formatOdds(value) {
  if(!Number.isFinite(value)||value<1)return 'Odds unknown';
  for(const [scale,suffix] of [[1e12,'t'],[1e9,'b'],[1e6,'m'],[1e3,'k']])if(value>=scale)return `≈1:${Number((value/scale).toFixed(1))}${suffix}`;
  return `≈1:${Math.round(value).toLocaleString()}`;
}

export const inspectIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
export function matchTags(wallet){
  return `<div class="detail-matches" aria-label="All matching words">${[...new Set(wallet.hits||[])].map(word=>`<span class="hit">${escape(word)}</span>`).join('')}${wallet.streak>=3?`<span class="hit">${wallet.streak} repeats</span>`:''}${!wallet.hits?.length&&!(wallet.streak>=3)?'<span class="muted">No word or repeat matches</span>':''}</div>`;
}
