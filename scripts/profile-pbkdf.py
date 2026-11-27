"""Compare SHA512 compilation strategies, checking every seed against hashlib.

Only timing metadata is printed. Does not access the archive or running hunt.
"""
import hashlib
import json
import sys
import time
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from pathlib import Path

import numpy as np
import pyopencl as cl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gpu'))
from engine import devices
from bitcoin import ROOT

if '--pipeline' in sys.argv:
    from engine import Engine, arrays
    from solana_recovery import RecoveryEngine
    program_type = cl.Program
    config = {'chain': 'sol', 'generationMode': 'recovery-phrase', 'scope': 'suffix', 'words': [], 'minLength': 3, 'minRank': 6, 'leet': False, 'onlyMatches': True, 'prefix': '', 'suffix': 'ZZZZZZZZZZ', 'target': 1}
    for variant in ['reference', 'unroll', 'reference', 'unroll']:
        barrier = Barrier(2)
        def program(context, code):
            if variant == 'reference':
                code = code.replace('  #pragma unroll 80\n', '')
            return program_type(context, code)
        def run(index):
            engine = Engine(devices()[index])
            engine.prepare(config, 16384, arrays)
            recovery = RecoveryEngine(engine)
            recovery.verify()
            barrier.wait(timeout=60)
            start = time.perf_counter()
            try:
                for _ in range(16):
                    entropy = np.frombuffer(bytearray(os.urandom(engine.size * 16)), dtype=np.uint8).reshape(engine.size, 16)
                    try:
                        recovery.derive_entropy(entropy)
                        engine.batch(device_seeds=True)
                    finally:
                        entropy.fill(0)
                        recovery.clear()
            finally:
                recovery.clear()
            return time.perf_counter() - start
        with patch.object(cl, 'Program', program), ThreadPoolExecutor(max_workers=2) as pool:
            elapsed = list(pool.map(run, [0, 1]))
        print(json.dumps({'variant': variant, 'mode': 'dual-gpu-pipeline', 'batch': 16384, 'attempts': 2 * 16 * 16384, 'elapsedSeconds': elapsed, 'perSecond': round(2 * 16 * 16384 / max(elapsed)), 'includes': 'randomness, packing, BIP39, derivation, address filtering, clearing; excludes bridge and retained matches'}), flush=True)
    sys.exit(0)

source = (ROOT / 'filter.cl').read_text() + '\n' + (ROOT / 'bitcoin.cl').read_text()
source = source.replace('  #pragma unroll 80\n', '')
phrase = b'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
expected = hashlib.pbkdf2_hmac('sha512', phrase, b'mnemonic', 2048, 64)
for device_index in [0, 1]:
    context = cl.Context([devices()[device_index]])
    queue = cl.CommandQueue(context)
    for variant in ['reference', 'unroll', 'reference', 'unroll']:
        code = source.replace('  for(uint i=0;i<80;i++){', '  #pragma unroll 80\n  for(uint i=0;i<80;i++){') if variant == 'unroll' else source
        program = cl.Program(context, code).build(options=['-cl-std=CL1.2'])
        kernel = cl.Kernel(program, 'btc_bip39')
        size = 16384
        inputs = np.zeros((size, 128), dtype=np.uint8)
        inputs[:, :len(phrase)] = np.frombuffer(phrase, dtype=np.uint8)
        output = np.empty((size, 64), dtype=np.uint8)
        ib = cl.Buffer(context, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR, hostbuf=inputs)
        ob = cl.Buffer(context, cl.mem_flags.WRITE_ONLY, output.nbytes)
        kernel(queue, (size,), None, ib, ob).wait()
        start = time.perf_counter()
        for _ in range(5):
            kernel(queue, (size,), None, ib, ob).wait()
        elapsed = time.perf_counter() - start
        cl.enqueue_copy(queue, output, ob).wait()
        assert np.all(output == np.frombuffer(expected, dtype=np.uint8)), 'PBKDF2 mismatch'
        print(json.dumps({'device': device_index, 'variant': variant, 'batch': size, 'perSecond': round(size * 5 / elapsed), 'verified': size}), flush=True)
