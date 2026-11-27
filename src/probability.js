import { SEARCH_ZONES } from './search-zones.js';
import { CHAINS } from './wallet.js';
import { wordBits } from './quality.js';
import { matches } from './text-match.js';

// Pattern estimates, not quality-score odds. Address positions are approximated
// as independent uniform draws; SOL leading bytes and BTC checksums are not.
export function estimatePattern(config){
  if(config.exactText)return {unavailable:'Exact-case odds are not yet estimated.'};
  if(config.searchStyles?.length)return {unavailable:'Style-specific odds are not yet estimated.'};
  if(config.scope==='both')return {unavailable:'Both-ends word combinations need a separate joint estimate.'};
  const size={sol:44,eth:40,btc:38}[config.chain],zone=Math.min(size,SEARCH_ZONES[config.scope].length);
  const alphabet=[...CHAINS[config.chain].alphabet];
  const anchors=[];
  if(config.prefix)anchors.push([0,config.prefix]);
  if(config.suffix)anchors.push([size-config.suffix.length,config.suffix]);
  function eventProbability(word,start,joined=false){
    const requirements=new Map();
    const add=(at,text,join=false)=>{
      for(let i=0;i<text.length;i++){
        const position=join&&i>=4?size-4+i-4:at+i;
        if(position<0||position>=size)return false;
        requirements.set(position,(requirements.get(position)||alphabet).filter(c=>matches(c,text[i],config.leet)));
      }
      return true;
    };
    for(const [at,text] of anchors)if(!add(at,text))return 0;
    if(word&&!add(start,word,joined))return 0;
    return [...requirements.values()].reduce((p,chars)=>p*chars.length/alphabet.length,1);
  }
  if(anchors.length&&!config.directSearch)return {probability:eventProbability('',0),unionBound:false};
  if(!config.words.length)return {unavailable:'Choose word targets or explicit ends to estimate word-match odds.'};
  if(anchors.length&&config.words.length>128)return {unavailable:'Use 128 or fewer direct words for a combined word-and-anchor estimate.'};
  let probability=0,events=0;
  for(const word of new Set(config.words)){
    if(word.length<config.minLength||word.length>zone||(config.scope==='joined'&&word.length!==8))continue;
    const positions=config.scope==='joined'?[0]:config.scope==='ends'?
      [0,size-4].flatMap(start=>Array.from({length:5-word.length},(_,i)=>start+i)):
      Array.from({length:zone-word.length+1},(_,i)=>(config.scope.startsWith('first')||config.scope==='any'?0:size-zone)+i);
    events+=positions.length;
    probability+=anchors.length?positions.reduce((p,start)=>p+eventProbability(word,start,config.scope==='joined'),0):positions.length*2**-wordBits(word,config.chain,config.leet);
  }
  return {probability:Math.min(1,probability),unionBound:events>1};
}
export function trialsForChance(probability,chance=.5){
  if(probability<=0)return Infinity;if(probability>=1)return 1;
  return Math.ceil(Math.log1p(-chance)/Math.log1p(-probability));
}


export function chanceAfterTrials(probability,trials){
  if(!Number.isFinite(trials)||trials<0||!Number.isFinite(probability)||probability<0||probability>1)return 0;
  if(trials===0||probability===0)return 0;
  if(probability===1)return 1;
  return -Math.expm1(trials*Math.log1p(-probability));
}
