"""Public synthetic repeat fixtures; tests the shared GPU prefilter on both cards."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gpu'))
from engine import devices, arrays
from bitcoin import BitcoinEngine

lengths = [2, 3, 7, 8, 9, 10]
addresses = ['bc1q' + ('a' * n + 'xyz' * 13)[:38] for n in lengths]
config = dict(scope='any', words=[], leet=False, onlyMatches=False, minRank=0,
              minLength=2, prefix='', suffix='', ignoreRepeated=True)
for index, device in enumerate(devices()):
    engine = BitcoinEngine(device)
    for maximum, expected in [(7, [3, 4, 5]), (44, [0])]:
        engine.prepare(dict(config, ignoreRepeatedMax=maximum), arrays)
        assert engine.filter(addresses) == expected, 'GPU repeat cutoff mismatch'
    print(f'Device {index}: shared GPU repeat filter accepts 8+; strict overflow still excludes 3+.', flush=True)
