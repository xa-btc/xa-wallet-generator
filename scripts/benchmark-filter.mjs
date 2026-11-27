import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../gpu/bridge.js';
import { selectedWords, RESULT_WORD_CATEGORIES } from '../src/word-packs.js';
import { WORDS } from '../src/matching.js';

const base={chain:'sol',generationMode:'private-key',scope:'suffix',minLength:3,prefix:'',suffix:'',leet:true,onlyMatches:true,minRank:4,target:999999};
const words=selectedWords(Object.fromEntries(RESULT_WORD_CATEGORIES.filter(([id])=>id!=='all'&&id!=='expanded').map(([id])=>[id,true]))).filter(w=>w.length<=6);
const cases=[
  {name:'themed-last6',config:validateConfig({...base,words:WORDS.filter(w=>w.length>=3&&w.length<=6)})},
  {name:'all-default-last6',config:validateConfig({...base,words})},
  {name:'all-default-last6-overflow',config:validateConfig({...base,words,discoveryRank:4,discoveryRemaining:999999})},
  {name:'all-default-last6-mythic-overflow',config:validateConfig({...base,words,minRank:5,discoveryRank:5,discoveryRemaining:999999})},
];
const child=spawn(fileURLToPath(new URL('../.gpu-venv/Scripts/python.exe',import.meta.url)),[fileURLToPath(new URL('../gpu/benchmark_filter.py',import.meta.url))],{windowsHide:true});
let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>process.stderr.write(d));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('close',code=>{if(code)throw new Error('Filter benchmark failed');for(const result of JSON.parse(output))console.log(JSON.stringify(result));});
child.stdin.end(JSON.stringify({device:Number(process.argv[2]??1),cases}));
