const savedWallets = new WeakSet();
export function markWalletsSaved(wallets) { for(const wallet of wallets)savedWallets.add(wallet); }
export function uniqueWallets(wallets) {
  const unique=new Map();
  for(const wallet of wallets){
    const id=`${wallet.chain}:${wallet.address}`,old=unique.get(id);
    if(!old){unique.set(id,wallet);continue;}
    const best=wallet.score>old.score?wallet:old;
    unique.set(id,{...best,privateKey:old.privateKey,phrase:old.phrase,created:old.created,
      hits:[...new Set([...old.hits,...wallet.hits])],streak:Math.max(old.streak,wallet.streak),
      highlights:[...new Map([...(old.highlights||[]),...(wallet.highlights||[])].map(h=>[JSON.stringify(h),h])).values()],
      display:{head:Math.max(old.display?.head||6,wallet.display?.head||6),tail:Math.max(old.display?.tail||6,wallet.display?.tail||6)}});
  }
  return [...unique.values()];
}
export async function savedRequest(path,body) {
  const response=await fetch('/api/saved/'+path,{method:body?'POST':'GET',headers:{'X-Wallet-Forge':'local','Content-Type':'application/json'},cache:'no-store',body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error || 'Project-folder save failed.');return data;
}
export async function saveCollection(wallets,batchId) {
  const unique=uniqueWallets(wallets);
  for(let start=0;start<unique.length;start+=500)await savedRequest('collect',{wallets:unique.slice(start,start+500),batchId});
  markWalletsSaved(wallets);
}
export async function exportCollection(wallets,importBatch=false) {
  const unique=uniqueWallets(wallets);
  const unsaved=new Set(wallets.filter(w=>!savedWallets.has(w)).map(w=>`${w.chain}:${w.address}`));
  await saveCollection(unique.filter(w=>unsaved.has(`${w.chain}:${w.address}`)));
  markWalletsSaved(wallets);
  return savedRequest('export',{ids:unique.map(w=>`${w.chain}:${w.address}`),importBatch});
}
