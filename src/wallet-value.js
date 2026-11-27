// User-supplied asking-price model, deliberately independent of rarity scores.
// This is not a market quote or a prediction that a wallet will sell.
export function estimatedSolValue(wallet){
  if(wallet.chain!=='sol')return null;
  const length=Math.max(0,Number.isInteger(wallet.streak)?wallet.streak:0,...(wallet.hits||[]).filter(word=>typeof word==='string'&&/^[a-z0-9]+$/i.test(word)).map(word=>word.length));
  if(length<2||length>44)return null;
  return {length,sol:2**(length-6)};
}
export function walletValueMarkup(wallet){
  const estimate=estimatedSolValue(wallet);
  if(!estimate)return '';
  const amount=estimate.sol.toLocaleString(undefined,{maximumFractionDigits:4});
  return `<span class="wallet-value" title="Custom length-based estimate: ${estimate.length}-character longest word or repeat. 6 = 1 SOL; doubles per extra character, halves per fewer character. Separate matches are not added together. Casing, substitutions, position and buyer demand are not priced. Not a verified market price or guaranteed sale."><small>Est.</small> ${amount} <small>SOL</small></span>`;
}
