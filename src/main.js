import { installNetworkInput, typedSearchError, TYPED_SEARCH_FIELDS } from './network-input.js';
import { SEARCH_STYLES } from './search-styles.js';
import { walletValueMarkup } from './wallet-value.js';
import { zoneControlsMarkup, installZoneControls } from './zone-controls.js';
import { installAppearance } from './appearance.js';
import { RunStatsClient, lifetimeMarkup, formatRunTime } from './run-stats-client.js';
import { estimatePattern, trialsForChance, chanceAfterTrials } from './probability.js';
import { fitTypedWord, collectionTarget } from './hunt-options.js';
import { installTabNavigation } from './tab-navigation.js';
import { MATCH_POSITIONS, parseMatchFilter, toggleMatchFilter, matchFilterSelected, matchingWordCounts, sortMatchingWords } from './collection-view.js';
import { THEME_CATEGORIES, THEME_SETTING_IDS } from './theme-words.js';
import { savedRequest, exportCollection, uniqueWallets, markWalletsSaved } from './saved-client.js';
import { SEARCH_ZONES } from './search-zones.js';
import { selectedWords, loadExpandedWords, RESULT_WORD_CATEGORIES, resultWordFilter } from './word-packs.js';
import { QUALITY_THRESHOLDS } from './quality.js';
import { RARE_CAPACITY, discoveryConfig } from './discovery.js';
import { SETTING_IDS, readSettings, saveSettings, chooseEngine } from './settings.js';
import { RARITIES, MAX_COLLECTION } from './rarity.js';
import { collectionView, longestWord, matchCount } from './collection-view.js';
import './style.css';
import { CHAINS } from './wallet.js';
import { possible } from './matching.js';
import { highlightedAddress, discoveryMeta, inspectIcon, matchTags } from './address-view.js';
import { SearchPool, recommendedWorkers } from './worker-pool.js';
import { GpuPool, gpuDevices } from './gpu-client.js';
const $ = s => document.querySelector(s);
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const autoWorkers = recommendedWorkers(navigator.hardwareConcurrency);
let pool, renderTimer, cardsDirty = false, availableGpus = [], currentPage = 0, pageSize = 40;
let expandedWords = [], dictionaryLoading = false, gpuReady = false;
let rareWallets = [], activeCollection = 'search';
const currentWallets = () => activeCollection === 'rare' ? rareWallets : wallets;
let selectedMatchWord = '';
let exportBusy = false;
let wallets = [], running = false, attempts = 0, baseAttempts = 0, started = 0, selected, sort = 'score';
window.name = 'xa-wallet-generator-generator';
installTabNavigation();
$('#app').innerHTML = `
<header class="generator-header"><a class="brand" href="/" aria-label="XA Wallet Generator home"><span class="logo">✦</span> XA Wallet Generator<small>VANITY LAB</small></a><div class="header-intro"><h1>Find your <em>one in a million.</em></h1><p>Generate fresh wallets. Hunt meaningful addresses. Keep the gems.</p></div>${lifetimeMarkup}<a class="saved-link" href="/saved.html" target="xa-wallet-generator-saved">Saved collection ↗</a></header>
<main class="generator-main">
<div class="workspace"><section class="panel controls" aria-label="Wallet search controls">
<form id="config"><div class="hunt-bar"><div><span class="eyebrow">VANITY SEARCH</span><h2>Configure your hunt</h2></div><div class="hunt-actions"><button class="primary" id="generate" type="submit">✦ Start generating <span>→</span></button><button id="stop" type="button" class="stop" hidden>■ Stop hunt</button></div></div>
<details id="configureDetails" class="configure-details" open><summary>Search settings <span>Expand / collapse</span></summary><fieldset id="fields"><div class="hunt-presets"><span>QUICK SETUP</span><button type="button" data-preset="ends">Readable ends</button><button type="button" data-preset="suffix">Strong suffix</button><button type="button" data-preset="suffix-repeat" title="Last six characters must repeat; case-insensitive">Last 6 repeats</button>${RARITIES.slice(3).map((rank, i) => `<button type="button" class="rarity-preset ${rank.toLowerCase()}" data-preset="tier-${i + 3}" title="Minimum quality score ${QUALITY_THRESHOLDS[i + 3]}">${rank}${i < 3 ? '+' : ''}</button>`).join('')}<button type="button" data-preset="repeat">Repeat hunt</button><button type="button" id="resetHuntFilters" class="reset-hunt-filters" title="Reset search and result filters to defaults" aria-label="Reset search and result filters"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/></svg></button></div><div class="setup-grid">
<div class="field"><label for="chain">NETWORK</label><select id="chain"><option value="sol">◎ Solana</option><option value="eth">◇ Ethereum / EVM</option><option value="btc">₿ Bitcoin · Native SegWit</option></select></div>
<div class="field"><label for="mode">GENERATION MODE</label><select id="mode"><option value="recovery-phrase">Recovery phrase + private key</option><option value="private-key" selected>Fast · private key only</option></select></div>
<div class="field"><label for="engine">PROCESSOR</label><select id="engine"><option value="cpu">CPU workers</option></select></div>
<div class="field"><label for="workers">CPU WORKERS</label><select id="workers"><option value="auto">Auto (${autoWorkers} workers)</option>${[1,2,4,8,12,16,24,32].map(n => `<option value="${n}">${n} worker${n === 1 ? '' : 's'}</option>`).join('')}</select></div>
</div><div class="search-grid">
<div class="field"><label>SEARCH ZONE</label>${zoneControlsMarkup}<select id="scope" hidden aria-label="Search zone">${Object.entries(SEARCH_ZONES).map(([value, zone]) => `<option value="${value}">${zone.label}</option>`).join('')}</select></div><div class="field"><label for="target">COLLECT / KEEP</label><input id="target" type="number" min="1" max="${MAX_COLLECTION}" step="1" value="500" required></div>
<div class="field"><label for="prefix">STARTS WITH</label><input id="prefix" maxlength="16" placeholder="e.g. sol" autocomplete="off"></div>
<div class="field"><label for="suffix">ENDS WITH</label><input id="suffix" maxlength="16" placeholder="e.g. moon" autocomplete="off"></div>
<div class="field"><label for="rank">MIN. RARITY</label><select id="rank">${RARITIES.map((rank, i) => `<option value="${i}">${i ? rank + (i < RARITIES.length - 1 ? " +" : "") : "Any rarity"}</option>`).join('')}</select></div>
<div class="field"><label for="collectionMode">COLLECTION MODE</label><select id="collectionMode"><option value="single">Single result · stop at first search match</option><option value="fill" selected>Fill and stop</option><option value="best">Keep the best · replace weaker</option></select></div><div class="field repeat-controls"><div><label for="requiredRepeat">REQUIRED REPEAT</label><select id="requiredRepeat"><option value="0">No requirement</option>${[3,4,5,6,7,8,9,10,12,16].map(n => `<option value="${n}">${n}+ consecutive</option>`).join('')}</select></div><label class="check ignore-repeated" title="Exclude case-insensitive runs of 2-7 characters in the search zone; allow 8+ repeats. Rare finds are collected independently."><input type="checkbox" id="ignoreRepeated">Ignore repeats (2-7)</label></div>
</div><div class="search-style-controls"><label>SEARCH MATCH STYLE</label><div class="search-style-buttons" role="group" aria-label="Styles accepted during generation"><button type="button" id="searchStyleAll" aria-pressed="true">Any style</button>${SEARCH_STYLES.map(([id,label])=>`<label class="search-style-toggle"><input type="checkbox" id="searchStyle${id[0].toUpperCase()+id.slice(1)}"><span>${label}</span></label>`).join('')}</div><small>Selected styles match either · Solana CAPS allows i/o; lowercase allows L · overflow stays independent</small></div><div class="direct-words-field"><label for="directWords">DIRECT WORDS · MATCH ANY</label><input id="directWords" maxlength="4096" placeholder="example, search, words" autocomplete="off"><small>Comma-separated alternatives · any rarity · red characters cannot be searched on this network</small><small id="effectiveWords"></small></div><details id="customMatchSettings" class="overflow-settings"><summary>Custom words & matching <span>+</span></summary><div class="custom-words-field"><label for="custom">CUSTOM WORDS · OPTIONAL</label><textarea id="custom" rows="2" placeholder="Extra words, separated by spaces or commas"></textarea><small>Starts with / Ends with are searched automatically. No need to repeat them here.</small></div><div class="filter-options"><label class="check"><input type="checkbox" id="fitWords" checked>Fit typed words to the selected end</label><label class="check"><input type="checkbox" id="leet" checked><span>Look-alike matching <small>1 → i / l, 5 → s</small></span></label><label class="check"><input type="checkbox" id="only" checked><span>Word & pattern matches only</span></label><span class="hint">Both end filters must match. Typed ends bypass minimum rarity; repeat requirements still apply.</span></div></details>
<details id="overflowSettings" class="overflow-settings"><summary>Rare-find overflow <span>+</span></summary><div class="rare-controls"><div><label for="discoveryRank">RARE-FIND MIN. RARITY</label><select id="discoveryRank"><option value="0">Off</option><option value="4" selected>Legendary+ · 90+ score</option><option value="5">Mythic+ · 105+ score</option><option value="6">Godlike · 150+ score</option></select></div><div><label for="discoveryTarget">OVERFLOW LIMIT</label><input id="discoveryTarget" type="number" min="1" max="${RARE_CAPACITY}" step="1" value="10000"></div><div><label for="discoverySource">OVERFLOW WORD SOURCE</label><select id="discoverySource"><option value="builtin">Built-in core · independent</option><option value="library">Selected library + custom words</option><option value="search">Current search words (includes Direct words)</option><option value="custom">Overflow words only</option></select></div><div><label for="discoveryMinLength">MIN. WORD LENGTH</label><select id="discoveryMinLength">${Array.from({length:11},(_,i)=>i+2).map(n=>`<option value="${n}" ${n===3?'selected':''}>${n}+ characters</option>`).join('')}</select></div><div><label for="discoveryScope">OVERFLOW SEARCH ZONE</label><select id="discoveryScope">${Object.entries(SEARCH_ZONES).map(([value,zone])=>`<option value="${value}" ${value==='any'?'selected':''}>${zone.label}</option>`).join('')}</select></div><div id="discoveryCustomField" hidden><label for="discoveryCustom">OVERFLOW WORDS</label><input id="discoveryCustom" maxlength="4096" placeholder="example, search, words"></div><label class="check"><input id="discoveryLeet" type="checkbox" checked>Look-alike matching</label><label class="check"><input id="discoveryIgnoreRepeated" type="checkbox">Exclude repeat runs (3+)</label><p id="discoverySummary"></p><p>Checks every candidate independently. Minimum word length applies to words; repeats can still qualify unless excluded. Stops when either collection reaches its limit.</p></div></details>
<div class="advanced-options"><details><summary>Word library & advanced <span>+</span></summary><div class="advanced-grid"><div><label for="minLength">MINIMUM WORD LENGTH</label><select id="minLength"><option value="2">2 characters (broad)</option><option value="3" selected>3 characters</option><option value="4">4 characters</option><option value="5">5 characters</option><option value="6">6 characters</option>${[7,8,9,10].map(n=>`<option value="${n}">${n} characters</option>`).join('')}</select><label class="check"><input type="checkbox" id="library" checked><span>Use selected word packs</span></label></div></div><div class="word-pack-actions"><button id="enableWordPacks" type="button">Enable all</button><button id="disableWordPacks" type="button">Disable all</button></div><div class="word-packs"><label class="check"><input id="packCommon" type="checkbox" checked>Common English</label><label class="check"><input id="packCrypto" type="checkbox" checked>Crypto & vanity</label><label class="check"><input id="packPolitics" type="checkbox" checked>Political</label><label class="check"><input id="packJewish" type="checkbox" checked>Jewish / Hebrew</label><label class="check"><input id="packShortEnglish" type="checkbox" checked>4–10 letters · broad English</label><label class="check"><input id="packShortSlang" type="checkbox" checked>4–10 characters · slang, abbreviations & typos</label><label class="check"><input id="packCountries" type="checkbox" checked>Countries & aliases</label><label class="check"><input id="packCities" type="checkbox" checked>Major cities</label><label class="check"><input id="packCompanies" type="checkbox" checked>Companies & brands</label><label class="check"><input id="packPeople" type="checkbox" checked>Influencers & business figures</label><label class="check"><input id="packPokemon" type="checkbox" checked>Pokémon & forms</label>${THEME_CATEGORIES.map(([id,label])=>`<label class="check"><input id="packTheme_${id}" type="checkbox" checked>${label}</label>`).join('')}<label class="check"><input id="packExpanded" type="checkbox">Expanded English · slower</label></div><p class="hint" id="wordCount"></p><div class="word-preview">${['btfd', 'hfsp', 'jomo', 'cabal', 'cto', 'pvp', 'koth', 'trenches', 'dexpaid', 'cooked', 'jeet', 'shill', 'hodler', 'smol', 'kek', 'pog', 'wagmi', 'degen', 'pepe', 'fwog', 'based', 'brrr', 'safu', 'godmode'].map(w => `<span>${w}</span>`).join('')}</div></details><details class="control-help"><summary>Network & GPU information <span>+</span></summary><p class="hint" id="chainHint"></p><p class="hint" id="gpuHint">Checking local GPUs…</p><p class="hint">More CPU workers use more CPU. Auto leaves room for the browser.</p></details></div>
</fieldset></details></form></section>
<section class="results"><div class="save-bar" id="saveNotice" hidden><span id="saveStatus" role="status"></span><button type="button" id="retrySave" hidden>Retry saving</button></div><div class="stats"><div class="hunt-stat"><label>CURRENT SEARCH</label><p class="hunt-summary" id="huntSummary" role="status"></p></div><div class="probability-stat" id="probabilityPanel" title="Estimated pattern chance before rarity/repeat filters, not a guaranteed hit. Each new address has the same odds."><div class="probability-heading"><label for="probabilityBar">EST. CHANCE <span id="probabilityKind">· this run</span></label><strong id="probabilityPercent">0%</strong></div><progress id="probabilityBar" max="1" value="0" aria-label="Estimated chance of at least one word match across this run"></progress><div class="probability-results"><span id="probabilitySummary">Ready to estimate</span><span class="run-elapsed">Run time: <strong id="runElapsed">00:00:00</strong></span><span id="probabilityMatches">0 search matches this run</span><label for="probabilityChance" class="probability-target">Estimate to <select id="probabilityChance"><option value="0.5">50%</option><option value="0.95">95%</option><option value="0.99">99%</option></select></label></div></div><div><label>ADDRESSES CHECKED</label><strong id="attempts">0</strong><small id="speed">Ready when you are</small></div><div><label>WALLETS COLLECTED</label><strong id="collected">0 <span>/ 12</span></strong></div><div><label>BEST DISCOVERY</label><strong id="best">—</strong></div></div>
<div class="panel collection"><div class="collection-tabs"><button type="button" id="searchTab" aria-pressed="true">Search matches <span id="searchCount">0</span></button><button type="button" id="rareTab" aria-pressed="false">Rare finds <span id="rareCount">0</span></button><span id="collectionNote">Your primary search matches</span></div><div class="collection-head"><div><div class="eyebrow">THE KEEPERS</div><h2>Your collection <span id="count">0</span></h2></div><div class="actions"><button id="export" disabled>↓ Export collection</button><button id="exportBoth" type="button" disabled>↓ Export both</button><label class="check export-import" title="Also add this export as a named batch under Saved collection → Imported files. Automatic saving continues independently."><input type="checkbox" id="exportAlsoImport">Also import into Saved collection</label><button id="clear" disabled>Clear</button><button id="clearBoth" type="button" disabled>Clear both</button></div></div><div class="toolbar"><span id="status" role="status">● Ready to generate</span><div class="result-filters"><label class="check"><input id="showWords" type="checkbox" checked>Show words</label><label class="check"><input id="showRepeated" type="checkbox" checked>Show repeated</label></div><div class="result-limits"><label for="resultRank">MIN. RARITY</label><select id="resultRank">${RARITIES.map((rank, i) => `<option value="${i}">${i ? rank + " +" : "Any"}</option>`).join('')}</select><label for="minRepeat">REPEAT MIN.</label><select id="minRepeat">${[3,4,5,6,7,8,9,10,12,16].map(n => `<option value="${n}">${n}+</option>`).join('')}</select></div><select id="sort" aria-label="Sort collection"><option value="score">Highest rarity first</option><option value="repeat">Longest repeat first</option><option value="matches">Most matches first</option><option value="word">Longest word first</option><option value="az">Word matches A–Z</option><option value="new">Newest first</option></select></div><details id="wordCategories" class="category-details"><summary>Word category <span id="categorySummary">All word categories</span></summary><div class="result-categories" role="group" aria-label="Filter results by word category"><input type="hidden" id="resultCategory" value="all">${RESULT_WORD_CATEGORIES.map(([value, label]) => `<button type="button" data-result-category="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}<small>Filters matched words in this collection. Categories can overlap; choose All for repeat-only wallets.</small></div></details><div class="repeater-shortcuts" aria-label="Quick repeater filters"><span>REPEATERS ONLY</span>${[3,8,9,10,12,16].map(n => `<button type="button" data-repeat-min="${n}" aria-pressed="false">${n === 3 ? 'All repeaters' : n + '+ repeats'}</button>`).join('')}<small>8+ needs an Anywhere hunt · Case-insensitive runs</small></div><div class="position-filters" role="group" aria-label="Match position"><span>MATCH POSITION</span><input type="hidden" id="resultPosition" value="all">${MATCH_POSITIONS.map(([id,label])=>`<button type="button" data-position="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><details id="matchingWordsPanel" class="category-details"><summary>Matching words <span id="matchingWordsSummary">All words</span></summary><div class="matching-word-tools"><input id="matchingWordSearch" type="search" placeholder="Find a matched word…" aria-label="Find a matched word"><div class="matching-word-sort" role="group" aria-label="Sort matching words"><button type="button" data-word-sort="az" aria-pressed="true">A–Z</button><button type="button" data-word-sort="count" aria-pressed="false">Most results</button><button type="button" data-word-sort="rarity" aria-pressed="false" title="Rarest matching wallet, then score and count">Highest rarity</button><button type="button" data-word-sort="length" aria-pressed="false">Longest word</button><button type="button" data-word-sort="repeat" aria-pressed="false" title="Longest repeated-character run in matching wallets">Most repeated</button></div><button type="button" id="clearMatchWord">All words</button></div><div id="matchingWordButtons" class="result-categories" role="group" aria-label="Select an exact matched word"></div></details><div class="collection-search"><label for="resultSearch">SEARCH RESULTS</label><input type="search" id="resultSearch" maxlength="128" placeholder="Search addresses or words, e.g. sol, moon" autocomplete="off" spellcheck="false" aria-describedby="resultSearchHint"><span id="resultSearchHint">Case-insensitive · 5 ↔ s, 1 ↔ i / l · Any word separated by spaces or commas · Searches full addresses</span></div><div id="cards" aria-label="Collected wallets"></div><div class="pagination"><span id="pageInfo" role="status">No wallets yet</span><div class="page-actions"><label for="pageSize">SHOW</label><select id="pageSize"><option value="20">20 per page</option><option value="40" selected>40 per page</option><option value="60">60 per page</option><option value="100">100 per page</option></select><button id="previousPage" aria-label="Previous results page" disabled>← Previous</button><button id="nextPage" aria-label="Next results page" disabled>Next →</button></div></div></div>
<div class="legend">${RARITIES.map((rank, i) => `<div><i class="dot ${rank.toLowerCase()}"></i><b>${rank}</b><span>${QUALITY_THRESHOLDS[i]}+ quality score</span></div>`).join('')}</div><p class="footnote">Quality combines estimated pattern difficulty, readability, familiar words, and separate matches. Difficulty assumes uniform independent address characters; it is not exact odds for the whole dictionary. Fill mode stops at the target; Keep the best replaces weaker finds until Stop or the overflow limit. Previously collected wallets remain in Saved collection.</p>
</section></div><footer><span>✦ XA WALLET GENERATOR</span><p>Collected wallets auto-save in the project’s saved folder. Exports include unencrypted keys. Keep this folder private.</p><button id="help">Import guide ↗</button></footer></main>
<dialog id="detail"><button class="close" aria-label="Close dialog">×</button><div id="dialogBody"></div></dialog><div id="toast" role="status"></div>`;

installAppearance();
const runStats=new RunStatsClient({onTick:elapsed=>{$('#runElapsed').textContent=formatRunTime(elapsed);}});
const compactControls = window.matchMedia('(max-width: 900px)');
const syncControlsLayout = () => { $('#configureDetails').open = !compactControls.matches; };
syncControlsLayout();
compactControls.addEventListener('change', syncControlsLayout);
$('#config').addEventListener('invalid', () => { $('#configureDetails').open = true; }, true);

const pendingSaves = [];
let saving = false, saveFailed = false;
async function flushSaves() {
  if (saving || !pendingSaves.length) return;
  saving = true; saveFailed = false; $('#retrySave').hidden = true;
  $('#saveStatus').textContent = 'Saving collected wallets to project folder...';
  try {
    while (pendingSaves.length) {
      const batch=pendingSaves.slice(0,500);
      await savedRequest('collect',{wallets:uniqueWallets(batch)});
      markWalletsSaved(batch);
      pendingSaves.splice(0,batch.length);
    }
    $('#saveNotice').hidden = true;
    $('#saveStatus').textContent = '';
  } catch {
    saveFailed = true; $('#saveNotice').hidden = false; $('#retrySave').hidden = false;
    $('#saveStatus').textContent = 'Save failed — keep this page open and retry. Your unsaved wallets remain in this tab.';
    if(pool?.active)stop();
  } finally { saving = false; }
}
$('#retrySave').onclick=()=>flushSaves();

let settingsStorage;
try { settingsStorage = window.localStorage; } catch { /* Storage may be disabled. */ }
const savedSettings = readSettings(settingsStorage);
let preferredEngine = typeof savedSettings.engine === 'string' ? savedSettings.engine : 'all';
for (const id of SETTING_IDS) {
  if (id === 'engine' || !(id in savedSettings)) continue;
  const control = $('#' + id), value = savedSettings[id];
  if (control.tagName === 'DETAILS') { if (typeof value === 'boolean') control.open = value; }
  else if (control.type === 'checkbox') { if (typeof value === 'boolean') control.checked = value; }
  else if (typeof value === 'string') {
    if (id === 'resultPosition' && !parseMatchFilter(value)) continue;
    if (id === 'resultCategory' && !RESULT_WORD_CATEGORIES.some(([key]) => key === value)) continue;
    if (control.tagName === 'SELECT' && ![...control.options].some(option => option.value === value)) continue;
    if (control.type === 'number' && (!Number.isInteger(+value) || +value < +control.min || +value > +control.max)) continue;
    control.value = control.maxLength > 0 ? value.slice(0, control.maxLength) : value;
  }
}
if ($('#ignoreRepeated').checked) $('#requiredRepeat').value = '0';
sort = $('#sort').value; pageSize = +$('#pageSize').value;
const updateNetworkInputs = TYPED_SEARCH_FIELDS.map(field => installNetworkInput($('#'+field.id), () => ({chain:$('#chain').value,list:field.list})));
const syncZoneControls=installZoneControls(document,()=>{refreshHints();persistSettings();});
function persistSettings() {
  const values = Object.fromEntries(SETTING_IDS.map(id => {
    const control = $('#' + id);
    return [id, id === 'engine' ? preferredEngine : control.tagName === 'DETAILS' ? control.open : control.type === 'checkbox' ? control.checked : control.value];
  }));
  saveSettings(settingsStorage, values);
}
for (const event of ['input', 'change']) $('#app').addEventListener(event, e => {
  if (!SETTING_IDS.includes(e.target.id)) return;
  if(e.target.id==='searchStyleReplacement'&&e.target.checked)$('#leet').checked=true;
  if (e.target.id === 'ignoreRepeated' && $('#ignoreRepeated').checked) $('#requiredRepeat').value = '0';
  if (e.target.id === 'requiredRepeat' && +$('#requiredRepeat').value > 0) $('#ignoreRepeated').checked = false;
  if (e.target.id === 'engine') preferredEngine = e.target.value;
  refreshHints(); persistSettings();
});
$('#generate').disabled = true;

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 4000); }
let cachedWordKey = '', cachedWords = [], eligibleCache, probabilityModel=null, lastRate=0, probabilityTrials=0, probabilityMatches=0, probabilityKey='';
function config() {
  const exactText=false; // Exact text is a Saved collection filter only.
  const typed=text=>exactText?text:text.toLowerCase();
  const fitWords=!exactText&&$('#fitWords').checked;
  const key = JSON.stringify([...THEME_SETTING_IDS,'library','packCommon','packCrypto','packPolitics','packJewish','packExpanded','packShortEnglish','packShortSlang','packCountries','packCities','packCompanies','packPeople','packPokemon','custom','directWords','scope','fitWords'].map(id => $('#' + id).type === 'checkbox' ? $('#' + id).checked : $('#' + id).value).concat(expandedWords.length));
  if (key !== cachedWordKey) {
    cachedWordKey = key; cachedWords = [...new Set([ ...($('#library').checked ? selectedWords({ ...Object.fromEntries(THEME_CATEGORIES.map(([id])=>[id, $('#packTheme_' + id).checked])), common: $('#packCommon').checked, crypto: $('#packCrypto').checked, politics: $('#packPolitics').checked, jewish: $('#packJewish').checked, expanded: $('#packExpanded').checked, shortEnglish: $('#packShortEnglish').checked, shortSlang: $('#packShortSlang').checked, countries: $('#packCountries').checked, cities: $('#packCities').checked, companies: $('#packCompanies').checked, people: $('#packPeople').checked, pokemon: $('#packPokemon').checked }, expandedWords) : []), ...typed($('#custom').value).split(/[\s,]+/).filter(Boolean)])];
  }
  const directWords = [...new Set(typed($('#directWords').value.trim()).split(/[\s,]+/).filter(Boolean))];
  const directSearch = directWords.length > 0;
  const customWords=new Set(typed($('#custom').value).split(/[\s,]+/).filter(Boolean));
  const words = directSearch ? [...new Set(directWords.map(w=>fitTypedWord(w,$('#scope').value,fitWords)))] : [...new Set(cachedWords.map(w=>customWords.has(w)?fitTypedWord(w,$('#scope').value,fitWords):w))];
  const discoverySource=$('#discoverySource').value;
  const discoveryOptions={source:discoverySource,minLength:+$('#discoveryMinLength').value,scope:$('#discoveryScope').value,leet:$('#discoveryLeet').checked,ignoreRepeated:$('#discoveryIgnoreRepeated').checked,
    ...(discoverySource==='builtin'?{}:{words:discoverySource==='library'?cachedWords.map(w=>w.toLowerCase()):discoverySource==='search'?words.map(w=>w.toLowerCase()):[...new Set($('#discoveryCustom').value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean))]})};
  return { exactText, searchStyles:SEARCH_STYLES.filter(([id])=>$('#searchStyle'+id[0].toUpperCase()+id.slice(1)).checked).map(([id])=>id), discoveryOptions, requestedWords:directWords, singleResult:$('#collectionMode').value==='single', directSearch, keepBest: $('#collectionMode').value === 'best', requiredRepeat: +$('#requiredRepeat').value, ignoreRepeated: $('#ignoreRepeated').checked, ignoreRepeatedMax:7, discoveryRank: +$('#discoveryRank').value, discoveryRemaining: +$('#discoveryTarget').value - rareWallets.length, chain: $('#chain').value, generationMode: $('#mode').value, scope: $('#scope').value, prefix: fitTypedWord(typed($('#prefix').value.trim()),$('#scope').value,fitWords,'first'), suffix: fitTypedWord(typed($('#suffix').value.trim()),$('#scope').value,fitWords,'last'), leet: !exactText&&$('#leet').checked, onlyMatches: directSearch || $('#only').checked, words, minLength: directSearch ? 2 : +$('#minLength').value, minRank: directSearch ? 0 : +$('#rank').value, target: $('#collectionMode').value==='single'?1:+$('#target').value };
}
function eligibleWords(c) {
  const key = `${c.chain}:${c.scope}:${c.leet}:${c.minLength}:${c.exactText}`;
  if (eligibleCache?.words === c.words && eligibleCache.key === key) return eligibleCache.value;
  const maxLength = Math.min(SEARCH_ZONES[c.scope].length, { sol: 44, eth: 40, btc: 38 }[c.chain]);
  const value = c.words.filter(w => (c.scope !== 'joined' || w.length === 8) && w.length >= c.minLength && w.length <= maxLength && possible(w, c.chain, c.leet) && (!c.exactText||[...w].every(char=>CHAINS[c.chain].alphabet.includes(char))));
  eligibleCache = { words: c.words, key, value }; return value;
}
function renderProbability(recalculate=false) {
  if(recalculate||!probabilityModel){
    const c=config();
    const key=JSON.stringify([cachedWordKey,c.chain,c.generationMode,c.scope,c.minLength,c.prefix,c.suffix,c.leet,c.minRank,c.requiredRepeat,c.ignoreRepeated,c.searchStyles,c.exactText]);
    if(key!==probabilityKey){probabilityModel=estimatePattern({...c,words:eligibleWords(c)});if(!running){probabilityTrials=0;probabilityMatches=0;lastRate=0;}probabilityKey=key;}
  }
  const model=probabilityModel,bar=$('#probabilityBar');
  $('#probabilityMatches').textContent=`${probabilityMatches.toLocaleString()} search ${probabilityMatches===1?'match':'matches'}`;
  const unavailable=model.unavailable||(!model.probability?'No matching word pattern fits these settings.':'');
  $('#probabilityPanel').classList.toggle('unavailable',!!unavailable);
  $('#probabilityKind').textContent=model.unionBound?'· upper bound':'· this run';
  if(unavailable){bar.value=0;bar.setAttribute('aria-valuetext','Estimate unavailable');$('#probabilityPercent').textContent='—';$('#probabilitySummary').textContent=unavailable;return;}
  const p=model.probability,chance=chanceAfterTrials(p,probabilityTrials);
  const percent=chance>=.9999?'>99.99%':chance>0&&chance<.0001?'<0.01%':`${(chance*100).toFixed(chance===0?0:2)}%`;
  bar.value=chance;bar.setAttribute('aria-valuetext',`${percent} estimated chance across ${probabilityTrials.toLocaleString()} checks`);$('#probabilityPercent').textContent=percent;
  const format=n=>n<1e12?Math.ceil(n).toLocaleString():n.toExponential(2);
  const trials=trialsForChance(p,+$('#probabilityChance').value),remaining=Math.max(0,trials-probabilityTrials);
  const seconds=lastRate>0?remaining/lastRate:null;
  const time=remaining===0?'Estimate reached':seconds===null?`${format(trials)} checks`:seconds<3600?`${(seconds/60).toFixed(1)} min remaining`:seconds<86400?`${(seconds/3600).toFixed(1)} hr remaining`:`${format(seconds/86400)} days remaining`;
  $('#probabilitySummary').textContent=`1 in ${format(1/p)} per address · ${Math.round(+$('#probabilityChance').value*100)}%: ${time}`;
}

function refreshHints() {
  for (const update of updateNetworkInputs) update();
  $('#searchStyleAll').setAttribute('aria-pressed',String(!SEARCH_STYLES.some(([id])=>$('#searchStyle'+id[0].toUpperCase()+id.slice(1)).checked)));
  syncZoneControls();
  $('#discoveryCustomField').hidden=$('#discoverySource').value!=='custom';
  try { const c=config(),rare=discoveryConfig(c.chain,c.discoveryRank,c.discoveryOptions);
    $('#discoverySummary').textContent=rare?`${rare.words.length.toLocaleString()} eligible overflow words · ${rare.minLength}+ characters · ${SEARCH_ZONES[rare.scope].label}`:'Overflow is off';
  } catch(error) { $('#discoverySummary').textContent=error.message; }

  const c = config();
  $('#target').disabled=c.singleResult;
  const mappings=c.requestedWords.map(w=>{const fitted=fitTypedWord(w,c.scope,!c.exactText&&$('#fitWords').checked);return fitted!==w?`${w} → ${fitted}`:fitted;});
  if($('#prefix').value.trim())mappings.push(`Starts with → ${c.prefix}`);
  if($('#suffix').value.trim())mappings.push(`Ends with → ${c.suffix}`);
  $('#effectiveWords').textContent=mappings.length?'Searching: '+mappings.join(' · '):'';
  const count = eligibleWords(c).length;
  $('#generate').disabled = dictionaryLoading || !gpuReady;
  $('#huntSummary').textContent = dictionaryLoading ? 'Loading expanded English…' : `${count.toLocaleString()} ${c.directSearch ? 'direct words (any match)' : 'dictionary words'}${c.prefix || c.suffix ? ` + ${[c.prefix,c.suffix].filter(Boolean).length} explicit end filter(s)` : ''} · ${c.directSearch ? 'Direct words · any rarity' : c.prefix || c.suffix ? 'Typed ends · any rarity' : `${RARITIES[c.minRank]} (${QUALITY_THRESHOLDS[c.minRank]}+ score)`} · ${c.singleResult ? 'Single result' : (c.keepBest ? 'Keep the best' : 'Collect')+' '+c.target.toLocaleString()} · ${SEARCH_ZONES[c.scope].label}${c.exactText?' · Exact text':''}${c.searchStyles.length?' · '+c.searchStyles.map(id=>SEARCH_STYLES.find(([key])=>key===id)[1]).join(' / '):''}`;
  const gpuAllowed = (['sol','btc'].includes(c.chain) && ['private-key','recovery-phrase'].includes(c.generationMode)) || (c.chain === 'eth' && c.generationMode === 'private-key');
  for (const option of $('#engine').options) if (option.value !== 'cpu') option.disabled = !gpuAllowed;
  $('#engine').value = chooseEngine(preferredEngine==='hybrid'&&!availableGpus.hybridSupported?'all':preferredEngine, availableGpus, c.chain, c.generationMode);
  $('#workers').disabled = !['cpu','hybrid'].includes($('#engine').value);
  $('#workers').options[0].textContent=`Auto (${$('#engine').value==='hybrid'?Math.min(2,autoWorkers):autoWorkers} workers)`;
  if (availableGpus.length) $('#gpuHint').textContent = gpuAllowed ? (c.chain === 'eth' ? 'Ethereum Fast: GPU keys and EVM addresses. Export is a hex private key without a recovery phrase. Each retained key and checksummed address is independently verified.' : c.chain === 'btc' && c.generationMode === 'private-key' ? 'Bitcoin Fast: GPU keys and native SegWit addresses. Export is WIF only, without a recovery phrase. Each retained key is independently verified.' : c.chain === 'btc' ? 'Bitcoin: GPU BIP39 seed derivation and filtering; native CPU BIP84 keys and addresses. Every retained phrase is independently recovered before export.' : c.generationMode==='recovery-phrase' ? 'Solana: GPU phrase seeds, Phantom account derivation and Ed25519 search. Each retained 12-word phrase and private key is independently verified on CPU.' : 'GPU keys are generated by a local helper on this PC and verified before export. First use may compile for several seconds.') : `${availableGpus.length} NVIDIA GPUs detected. Select Fast mode for Ethereum, or either mode for Solana and Bitcoin.`;
  $('#wordCount').textContent = `${count} of ${c.words.length} words fit this network, search zone, and minimum length. Dictionary words follow the zone and minimum length; explicit end terms are always searched. ${c.exactText?'Exact text is case-sensitive.':'All matches ignore case.'}`;
  renderProbability(true);
  $('#chainHint').textContent = c.chain === 'eth' ? 'Also usable on Base, Polygon, Arbitrum and other EVM networks. Address characters: 0–9 and a–f.' : c.chain === 'btc' ? (c.generationMode === 'private-key' ? 'Mainnet bc1q address. WIF private key only; no recovery phrase. Use a wallet supporting native SegWit WIF import or sweep.' : 'Mainnet bc1q address. Export includes WIF and recovery phrase.') : 'Phantom-compatible Base58 secret key.';
}
$('#searchStyleAll').onclick=()=>{for(const [id] of SEARCH_STYLES)$('#searchStyle'+id[0].toUpperCase()+id.slice(1)).checked=false;refreshHints();persistSettings();};
$('#resetHuntFilters').onclick=()=>{
  if(running)return;
  const ids=['scope','zoneLength','splitZone','prefix','suffix','rank','requiredRepeat','ignoreRepeated','directWords','custom','fitWords','leet','only','minLength','library','discoveryRank','discoverySource','discoveryMinLength','discoveryScope','discoveryCustom','discoveryLeet','discoveryIgnoreRepeated','showWords','showRepeated','resultCategory','resultPosition','resultRank','minRepeat','resultSearch','sort',...SETTING_IDS.filter(id=>id.startsWith('pack')||id.startsWith('searchStyle'))];
  for(const id of ids){
    const control=$('#'+id);if(!control)continue;
    if(control.type==='checkbox')control.checked=control.defaultChecked;
    else if(control.tagName==='SELECT')control.value=([...control.options].find(option=>option.defaultSelected)||control.options[0]).value;
    else control.value=control.defaultValue;
  }
  selectedMatchWord='';$('#matchingWordSearch').value='';
  sort=$('#sort').value;currentPage=0;
  refreshHints();persistSettings();render();
  toast('Search and result filters reset');
};

document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => {
  const preset = button.dataset.preset;
  const repeatsOnly = preset === 'repeat' || preset === 'suffix-repeat';
  const tier = { 'tier-3': 3, 'tier-4': 4, 'tier-5': 5, 'tier-6': 6 }[preset];
  if (tier === undefined) $('#scope').value = preset === 'ends' ? 'ends' : preset === 'suffix' || preset === 'suffix-repeat' ? 'suffix' : 'any';
  if (repeatsOnly) $('#ignoreRepeated').checked = false;
  $('#requiredRepeat').value = preset === 'suffix-repeat' ? '6' : preset === 'repeat' ? '6' : '0';
  $('#rank').value = tier !== undefined ? String(tier) : preset === 'ends' ? '1' : preset === 'suffix' ? '2' : '3';
  $('#minLength').value = tier !== undefined || repeatsOnly ? '3' : preset === 'ends' ? '4' : '5';
  $('#library').checked = !repeatsOnly; $('#only').checked = true;
  $('#prefix').value = ''; $('#suffix').value = '';
  if (repeatsOnly) $('#custom').value = '';
  if (repeatsOnly) $('#resultCategory').value = 'all';
  $('#showWords').checked = !repeatsOnly; $('#showRepeated').checked = true;
  sort = repeatsOnly ? 'repeat' : 'score'; $('#sort').value = sort;
  $('#resultRank').value = '0'; $('#minRepeat').value = preset === 'suffix-repeat' ? '6' : '3';
  $('#resultSearch').value = '';
  currentPage = 0; refreshHints(); persistSettings(); render();
});
refreshHints();
async function ensureExpanded() {
  if ((!$('#packExpanded').checked && $('#resultCategory').value !== 'expanded') || expandedWords.length) return;
  dictionaryLoading = true; refreshHints();
  try { expandedWords = await loadExpandedWords(); }
  catch { $('#packExpanded').checked = false; if ($('#resultCategory').value === 'expanded') $('#resultCategory').value = 'all'; toast('Expanded English could not load. Other packs are ready.'); }
  finally { dictionaryLoading = false; refreshHints(); persistSettings(); render(); }
}
$('#packExpanded').addEventListener('change', ensureExpanded);
for (const id of ['overflowSettings', 'wordCategories', 'customMatchSettings', 'matchingWordsPanel']) $('#' + id).addEventListener('toggle', persistSettings);
for (const [id, enabled] of [['enableWordPacks', true], ['disableWordPacks', false]]) {
  $('#' + id).onclick = () => {
    document.querySelectorAll('.word-packs input[type=checkbox]').forEach(control => { control.checked = enabled; });
    if (enabled) $('#library').checked = true;
    refreshHints(); persistSettings();
    if (enabled) void ensureExpanded();
  };
}
ensureExpanded();

gpuDevices().then(devices => {
  availableGpus = devices;
  if(devices.length&&devices.hybridSupported){const option=document.createElement('option');option.value='hybrid';option.textContent='CPU + all GPUs';$('#engine').append(option);}
  if (devices.length > 1) {
    const option = document.createElement('option'); option.value = 'all'; option.textContent = `All ${devices.length} NVIDIA GPUs`; $('#engine').append(option);
  }
  for (const device of devices) {
    const option = document.createElement('option'); option.value = String(device.index); option.textContent = `GPU ${device.index} · ${device.name}`; $('#engine').append(option);
  }
  if (!devices.length) $('#gpuHint').textContent = 'No NVIDIA OpenCL GPUs detected. CPU mode is available.';
  refreshHints();
}).catch(() => { $('#gpuHint').textContent = 'GPU helper unavailable. Run Setup GPU.cmd, then restart the local website.'; }).finally(() => { gpuReady = true; refreshHints(); });
function scheduleRender(changed = false) {
  cardsDirty ||= changed;
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = undefined; const dirty = cardsDirty; cardsDirty = false; render(dirty);
  }, wallets.length + rareWallets.length > 10000 ? 1000 : 200);
}
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
function renderMatchingWords() {
  $('#matchingWordsSummary').textContent = selectedMatchWord || 'All words';
  if (!$('#matchingWordsPanel').open) return;
  const query = $('#matchingWordSearch').value.trim().toLowerCase();
  const options={showWords:$('#showWords').checked,showRepeated:$('#showRepeated').checked,minRepeat:+$('#minRepeat').value,minRank:+$('#resultRank').value,query:$('#resultSearch').value,position:$('#resultPosition').value,wordFilter:resultWordFilter($('#resultCategory').value,expandedWords)};
  const counts = matchingWordCounts(collectionView(currentWallets(),options),options);
  $('#matchingWordsSummary').textContent = `${selectedMatchWord || 'All words'} · ${counts.length.toLocaleString()} unique`;
  $('#matchingWordButtons').innerHTML = sortMatchingWords(counts, matchingWordOrder).filter(([word]) => word.includes(query)).map(([word,count,level=0,score=0,repeat=0]) => `<button type="button" data-match-word="${escape(word)}" aria-pressed="${word === selectedMatchWord}">${escape(word)} <small>${count.toLocaleString()} · ${RARITIES[level]}${matchingWordOrder==='length' ? ` · ${word.length} chars` : matchingWordOrder==='repeat' ? ` · ${repeat}× repeat` : ''}</small></button>`).join('') || '<small>No matching words in this collection.</small>';
}
$('#matchingWordsPanel').addEventListener('toggle', renderMatchingWords);
$('#matchingWordSearch').oninput = renderMatchingWords;
$('#clearMatchWord').onclick = () => { selectedMatchWord = ''; currentPage = 0; render(); };
$('#matchingWordButtons').onclick = event => {
  const button = event.target.closest('[data-match-word]'); if (!button) return;
  selectedMatchWord = selectedMatchWord === button.dataset.matchWord ? '' : button.dataset.matchWord;
  if(selectedMatchWord) $('#showWords').checked = true;
  currentPage = 0; persistSettings(); render();
};
function render(updateCards = true) {
  for (const button of document.querySelectorAll('[data-position]')) button.setAttribute('aria-pressed', String(matchFilterSelected($('#resultPosition').value, button.dataset.position)));
  $('#categorySummary').textContent = RESULT_WORD_CATEGORIES.find(([id]) => id === $('#resultCategory').value)?.[1] || 'All word categories';
  for (const button of document.querySelectorAll('[data-result-category]')) button.setAttribute('aria-pressed', String(button.dataset.resultCategory === $('#resultCategory').value));
  const shownWallets = currentWallets();
  $('#searchCount').textContent = wallets.length.toLocaleString();
  $('#rareCount').textContent = `${rareWallets.length.toLocaleString()} / ${Number($('#discoveryTarget').value).toLocaleString()}`;
  $('#searchTab').setAttribute('aria-pressed', String(activeCollection === 'search'));
  $('#rareTab').setAttribute('aria-pressed', String(activeCollection === 'rare'));
  $('#collectionNote').textContent = activeCollection === 'rare' ? 'Full-address rare finds · retained independently of search filters' : 'Your primary search matches';
  for (const button of document.querySelectorAll('[data-repeat-min]')) button.setAttribute('aria-pressed', String(!$('#showWords').checked && $('#showRepeated').checked && $('#minRepeat').value === button.dataset.repeatMin));
  $('#attempts').textContent = attempts.toLocaleString(); $('#collected').innerHTML = `${wallets.length} <span>/ ${$('#collectionMode').value==='single'?'Single':escape($('#target').value)}</span>`;
  $('#count').textContent = shownWallets.length; $('#export').disabled = !shownWallets.length || exportBusy;
  $('#exportBoth').disabled = !(wallets.length || rareWallets.length) || exportBusy;
  $('#clearBoth').disabled = !(wallets.length || rareWallets.length) || running; $('#clear').disabled = !shownWallets.length || running;
  if (!updateCards) return;
  renderMatchingWords();
  const best = shownWallets.reduce((best, w) => !best || w.level > best.level || (w.level === best.level && w.score > best.score) ? w : best, null); $('#best').textContent = best?.rank || '—';
  const categoryFilter = resultWordFilter($('#resultCategory').value, expandedWords);
  const selectedWordFilter = selectedMatchWord ? word => word.toLowerCase() === selectedMatchWord && (!categoryFilter || categoryFilter(word)) : categoryFilter;
  const ordered = collectionView(shownWallets, { showWords: $('#showWords').checked, showRepeated: $('#showRepeated').checked, sort, minRepeat: +$('#minRepeat').value, minRank: +$('#resultRank').value, query: $('#resultSearch').value, position: $('#resultPosition').value, wordFilter: selectedWordFilter });
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  currentPage = Math.min(currentPage, pageCount - 1);
  $('#previousPage').disabled = currentPage === 0;
  $('#nextPage').disabled = currentPage >= pageCount - 1;
  $('#pageInfo').textContent = ordered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, ordered.length)} of ${ordered.length.toLocaleString()} shown / ${shownWallets.length.toLocaleString()} collected · Page ${currentPage + 1} / ${pageCount}` : 'No results match these toggles';
  if (!shownWallets.length) { $('#cards').innerHTML = `<div class="empty"><div class="orb">✧</div><h3>${running ? 'Looking for your next gem…' : 'Great wallets start with a little luck.'}</h3><p>${running ? 'Your browser is generating fresh keys and checking every address.' : 'Choose a network, set your filters, and start the hunt.<br>Your unique finds will appear here.'}</p><div class="example">SoL…moon <span>✦ ULTRA</span></div></div>`; return; }
  if (!ordered.length) { $('#cards').innerHTML = '<div class="empty"><h3>No results match these toggles.</h3><p>Adjust the search text, word/repeat toggles, minimum rarity, or repeat length to display matching wallets. Your full collection is retained for export.</p></div>'; return; }
  $('#cards').innerHTML = ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(w => `<article class="wallet"><div class="wallet-info">${walletValueMarkup(w)}<code class="address-preview" aria-label="Address ends and all matched regions; open details for the full address">${highlightedAddress(w)}</code><div class="wallet-meta">${discoveryMeta(w)}<span class="network">${CHAINS[w.chain].symbol}</span><span class="badge ${w.rank.toLowerCase()}">${w.rank}</span><span class="muted">${w.phrase ? 'Phrase' : 'Key only'}</span><small>${w.streak >= 3 ? `${w.streak}× repeat` : w.hits.length ? `${longestWord(w)}-char word` : 'Fresh'}</small><small title="Estimated difficulty: ${w.quality?.difficultyBits ?? 0} bits · Casing: ${w.quality?.casing ?? 'legacy'} (+${w.quality?.casingBonus ?? 0}) · Readability: ${w.quality?.readability ?? 0} · Desirability: ${w.quality?.desirability ?? 0} · Pattern bonus: ${w.quality?.patternBonus ?? 0}">${w.score.toFixed(1)} pts</small><small title="Separate matched regions in the hunt’s search zone; overlapping highlights count once">${matchCount(w)} matches</small></div></div><div class="wallet-reasons" title="${escape([...w.hits, ...(w.streak >= 3 ? [`${w.streak} repeats`] : [])].join(', '))}">${w.hits.map(h => `<span class="hit">${escape(h)}</span>`).join('')}${w.streak >= 3 ? `<span class="hit">${w.streak} repeats</span>` : ''}${!w.hits.length && w.streak < 3 ? '<span class="muted">Fresh wallet</span>' : ''}</div><button data-address="${escape(w.address)}" class="inspect-wallet" title="View wallet details" aria-label="View wallet details">${inspectIcon}</button></article>`).join('');
}
let forceStopTimer;
function finish(message) {
  if(runStats.run?.source==='gpu'&&!pool?.token)runStats.cancel();else runStats.finish();
  clearTimeout(forceStopTimer);
  clearTimeout(renderTimer); renderTimer = undefined; cardsDirty = false;
  running = false; $('#fields').disabled = false; $('#generate').hidden = false;
  $('#stop').hidden = true; $('#stop').disabled = false; $('#stop').textContent = '■ Stop hunt';
  $('#status').textContent = message; refreshHints(); render();
}
function stop() {
  if (!pool?.active) return;
  if (pool.stopping) {
    $('#stop').disabled = true;
    $('#status').textContent = 'Force stopping - keeping collected wallets...';
    pool.forceStop(); return;
  }
  $('#stop').disabled = true; $('#stop').textContent = 'Stopping...';
  const stoppingPool = pool;
  forceStopTimer = setTimeout(() => {
    if (pool === stoppingPool && pool.active) { $('#stop').disabled = false; $('#stop').textContent = 'Force stop'; }
  }, 2000);
  $('#status').textContent = 'Stopping - finishing verified matches...'; pool.stop();
}
$('#config').addEventListener('submit', e => {
  e.preventDefault();
  const invalidInput = typedSearchError(Object.fromEntries([...TYPED_SEARCH_FIELDS.map(field=>field.id),'chain','discoveryRank','discoverySource'].map(id=>[id,$('#'+id).value])));
  if (invalidInput) {
    for (const update of updateNetworkInputs) update();
    const input = $('#'+invalidInput.id);
    for (let parent=input.parentElement; parent; parent=parent.parentElement) if(parent.tagName==='DETAILS') parent.open=true;
    input.focus(); toast(invalidInput.message); return;
  }
  const c = config();
  if (!Number.isInteger(c.target) || c.target < 1 || c.target > MAX_COLLECTION) { toast('Enter a collection target from 1 to 999999.'); return; }
  if (c.discoveryRank && (!Number.isInteger(+$('#discoveryTarget').value) || +$('#discoveryTarget').value < 1 || +$('#discoveryTarget').value > RARE_CAPACITY)) { toast('Enter an overflow limit from 1 to 999999.'); return; }
  try { const rare=discoveryConfig(c.chain,c.discoveryRank,c.discoveryOptions);
    if(rare&&!rare.words.length&&(rare.ignoreRepeated||['both','joined'].includes(rare.scope))){toast('No overflow words fit these settings. Choose a word source, shorter minimum, or wider zone.');return;}
  } catch(error) {toast(error.message);return;}
  if (c.discoveryRank && c.discoveryRemaining <= 0) { toast('Increase the overflow limit or export and clear Rare finds first.'); return; }
  if ((!c.singleResult && !c.keepBest && wallets.length >= c.target) || (c.keepBest && wallets.length > c.target)) { toast('Increase the collection target or clear your collection first.'); return; }
  if (![c.prefix,c.suffix].every(w => possible(w,c.chain,c.leet))) { toast('A filter contains characters this network cannot produce.'); return; }
  if(c.exactText&&![c.prefix,c.suffix].every(word=>[...word].every(char=>CHAINS[c.chain].alphabet.includes(char)))){toast('Exact text contains characters this network cannot generate. Solana excludes 0, O, I and lowercase l.');return;}
  if (dictionaryLoading || !gpuReady) return;
  if (c.requiredRepeat > Math.min(SEARCH_ZONES[c.scope].length, { sol: 44, eth: 40, btc: 38 }[c.chain])) { toast('The required repeat is longer than this search zone. Choose Anywhere.'); return; }
  if (c.scope !== 'any' && c.minLength > SEARCH_ZONES[c.scope].length && c.onlyMatches && !c.prefix && !c.suffix) { toast('Minimum word length is larger than the selected search zone.'); return; }
  if(c.directSearch && c.requestedWords.some(word=>!/^[a-z0-9]{2,44}$/i.test(word))){toast('Direct words must be 2–44 letters or digits, separated by commas or spaces.');return;}
  if(c.directSearch && eligibleWords(c).length!==c.words.length){toast('Some direct words cannot fit this network or search zone. Adjust the zone or words so every term can be searched.');return;}
  c.words = eligibleWords(c);
  if (c.keepBest) c.bestExisting = wallets.map(({chain,address,level,score}) => ({chain,address,level,score}));
  else c.target = collectionTarget(c.singleResult?'single':'fill',c.target,wallets.length);
  probabilityTrials=0;probabilityMatches=0;lastRate=0;renderProbability();
  baseAttempts = attempts; started = performance.now(); running = true;
  $('#fields').disabled = true; $('#generate').hidden = true; $('#stop').hidden = false; $('#status').textContent = '● Generating locally…';
  const hybrid=$('#engine').value==='hybrid';
  const workerCount = $('#workers').value === 'auto' ? (hybrid?Math.min(2,autoWorkers):autoWorkers) : +$('#workers').value;
  c.cpuWorkers=hybrid?workerCount:0;
  const useGpu = $('#engine').value !== 'cpu';
  c.runId=runStats.begin(useGpu?'gpu':'cpu');
  const selectedGpus = ['all','hybrid'].includes($('#engine').value) ? availableGpus.map(d => d.index) : [+$('#engine').value];
  if (useGpu) $('#status').textContent = '● Preparing GPUs · compiling and verifying keys…';
  const Pool = useGpu ? GpuPool : SearchPool;
  pool = new Pool({
    devices: selectedGpus,
    createWorker: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
    onProgress: data => {
      runStats.progress(data.attempts,data.elapsedMs,data.done);
      if(!useGpu)for(const wallet of [...data.wallets,...(data.rareWallets||[])]){wallet.discoveryElapsedMs ??= Math.round(performance.now()-started);wallet.discoveryRunId ??= c.runId;}
      // CPU results are flushed in bounded batches, retaining failed saves for retry.
      if (!useGpu || data.error) {
        pendingSaves.push(...data.wallets,...(data.rareWallets || []));
        if (!saveFailed) void flushSaves();
      }
      if(useGpu && !data.error)markWalletsSaved([...data.wallets,...(data.rareWallets || [])]);
      attempts = baseAttempts + data.attempts;
      if (data.removed?.length) { const removed = new Set(data.removed); wallets = wallets.filter(w => !removed.has(`${w.chain}:${w.address}`)); }
      for (const wallet of data.wallets) wallets.push(wallet);
      for (const wallet of data.rareWallets || []) rareWallets.push(wallet);
      probabilityTrials=data.attempts;probabilityMatches+=data.wallets.length;
      lastRate=data.attempts/((performance.now()-started)/1000);renderProbability();
      $('#speed').textContent = `${Math.round(data.attempts / ((performance.now()-started)/1000)).toLocaleString()} addresses / sec · ${useGpu ? `${selectedGpus.length} GPU${selectedGpus.length === 1 ? '' : 's'}${hybrid?` + ${workerCount} CPU workers`:''}` : `${workerCount} workers`}`;
      if (useGpu && data.ready && !pool.stopping) $('#status').textContent = `● Generating locally · ${data.ready} GPU${data.ready === 1 ? '' : 's'} ready${hybrid?` + ${workerCount} CPU workers`:''}`;
      scheduleRender(data.wallets.length > 0 || data.rareWallets?.length > 0 || data.removed?.length > 0);
      if (c.keepBest && wallets.length >= c.target && !pool.stopping) $('#status').textContent = '● Keeping the best · weaker finds are replaced · Stop to finish';
    },
    onFinish: reason => finish(reason === 'forced' ? 'Force stopped - collected wallets retained; unfinished candidates discarded' : reason === 'rare-limit' ? '● Rare-find overflow limit reached · export your collections' : reason === 'target' ? (c.singleResult?'● Single result found · hunt stopped':'● Target reached · export your keepers') : '● Hunt stopped · collection retained'),
    onError: message => finish('Generation failed: ' + message),
  });
  pool.start(c, workerCount, wallets.map(w => `${w.chain}:${w.address}`), rareWallets.map(w => `${w.chain}:${w.address}`)); render();
});
for (const [id, name] of [['#searchTab', 'search'], ['#rareTab', 'rare']]) $(id).onclick = () => {
  activeCollection = name; currentPage = 0;
  // Avoid a previous repeat-only filter making an independently captured word invisible.
  $('#showWords').checked = true; $('#showRepeated').checked = true;
  $('#resultRank').value = '0'; $('#minRepeat').value = '3'; $('#resultSearch').value = '';
  sort = 'score'; $('#sort').value = sort; persistSettings(); render();
};
$('#stop').onclick = () => stop(); $('#sort').onchange = e => { sort = e.target.value; currentPage = 0; render(); };
document.querySelectorAll('[data-repeat-min]').forEach(button => button.onclick = () => {
  $('#resultCategory').value = 'all';
  $('#showWords').checked = false; $('#showRepeated').checked = true;
  $('#minRepeat').value = button.dataset.repeatMin;
  $('#resultRank').value = '0'; $('#resultSearch').value = '';
  sort = 'repeat'; $('#sort').value = sort;
  currentPage = 0; persistSettings(); render();
});
document.querySelectorAll('[data-position]').forEach(button => button.onclick = () => {
  $('#resultPosition').value = toggleMatchFilter($('#resultPosition').value, button.dataset.position); currentPage = 0; persistSettings(); render();
});
document.querySelectorAll('[data-result-category]').forEach(button => button.onclick = () => {
  $('#resultCategory').value = button.dataset.resultCategory;
  if ($('#resultCategory').value !== 'all') $('#showWords').checked = true;
  currentPage = 0; persistSettings(); render(); ensureExpanded();
});
$('#resultSearch').addEventListener('input', () => { currentPage = 0; scheduleRender(true); });
for (const id of ['#showWords', '#showRepeated', '#resultRank', '#minRepeat']) $(id).onchange = () => {
  if (id === '#minRepeat') { $('#resultCategory').value = 'all'; $('#showWords').checked = false; $('#showRepeated').checked = true; sort = 'repeat'; $('#sort').value = sort; }
  if ((id === '#showWords' || id === '#showRepeated') && $('#showRepeated').checked && !$('#showWords').checked) { sort = 'repeat'; $('#sort').value = sort; $('#resultCategory').value = 'all'; }
  currentPage = 0; persistSettings(); render();
};
$('#clearBoth').onclick = () => {
  if(running)return;
  if(confirm('Clear Search matches and Rare finds? Project-folder saves and exports remain saved.')){
    wallets=[];rareWallets=[];selectedMatchWord='';currentPage=0;render();
  }
};
$('#clear').onclick = () => { if (confirm('Clear this tab’s collection? Project-folder saves remain in Saved collection.')) { if (activeCollection === 'rare') rareWallets = []; else wallets = []; currentPage = 0; render(); } };
$('#pageSize').onchange = e => { pageSize = +e.target.value; currentPage = 0; render(); };
$('#previousPage').onclick = () => { if (currentPage > 0) { currentPage--; render(); } };
$('#nextPage').onclick = () => { if (!$('#nextPage').disabled) { currentPage++; render(); } };
async function download(items,importBatch=false) {
  if(exportBusy)return;
  exportBusy=true;render(false);
  const snapshot=[...items];
  try {
    const result=await exportCollection(snapshot,importBatch);
    toast('Saved '+result.count+' wallets to '+result.path+(result.batchId?' · Imported into Saved collection':''));
  } catch(error) { toast(error.message); }
  finally {exportBusy=false;render(false);}
}

$('#exportBoth').onclick = () => { if(!exportBusy && confirm('Export Search matches and Rare finds together with unencrypted keys? Duplicate wallets are included once.')) void download([...wallets,...rareWallets],$('#exportAlsoImport').checked); };
$('#export').onclick = () => { if (confirm('Save an unencrypted export with private keys and recovery phrases inside the project folder?')) download(currentWallets(),$('#exportAlsoImport').checked); };
const guide = `<h2>Import into your wallet</h2><p>In Phantom, use Add / Connect Wallet → Import Private Key for Solana or Ethereum and select the matching network. Menu labels can vary by app version.</p><p>For Bitcoin recovery mode, use the 12-word recovery phrase through Phantom’s recovery-phrase import flow. Bitcoin Fast exports only WIF: use a wallet supporting native SegWit WIF import or sweeping. WIF is included for wallets that support it; do not paste WIF into a Solana or Ethereum key field.</p><p>Choose the first account and verify its address exactly matches your exported address before funding it. Bitcoin uses native SegWit (BIP84). If Phantom does not discover that address, use a wallet supporting the displayed derivation path.</p><p>Recovery-phrase mode creates an independent phrase for each result, with no additional passphrase. Fast mode creates a private key only: import the exported key on that network. There is no recovery phrase in Fast mode. Bitcoin Fast WIF is not a promised Phantom import option.</p>`;
$('#help').onclick = () => { $('#dialogBody').innerHTML = guide; $('#detail').showModal(); };
$('.close').onclick = () => { $('#detail').close(); $('#dialogBody').replaceChildren(); selected = undefined; };
$('#detail').addEventListener('close', () => { $('#dialogBody').replaceChildren(); selected = undefined; });
$('#cards').onclick = e => {
  const button = e.target.closest('button[data-address]'); if (!button) return;
  selected = currentWallets().find(w => w.address === button.dataset.address);
  $('#dialogBody').innerHTML = `<div class="eyebrow">${CHAINS[selected.chain].name} / ${selected.rank}</div><h2>Your wallet, your keys.</h2><p class="warning">Private keys and recovery phrases give full access to funds. Keep them secret. Exports are unencrypted.</p><p>Quality: ${selected.score.toFixed(2)} · estimated pattern difficulty: ${selected.quality?.difficultyBits ?? 0} bits · ${selected.quality?.independentPatterns ?? 0} independent patterns. This is a ranking estimate, not exact odds or wallet value.</p><label>PUBLIC ADDRESS</label><code class="secret">${highlightedAddress(selected, false)}</code><label>MATCHED WORDS & PATTERNS</label>${matchTags(selected)}<label>DERIVATION PATH</label><code>${escape(selected.path || 'Direct random key — no derivation path')}</code><div id="secrets"><button class="primary" id="reveal">Reveal private key${selected.phrase ? ' & recovery phrase' : ''}</button></div><button id="exportOne">↓ Export this wallet</button>`;
  $('#reveal').onclick = () => { $('#secrets').innerHTML = `<label>${escape(selected.format)}</label><code class="secret">${escape(selected.privateKey)}</code>${selected.phrase ? `<label>12-WORD RECOVERY PHRASE</label><code class="secret">${escape(selected.phrase)}</code>` : '<p class="warning">Fast mode: this wallet has no recovery phrase. Import and back up the private key.</p>'}<p class="hint">Import guide is available at the bottom of the page. Verify the address before funding.</p>`; };
  $('#exportOne').onclick = () => download([selected]); $('#detail').showModal();
};
window.addEventListener('beforeunload', e => { if (pendingSaves.length || running) { e.preventDefault(); e.returnValue = ''; } });
render();
