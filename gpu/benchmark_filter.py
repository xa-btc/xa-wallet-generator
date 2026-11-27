"""Paired before/after benchmark with PUBLIC deterministic fixtures, never keys."""
import hashlib
import json
import sys
import time
import numpy as np
from engine import Engine, devices, arrays, mask, ALPHABET, ROOT

def legacy_arrays(config):
    words = list(dict.fromkeys(w.lower() for w in config['words'] if config['minLength'] <= len(w) <= 44))
    masks, offsets, lengths = [], [], []
    for word in words:
        offsets.append(len(masks)); lengths.append(len(word))
        masks.extend(mask(c, config['leet']) for c in word)
    bucket_offsets, bucket_ids = [], []
    for i in range(128):
        bucket_offsets.append(len(bucket_ids))
        if chr(i) not in (ALPHABET.lower() if config.get('chain','sol')=='sol' else 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'): continue
        bucket_ids.extend(w for w, word in enumerate(words) if mask(chr(i),config['leet']) & mask(word[0],config['leet']))
    bucket_offsets.append(len(bucket_ids))
    return [np.array(v or [0], dtype=t) for v,t in [
        (masks,np.uint64),(offsets,np.uint32),(lengths,np.uint32),(bucket_offsets,np.uint32),(bucket_ids,np.uint32),
        ([config.get('wordScores',{}).get(w, int(np.ceil(len(w)*np.log2(58)*3+38))) for w in words],np.uint32),
        ([mask(c,config['leet']) for c in config['prefix']],np.uint64),
        ([mask(c,config['leet']) for c in config['suffix']],np.uint64),
    ]]

request=json.load(sys.stdin)
source=(ROOT/'filter.cl').read_text()
old_source=source.replace("      if(length-p<2)continue;\n      uint key=(uint)wf_lower(addr[start+p])*128+(uint)wf_lower(addr[start+p+1]);\n      for(uint k=bucket_offsets[key];k<bucket_offsets[key+1];k++) {",
    "      uchar c=wf_lower(addr[start+p]);\n      for(uint k=bucket_offsets[c];k<bucket_offsets[c+1];k++) {").replace('for(uint j=2;j<len;j++)','for(uint j=1;j<len;j++)')
assert old_source!=source and 'bucket_offsets[key]' not in old_source
repeat_start=old_source.index('  if(streak>=3){')
repeat_end=old_source.index('  // Explicit anchors',repeat_start)
old_source=old_source[:repeat_start]+'  if(streak>=3)score_bound=max(score_bound,(uint)ceil((float)streak*17.574f)+48);\n'+old_source[repeat_end:]
device=devices()[request.get('device',1)]
engines={'before':Engine(device,old_source),'after':Engine(device)}
size=16384
fixture=bytearray(hashlib.shake_256(b'XA Wallet Generator PUBLIC filter benchmark').digest(size*32))
output=[]
for case in request['cases']:
    for name,engine in engines.items():
        engine.prepare(case['config'],size,legacy_arrays if name=='before' else arrays)
    samples={'before':[],'after':[]}
    found={}
    for iteration in range(4):
        for name in (['before','after'] if iteration%2==0 else ['after','before']):
            engine=engines[name]
            started=time.perf_counter();batches=0
            while time.perf_counter()-started<0.65:
                _,indices,_=engine.batch(fixture);batches+=1
            elapsed=time.perf_counter()-started
            if iteration: samples[name].append(size*batches/elapsed)
            found[name]=set(int(i) for i in indices)
    assert found['after'].issubset(found['before'])
    before=sorted(samples['before'])[1];after=sorted(samples['after'])[1]
    output.append({'case':case['name'],'beforePerSecond':round(before),'afterPerSecond':round(after),
                   'speedup':round(after/before,2),'beforeCandidates':len(found['before']),'afterCandidates':len(found['after'])})
fixture[:]=bytes(len(fixture))
print(json.dumps(output))
