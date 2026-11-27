import { VOCABULARY_ADDITIONS } from './vocabulary-additions.js';
import countries from './data/entity-countries.json' with { type: 'json' };
import cities from './data/entity-cities.json' with { type: 'json' };
import companies from './data/entity-companies.json' with { type: 'json' };
import people from './data/entity-people.json' with { type: 'json' };
import pokemon from './data/entity-pokemon.json' with { type: 'json' };
import { THEME_WORD_PACKS } from './theme-words.js';

export const ENTITY_WORD_PACKS = {countries,cities,companies,people,pokemon,...THEME_WORD_PACKS};
for(const id of ['countries','cities','companies','people'])ENTITY_WORD_PACKS[id]=[...new Set([...ENTITY_WORD_PACKS[id],...VOCABULARY_ADDITIONS[id]])].sort();
export const ENTITY_WORDS = [...new Set(Object.values(ENTITY_WORD_PACKS).flat())];
