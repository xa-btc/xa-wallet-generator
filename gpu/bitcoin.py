"""GPU BIP39 + filtering; CPU BIP84/secp256k1, preserving each recovery phrase."""
import hashlib
import hmac
import os
import time
from pathlib import Path
import numpy as np
import pyopencl as cl
from coincurve import PrivateKey
from mnemonic import Mnemonic

ROOT = Path(__file__).resolve().parent
MNEMONIC = Mnemonic('english')
ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141
BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
PATH = [0x80000054, 0x80000000, 0x80000000, 0, 0]

def derive_key(seed):
    digest = hmac.digest(b'Bitcoin seed', seed, 'sha512')
    key, chain = int.from_bytes(digest[:32], 'big'), digest[32:]
    if not 0 < key < ORDER:
        raise ValueError('Invalid BIP32 master key')
    for index in PATH:
        while True:
            serialized = key.to_bytes(32, 'big')
            data = b'\0' + serialized if index >= 0x80000000 else PrivateKey(serialized).public_key.format(compressed=True)
            digest = hmac.digest(chain, data + index.to_bytes(4, 'big'), 'sha512')
            tweak = int.from_bytes(digest[:32], 'big')
            child = (key + tweak) % ORDER
            if tweak < ORDER and child:
                key, chain = child, digest[32:]
                break
            index += 1
            if index > 0xffffffff:
                raise ValueError('BIP32 child index exhausted')
    return bytearray(key.to_bytes(32, 'big'))

def address_for(key):
    pub = PrivateKey(bytes(key)).public_key.format(compressed=True)
    payload = hashlib.new('ripemd160', hashlib.sha256(pub).digest()).digest()
    acc = bits = 0
    words = [0]
    for value in payload:
        acc = ((acc << 8) | value) & 0xfff
        bits += 8
        while bits >= 5:
            bits -= 5
            words.append((acc >> bits) & 31)
    assert bits == 0
    values = [3, 3, 0, 2, 3] + words + [0] * 6  # HRP expansion of "bc".
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1ffffff) << 5) ^ value
        for bit, generator in enumerate([0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]):
            if (top >> bit) & 1:
                checksum ^= generator
    checksum ^= 1
    return 'bc1' + ''.join(BECH32[w] for w in words + [(checksum >> (5 * (5 - i))) & 31 for i in range(6)])

class BitcoinEngine:
    def __init__(self, device):
        self.context = cl.Context([device])
        self.queue = cl.CommandQueue(self.context)
        self.program = cl.Program(self.context, (ROOT/'filter.cl').read_text() + '\n' + (ROOT/'bitcoin.cl').read_text()).build(options=['-cl-std=CL1.2'])
        self.seed_kernel = cl.Kernel(self.program, 'btc_bip39')
        self.filter_kernel = cl.Kernel(self.program, 'btc_filter')

    def buffer(self, data):
        return cl.Buffer(self.context, cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR, hostbuf=data)

    def seeds(self, phrases):
        inputs = np.zeros((len(phrases), 128), dtype=np.uint8)
        for i, phrase in enumerate(phrases):
            encoded = phrase.encode('ascii')
            if len(encoded) > 128:
                raise ValueError('GPU supports 12-word English phrases only')
            inputs[i, :len(encoded)] = np.frombuffer(encoded, dtype=np.uint8)
        output = np.empty((len(phrases), 64), dtype=np.uint8)
        input_buffer = self.buffer(inputs)
        output_buffer = cl.Buffer(self.context, cl.mem_flags.WRITE_ONLY, output.nbytes)
        try:
            self.seed_kernel(self.queue, (len(phrases),), None, input_buffer, output_buffer)
            cl.enqueue_copy(self.queue, output, output_buffer).wait()
            return output
        finally:
            inputs.fill(0)
            cl.enqueue_fill_buffer(self.queue, input_buffer, np.uint8(0), 0, inputs.nbytes)
            cl.enqueue_fill_buffer(self.queue, output_buffer, np.uint8(0), 0, output.nbytes).wait()

    def verify(self):
        phrases = [MNEMONIC.to_mnemonic(bytes(16)), MNEMONIC.to_mnemonic(bytes([255])*16)]
        phrases += [MNEMONIC.to_mnemonic(os.urandom(16)) for _ in range(6)]
        seeds = self.seeds(phrases)
        try:
            for phrase, seed in zip(phrases, seeds):
                if bytes(seed) != hashlib.pbkdf2_hmac('sha512', phrase.encode(), b'mnemonic', 2048, 64):
                    raise RuntimeError('GPU Bitcoin seed verification failed')
        finally:
            seeds.fill(0)

    def prepare(self, config, arrays):
        self.passes = [(config, [self.buffer(a) for a in arrays(config)])]
        if config.get('discovery'):
            rare = config['discovery']
            self.passes.append((rare, [self.buffer(a) for a in arrays(rare)]))

    def filter(self, addresses):
        size = len(addresses)
        encoded = np.frombuffer(''.join(a[4:] for a in addresses).encode('ascii'), dtype=np.uint8)
        address_buffer = self.buffer(encoded)
        count_buffer = cl.Buffer(self.context, cl.mem_flags.READ_WRITE, 4)
        indices_buffer = cl.Buffer(self.context, cl.mem_flags.WRITE_ONLY, size*4)
        found = set()
        for c, buffers in self.passes:
            count = np.zeros(1, dtype=np.uint32)
            cl.enqueue_copy(self.queue, count_buffer, count)
            self.filter_kernel(self.queue, (size,), None, address_buffer, count_buffer, indices_buffer, *buffers,
                np.uint32(len(c['prefix'])), np.uint32(len(c['suffix'])),
                np.int32({'first5':8,'first6':9,'first7':10,'first8':11,'first9':12,'first10':13,'last7':14,'last8':15,'last9':16,'last10':17,'joined':7,'both':6,'ends':0,'suffix':1,'any':2,'first4':3,'last4':4,'last5':5}[c['scope']]),
                np.int32(c['leet']), np.int32(2 if c.get('directSearch') else c['onlyMatches']), np.int32(c['minRank']), np.int32(c.get('requiredRepeat',0)),np.int32((c.get('ignoreRepeatedMax') or 44) if c.get('ignoreRepeated',False) else 0))
            cl.enqueue_copy(self.queue, count, count_buffer).wait()
            indices = np.empty(int(count[0]), dtype=np.uint32)
            if len(indices):
                cl.enqueue_copy(self.queue, indices, indices_buffer).wait()
                found.update(int(i) for i in indices)
        return sorted(found)

def run_bitcoin(device, index, config, arrays, stop, emit, deadline=None):
    if stop.is_set(): return 0
    engine = BitcoinEngine(device)
    if stop.is_set(): return 0
    engine.verify()
    if stop.is_set(): return 0
    engine.prepare(config, arrays)
    emit({'type':'ready','device':index,'name':device.name})
    attempts = kept = 0
    while not stop.is_set() and (deadline is None or time.perf_counter() < deadline):
        entropy = [bytearray(os.urandom(16)) for _ in range(1024)]
        phrases = [MNEMONIC.to_mnemonic(bytes(e)) for e in entropy]
        seeds = None
        keys = []
        try:
            seeds = engine.seeds(phrases)
            addresses = []
            for seed in seeds:
                if stop.is_set(): break
                key = derive_key(bytes(seed))
                keys.append(key)
                addresses.append(address_for(key))
            attempts += len(addresses)
            if stop.is_set(): break
            indices = engine.filter(addresses)
            matches = []
            for i in indices:
                if stop.is_set(): break
                # Independently recompute each emitted seed on CPU. The bridge
                # separately recovers the phrase/address/WIF using JS libraries.
                expected = hashlib.pbkdf2_hmac('sha512', phrases[i].encode(), b'mnemonic', 2048, 64)
                if bytes(seeds[i]) != expected:
                    raise RuntimeError('GPU Bitcoin result verification failed')
                kept += 1
                if deadline is None:
                    matches.append({'entropy':entropy[i].hex(),'key':keys[i].hex(),'address':addresses[i]})
                if len(matches) >= 32:
                    emit({'type':'progress','device':index,'attempts':attempts,'matches':matches})
                    matches = []
            emit({'type':'progress','device':index,'attempts':attempts,'matches':matches})
        finally:
            if seeds is not None:
                seeds.fill(0)
            for secret in entropy + keys:
                secret[:] = bytes(len(secret))
    emit({'type':'done','device':index,'attempts':attempts,'matches':[],'verifiedMatches':kept})
    return attempts
