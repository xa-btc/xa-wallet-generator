# Quality scoring, version 2

The score ranks appearance and estimated pattern difficulty. It is not a market price, a security rating, or a measured chance of finding any dictionary match. All keys still use the same secure random generation process. A six-character suffix may fall into different tiers depending on spelling, substitutions, character availability, repeats, and independent patterns.

For a word, the matcher counts how many characters in the selected chain's alphabet can match each letter, including case folding and enabled digit aliases. It sums `log2(alphabet size / matching character count)` and subtracts `log2(number of eligible placements)` in the selected search zone. The result is a difficulty estimate in bits for that specific pattern. For repeats, it uses the case-folded multiplicity of the repeated character and the run length. These estimates assume uniform, independent characters; real Solana leading characters, Ethereum case formatting, Bitcoin checksums, and overlapping pattern opportunities do not fully satisfy that model. The estimate is not corrected for the probability of matching any word among an entire dictionary and must not be presented as exact aggregate odds.

A word's base score is `3 × difficulty bits + readability + desirability`. Exact spelling, ignoring case, receives +6 readability; each substituted character instead costs 3 points. Familiar words from the BIP39 English vocabulary receive +8 desirability, words in the curated themed additions receive +4, and other words receive no desirability bonus. This is a transparent editorial preference, not a frequency measurement. Repeats receive +16 desirability and +8 readability if all repeated characters use identical case. Mixed-case runs still qualify but do not get that +8.

Each candidate pattern can gain +8 for each additional nonoverlapping matched region, capped at +24. The highest resulting candidate score determines the wallet's quality. Nested words, overlapping aliases, and a word/repeat occupying the same characters cannot inflate this bonus. Scores round to two decimal places. Prefix/suffix requirements constrain the hunt but do not independently add score. The exported `quality` object records difficulty bits, readability, desirability, substitutions, independent pattern count, and the bonus; `scoringVersion` is 2.

| Tier | Minimum quality score |
| --- | ---: |
| Common | 0 |
| Rare | 45 |
| Ultra | 60 |
| Epic | 75 |
| Legendary | 90 |
| Mythic | 105 |
| Godlike | 120 |

GPU filtering uses conservative upper score bounds, allowing extra candidates through rather than discarding a potential qualifier. It omits position penalties and assumes maximum readability and independent-pattern bonuses. The local CPU verifies public keys, computes the full quality score, enforces minimum rarity and repeat requirements, and retains only qualified candidates. Hardware tests check that the prefilter does not drop CPU-qualified fixtures; extra GPU candidates are expected and are discarded by the CPU. This adds verification overhead, especially with broad dictionaries.

Keep the best maintains a bounded primary collection ordered by tier and score. It replaces the weakest retained wallet only when a new candidate is strictly better, continues after reaching capacity, supports resuming with existing keeper metadata, and stops manually or when rare overflow fills. Exported copies are unaffected by later replacement. The rare overflow collection retains its original fill-and-stop behavior.
