import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../utils/ringBuffer.js';

describe('RingBuffer', () => {
  it('rejects non-positive capacities', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(-1)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });

  it('preserves insertion order while below capacity', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    expect(buf.toArray()).toEqual([1, 2]);
    expect(buf.size).toBe(2);
    expect(buf.isFull).toBe(false);
  });

  it('drops the oldest item when over capacity', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.isFull).toBe(true);
    buf.push(4);
    expect(buf.toArray()).toEqual([2, 3, 4]);
    expect(buf.size).toBe(3);
  });

  it('clears the buffer', () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.toArray()).toEqual([]);
    expect(buf.size).toBe(0);
    expect(buf.isFull).toBe(false);
  });
});
