"""Synthetic stage timings; never saves or prints wallet material."""
import sys,time,json,os
import numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'gpu'))
from bitcoin import BitcoinEngine,MNEMONIC
from solana_recovery import derive_key,RecoveryEngine
from engine import Engine,devices,arrays
config={'chain':'sol','generationMode':'recovery-phrase','scope':'suffix','words':[], 'minLength':3,'minRank':6,'leet':False,'onlyMatches':True,'prefix':'','suffix':'ZZZZZZZZZZ','target':1}
bip=BitcoinEngine(devices()[0]);bip.verify();search=Engine(devices()[0]);search.verify()
for size in [1024,4096,8192,16384,32768]:
 search.prepare(config,size,arrays)
 optimized='--optimized' in sys.argv or '--vectorized' in sys.argv
 vectorized='--vectorized' in sys.argv
 recovery=RecoveryEngine(search) if optimized else None
 if recovery:recovery.verify()
 totals=[0,0,0,0]
 for n in range(4):
  start=time.perf_counter();entropy=np.frombuffer(bytearray(os.urandom(size*16)),dtype=np.uint8).reshape(size,16) if vectorized else [os.urandom(16) for _ in range(size)];phrases=[] if vectorized else [MNEMONIC.to_mnemonic(e) for e in entropy];a=time.perf_counter()
  seeds=None;keys=bytearray()
  if optimized:
   if vectorized:recovery.derive_entropy(entropy)
   else:recovery.derive(phrases)
   b=time.perf_counter();c=b;search.batch(device_seeds=True);recovery.clear();d=time.perf_counter()
  else:
   seeds=bip.seeds(phrases);b=time.perf_counter()
   for seed in seeds:keys.extend(derive_key(bytes(seed)))
   c=time.perf_counter();search.batch(keys);d=time.perf_counter()
  if n:totals=[x+y for x,y in zip(totals,[a-start,b-a,c-b,d-c])]
  if seeds is not None:seeds.fill(0)
  keys[:]=bytes(len(keys))
 print(json.dumps({'mode':'gpu-vectorized' if vectorized else 'gpu-derive' if optimized else 'cpu-derive','batch':size,'phrasesMs':round(totals[0]*1000/3,2),'pbkdfMs':round(totals[1]*1000/3,2),'deriveMs':round(totals[2]*1000/3,2),'addressFilterMs':round(totals[3]*1000/3,2),'perSecond':round(size*3/sum(totals))}),flush=True)
