"""Public fixtures and in-memory random-key validation; never print random keys."""
import hashlib
import json
import sys
import time

import numpy as np

from bitcoin import ORDER, address_for
from bitcoin_fast import BitcoinFastEngine, random_keys
from engine import arrays, devices


def main():
    cases = json.load(sys.stdin)
    scalars = [1, 2, 255, 256, ORDER - 1, ORDER - 2, 1 << 255]
    scalars += [int.from_bytes(hashlib.sha256(('XA Wallet Generator BTC Fast public fixture:' + str(i)).encode()).digest(), 'big') for i in range(249)]
    keys = np.array([list(k.to_bytes(32, 'big')) for k in scalars], dtype=np.uint8)
    expected = [address_for(key) for key in keys]
    results, rates = [], []
    for device_index, device in enumerate(devices()):
        engine = BitcoinFastEngine(device)
        try:
            engine.verify()
            # Exercise every scalar bit and values approaching the group order.
            edge_values = [value for bit in range(256) for value in (1 << bit, ORDER - (1 << bit))]
            edge_keys = np.array([list(k.to_bytes(32, 'big')) for k in edge_values], dtype=np.uint8)
            engine.generate(edge_keys)
            assert engine.read_addresses(len(edge_keys)) == [address_for(key) for key in edge_keys], 'Scalar boundary vectors failed'
            for size in (1, 63, 64, 65, 127, 128, 129, 256):
                engine.generate(keys[:size])
                assert engine.read_addresses(size) == expected[:size], 'Public GPU vectors failed'
            for case_index, config in enumerate(cases):
                engine.prepare(config, arrays)
                results.append({'device': device_index, 'case': case_index, 'indices': engine.filter_generated(len(keys))})
            random = random_keys(engine.size)
            try:
                engine.generate(random)
                for key, address in zip(random, engine.read_addresses(len(random))):
                    assert address_for(key) == address, 'Random GPU address verification failed'
                config = dict(cases[0], prefix='zzzzzzzzzzzzzzzz', words=[])
                config.pop('discovery', None)
                engine.prepare(config, arrays)
                attempts = 0
                start = time.perf_counter()
                while time.perf_counter() - start < 2:
                    random.fill(0)
                    random = random_keys(engine.size)
                    engine.generate(random)
                    assert not engine.filter_generated(engine.size)
                    engine.clear()
                    attempts += engine.size
                rates.append({'device': device_index, 'searchPerSecond': round(attempts / (time.perf_counter() - start))})
            finally:
                random.fill(0)
        finally:
            engine.clear()
    print(json.dumps({'addresses': expected, 'results': results, 'rates': rates}))


if __name__ == '__main__':
    main()
