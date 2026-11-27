import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_CATEGORIES, THEME_WORD_PACKS, THEME_SETTING_IDS } from '../src/theme-words.js';
import { selectedWords, RESULT_WORD_CATEGORIES, resultWordFilter } from '../src/word-packs.js';
import { SETTING_IDS, saveSettings, readSettings } from '../src/settings.js';
import { compileMatcher } from '../src/matching.js';
import { discoveryConfig } from '../src/discovery.js';
import { HISTORICAL_DEFINITIONS } from '../src/historical-words.js';

test('given names, surnames and full names are independent searchable terms with independent difficulty',()=>{
  for(const [category,given,surname,full] of [['historicNotorious','adolf','hitler','adolfhitler'],['historicScience','nikola','tesla','nikolatesla'],['historicScience','marie','curie','mariecurie'],['historicArtists','leonardo','davinci','leonardodavinci'],['historicWriters','william','shakespeare','williamshakespeare']]){
    const words=selectedWords({[category]:true});
    const match=compileMatcher('sol',{scope:'any',minLength:2,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0,words});
    for(const word of [given,surname,full])assert.ok(words.includes(word),word);
    const first=match('xyz'+given+'xyz'),whole=match('xyz'+full+'xyz');
    assert.ok(first.keep);assert.ok(first.hits.includes(given));
    assert.ok(!first.hits.includes(full));assert.ok(whole.score>first.score);
    assert.ok(discoveryConfig('sol',4).words.includes(given));
  }
});

test('historical packs span eras and roles with full names and deliberate short aliases',()=>{
  const examples={historicRulers:['hatshepsut','wuzetian','mansamusa','ashoka','cleopatra','nelsonmandela'],historicMilitary:['hannibal','yisunsin','subutai','ranilakshmibai','georgyzhukov'],historicScience:['hypatia','alkhwarizmi','nikolatesla','tesla','mariecurie','adalovelace','tuyouyou'],historicArtists:['leonardodavinci','davinci','hokusai','fridakahlo','zahahadid'],historicWriters:['enheduanna','confucius','shakespeare','tagore','chinuaachebe','octaviabutler'],historicReformers:['buddha','gurunanak','harriettubman','sophiescholl','wangarimaathai'],historicExplorers:['zhenghe','ibnbattuta','sacagawea','ameliaearhart','yurigagarin'],historicNotorious:['adolfhitler','josephstalin','polpot','blackbeard','alcapone','berniemadoff']};
  assert.equal(HISTORICAL_DEFINITIONS.length,8);
  for(const [id,names] of Object.entries(examples)){
    const words=selectedWords({[id]:true});
    for(const name of names){
      assert.ok(words.includes(name),`${id}: ${name}`);
      assert.ok(resultWordFilter(id)(name.toUpperCase()));
    }
    const word=names[0],match=compileMatcher('sol',{scope:'any',minLength:2,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0,words})('xyz'+word+'xyz');
    assert.ok(match.hits.includes(word));
  }
  for(const fragment of ['ompson','thegreat','albertasc','shizhen'])assert.ok(!selectedWords({historicScience:true,historicRulers:true}).includes(fragment),fragment);
});

test('every new category is selectable, filterable, persistent, and present in rare discovery',()=>{
  assert.ok(THEME_CATEGORIES.length>=35);
  const rare=new Set(discoveryConfig('sol',4).words);
  for(const [id,label] of THEME_CATEGORIES){
    const words=THEME_WORD_PACKS[id];
    assert.ok(label.length>0);assert.ok(words.length>=50,id);
    assert.deepEqual(selectedWords({[id]:true}),words);
    assert.equal(words.length,new Set(words).size);
    assert.ok(words.every(w=>/^[a-z0-9]{2,44}$/.test(w)),id);
    assert.ok(RESULT_WORD_CATEGORIES.some(([key])=>key===id));
    assert.ok(SETTING_IDS.includes(`packTheme_${id}`));
    const filter=resultWordFilter(id);
    for(const word of words){
      assert.ok(filter(word.toUpperCase()),`${id}: ${word}`);
      if(word.length>=3)assert.ok(rare.has(word),`${id}: ${word}`);
    }
  }
  const all=selectedWords(Object.fromEntries(THEME_CATEGORIES.map(([id])=>[id,true])));
  assert.ok(all.length>6000);assert.equal(all.length,new Set(all).size);
  let saved;const storage={setItem:(_,value)=>{saved=value;},getItem:()=>saved};
  const choices=Object.fromEntries(THEME_SETTING_IDS.map((id,i)=>[id,i%2===0]));
  saveSettings(storage,choices);assert.deepEqual(readSettings(storage),choices);
});

test('themed names match exact zones with case and digit aliases without changing rarity rules',()=>{
  const examples={sports:'tennis',teams:'lakers',athletes:'messi',motorsport:'senna',combat:'canelo',sportEvents:'worldcup2026',events:'grammys',holidays:'diwali',tradingCards:'topps',toys:'labubu',sneakers:'yeezy',watches:'rolex',collectibles:'banksy',comics:'venom',anime:'naruto',gaming:'zelda',esports:'faker',popMusic:'sabrina',hiphop:'drake',rockMusic:'nirvana',countryMusic:'ellalangley',globalMusic:'badbunny',kpop:'jennie',electronic:'avicii',house:'fisher',techno:'amelielens',trance:'astrix',bassMusic:'rezz',drumBass:'hedex',festivals:'edc',musicGear:'moog',filmTV:'grogu',automotive:'supra',spaceScience:'orion',foodDrink:'sushi',fantasy:'dragon'};
  for(const [id,word] of Object.entries(examples)){
    const config={scope:word.length<=6?'suffix':'any',minLength:2,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0,words:selectedWords({[id]:true})};
    const match=compileMatcher('sol',config)('X'.repeat(32)+word.toUpperCase().replaceAll('S','5').replaceAll('I','1'));
    assert.ok(match.keep,id);assert.ok(match.hits.includes(word),`${id}: ${word}`);
    assert.ok(match.highlights.some(h=>h.reason===`Word: ${word}`));
  }
  const words=selectedWords({electronic:true,drumBass:true,bassMusic:true});
  for(const fragment of ['pl','ur','dv','lm','gy','ul','triti'])assert.ok(!words.includes(fragment),fragment);
});

test('AI category supports independent selection, saved filters, settings and overflow',()=>{
  const words=selectedWords({ai:true});
  for(const word of ['chatgpt','agi','llm','qwen','copilot','pytorch','inference','embeddings','skynet','hal9000','sam','altman','samaltman']){
    assert.ok(words.includes(word),word);
    assert.ok(resultWordFilter('ai')(word.toUpperCase()));
  }
  assert.ok(!selectedWords({}).includes('chatgpt'));
  assert.ok(SETTING_IDS.includes('packTheme_ai'));
  assert.ok(RESULT_WORD_CATEGORIES.some(([id])=>id==='ai'));
  assert.ok(discoveryConfig('sol',4).words.includes('chatgpt'));
  const matcher=compileMatcher('sol',{scope:'any',minLength:2,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:0,words});
  assert.ok(matcher('xyzChatGPTxyz').hits.includes('chatgpt'));
});
