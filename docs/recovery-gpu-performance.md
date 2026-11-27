# Solana recovery-phrase GPU performance

Measured locally on 2026-11-01 using two NVIDIA RTX 3090 cards. The component profiler uses random 128-bit entropy, a deliberately rare target, one warmup batch and three timed batches per size. It never writes wallet keys. The full-backend benchmark waits for readiness plus a 1.5-second warmup, measures approximately four seconds, and includes stop draining and HTTP transport. These are search-throughput measurements, not wallet sale values or guarantees for every dictionary and filter combination.

## Historical context

Earlier recorded CPU recovery benchmarks started near 199–218 addresses/sec and reached approximately 6,629/sec using native crypto and 12 workers. Separate Fast-mode GPU benchmarks reached approximately 20.5 million/sec on both cards. Fast mode generates private keys directly and does not perform BIP39 or account derivation, so those figures are not recovery-mode performance targets.

## Recovery changes

Recovery mode previously used 1,024 candidates per batch, copied all BIP39 seeds to Python, derived every Phantom account key on CPU, and uploaded every key again. The updated Solana path uses 16,384 candidates, GPU SLIP-0010 at m/44'/501'/0'/0', a shared device context and key buffer, vectorized BIP39 phrase packing, and copies back keys only for matched candidates. The PBKDF2 iteration count remains 2,048. Each GPU runs CPU-reference checks on deterministic and random inputs for both phrase-packing paths, and retained results are independently recovered again in the JavaScript bridge before saving. CPU and Bitcoin generation behavior is unchanged.

## Measurements

| Measurement | Addresses/sec |
| --- | ---: |
| Original recovery pipeline, 1,024 batch, one GPU | 12,818–14,070 |
| Larger batches alone, 16,384, one GPU | 53,207–54,025 |
| GPU account derivation, 16,384, one GPU | 126,096 |
| GPU derivation plus vectorized phrase packing, 16,384, one GPU | 172,628 |
| Full backend, both GPUs, rare target | 361,844 |

Individual full-backend card measurements varied from 101,279/sec on device 0 to 208,418/sec on device 1 in the recorded warm run. Earlier cold/short measurements varied more. Frequent matches, CPU verification, disk writes, competing work, and large word dictionaries can reduce throughput. The rare-target benchmark retained zero wallets, so it does not measure heavy verification or archive-write load; those paths are covered by separate correctness tests.

Raw results are in `performance-recovery-reference.jsonl`, `performance-recovery-optimized.jsonl`, `performance-recovery-vectorized.jsonl`, and `performance-recovery-full.jsonl`. Reproduce with `.gpu-venv\Scripts\python.exe scripts/profile-recovery.py`, add `--optimized` or `--vectorized` for the newer component paths, and run `node scripts/benchmark-recovery.mjs` for the full backend. Do not benchmark during a live hunt if you want uncontended measurements.

Validation includes `node scripts/test-solana-recovery.mjs`, `node scripts/test-saved-gpu.mjs --preview --single --recovery`, `node scripts/test-hybrid.mjs`, `npm test`, and `npm run build`. Both GPUs recovered matching Solana phrases and private keys and rejected mismatched phrases; combined recovery hunts passed normal stop and force-stop checks. Actual Phantom UI import was not automated.

## SHA-512 round scheduling follow-up

The shared recovery SHA-512 compression loop now requests full unrolling of its 80 rounds. Constant indexes allow the OpenCL compiler to optimize the rolling message schedule and avoid dynamic indexing overhead. This changes compilation, not BIP39's 2,048 iterations, entropy generation, derivation paths, or independent retained-result verification. Both Solana and Bitcoin use this kernel; private-key-only generation is unaffected.

On 2026-11-01, alternating reference/optimized runs of both GPUs measured 248,997 / 287,310 and 245,081 / 294,383 candidates/sec respectively, a 15–20% pipeline improvement. Each run processed 524,288 candidates, including secure randomness, phrase packing, BIP39, account derivation, Ed25519, filtering and buffer clearing. Startup verification was excluded, and these tests do not include bridge transport, retained-result verification or archive writes. A user hunt remained active throughout, so these are contended measurements and do not promise the same rate in the UI. Larger batches were also checked and did not justify increasing the existing 16,384 batch size.

Reproduce alternating kernel checks with `.gpu-venv\Scripts\python.exe scripts/profile-pbkdf.py`, or add `--pipeline` for the two-GPU pipeline comparison. The reference source is compiled in memory without changing production files. Kernel checks compare all 16,384 output seeds against hashlib; pipeline startup checks exercise deterministic and random phrases against CPU derivation. Pipeline measurements are recorded in `performance-recovery-unroll.jsonl`. Running hunts retain their already-compiled kernel; the next hunt loads the new kernel without restarting the website.
