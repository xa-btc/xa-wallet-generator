import { mkdirSync, readdirSync, statSync, openSync, closeSync, readSync, writeSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Immutable, length-addressed records: payload bytes are durable before the
// catalog commits their pointer. A failed transaction can leave unused bytes,
// but cannot overwrite a key referenced by an earlier catalog snapshot.
export function createPayloadParts(directory, maxBytes = 128 * 1024 * 1024) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid payload part size.');
  const root=join(directory,'parts');mkdirSync(root,{recursive:true});
  const names=readdirSync(root).filter(n=>/^wallets-\d{6}\.jsonl$/.test(n)).sort();
  let part=names.length?Number(names.at(-1).slice(8,14)):1;
  let fd, length=0, dirty=false;
  const name=()=>`wallets-${String(part).padStart(6,'0')}.jsonl`;
  function flush(){if(fd!==undefined&&dirty){fsyncSync(fd);dirty=false;}}
  function close(){flush();if(fd!==undefined){closeSync(fd);fd=undefined;}}
  function put(data){
    const bytes=Buffer.from(data+'\n');
    if(bytes.length-1>32*1024*1024)throw new Error('Wallet payload exceeds the supported record size.');
    if(fd===undefined){fd=openSync(join(root,name()),'a',0o600);length=statSync(join(root,name())).size;}
    if(length&&length+bytes.length>maxBytes){close();part++;if(part>999999)throw new Error('Payload part limit reached.');return put(data);}
    const offset=length;let written=0;
    while(written<bytes.length){const n=writeSync(fd,bytes,written,bytes.length-written);if(!n)throw new Error('Payload write failed.');written+=n;length+=n;}
    dirty=true;
    return JSON.stringify({$payload:name(),offset,length:bytes.length-1,sha256:createHash('sha256').update(data).digest('hex')});
  }
  function read(value){
    const pointer=JSON.parse(value);
    if(!pointer.$payload||pointer.chain)return value;
    if(!/^wallets-\d{6}\.jsonl$/.test(pointer.$payload)||!Number.isSafeInteger(pointer.offset)||pointer.offset<0||!Number.isSafeInteger(pointer.length)||pointer.length<1||pointer.length>32*1024*1024)throw new Error('Invalid payload pointer.');
    const input=openSync(join(root,pointer.$payload),'r');
    try{
      const bytes=Buffer.alloc(pointer.length);let used=0;
      while(used<bytes.length){const n=readSync(input,bytes,used,bytes.length-used,pointer.offset+used);if(!n)throw new Error('Incomplete wallet payload.');used+=n;}
      if(createHash('sha256').update(bytes).digest('hex')!==pointer.sha256)throw new Error('Wallet payload checksum mismatch.');
      return bytes.toString('utf8');
    }finally{closeSync(input);}
  }
  return {put,read,flush,close};
}
