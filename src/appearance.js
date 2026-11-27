export function installAppearance(){
  const key='wallet-forge.theme';
  let theme='dark';
  try{theme=localStorage.getItem(key)==='forest'?'forest':'dark';}catch{}
  const header=document.querySelector('header');
  const button=document.createElement('button');
  button.type='button';button.className='theme-toggle';
  const apply=()=>{document.documentElement.dataset.theme=theme;button.textContent=theme==='dark'?'Theme: Dark':'Theme: Forest';button.setAttribute('aria-label',`Current theme: ${theme}. Switch to ${theme==='dark'?'forest':'dark'} theme`);};
  button.onclick=()=>{theme=theme==='dark'?'forest':'dark';apply();try{localStorage.setItem(key,theme);}catch{}};
  header.append(button);apply();
  window.addEventListener('storage',event=>{if(event.key===key){theme=event.newValue==='forest'?'forest':'dark';apply();}});
  new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',`${header.getBoundingClientRect().height}px`)).observe(header);
}
