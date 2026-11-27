const aliases = { '0': 'o', '1': 'il', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };
function options(c, leet) { return c.toLowerCase() + (leet ? aliases[c] || '' : ''); }
export function matches(text, word, leet = true) {
  if (text.length !== word.length) return false;
  return [...text.toLowerCase()].every((c, i) => [...options(c, leet)].some(x => options(word[i], leet).includes(x)));
}
