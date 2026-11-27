import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { base58, base58check, bech32, base64urlnopad } from '@scure/base';
import { bytesToHex, concatBytes, utf8ToBytes, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

export const CHAINS = {
  sol: { name: 'Solana', symbol: 'SOL', path: "m/44'/501'/0'/0'", alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', prefix: '' },
  eth: { name: 'Ethereum / EVM', symbol: 'ETH', path: "m/44'/60'/0'/0/0", alphabet: '0123456789abcdef', prefix: '0x' },
  btc: { name: 'Bitcoin', symbol: 'BTC', path: "m/84'/0'/0'/0/0", alphabet: 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', prefix: 'bc1q' },
};
export function solanaPrivate(seed) {
  let I = hmac(sha512, utf8ToBytes('ed25519 seed'), seed);
  for (const index of [44, 501, 0, 0]) {
    const n = new Uint8Array(4); new DataView(n.buffer).setUint32(0, index + 0x80000000);
    I = hmac(sha512, I.slice(32), concatBytes(new Uint8Array([0]), I.slice(0, 32), n));
  }
  return I.slice(0, 32);
}
export function checksumEth(hex) {
  const hash = bytesToHex(keccak_256(utf8ToBytes(hex)));
  return '0x' + [...hex].map((c, i) => parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c).join('');
}
export function generateWallet(chain, phrase = generateMnemonic(wordlist, 128)) {
  if (!CHAINS[chain]) throw new Error('Unknown chain');
  const seed = mnemonicToSeedSync(phrase);
  return walletFromSeed(chain, phrase, seed);
}

// Identical BIP39 parameters; native crypto avoids SHA-512 rounds in JavaScript.
export async function mnemonicToNativeSeed(phrase, passphrase = '') {
  const input = utf8ToBytes(phrase.normalize('NFKD'));
  const salt = utf8ToBytes(('mnemonic' + passphrase).normalize('NFKD'));
  const key = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 2048, hash: 'SHA-512' }, key, 512);
  return new Uint8Array(result);
}

export async function generateWalletAsync(chain, phrase = generateMnemonic(wordlist, 128)) {
  return finalizeCandidate(await generateCandidate(chain, 'recovery-phrase', phrase));
}

const ed25519Pkcs8Prefix = hexToBytes('302e020100300506032b657004220420');
let nativeEdAvailable;
export async function solanaPublicNative(seed) {
  if (nativeEdAvailable === false) return ed25519.getPublicKey(seed);
  const encoded = concatBytes(ed25519Pkcs8Prefix, seed);
  try {
    const key = await crypto.subtle.importKey('pkcs8', encoded, { name: 'Ed25519' }, true, ['sign']);
    const jwk = await crypto.subtle.exportKey('jwk', key);
    const pub = base64urlnopad.decode(jwk.x);
    if (pub.length !== 32) throw new Error('Invalid native Ed25519 public key');
    nativeEdAvailable = true;
    return pub;
  } catch (error) {
    if (error.name !== 'NotSupportedError') throw error;
    nativeEdAvailable = false;
    return ed25519.getPublicKey(seed);
  } finally { encoded.fill(0); }
}

// Candidates keep secret bytes worker-local. Human-readable exports and ETH
// checksum casing are created only after an address passes the filters.
export async function generateCandidate(chain, mode = 'recovery-phrase', phrase) {
  if (!CHAINS[chain]) throw new Error('Unknown chain');
  if (!['recovery-phrase', 'private-key'].includes(mode)) throw new Error('Unknown generation mode');
  let key, pub;
  try {
    if (mode === 'private-key') {
      phrase = null;
      key = chain === 'sol' ? randomBytes(32) : secp256k1.utils.randomSecretKey();
    } else {
      phrase ??= generateMnemonic(wordlist, 128);
      const seed = await mnemonicToNativeSeed(phrase);
      try { key = chain === 'sol' ? solanaPrivate(seed) : HDKey.fromMasterSeed(seed).derive(CHAINS[chain].path).privateKey; }
      finally { seed.fill(0); }
    }
    let address;
    if (chain === 'sol') {
      pub = await solanaPublicNative(key); address = base58.encode(pub);
    } else if (chain === 'eth') {
      pub = secp256k1.getPublicKey(key, false);
      address = '0x' + bytesToHex(keccak_256(pub.slice(1)).slice(-20));
    } else {
      pub = secp256k1.getPublicKey(key, true);
      address = bech32.encode('bc', [0, ...bech32.toWords(ripemd160(sha256(pub)))]);
    }
    return { chain, address, key, pub, phrase, generationMode: mode, path: mode === 'private-key' ? null : CHAINS[chain].path };
  } catch (error) { key?.fill(0); throw error; }
}

export function finalizeCandidate(candidate) {
  const { chain, key, pub, phrase, path, generationMode } = candidate;
  try {
    let address = candidate.address, privateKey, format;
    if (chain === 'sol') {
      privateKey = base58.encode(concatBytes(key, pub)); format = 'Base58 secret key (64 bytes)';
    } else if (chain === 'eth') {
      address = checksumEth(address.slice(2)); privateKey = '0x' + bytesToHex(key); format = 'Hex private key';
    } else {
      privateKey = base58check(sha256).encode(concatBytes(new Uint8Array([128]), key, new Uint8Array([1]))); format = 'Compressed mainnet WIF';
    }
    return { chain, address, privateKey, format, phrase, path, generationMode, created: new Date().toISOString() };
  } finally { candidate.key.fill(0); }
}

function walletFromSeed(chain, phrase, seed) {
  try {
    let address, privateKey, format;
    if (chain === 'sol') {
      const key = solanaPrivate(seed); const pub = ed25519.getPublicKey(key);
      address = base58.encode(pub); privateKey = base58.encode(concatBytes(key, pub)); format = 'Base58 secret key (64 bytes)';
    } else {
      const key = HDKey.fromMasterSeed(seed).derive(CHAINS[chain].path).privateKey;
      if (chain === 'eth') {
        address = checksumEth(bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20)));
        privateKey = '0x' + bytesToHex(key); format = 'Hex private key';
      } else {
        const hash = ripemd160(sha256(secp256k1.getPublicKey(key, true)));
        address = bech32.encode('bc', [0, ...bech32.toWords(hash)]);
        privateKey = base58check(sha256).encode(concatBytes(new Uint8Array([128]), key, new Uint8Array([1]))); format = 'Compressed mainnet WIF';
      }
    }
    return { chain, address, privateKey, format, phrase, path: CHAINS[chain].path, created: new Date().toISOString() };
  } finally { seed.fill(0); }
}
