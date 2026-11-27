############################################################################################################################
# Ethereum Fast v1.00 - Local OpenCL Ethereum private-key generation.
# Reuses independent random secp256k1 candidates and adds GPU Keccak-256 addresses.
# Retained results are verified by native secp256k1 and CPU Keccak, then independently by the JavaScript bridge.
# Core Features:
# - GPU Ethereum addresses and shared search filters.
# - CPU reference Keccak-256 with Ethereum's legacy padding.
# - Shared cancellation, bounded batches and secret cleanup.
# - Hex private-key export, no recovery phrase or derivation path.
# Important Note: No keys or candidate wallets are written to disk by this helper.
# Created by: XA Wallet Generator
# Last Updated: 2026-11-19 13:00:00
# Release Notes: v1.00 - Add Ethereum Fast GPU support.
############################################################################################################################
from coincurve import PrivateKey

from bitcoin_fast import BitcoinFastEngine

_MASK = (1 << 64) - 1
_ROT = ((0, 36, 3, 41, 18), (1, 44, 10, 45, 2), (62, 6, 43, 15, 61),
        (28, 55, 25, 21, 56), (27, 20, 39, 8, 14))
_RC = (0x1, 0x8082, 0x800000000000808a, 0x8000000080008000, 0x808b, 0x80000001,
       0x8000000080008081, 0x8000000000008009, 0x8a, 0x88, 0x80008009, 0x8000000a,
       0x8000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
       0x8000000000008002, 0x8000000000000080, 0x800a, 0x800000008000000a,
       0x8000000080008081, 0x8000000000008080, 0x80000001, 0x8000000080008008)


def _rotate(value, count):
    return ((value << count) | (value >> (64 - count))) & _MASK


def keccak256(message):
    """CPU reference, deliberately independent of the GPU's byte packing."""
    padded = bytearray(message)
    padded.append(1)
    padded.extend(bytes((-len(padded)) % 136))
    padded[-1] |= 0x80
    state = [[0] * 5 for _ in range(5)]
    for start in range(0, len(padded), 136):
        for lane in range(17):
            offset = start + lane * 8
            state[lane % 5][lane // 5] ^= int.from_bytes(padded[offset:offset + 8], 'little')
        for constant in _RC:
            columns = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
            delta = [columns[(x - 1) % 5] ^ _rotate(columns[(x + 1) % 5], 1) for x in range(5)]
            rotated = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    rotated[y][(2 * x + 3 * y) % 5] = _rotate(state[x][y] ^ delta[x], _ROT[x][y])
            for x in range(5):
                for y in range(5):
                    state[x][y] = rotated[x][y] ^ ((~rotated[(x + 1) % 5][y]) & rotated[(x + 2) % 5][y])
            state[0][0] ^= constant
    return b''.join(state[x][0].to_bytes(8, 'little') for x in range(4))


def address_for(key):
    public = PrivateKey(bytes(key)).public_key.format(compressed=False)
    return '0x' + keccak256(public[1:])[-20:].hex()


class EthereumFastEngine(BitcoinFastEngine):
    source_files = BitcoinFastEngine.source_files + ('ethereum_fast.cl',)
    address_kernel_name = 'eth_fast_addresses'
    filter_kernel_name = 'eth_filter'
    address_width = 40
    address_prefix = '0x'
    label = 'Ethereum Fast'
    reference_address = staticmethod(address_for)

    def verify(self):
        if keccak256(b'').hex() != 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470':
            raise RuntimeError('Ethereum CPU Keccak verification failed')
        if address_for((1).to_bytes(32, 'big')) != '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf':
            raise RuntimeError('Ethereum CPU address verification failed')
        super().verify()
