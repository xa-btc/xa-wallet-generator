// Node adapter for the exact browser worker module. Never logs wallet keys.
import { parentPort } from 'node:worker_threads';
globalThis.self = { postMessage: message => parentPort.postMessage(message) };
await import('../src/worker.js');
parentPort.on('message', data => self.onmessage({ data }));
parentPort.postMessage({ type: 'ready' });
