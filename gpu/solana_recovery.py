"""GPU BIP39, SLIP-0010 and Ed25519 search; CPU verification of retained results."""
import hashlib
import hmac
import os
import time
from bitcoin import MNEMONIC, ROOT
import numpy as np
import pyopencl as cl


def derive_key(seed):
    digest = hmac.digest(b'ed25519 seed', seed, 'sha512')
    for index in [44, 501, 0, 0]:
        digest = hmac.digest(digest[32:], b'\0' + digest[:32] + (index + 0x80000000).to_bytes(4, 'big'), 'sha512')
    return bytearray(digest[:32])


class RecoveryEngine:
    def __init__(self, engine):
        self.engine=engine
        self.context=engine.context
        self.queue=engine.queue
        source=(ROOT/'filter.cl').read_text()+'\n'+(ROOT/'bitcoin.cl').read_text()+'\n'+(ROOT/'solana_derive.cl').read_text()
        self.program=cl.Program(self.context,source).build(options=['-cl-std=CL1.2'])
        self.seed_kernel=cl.Kernel(self.program,'btc_bip39')
        self.derive_kernel=cl.Kernel(self.program,'sol_derive')
        self.words=np.zeros((2048,8),dtype=np.uint8)
        self.lengths=np.array([len(word) for word in MNEMONIC.wordlist],dtype=np.int32)
        for index,word in enumerate(MNEMONIC.wordlist):self.words[index,:len(word)]=np.frombuffer(word.encode('ascii'),dtype=np.uint8)
        self.rows=np.arange(engine.size)
        self.inputs=np.zeros((engine.size,128),dtype=np.uint8)
        self.phrase_buffer=cl.Buffer(self.context,cl.mem_flags.READ_ONLY,self.inputs.nbytes)
        self.seed_buffer=cl.Buffer(self.context,cl.mem_flags.READ_WRITE,engine.size*64)

    def derive(self, phrases):
        if len(phrases)!=self.engine.size: raise ValueError('Wrong phrase batch size')
        self.inputs.fill(0)
        try:
            for index,phrase in enumerate(phrases):
                encoded=phrase.encode('ascii')
                if len(encoded)>128: raise ValueError('Expected 12-word English phrase')
                self.inputs[index,:len(encoded)]=np.frombuffer(encoded,dtype=np.uint8)
            self.launch()
        finally:
            self.inputs.fill(0)

    def launch(self):
        cl.enqueue_copy(self.queue,self.phrase_buffer,self.inputs)
        self.seed_kernel(self.queue,(self.engine.size,),None,self.phrase_buffer,self.seed_buffer)
        self.derive_kernel(self.queue,(self.engine.size,),None,self.seed_buffer,self.engine.seeds).wait()

    def derive_entropy(self, entropy):
        if entropy.shape!=(self.engine.size,16):raise ValueError('Expected 128-bit entropy per wallet')
        extended=np.zeros((self.engine.size,17),dtype=np.uint8)
        extended[:,:16]=entropy
        extended[:,16]=np.fromiter((hashlib.sha256(row.tobytes()).digest()[0]&240 for row in entropy),dtype=np.uint8,count=self.engine.size)
        bits=np.unpackbits(extended,axis=1)[:,:132].reshape(-1,12,11)
        indices=(bits*(1<<np.arange(10,-1,-1))).sum(axis=2)
        self.inputs.fill(0)
        offsets=np.zeros(self.engine.size,dtype=np.int32)
        try:
            for column in range(12):
                ids=indices[:,column]
                self.inputs[self.rows[:,None],offsets[:,None]+np.arange(8)]=self.words[ids]
                offsets+=self.lengths[ids]
                if column<11:
                    self.inputs[self.rows,offsets]=32;offsets+=1
            self.launch()
        finally:
            self.inputs.fill(0);extended.fill(0);bits.fill(0);indices.fill(0)

    def key(self,index):
        key=np.empty(32,dtype=np.uint8)
        cl.enqueue_copy(self.queue,key,self.engine.seeds,src_offset=index*32).wait()
        return key

    def clear(self):
        for buffer,size in [(self.phrase_buffer,self.inputs.nbytes),(self.seed_buffer,self.engine.size*64),(self.engine.seeds,self.engine.size*32)]:
            cl.enqueue_fill_buffer(self.queue,buffer,np.uint8(0),0,size)
        self.queue.finish()

    def verify(self):
        entropy=[bytes(16),bytes([255])*16]+[os.urandom(16) for _ in range(6)]
        phrases=[MNEMONIC.to_mnemonic(value) for value in entropy]
        for vectorized in [False,True]:
            batch=np.array([list(entropy[i%len(entropy)]) for i in range(self.engine.size)],dtype=np.uint8)
            if vectorized:self.derive_entropy(batch)
            else:self.derive([phrases[i%len(phrases)] for i in range(self.engine.size)])
            try:
                for index in [0,1,2,3,4,5,6,7,self.engine.size-1]:
                    phrase=phrases[index%len(phrases)]
                    expected=derive_key(hashlib.pbkdf2_hmac('sha512',phrase.encode(),b'mnemonic',2048,64))
                    actual=self.key(index)
                    try:
                        if bytes(actual)!=bytes(expected):raise RuntimeError('GPU Solana recovery derivation verification failed')
                    finally:actual.fill(0);expected[:]=bytes(len(expected))
            finally:batch.fill(0);self.clear()



def run_solana_recovery(device, index, config, engine_type, arrays, stop, emit, deadline=None):
    if stop.is_set(): return 0
    engine=engine_type(device)
    engine.verify()
    if stop.is_set(): return 0
    engine.prepare(config,16384,arrays)
    recovery=RecoveryEngine(engine)
    recovery.verify()
    if stop.is_set(): return 0
    emit({'type':'ready','device':index,'name':device.name})
    attempts=0
    try:
        while not stop.is_set() and (deadline is None or time.perf_counter()<deadline):
            entropy=np.frombuffer(bytearray(os.urandom(engine.size*16)),dtype=np.uint8).reshape(engine.size,16)
            try:
                recovery.derive_entropy(entropy)
                if stop.is_set(): break
                _,indices,pubs=engine.batch(device_seeds=True)
                attempts+=engine.size
                matches=[]
                for slot,candidate in enumerate(indices):
                    if stop.is_set(): break
                    candidate=int(candidate)
                    key=recovery.key(candidate)
                    phrase=MNEMONIC.to_mnemonic(entropy[candidate].tobytes())
                    expected=derive_key(hashlib.pbkdf2_hmac('sha512',phrase.encode(),b'mnemonic',2048,64))
                    try:
                        if bytes(key)!=bytes(expected): raise RuntimeError('GPU Solana phrase verification failed')
                        if deadline is None: matches.append({'entropy':entropy[candidate].tobytes().hex(),'seed':bytes(key).hex(),'pub':bytes(pubs[slot*32:(slot+1)*32]).hex()})
                    finally: key.fill(0);expected[:]=bytes(len(expected))
                    if len(matches)>=32:
                        emit({'type':'progress','device':index,'attempts':attempts,'matches':matches});matches=[]
                emit({'type':'progress','device':index,'attempts':attempts,'matches':matches})
            finally:
                entropy.fill(0)
                recovery.clear()
    finally: recovery.clear()
    emit({'type':'done','device':index,'attempts':attempts,'matches':[]})
    return attempts
