import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { partitionArchive } from '../server/archive-maintenance.js';

const running=await new Promise(resolve=>{
  const socket=connect({host:'127.0.0.1',port:5173});
  socket.setTimeout(1500);
  socket.once('connect',()=>{socket.destroy();resolve(true);});
  socket.once('error',()=>resolve(false));
  socket.once('timeout',()=>{socket.destroy();resolve(true);});
});
if(running)throw new Error('Stop XA Wallet Generator in its command window before partitioning the archive.');
const directory=fileURLToPath(new URL('../saved/',import.meta.url));
mkdirSync(join(directory,'parts'),{recursive:true});
const result=await partitionArchive(directory,{log:message=>console.log(message)});
console.log(JSON.stringify(result,null,2));
console.log('Archive verified. Start XA Wallet Generator normally. Keep the backup until you have checked your collection.');
