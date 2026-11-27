############################################################################################################################
# Bitcoin Fast v1.01 - Local OpenCL Bitcoin private-key generation.
# Computes public keys and native SegWit addresses on the selected GPU.
# Existing search filters are shared with recovery mode; retained results are independently verified.
# Core Features:
# - Independent OS-random keys, fixed-base secp256k1 and batch inversion.
# - GPU HASH160, Bech32 and filtering; CPU verification before export.
# - Bounded batches, cooperative stop and secret-buffer cleanup.
# - No recovery phrase, remote services or persisted candidate keys.
# Important Note: Exported WIF requires a compatible native SegWit wallet.
# Created by: XA Wallet Generator
# Last Updated: 2026-11-19 13:18:00
# Release Notes: v1.01 - Share Fast pipeline with Ethereum address kernels.
# v1.00 - Add Bitcoin Fast GPU backend.
############################################################################################################################
import os
import time
from functools import lru_cache

import numpy as np
import pyopencl as cl
from coincurve import PrivateKey

from bitcoin import BitcoinEngine, ROOT, ORDER, address_for


@lru_cache(maxsize=1)
def public_table():
    """Public multiples of G, indexed by scalar byte position and value."""
    table = np.empty((32 * 255, 16), dtype=np.uint32)
    for pos in range(32):
        for digit in range(1, 256):
            scalar = (digit << (pos * 8)) % ORDER
            pub = PrivateKey(scalar.to_bytes(32, 'big')).public_key.format(compressed=False)
            table[pos * 255 + digit - 1] = [
                int.from_bytes(pub[start + j:start + j + 4], 'big')
                for start in (1, 33) for j in range(28, -1, -4)
            ]
    table.flags.writeable = False
    return table


def random_keys(size):
    keys = np.frombuffer(bytearray(os.urandom(size * 32)), dtype=np.uint8).reshape(size, 32)
    # Rejection sampling (never modulo reduction) preserves uniform secret keys.
    suspect = np.flatnonzero(np.all(keys == 0, axis=1) | np.all(keys[:, :4] == 255, axis=1))
    for i in suspect:
        while not 0 < int.from_bytes(keys[i].tobytes(), 'big') < ORDER:
            keys[i] = np.frombuffer(os.urandom(32), dtype=np.uint8)
    return keys


class BitcoinFastEngine(BitcoinEngine):
    source_files = ('filter.cl', 'bitcoin.cl', 'bitcoin_fast.cl')
    address_kernel_name = 'btc_fast_addresses'
    filter_kernel_name = 'btc_filter'
    address_width = 38
    address_prefix = 'bc1q'
    label = 'Bitcoin Fast'
    reference_address = staticmethod(address_for)

    def __init__(self, device, size=16384):
        self.size = size
        self.context = cl.Context([device])
        self.queue = cl.CommandQueue(self.context)
        source = '\n'.join((ROOT / name).read_text() for name in self.source_files)
        self.program = cl.Program(self.context, source).build(options=['-cl-std=CL1.2'])
        self.points_kernel = cl.Kernel(self.program, 'btc_fast_points')
        self.inverse_kernel = cl.Kernel(self.program, 'btc_fast_inverse')
        self.address_kernel = cl.Kernel(self.program, self.address_kernel_name)
        self.filter_kernel = cl.Kernel(self.program, self.filter_kernel_name)
        self.table = self.buffer(public_table())
        self.keys = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, size * 32)
        self.points = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, size * 96)
        self.inverses = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, size * 32)
        self.addresses = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, size * self.address_width)
        self.count = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, 4)
        self.indices = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, size * 4)

    def generate(self, keys):
        size = len(keys)
        if not 0 < size <= self.size:
            raise ValueError(f'Invalid {self.label} batch size')
        cl.enqueue_copy(self.queue, self.keys, keys)
        self.points_kernel(self.queue, (size,), None, self.keys, self.table, self.points)
        self.inverse_kernel(self.queue, ((size + 63) // 64,), None, self.points, self.inverses, np.uint32(size))
        self.address_kernel(self.queue, (size,), None, self.points, self.inverses, self.addresses)

    def read_addresses(self, size):
        output = np.empty((size, self.address_width), dtype=np.uint8)
        cl.enqueue_copy(self.queue, output, self.addresses).wait()
        return [self.address_prefix + row.tobytes().decode('ascii') for row in output]

    def filter_generated(self, size):
        found = set()
        scopes = {'first5':8,'first6':9,'first7':10,'first8':11,'first9':12,'first10':13,'last7':14,'last8':15,'last9':16,'last10':17,'joined':7,'both':6,'ends':0,'suffix':1,'any':2,'first4':3,'last4':4,'last5':5}
        for c, buffers in self.passes:
            count = np.zeros(1, dtype=np.uint32)
            cl.enqueue_copy(self.queue, self.count, count)
            self.filter_kernel(self.queue, (size,), None, self.addresses, self.count, self.indices, *buffers,
                np.uint32(len(c['prefix'])), np.uint32(len(c['suffix'])), np.int32(scopes[c['scope']]),
                np.int32(c['leet']), np.int32(2 if c.get('directSearch') else c['onlyMatches']),
                np.int32(c['minRank']), np.int32(c.get('requiredRepeat', 0)),
                np.int32((c.get('ignoreRepeatedMax') or 44) if c.get('ignoreRepeated', False) else 0))
            cl.enqueue_copy(self.queue, count, self.count).wait()
            if int(count[0]) > size:
                raise RuntimeError(f'Invalid {self.label} match count')
            indices = np.empty(int(count[0]), dtype=np.uint32)
            if len(indices):
                cl.enqueue_copy(self.queue, indices, self.indices).wait()
                found.update(int(i) for i in indices)
        return sorted(found)

    def clear(self):
        for buffer, length in ((self.keys, self.size * 32), (self.points, self.size * 96),
                               (self.inverses, self.size * 32), (self.addresses, self.size * self.address_width)):
            cl.enqueue_fill_buffer(self.queue, buffer, np.uint8(0), 0, length)
        self.queue.finish()

    def verify(self):
        values = [1, 2, 255, 256, ORDER - 1, ORDER - 2, 1 << 255]
        keys = random_keys(72)
        try:
            for i, value in enumerate(values):
                keys[i] = np.frombuffer(value.to_bytes(32, 'big'), dtype=np.uint8)
            self.generate(keys)
            for key, address in zip(keys, self.read_addresses(len(keys))):
                if self.reference_address(key) != address:
                    raise RuntimeError(f'{self.label} startup verification failed')
        finally:
            keys.fill(0)
            self.clear()


def run_secp256k1_fast(device, index, config, arrays, stop, emit, deadline=None, engine_class=BitcoinFastEngine):
    if stop.is_set():
        return 0
    engine = engine_class(device)
    attempts = kept = 0
    try:
        if stop.is_set():
            return 0
        engine.verify()
        engine.prepare(config, arrays)
        emit({'type': 'ready', 'device': index, 'name': device.name})
        while not stop.is_set() and (deadline is None or time.perf_counter() < deadline):
            keys = random_keys(engine.size)
            try:
                engine.generate(keys)
                indices = engine.filter_generated(engine.size)
                attempts += engine.size
                matches = []
                # Transfer only matches, and independently verify each on CPU.
                for i in indices:
                    if stop.is_set():
                        break
                    encoded = np.empty(engine.address_width, dtype=np.uint8)
                    cl.enqueue_copy(engine.queue, encoded, engine.addresses, src_offset=i * engine.address_width).wait()
                    address = engine.address_prefix + encoded.tobytes().decode('ascii')
                    if engine.reference_address(keys[i]) != address:
                        raise RuntimeError(f'{engine.label} result verification failed')
                    kept += 1
                    if deadline is None:
                        matches.append({'key': keys[i].tobytes().hex(), 'address': address})
                    if len(matches) >= 32:
                        emit({'type': 'progress', 'device': index, 'attempts': attempts, 'matches': matches})
                        matches = []
                emit({'type': 'progress', 'device': index, 'attempts': attempts, 'matches': matches})
            finally:
                keys.fill(0)
                engine.clear()
        emit({'type': 'done', 'device': index, 'attempts': attempts, 'matches': [], 'verifiedMatches': kept})
        return attempts
    finally:
        engine.clear()


def run_bitcoin_fast(device, index, config, arrays, stop, emit, deadline=None):
    return run_secp256k1_fast(device, index, config, arrays, stop, emit, deadline)
