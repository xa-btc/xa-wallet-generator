import { walletValueMarkup } from './wallet-value.js';
import { installAppearance } from './appearance.js';
import { RunStatsClient, lifetimeMarkup } from './run-stats-client.js';
import { installTabNavigation } from './tab-navigation.js';
import { MATCH_POSITIONS, toggleMatchFilter, matchFilterSelected, sortMatchingWords } from './collection-view.js';
import './style.css';
import { savedRequest, saveCollection } from './saved-client.js';
import { RESULT_WORD_CATEGORIES } from './word-packs.js';
import { RARITIES } from './rarity.js';
import { highlightedAddress, discoveryMeta, inspectIcon, matchTags } from './address-view.js';

const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let matchingWords=[],matchWord='';
let page=0,category='all',position='all',generation=0,timer,visible=[],busy=false;
window.name = 'xa-wallet-generator-saved';
installTabNavigation();
$('#app').innerHTML=`<header><a class="brand" href="/" target="xa-wallet-generator-generator">✦ XA Wallet Generator</a><nav><a href="/" target="xa-wallet-generator-generator">Generator</a><a href="/saved.html" target="xa-wallet-generator-saved" aria-current="page">Saved collection</a></nav>${lifetimeMarkup}</header>
<main class="saved-page"><section class="results"><div class="collection-head"><div><h1>Saved collection</h1><p class="hint">All collected wallets across runs · saved in this project · keys hidden until revealed or exported</p></div><div class="actions"><button id="refresh">Refresh</button><button id="import">Import export files</button><input type="file" id="importFile" accept=".json" multiple hidden><button id="exportSaved">Save filtered export</button></div></div>
<details class="import-batches"><summary>Imported files <span id="batchCount">0 batches</span></summary><p class="hint">Delete a batch to remove its imported wallets. Wallets also present in other batches or generated hunts stay saved. Original files and exports are not deleted.</p><div id="batchList"></div></details><div class="panel collection"><div class="toolbar saved-filters"><label>SEARCH WORDS / ADDRESS<input id="query" type="search" maxlength="128" placeholder="Words or address · 5 ↔ s, 1 ↔ i/l"></label><label class="check saved-exact"><input type="checkbox" id="exactQuery">Exact text<span class="hint">Case-sensitive · no look-alikes</span></label><label>MIN. RARITY<select id="rank">${RARITIES.map((r,i)=>`<option value="${i}">${i?r+' +':'Any rarity'}</option>`).join('')}</select></label><label>NETWORK<select id="chain"><option value="all">All networks</option><option value="sol">Solana</option><option value="eth">Ethereum / EVM</option><option value="btc">Bitcoin</option></select></label><label>SHOW<select id="kind"><option value="all">All wallets</option><option value="words">Word matches</option><option value="repeats">Repeaters</option></select></label><label>REPEAT MIN.<select id="repeat">${[3,4,5,6,7,8,9,10,12,16].map(n=>`<option>${n}</option>`).join('')}</select></label><label>SORT<select id="sort"><option value="new">Newest</option><option value="score">Highest rarity</option><option value="az">Words A–Z</option><option value="repeat">Longest repeat</option><option value="word">Longest word</option><option value="matches">Most matches</option></select></label></div>
<div class="position-filters" role="group" aria-label="Match position"><span>MATCH POSITION</span>${MATCH_POSITIONS.map(([id,label])=>`<button type="button" data-position="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><div class="result-categories" role="group" aria-label="Word category">${RESULT_WORD_CATEGORIES.map(([id,label])=>`<button type="button" data-category="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><details id="matchingWordsPanel" class="category-details"><summary>Matching words <span id="matchingWordsSummary">All words</span></summary><div class="matching-word-tools"><input id="matchingWordSearch" type="search" placeholder="Find a matched word…" aria-label="Find a matched word"><div class="matching-word-sort" role="group" aria-label="Sort matching words"><button type="button" data-word-sort="az" aria-pressed="true">A–Z</button><button type="button" data-word-sort="count" aria-pressed="false">Most results</button><button type="button" data-word-sort="rarity" aria-pressed="false" title="Rarest matching wallet, then score and count">Highest rarity</button><button type="button" data-word-sort="length" aria-pressed="false">Longest word</button><button type="button" data-word-sort="repeat" aria-pressed="false" title="Longest repeated-character run in matching wallets">Most repeated</button></div><button type="button" id="clearMatchWord">All words</button></div><div id="matchingWordButtons" class="result-categories" role="group" aria-label="Select an exact matched word"></div></details><div class="save-bar"><span id="summary" role="status">Loading saved collection…</span></div><div id="cards"></div><div class="pagination"><span id="pages"></span><div class="page-actions"><button id="previous">← Previous</button><button id="next">Next →</button></div></div></div><p id="message" role="status" class="hint"></p><p class="hint">Filters never delete saved wallets. Category membership may overlap. Exports are written to saved/exports/ and contain unencrypted private keys.</p></section></main>
<dialog id="detail"><button class="close" aria-label="Close">×</button><div id="detailBody"></div></dialog>`;
installAppearance();
const runStats=new RunStatsClient();
function filters(){return {query:$('#query').value,exactText:String($('#exactQuery').checked),minRank:$('#rank').value,chain:$('#chain').value,kind:$('#kind').value,minRepeat:$('#repeat').value,sort:$('#sort').value,category,position,matchWord,includeWords:String($('#matchingWordsPanel').open),page,pageSize:40};}
let matchingWordOrder = 'az';
try { const savedOrder=window.localStorage.getItem('wallet-forge.matching-word-order'); if(['az','count','rarity','length','repeat'].includes(savedOrder)) matchingWordOrder=savedOrder; } catch {}
function syncMatchingWordSort(){
  document.querySelectorAll('[data-word-sort]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.wordSort===matchingWordOrder)));
}
syncMatchingWordSort();
document.querySelectorAll('[data-word-sort]').forEach(button=>button.onclick=()=>{
  matchingWordOrder=button.dataset.wordSort;
  try { window.localStorage.setItem('wallet-forge.matching-word-order',matchingWordOrder); } catch {}
  syncMatchingWordSort();renderMatchingWords();
});
function renderMatchingWords(){
  $('#matchingWordsSummary').textContent=(matchWord||'All words')+' · '+matchingWords.length.toLocaleString()+' unique';
  if(!$('#matchingWordsPanel').open)return;
  const query=$('#matchingWordSearch').value.trim().toLowerCase();
  $('#matchingWordButtons').innerHTML=sortMatchingWords(matchingWords, matchingWordOrder).filter(([word])=>word.includes(query)).map(([word,count,level=0,score=0,repeat=0])=>`<button type="button" data-match-word="${escape(word)}" aria-pressed="${word===matchWord}">${escape(word)} <small>${count.toLocaleString()} · ${RARITIES[level]}${matchingWordOrder==='length' ? ` · ${word.length} chars` : matchingWordOrder==='repeat' ? ` · ${repeat}× repeat` : ''}</small></button>`).join('')||'<small>No matching words saved.</small>';
}
$('#matchingWordsPanel').ontoggle=()=>{if($('#matchingWordsPanel').open)void refresh();};
$('#matchingWordSearch').oninput=renderMatchingWords;
$('#clearMatchWord').onclick=()=>{matchWord='';page=0;void refresh();};
$('#matchingWordButtons').onclick=event=>{const button=event.target.closest('[data-match-word]');if(!button)return;matchWord=matchWord===button.dataset.matchWord?'':button.dataset.matchWord;page=0;void refresh();};
async function refresh(){
  const request=++generation;
  try{
    const [data, imports]=await Promise.all([savedRequest('list?'+new URLSearchParams(filters())),savedRequest('batches')]);
    if(request!==generation)return;
    visible=data.wallets;page=data.page;
    if(data.words)matchingWords=data.words;renderMatchingWords();
    $('#batchCount').textContent=imports.batches.length+' batches';
    $('#batchList').innerHTML=imports.batches.length?imports.batches.map(batch=>'<div class="import-batch"><div><strong>'+escape(batch.filename)+'</strong><small>'+escape(batch.created)+' · '+batch.wallets.toLocaleString()+' wallets · '+escape(batch.status)+'</small></div><button type="button" data-delete-batch="'+escape(batch.id)+'" data-filename="'+escape(batch.filename)+'">Delete batch</button></div>').join(''):'<p class="hint">No imported files yet.</p>';
    $('#summary').textContent=`${data.filtered.toLocaleString()} matching / ${data.total.toLocaleString()} saved wallets`;
    $('#pages').textContent=`Page ${page+1} / ${Math.max(1,Math.ceil(data.filtered/data.pageSize))}`;
    $('#previous').disabled=page===0;$('#next').disabled=(page+1)*data.pageSize>=data.filtered;
    $('#exportSaved').disabled=!data.filtered;
    $('#cards').innerHTML=visible.length?visible.map(w=>`<article class="wallet"><div class="wallet-info">${walletValueMarkup(w)}<code class="address-preview">${highlightedAddress(w)}</code><div class="wallet-meta">${discoveryMeta(w)}<span class="network">${escape(w.chain.toUpperCase())}</span><span class="badge ${RARITIES[w.level].toLowerCase()}">${RARITIES[w.level]}</span><small>${w.score.toFixed(1)} pts</small><small>${w.streak>=3?w.streak+'× repeat':''}</small><small>${w.hasPhrase?'Phrase':'Key only'}</small></div></div><div class="wallet-reasons">${w.hits.map(word=>`<span class="hit">${escape(word)}</span>`).join('')}</div><button data-wallet="${escape(w.id)}" class="inspect-wallet" title="View wallet details" aria-label="View wallet details">${inspectIcon}</button></article>`).join(''):'<div class="empty"><h3>No saved wallets match.</h3><p>Adjust filters, generate matches, or import an existing wallet export.</p></div>';
  }catch(error){if(request===generation)$('#summary').textContent=error.message;}
}
for(const id of ['rank','chain','kind','repeat','sort'])$('#'+id).onchange=()=>{page=0;void refresh();};
try{$('#exactQuery').checked=localStorage.getItem('wallet-forge.saved-exact')==='true';}catch{}
function updateQueryHint(){$('#query').placeholder=$('#exactQuery').checked?'Exact address text · case-sensitive':'Words or address · 5 ↔ s, 1 ↔ i/l';}
updateQueryHint();
$('#exactQuery').onchange=()=>{try{localStorage.setItem('wallet-forge.saved-exact',String($('#exactQuery').checked));}catch{}updateQueryHint();page=0;void refresh();};
$('#query').oninput=()=>{page=0;clearTimeout(timer);timer=setTimeout(refresh,250);};
document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;page=0;document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));void refresh();});
document.querySelectorAll('[data-position]').forEach(button=>button.onclick=()=>{position=toggleMatchFilter(position,button.dataset.position);page=0;document.querySelectorAll('[data-position]').forEach(b=>b.setAttribute('aria-pressed',String(matchFilterSelected(position,b.dataset.position))));void refresh();});
$('#refresh').onclick=()=>refresh();$('#previous').onclick=()=>{page--;void refresh();};$('#next').onclick=()=>{page++;void refresh();};
$('#exportSaved').onclick=async()=>{
  if(busy)return;
  busy=true;$('#exportSaved').disabled=true;$('#message').textContent='Saving export inside project folder…';
  try{const data=await savedRequest('export',{filters:filters()});$('#message').textContent=`Saved ${data.count} wallets to ${data.path}`;}catch(error){$('#message').textContent=error.message;}
  finally{busy=false;void refresh();}
};
$('#import').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async()=>{
  const files=[...$('#importFile').files];if(!files.length)return;
  $('#import').disabled=true;let succeeded=0,records=0;const failures=[];
  try {
    for(const [index,file] of files.entries()){
      $('#message').textContent='Importing file '+(index+1)+' of '+files.length+': '+file.name;
      let batch;
      try{
        const data=JSON.parse(await file.text());
        if(!Array.isArray(data.wallets))throw new Error('Not a XA Wallet Generator export');
        batch=await savedRequest('import-start',{filename:file.name});
        await saveCollection(data.wallets,batch.id);
        await savedRequest('import-finish',{id:batch.id,status:'complete'});succeeded++;records+=data.wallets.length;
      }catch{failures.push(file.name);if(batch)await savedRequest('import-finish',{id:batch.id,status:'partial'}).catch(()=>{});}
    }
    $('#message').textContent='Imported '+succeeded+' of '+files.length+' files ('+records+' wallet records); duplicates merged.'+
      (failures.length?' Failed or partially imported: '+failures.join(', ')+'. You can safely retry these files.':'');
    $('.import-batches').open=true;void refresh();
  }finally{$('#import').disabled=false;$('#importFile').value='';}
};

$('#batchList').onclick=async event=>{
  const button=event.target.closest('[data-delete-batch]');if(!button)return;
  if(!confirm('Delete imported batch "'+button.dataset.filename+'"? Wallets found only in this batch will be removed from the saved collection. Wallets shared with other batches or generated hunts will stay. This cannot be undone without reimporting the original file.'))return;
  button.disabled=true;
  try{const data=await savedRequest('delete-batch',{id:button.dataset.deleteBatch});$('#message').textContent='Deleted batch: '+data.removed+' wallets removed, '+data.retained+' shared wallets retained.';void refresh();}
  catch(error){$('#message').textContent=error.message;button.disabled=false;}
};
$('#cards').onclick=event=>{
  const button=event.target.closest('[data-wallet]');if(!button)return;
  const wallet=visible.find(w=>w.id===button.dataset.wallet);if(!wallet)return;
  $('#detailBody').innerHTML=`<h2>Saved wallet</h2><code class="secret">${highlightedAddress(wallet,false)}</code><label>MATCHED WORDS & PATTERNS</label>${matchTags(wallet)}<p>${escape(wallet.path || 'Direct private key')}</p><div id="secrets"><button id="revealSaved">Reveal private key${wallet.hasPhrase?' & recovery phrase':''}</button></div><button id="exportOneSaved">Save wallet export</button><button type="button" id="deleteOneSaved" class="delete-wallet">Delete wallet</button><p id="detailStatus" role="status"></p>`;
  $('#detail').showModal();
  $('#revealSaved').onclick=async()=>{
    try{const data=await savedRequest('reveal',{id:wallet.id});if(!$('#detail').open)return;$('#secrets').innerHTML=`<label>PRIVATE KEY</label><code class="secret">${escape(data.wallet.privateKey)}</code>${data.wallet.phrase?`<label>RECOVERY PHRASE</label><code class="secret">${escape(data.wallet.phrase)}</code>`:''}`;}
    catch(error){$('#detailStatus').textContent=error.message;}
  };
  $('#deleteOneSaved').onclick=async()=>{
    if(!confirm('Delete '+wallet.address+' from Saved collection and all imported batches? Export any keys you want to keep first. Existing exports and backups are not deleted.'))return;
    const button=$('#deleteOneSaved');button.disabled=true;
    try{await savedRequest('delete-wallet',{id:wallet.id});$('#detail').close();$('#message').textContent='Wallet deleted from the saved collection.';await refresh();}
    catch(error){if($('#detailStatus'))$('#detailStatus').textContent=error.message;if(button.isConnected)button.disabled=false;}
  };
  $('#exportOneSaved').onclick=async()=>{try{const data=await savedRequest('export',{ids:[wallet.id]});$('#detailStatus').textContent='Saved to '+data.path;}catch(error){$('#detailStatus').textContent=error.message;}};
};
$('.close').onclick=()=>$('#detail').close();$('#detail').addEventListener('close',()=>$('#detailBody').replaceChildren());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
setInterval(()=>{if(!document.hidden&&!busy)void refresh();},10000);
void refresh();
