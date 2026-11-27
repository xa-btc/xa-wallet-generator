import { openSync, writeFileSync, readFileSync, unlinkSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function acquireArchiveLock(directory){
  const path=join(directory,'.writer.lock'),token=randomUUID();
  for(let attempt=0;attempt<2;attempt++){
    let fd;
    try{fd=openSync(path,'wx',0o600);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let previous;try{previous=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('Archive lock needs manual inspection.');}
      if(!Number.isInteger(previous.pid)||previous.pid<1)throw new Error('Invalid archive lock.');
      try{process.kill(previous.pid,0);}catch(error){if(error.code==='ESRCH'){unlinkSync(path);continue;}throw error;}
      throw new Error('Wallet archive is already open. Stop XA Wallet Generator before maintenance.');
    }
    try{writeFileSync(fd,JSON.stringify({pid:process.pid,token}));}finally{closeSync(fd);}
    return {release(){if(JSON.parse(readFileSync(path,'utf8')).token!==token)throw new Error('Archive lock ownership changed.');unlinkSync(path);}};
  }
  throw new Error('Cannot acquire archive lock.');
}
