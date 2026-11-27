import { HuntCollector } from './discovery.js';
// Browser-independent coordinator so stop, target and duplicate handling can
// be tested without generating or exporting real browser-wallet collections.
export function recommendedWorkers(logicalCores = 4) {
  return Math.max(1, Math.min(12, Math.floor(Number(logicalCores) || 4) - 2));
}

export class SearchPool {
  constructor({ createWorker, onProgress, onFinish, onError }) {
    Object.assign(this, { createWorker, onProgress, onFinish, onError });
    this.entries = []; this.active = false;
  }
  start(config, count, existing = [], rareExisting = []) {
    if (this.active) throw new Error('A hunt is already running');
    this.active = true; this.stopping = false; this.reason = '';
    this.collector = new HuntCollector(config, existing, rareExisting);
    this.entries = [];
    try {
      for (let i = 0; i < count; i++) {
        const worker = this.createWorker();
        const entry = { worker, attempts: 0, done: false }; this.entries.push(entry);
        worker.onerror = () => this.fail('A generation worker failed. Your collected wallets are retained.');
        worker.onmessage = ({ data }) => this.receive(entry, data);
        worker.postMessage({ type: 'start', config });
      }
    } catch (error) { this.fail(error.message); }
  }
  receive(entry, data) {
    if (!this.active || entry.done || !this.entries.includes(entry)) return;
    if (data.type === 'error') { this.fail(data.message); return; }
    if (data.type !== 'progress') return;
    entry.attempts = data.attempts;
    const accepted = this.collector.accept(data.wallets);
    if (data.done) { entry.done = true; entry.worker.terminate(); }
    this.onProgress({ attempts: this.entries.reduce((sum, e) => sum + e.attempts, 0), ...accepted });
    if (this.collector.reason) this.stop(this.collector.reason);
    if (this.entries.every(e => e.done)) this.finish();
  }
  stop(reason = 'stopped') {
    if (!this.active || this.stopping) return;
    this.stopping = true; this.reason = reason;
    // Let in-flight native work complete and flush matches and counters.
    for (const entry of this.entries) if (!entry.done) entry.worker.postMessage({ type: 'stop' });
    this.timeout = setTimeout(() => this.fail('A worker did not stop in time. Collected wallets are retained.'), 10000);
  }
  forceStop() {
    if (!this.active) return;
    this.reason = 'forced'; this.finish();
  }
  finish() {
    clearTimeout(this.timeout); this.active = false;
    for (const entry of this.entries) entry.worker.terminate();
    this.onFinish(this.reason);
  }
  fail(message) {
    if (!this.active) return;
    clearTimeout(this.timeout); this.active = false;
    for (const entry of this.entries) entry.worker.terminate();
    this.onError(message);
  }
}
