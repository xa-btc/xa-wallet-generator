import { SEARCH_ZONES } from './search-zones.js';

export function fitTypedWord(word,scope,enabled=true,end){
  if(!enabled||scope==='any'||scope==='joined')return word;
  const length=SEARCH_ZONES[scope]?.length;
  if(!length||word.length<=length)return word;
  if(end==='first'||(!end&&scope.startsWith('first')))return word.slice(0,length);
  if(end==='last'||(!end&&(scope.startsWith('last')||scope==='suffix')))return word.slice(-length);
  return word;
}

export function collectionTarget(mode,target,existing=0){
  if(mode==='single')return 1;
  return mode==='best'?target:target-existing;
}
