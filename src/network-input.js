import { CHAINS } from './wallet.js';

export const TYPED_SEARCH_FIELDS = [
  { id:'prefix', label:'Starts with', list:false },
  { id:'suffix', label:'Ends with', list:false },
  { id:'directWords', label:'Direct words', list:true },
  { id:'custom', label:'Custom words', list:true },
  { id:'discoveryCustom', label:'Overflow words', list:true },
];

// Validate the original text, before case folding, trimming words to a zone,
// or filtering dictionaries can hide an unsupported character.
export function searchCharacters(text, chain, { list = false } = {}) {
  const alphabet = CHAINS[chain]?.alphabet;
  if (!alphabet) throw new Error('Unknown chain');
  const first = text.search(/\S/), last = text.trimEnd().length;
  let index = 0;
  return [...text].map(char => {
    const separator = list ? /[\s,]/.test(char) : /\s/.test(char) && (index < first || index >= last);
    const literal = alphabet.includes(chain === 'sol' ? char : char.toLowerCase());
    const invalid = !separator && !literal;
    const item = { char, index, invalid };
    index += char.length;
    return item;
  });
}

export function searchCharacterError(text, chain, options = {}) {
  const invalid = [...new Set(searchCharacters(text, chain, options).filter(c => c.invalid).map(c => c.char))];
  if (!invalid.length) return '';
  const shown = invalid.slice(0, 8).map(c => JSON.stringify(c)).join(', ');
  return `${CHAINS[chain].name} cannot use ${shown}${invalid.length > 8 ? ', …' : ''}. Remove or replace the red characters before searching.`;
}

export function typedSearchError(values) {
  const direct = (values.directWords || '').split(/[\s,]+/).some(Boolean);
  const overflow = Number(values.discoveryRank) > 0, source = values.discoverySource;
  for (const field of TYPED_SEARCH_FIELDS) {
    if (field.id === 'custom' && direct && !(overflow && source === 'library')) continue;
    if (field.id === 'discoveryCustom' && !(overflow && source === 'custom')) continue;
    const message = searchCharacterError(values[field.id] || '', values.chain, {list:field.list});
    if (message) return {id:field.id,message:field.label+': '+message};
  }
  return null;
}

// Keep native inputs for selection, keyboard editing, paste, IME and form labels.
// A pointer-transparent mirror provides per-character colors, which inputs lack.
export function installNetworkInput(input, getOptions) {
  const wrapper = document.createElement('div');
  wrapper.className = 'network-input';
  input.before(wrapper); wrapper.append(input);
  const backdrop = document.createElement('div'), text = document.createElement('div');
  backdrop.className = 'network-input-overlay'; backdrop.setAttribute('aria-hidden', 'true');
  text.className = 'network-input-text'; backdrop.append(text); wrapper.append(backdrop);
  const syncScroll = () => { text.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`; };
  const update = () => {
    const { chain, ...options } = getOptions(), style = getComputedStyle(input);
    input.style.caretColor = style.color;
    for (const property of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariant','letterSpacing','lineHeight','textIndent','textAlign','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','color','tabSize']) text.style[property] = style[property];
    backdrop.style.borderRadius = style.borderRadius;
    text.style.width = `${input.offsetWidth}px`;
    if (input.tagName === 'TEXTAREA') {
      text.style.width = `${input.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'break-word';
    } else {
      text.style.whiteSpace = 'pre';
      // Native single-line input text is centered within its content box.
      text.style.lineHeight = `${input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`;
    }
    const fragment = document.createDocumentFragment();
    let invalid = false;
    for (const item of searchCharacters(input.value, chain, options)) {
      if (item.invalid) {
        const span = document.createElement('span'); span.className = 'network-invalid-character'; span.textContent = item.char;
        fragment.append(span); invalid = true;
      } else fragment.append(document.createTextNode(item.char));
    }
    text.replaceChildren(fragment);
    wrapper.classList.toggle('has-value', !!input.value);
    input.setAttribute('aria-invalid', String(invalid));
    syncScroll();
  };
  input.addEventListener('input', update);
  input.addEventListener('scroll', syncScroll);
  input.addEventListener('keyup', syncScroll);
  input.addEventListener('click', syncScroll);
  const observer = new ResizeObserver(update); observer.observe(input);
  const themeObserver = new MutationObserver(update);
  themeObserver.observe(document.documentElement, {attributes:true,attributeFilter:['data-theme','class','style']});
  update();
  return update;
}
