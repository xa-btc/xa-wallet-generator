// Reuse and focus the two local pages without reloading an active hunt.
export function installTabNavigation() {
  document.addEventListener('click', event => {
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('header a[target]');
    if(!link||!['xa-wallet-generator-generator','xa-wallet-generator-saved'].includes(link.target))return;
    if(link.target===window.name){event.preventDefault();return;}
    const tab=window.open('',link.target);
    if(!tab)return;
    event.preventDefault();
    try { if(tab.location.href==='about:blank')tab.location.replace(link.href); }
    catch { tab.location=link.href; }
    tab.focus();
  });
}
