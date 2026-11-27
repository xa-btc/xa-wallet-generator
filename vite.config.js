import { defineConfig } from 'vite';
import { gpuBridge } from './gpu/bridge.js';
import { createSavedStore } from './server/saved-store.js';
import { savedBridge } from './server/saved-bridge.js';
import { fileURLToPath } from 'node:url';

export default defineConfig(async ({command}) => {
  // Vite can reload its config in the same process. Retire that process's old
  // catalog before acquiring the exclusive archive writer lock again.
  const storeKey=Symbol.for('wallet-forge.local-archive');
  if(command==='serve'&&globalThis[storeKey]){globalThis[storeKey].close();delete globalThis[storeKey];}
  const log = message => console.info('[Archive] ' + message);
  if (command === 'serve') log('Opening your local wallet archive. The site URL will appear here when ready.');
  const store = command === 'serve'
    ? await createSavedStore(fileURLToPath(new URL('./saved/',import.meta.url)), {log})
    : null;
  if(store)globalThis[storeKey]=store;
  return {
  plugins:store ? [gpuBridge({saveWallets:store.save,saveRun:store.recordRun}),savedBridge(store)] : [],
  build:{rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),saved:fileURLToPath(new URL('./saved.html',import.meta.url))}}},
  server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/saved/**','**/.gpu-venv/**']},fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/saved/**']}},
  preview:{host:'127.0.0.1',port:5173,strictPort:true},
}; });
