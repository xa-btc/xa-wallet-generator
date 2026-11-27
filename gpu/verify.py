"""GPU/reference comparison fixtures. Emits public keys only, never private keys."""
import hashlib
import json
import sys
from engine import Engine, devices
from nacl.signing import SigningKey

cases=json.load(sys.stdin)
seeds=bytearray(b''.join(hashlib.sha256(('XA Wallet Generator public test fixture:'+str(i)).encode()).digest() for i in range(512)))
pubs=[bytes(SigningKey(bytes(seeds[i*32:(i+1)*32])).verify_key).hex() for i in range(512)]
results=[]
for index,device in enumerate(devices()):
    engine=Engine(device);engine.verify()
    for case,config in enumerate(cases):
        engine.prepare(config,512)
        _,indices,actual=engine.batch(seeds)
        for slot,idx in enumerate(indices):
            assert bytes(actual[slot*32:(slot+1)*32]).hex()==pubs[int(idx)],'GPU returned the wrong public key'
        results.append({'device':index,'case':case,'indices':sorted(int(i) for i in indices)})
seeds[:]=bytes(len(seeds))
print(json.dumps({'pubs':pubs,'results':results}))
