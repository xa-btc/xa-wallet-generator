"""Public deterministic fixtures only. Never emits random wallet keys or phrases."""
import hashlib
import json
import sys
from bitcoin import BitcoinEngine, MNEMONIC, derive_key, address_for
from engine import arrays, devices

cases = json.load(sys.stdin)
entropy = [bytes(16), bytes([255])*16] + [hashlib.sha256(('XA Wallet Generator BTC public fixture:'+str(i)).encode()).digest()[:16] for i in range(62)]
phrases = [MNEMONIC.to_mnemonic(value) for value in entropy]
expected = [hashlib.pbkdf2_hmac('sha512', phrase.encode(), b'mnemonic', 2048, 64) for phrase in phrases]
addresses = [address_for(derive_key(seed)) for seed in expected]
results = []
for index, device in enumerate(devices()):
    engine = BitcoinEngine(device)
    engine.verify()
    seeds = engine.seeds(phrases)
    try:
        for i, seed in enumerate(seeds):
            assert bytes(seed) == expected[i], 'BIP39 GPU seed mismatch'
            assert address_for(derive_key(bytes(seed))) == addresses[i], 'BIP84 GPU address mismatch'
    finally:
        seeds.fill(0)
    for case, config in enumerate(cases):
        engine.prepare(config, arrays)
        results.append({'device':index,'case':case,'indices':engine.filter(addresses)})
print(json.dumps({'addresses':addresses,'results':results}))
