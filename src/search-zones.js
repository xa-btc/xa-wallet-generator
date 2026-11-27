export const SEARCH_ZONES = {
  ends: { label: 'First 4 + last 4 · either end', length: 4 },
  both: { label: 'First 4 + last 4 · BOTH ends required', length: 4 },
  joined: { label: 'First 4 + last 4 · ONE 8-character word', length: 8 },
  first4: { label: 'First 4 characters', length: 4 },
  last4: { label: 'Last 4 characters', length: 4 },
  last5: { label: 'Last 5 characters', length: 5 },
  suffix: { label: 'Last 6 characters', length: 6 },
  ...Object.fromEntries([5,6,7,8,9,10].map(n=>['first'+n,{label:`First ${n} characters`,length:n}])),
  ...Object.fromEntries([7,8,9,10].map(n=>['last'+n,{label:`Last ${n} characters`,length:n}])),
  any: { label: 'Anywhere in the address', length: Infinity },
};
export function searchZones(raw, scope) {
  if (scope === 'any') return [{ text: raw, start: 0 }];
  const length = Math.min(SEARCH_ZONES[scope].length, raw.length);
  const first = { text: raw.slice(0, length), start: 0 };
  const last = { text: raw.slice(-length), start: raw.length - length };
  return (scope === 'ends' || scope === 'both') ? [first, last] : scope.startsWith('first') ? [first] : [last];
}
