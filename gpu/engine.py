"""Local OpenCL Solana backend. JSON stdin/stdout; never writes wallet keys to disk.

Uses SolVanityCL's GPL-3.0 Ed25519 implementation with independently random seed
bytes per candidate. Does not use its incremental-seed search entry point.
"""
import concurrent.futures
import json
import math
import os
from pathlib import Path
import sys
import threading
import time

import numpy as np
import pyopencl as cl
from nacl.signing import SigningKey

ROOT = Path(__file__).resolve().parent
STOP = threading.Event()
PRINT_LOCK = threading.Lock()
ACKS = {}
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
ALIASES = {'0':'o','1':'il','2':'z','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g'}

def emit(data):
    ack = ACKS.get(data.get('device')) if data.get('type') == 'progress' else None
    if ack is not None:
        ack.clear()
    with PRINT_LOCK:
        print(json.dumps(data, separators=(',', ':')), flush=True)
    # At most one unacknowledged chunk per GPU; never hold PRINT_LOCK here.
    while ack is not None and not STOP.is_set() and not ack.wait(0.1):
        pass

def devices():
    return [d for p in cl.get_platforms() for d in p.get_devices(cl.device_type.GPU) if 'NVIDIA' in d.vendor.upper()]

def mask(char, leet):
    result = 0
    for c in char.lower() + (ALIASES.get(char, '') if leet else ''):
        if '0' <= c <= '9': result |= 1 << (ord(c)-48)
        elif 'a' <= c <= 'z': result |= 1 << (ord(c)-97+10)
    return result

def arrays(config):
    # A conservative per-word upper bound already includes the maximum bonus.
    threshold = [0, 45, 60, 75, 90, 105, 150][config['minRank']]
    max_length = {'first5':5,'first6':6,'first7':7,'first8':8,'first9':9,'first10':10,'last7':7,'last8':8,'last9':9,'last10':10,'joined':8, 'both':4, 'ends':4, 'suffix':6, 'first4':4, 'last4':4, 'last5':5, 'any':44}[config['scope']]
    scores = config.get('wordScores', {})
    # Minimum SOL address length is 32; BTC and ETH payloads are 38 and 40.
    # Using the minimum opportunities keeps this an upper bound for every address.
    zone_length = {'sol':32, 'btc':38, 'eth':40}[config.get('chain','sol')] if config['scope'] == 'any' else max_length
    zone_count = 2 if config['scope'] in ('ends', 'both') else 1
    def score_for(word):
        bound = scores[word] if word in scores else math.ceil(len(word)*math.log2(58)*3+56)
        opportunities = max(1, zone_count * max(0, zone_length - len(word) + 1))
        return max(0, bound - math.floor(math.log2(opportunities)*3))
    words = list(dict.fromkeys(w.lower() for w in config['words']
                             if (config['scope'] != 'joined' or len(w) == 8) and max(2, config['minLength']) <= len(w) <= max_length and (config['scope'] == 'both' or (config['scope'] == 'joined' and (config.get('prefix') or config.get('suffix'))) or score_for(w.lower()) >= threshold)))
    masks, offsets, lengths = [], [], []
    for word in words:
        offsets.append(len(masks)); lengths.append(len(word))
        masks.extend(mask(c, config['leet']) for c in word)
    # Expand aliases once at setup instead of scanning a whole first-letter
    # bucket for every character of every generated address.
    alphabet = sorted(set({'sol':ALPHABET.lower(), 'btc':'qpzry9x8gf2tvdw0s3jn54khce6mua7l', 'eth':'0123456789abcdef'}[config.get('chain','sol')]))
    variants = {c:[ord(a) for a in alphabet if mask(a, config['leet']) & mask(c, config['leet'])]
                for c in '0123456789abcdefghijklmnopqrstuvwxyz'}
    buckets = {}
    for index, word in enumerate(words):
        for first in variants.get(word[0], []):
            for second in variants.get(word[1], []):
                buckets.setdefault(first*128+second, []).append(index)
    bucket_offsets, bucket_ids = [], []
    for key in range(128*128):
        bucket_offsets.append(len(bucket_ids))
        bucket_ids.extend(buckets.get(key, []))
    bucket_offsets.append(len(bucket_ids))
    return [np.array(v or [0], dtype=t) for v,t in [
        (masks,np.uint64),(offsets,np.uint32),(lengths,np.uint32),(bucket_offsets,np.uint32),(bucket_ids,np.uint32),
        ([score_for(w) for w in words],np.uint32),
        ([mask(c,config['leet']) for c in config['prefix']],np.uint64),
        ([mask(c,config['leet']) for c in config['suffix']],np.uint64),
    ]]

class Engine:
    def __init__(self, device, filter_source=None):
        self.context=cl.Context([device]); self.queue=cl.CommandQueue(self.context)
        source=(ROOT/'vendor/ed25519.cl').read_text().split('__kernel void generate_pubkey')[0]
        # Remove upstream search settings. Only cryptographic primitives are used.
        start=source.index('// DO NOT EDIT BELOW'); end=source.index('// DO NOT EDIT ABOVE')
        source=source[:start]+source[source.index('\n',end)+1:]
        self.program=cl.Program(self.context,source+'\n'+(filter_source if filter_source is not None else (ROOT/'filter.cl').read_text())+'\n'+(ROOT/'search.cl').read_text()).build(options=['-cl-std=CL1.2'])
        self.public_kernel=cl.Kernel(self.program,'wf_public_keys')
        self.search_kernel=cl.Kernel(self.program,'wf_search')

    def buffer(self, data):
        return cl.Buffer(self.context,cl.mem_flags.READ_ONLY|cl.mem_flags.COPY_HOST_PTR,hostbuf=data)

    def verify(self):
        seeds=bytearray(os.urandom(32*128)); output=np.empty(32*128,dtype=np.uint8)
        seed_buffer=self.buffer(seeds); result=cl.Buffer(self.context,cl.mem_flags.WRITE_ONLY,output.nbytes)
        self.public_kernel(self.queue,(128,),None,seed_buffer,result)
        cl.enqueue_copy(self.queue,output,result).wait()
        for i in range(128):
            if bytes(output[i*32:(i+1)*32]) != bytes(SigningKey(bytes(seeds[i*32:(i+1)*32])).verify_key):
                raise RuntimeError('GPU public-key validation failed')
        seeds[:]=bytes(len(seeds))

    def prepare(self, config, size, array_builder=arrays):
        self.size=size; self.config=config
        self.static=[self.buffer(a) for a in array_builder(config)]
        self.rare_static=[self.buffer(a) for a in array_builder(config['discovery'])] if config.get('discovery') else None
        self.candidate_pubs=cl.Buffer(self.context,cl.mem_flags.READ_WRITE,size*32)
        self.seeds=cl.Buffer(self.context,cl.mem_flags.READ_WRITE,size*32)
        self.count=cl.Buffer(self.context,cl.mem_flags.READ_WRITE,4)
        self.indices=cl.Buffer(self.context,cl.mem_flags.WRITE_ONLY,size*4)
        self.pubs=cl.Buffer(self.context,cl.mem_flags.WRITE_ONLY,size*32)

    def batch(self, seeds=None, device_seeds=False):
        if not device_seeds:
            seeds=bytearray(os.urandom(self.size*32)) if seeds is None else seeds
            cl.enqueue_copy(self.queue,self.seeds,seeds)
        found={}
        passes=[(self.config,self.static)]
        if self.rare_static is not None: passes.append((self.config['discovery'],self.rare_static))
        for reuse,(c,static) in enumerate(passes):
            count=np.zeros(1,dtype=np.uint32)
            cl.enqueue_copy(self.queue,self.count,count)
            self.search_kernel(self.queue,(self.size,),None,self.seeds,self.count,self.indices,self.pubs,*static,
                np.uint32(len(c['prefix'])),np.uint32(len(c['suffix'])),np.int32({'first5':8,'first6':9,'first7':10,'first8':11,'first9':12,'first10':13,'last7':14,'last8':15,'last9':16,'last10':17,'joined':7,'both':6,'ends':0,'suffix':1,'any':2,'first4':3,'last4':4,'last5':5}[c['scope']]),
                np.int32(c['leet']),np.int32(2 if c.get('directSearch') else c['onlyMatches']),np.int32(c['minRank']),np.int32(c.get('requiredRepeat',0)),np.int32((c.get('ignoreRepeatedMax') or 44) if c.get('ignoreRepeated',False) else 0),self.candidate_pubs,np.int32(reuse))
            cl.enqueue_copy(self.queue,count,self.count).wait()
            n=int(count[0]); indices=np.empty(n,dtype=np.uint32);pubs=np.empty(n*32,dtype=np.uint8)
            if n:
                cl.enqueue_copy(self.queue,indices,self.indices).wait();cl.enqueue_copy(self.queue,pubs,self.pubs).wait()
                for slot,index in enumerate(indices): found[int(index)]=pubs[slot*32:(slot+1)*32].copy()
        indices=np.array(list(found),dtype=np.uint32)
        pubs=np.concatenate(list(found.values())) if found else np.empty(0,dtype=np.uint8)
        return seeds,indices,pubs


def run_device(index, config, deadline=None):
    if config.get('chain') == 'eth' and config.get('generationMode') == 'private-key':
        from bitcoin_fast import run_secp256k1_fast
        from ethereum_fast import EthereumFastEngine
        return run_secp256k1_fast(devices()[index], index, config, arrays, STOP, emit, deadline, EthereumFastEngine)
    if config.get('chain') == 'sol' and config.get('generationMode') == 'recovery-phrase':
        from solana_recovery import run_solana_recovery
        return run_solana_recovery(devices()[index], index, config, Engine, arrays, STOP, emit, deadline)
    if config.get('chain') == 'btc' and config.get('generationMode') == 'private-key':
        from bitcoin_fast import run_bitcoin_fast
        return run_bitcoin_fast(devices()[index], index, config, arrays, STOP, emit, deadline)
    if config.get('chain') == 'btc':
        from bitcoin import run_bitcoin
        return run_bitcoin(devices()[index], index, config, arrays, STOP, emit, deadline)
    if STOP.is_set(): return 0
    engine=Engine(devices()[index])
    if STOP.is_set(): return 0
    engine.verify()
    if STOP.is_set(): return 0
    engine.prepare(config,16384)
    emit({'type':'ready','device':index,'name':devices()[index].name})
    attempts=0;last=time.perf_counter();kept=0
    while not STOP.is_set() and (deadline is None or time.perf_counter()<deadline):
        seeds,indices,pubs=engine.batch();attempts+=engine.size;matches=[]
        try:
            for slot,idx in enumerate(indices if config.get('discovery') or config.get('keepBest') else indices[:config.get('target',500)]):
                if STOP.is_set(): break
                seed=bytes(seeds[int(idx)*32:(int(idx)+1)*32]);pub=bytes(pubs[slot*32:(slot+1)*32])
                # Independently verify every emitted GPU result on CPU.
                if bytes(SigningKey(seed).verify_key)!=pub: raise RuntimeError('GPU result verification failed')
                kept+=1
                if deadline is None: matches.append({'seed':seed.hex(),'pub':pub.hex()})
                if len(matches) >= 128:
                    emit({'type':'progress','device':index,'attempts':attempts,'matches':matches})
                    matches=[]
            now=time.perf_counter()
            if matches or now-last>=0.2:
                emit({'type':'progress','device':index,'attempts':attempts,'matches':matches})
                last=now
        finally: seeds[:]=bytes(len(seeds))
    emit({'type':'done','device':index,'attempts':attempts,'matches':[], 'verifiedMatches':kept})
    return attempts

def read_commands():
    for line in sys.stdin:
        try:
            command = json.loads(line)
            if command.get('type')=='stop': STOP.set();return
            if command.get('type')=='ack' and command.get('device') in ACKS:
                ACKS[command['device']].set()
        except (ValueError,AttributeError): STOP.set();return
    STOP.set()

def main():
    if '--devices' in sys.argv:
        emit({'devices':[{'index':i,'name':d.name,'memory':d.global_mem_size} for i,d in enumerate(devices())]});return
    request=json.loads(sys.stdin.readline());config=request['config']
    if (config.get('chain'),config.get('generationMode')) not in [('sol','private-key'),('sol','recovery-phrase'),('btc','recovery-phrase'),('btc','private-key'),('eth','private-key')]: raise ValueError('GPU supports Fast mode for Solana, Bitcoin and Ethereum; recovery mode for Solana and Bitcoin')
    selected=request['devices']
    if not selected or len(set(selected))!=len(selected) or any(type(i)!=int or not 0<=i<len(devices()) for i in selected): raise ValueError('Invalid GPU selection')
    ACKS.update({i:threading.Event() for i in selected})
    threading.Thread(target=read_commands,daemon=True).start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(selected)) as pool:
        tasks=[pool.submit(run_device,i,config) for i in selected]
        for task in concurrent.futures.as_completed(tasks):
            try: task.result()
            except Exception: STOP.set();raise
    emit({'type':'stopped'})

if __name__=='__main__':
    try: main()
    except Exception as error:
        STOP.set();emit({'type':'error','message':str(error)});sys.exit(1)
