export const SETTINGS_KEY = 'wallet-forge.settings.v1';
import { THEME_SETTING_IDS } from './theme-words.js';
export const SETTING_IDS = [...THEME_SETTING_IDS, 'overflowSettings', 'wordCategories', 'matchingWordsPanel', 'customMatchSettings', 'packPokemon', 'packCountries', 'packCities', 'packCompanies', 'packPeople', 'exportAlsoImport', 'packShortEnglish', 'packShortSlang', 'searchStyleCaps','searchStyleProper','searchStyleScattered','searchStyleReplacement','searchStyleLowercase','requiredRepeat', 'ignoreRepeated', 'packCommon', 'packCrypto', 'packPolitics', 'packJewish', 'packExpanded', 'collectionMode', 'discoverySource', 'discoveryMinLength', 'discoveryScope', 'discoveryCustom', 'discoveryLeet', 'discoveryIgnoreRepeated', 'discoveryRank', 'discoveryTarget', 'chain', 'mode', 'engine', 'workers', 'scope', 'prefix', 'suffix', 'rank', 'target', 'leet', 'only', 'minLength', 'library', 'probabilityChance', 'fitWords', 'custom', 'directWords', 'showWords', 'showRepeated', 'resultCategory', 'resultPosition', 'resultRank', 'minRepeat', 'sort', 'resultSearch', 'pageSize'];

export function readSettings(storage) {
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function saveSettings(storage, values) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(Object.fromEntries(SETTING_IDS.filter(id => id in values).map(id => [id, values[id]]))));
    return true;
  } catch { return false; }
}

export function chooseEngine(preferred, devices, chain, mode) {
  if (!((['sol','btc'].includes(chain) && ['private-key','recovery-phrase'].includes(mode)) || (chain === 'eth' && mode === 'private-key')) || !devices.length || preferred === 'cpu') return 'cpu';
  if (preferred === 'hybrid') return 'hybrid';
  if (preferred === 'all') return devices.length > 1 ? 'all' : String(devices[0].index);
  return devices.some(device => String(device.index) === preferred) ? preferred : 'cpu';
}
