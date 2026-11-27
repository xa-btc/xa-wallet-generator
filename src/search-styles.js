export const SEARCH_STYLES=[['caps','CAPS'],['proper','Proper'],['lowercase','lower'],['scattered','sCaTter'],['replacement','L33t']];
export function isLowercaseMatch(text,word,chain){
  return (!word||text.toLowerCase()===word.toLowerCase())&&(chain==='sol'?/^[a-zL]+$/:/^[a-z]+$/).test(text);
}
export function searchStyle(text,word,chain){
  if(word&&text.toLowerCase()!==word.toLowerCase())return 'replacement';
  // Base58 has no uppercase I/O or lowercase l. Prefer the highest valid style
  // when mandatory letter forms make more than one casing indistinguishable.
  if(chain==='sol'&&/^[A-Za-z]+$/.test(text)){
    if(/^[A-Zio]+$/.test(text))return 'caps';
    if(/^[A-Zio][a-zL]+$/.test(text))return 'proper';
    if(/^[a-zL]+$/.test(text))return 'lowercase';
    return 'scattered';
  }
  if(/^[A-Z]+$/.test(text))return 'caps';
  if(/^[A-Z][a-z]+$/.test(text))return 'proper';
  if(/^[a-z]+$/.test(text))return 'lowercase';
  if(/[A-Z]/.test(text)&&/[a-z]/.test(text))return 'scattered';
  return null;
}
export function acceptsStyle(text,word,styles,chain){return !styles?.length||styles.includes(searchStyle(text,word,chain))||(styles.includes('lowercase')&&isLowercaseMatch(text,word,chain));}
