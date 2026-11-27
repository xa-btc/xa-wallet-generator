export const walletId = w => `${w.chain}:${w.address}`;
const compare = (a, b) => a.level - b.level || a.score - b.score;

// Bounded min-heap: the weakest keeper is replaced in O(log capacity), without
// retaining an ever-growing history of rejected/replaced addresses or keys.
export class BestKeepers {
  constructor(capacity, existing = []) {
    this.capacity = capacity; this.heap = []; this.ids = new Set();
    for (const wallet of existing) this.offer(wallet);
  }
  offer(wallet) {
    const id = walletId(wallet);
    if (this.ids.has(id)) return { accepted: false };
    if (this.heap.length < this.capacity) {
      this.heap.push(wallet); this.ids.add(id);
      let i = this.heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (compare(this.heap[i], this.heap[parent]) >= 0) break;
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]]; i = parent;
      }
      return { accepted: true };
    }
    if (compare(wallet, this.heap[0]) <= 0) return { accepted: false };
    const removed = walletId(this.heap[0]); this.ids.delete(removed); this.ids.add(id);
    this.heap[0] = wallet;
    let i = 0;
    while (true) {
      let child = i * 2 + 1;
      if (child >= this.heap.length) break;
      if (child + 1 < this.heap.length && compare(this.heap[child + 1], this.heap[child]) < 0) child++;
      if (compare(this.heap[i], this.heap[child]) <= 0) break;
      [this.heap[i], this.heap[child]] = [this.heap[child], this.heap[i]]; i = child;
    }
    return { accepted: true, removed };
  }
}
