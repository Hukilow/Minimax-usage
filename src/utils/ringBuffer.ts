/**
 * Fixed-size ring buffer. When the buffer is full, the oldest sample is
 * dropped on push. Pure (no VS Code dependency) so it can be unit-tested.
 */
export class RingBuffer<T> {
  private readonly items: T[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('RingBuffer capacity must be a positive integer');
    }
    this.capacity = capacity;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  toArray(): T[] {
    return this.items.slice();
  }

  get size(): number {
    return this.items.length;
  }

  get isFull(): boolean {
    return this.items.length >= this.capacity;
  }

  clear(): void {
    this.items.length = 0;
  }
}
