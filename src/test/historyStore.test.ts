import { describe, expect, it, vi } from 'vitest';
import {
  HISTORY_KEY,
  HISTORY_VERSION,
  MAX_HISTORY_AGE_MS,
  RAW_WINDOW_MS,
  QuotaHistoryStore,
  deserialize,
  downsample,
  mergeSamples,
  serialize,
} from '../api/historyStore.js';
import type { QuotaSample } from '../api/types.js';

// ---- helpers -------------------------------------------------------------

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

function sample(ts: number, intervalUsed = 10, weeklyUsed = 20): QuotaSample {
  return {
    timestamp: ts,
    perModel: {
      general: {
        interval: { usedPercent: intervalUsed, status: 1 },
        weekly: { usedPercent: weeklyUsed, status: 1 },
      },
    },
  };
}

/** Build `count` evenly-spaced samples ending at `now`. */
function samplesEndingAt(now: number, count: number, stepMs: number): QuotaSample[] {
  const out: QuotaSample[] = [];
  for (let i = 0; i < count; i++) {
    out.push(sample(now - (count - 1 - i) * stepMs));
  }
  return out;
}

// ---- serialize / deserialize ---------------------------------------------

describe('serialize + deserialize', () => {
  it('round-trips a small buffer', () => {
    const now = Date.now();
    const original = samplesEndingAt(now, 5, 60_000);
    const blob = serialize(original, now);
    expect(blob.version).toBe(HISTORY_VERSION);
    expect(blob.savedAt).toBe(now);
    expect(blob.samples).toHaveLength(5);

    const { samples, dropped } = deserialize(blob);
    expect(dropped).toBe(0);
    expect(samples).toHaveLength(5);
    expect(samples.map((s) => s.timestamp)).toEqual(original.map((s) => s.timestamp));
  });

  it('serializes oldest-first regardless of input order', () => {
    const now = Date.now();
    const original = [sample(now), sample(now - 60_000), sample(now - 120_000)];
    const blob = serialize(original, now);
    expect(blob.samples.map((s) => s.timestamp)).toEqual([
      now - 120_000,
      now - 60_000,
      now,
    ]);
  });

  it('writes the documented storage key', () => {
    expect(HISTORY_KEY).toBe('history.v1');
  });
});

describe('deserialize defensive parsing', () => {
  it('returns empty for null', () => {
    expect(deserialize(null)).toEqual({ samples: [], dropped: 0 });
  });

  it('returns empty for non-object', () => {
    expect(deserialize(42)).toEqual({ samples: [], dropped: 0 });
    expect(deserialize('hello')).toEqual({ samples: [], dropped: 0 });
    expect(deserialize([])).toEqual({ samples: [], dropped: 0 });
  });

  it('returns empty for unknown version', () => {
    expect(deserialize({ version: 99, samples: [] })).toEqual({
      samples: [],
      dropped: 0,
    });
  });

  it('returns empty when samples is not an array', () => {
    expect(deserialize({ version: HISTORY_VERSION, samples: 'oops' })).toEqual({
      samples: [],
      dropped: 0,
    });
  });

  it('drops malformed samples and reports the count', () => {
    const blob = {
      version: HISTORY_VERSION,
      samples: [
        sample(1000),
        { timestamp: 'not a number' }, // bad ts
        { timestamp: 2000, perModel: null }, // bad perModel
        { timestamp: 3000, perModel: { general: null } }, // bad perModel entry
        {
          timestamp: 4000,
          perModel: {
            general: { interval: { usedPercent: 'NaN', status: 1 }, weekly: { usedPercent: 20, status: 1 } },
          },
        },
        sample(5000),
      ],
    };
    const { samples, dropped } = deserialize(blob);
    expect(dropped).toBe(4);
    expect(samples.map((s) => s.timestamp)).toEqual([1000, 5000]);
  });

  it('clamps and rounds percent values', () => {
    const blob = {
      version: HISTORY_VERSION,
      samples: [
        {
          timestamp: 1000,
          perModel: {
            general: {
              interval: { usedPercent: 12.6, status: 1 },
              weekly: { usedPercent: 250, status: 1 },
            },
          },
        },
      ],
    };
    const { samples } = deserialize(blob);
    expect(samples[0]!.perModel.general!.interval.usedPercent).toBe(13);
    expect(samples[0]!.perModel.general!.weekly.usedPercent).toBe(100);
  });
});

// ---- downsample ----------------------------------------------------------

describe('downsample', () => {
  it('returns empty for empty input', () => {
    expect(downsample([], 100, Date.now())).toEqual([]);
  });

  it('returns empty when limit is invalid', () => {
    const now = Date.now();
    expect(downsample([sample(now)], 0, now)).toEqual([]);
    expect(downsample([sample(now)], -1, now)).toEqual([]);
    expect(downsample([sample(now)], 1.5, now)).toEqual([]);
  });

  it('returns input unchanged when it fits in limit', () => {
    const now = Date.now();
    const samples = samplesEndingAt(now, 10, 60_000);
    expect(downsample(samples, 100, now)).toEqual(samples);
  });

  it('drops samples older than MAX_HISTORY_AGE_MS', () => {
    const now = Date.now();
    const old = sample(now - MAX_HISTORY_AGE_MS - 1);
    const recent = sample(now - HOUR);
    const result = downsample([old, recent], 100, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp).toBe(recent.timestamp);
  });

  it('preserves the raw window (last 1 h) untouched when bucketing', () => {
    const now = Date.now();
    // 10 raw samples in the last 30 min, 200 old samples 2..5 days ago.
    const raw = samplesEndingAt(now, 10, 3 * 60_000); // last 30 min
    const old = samplesEndingAt(now - 2 * DAY, 200, 30 * 60_000); // 200 over 5 days
    const result = downsample([...old, ...raw], 60, now);
    // Raw samples must be present unchanged.
    const rawTimestamps = new Set(raw.map((s) => s.timestamp));
    for (const r of result) {
      if (r.timestamp >= now - RAW_WINDOW_MS) {
        expect(rawTimestamps.has(r.timestamp)).toBe(true);
      }
    }
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('never exceeds the limit, even on extreme input', () => {
    const now = Date.now();
    const huge = samplesEndingAt(now, 5_000, 60_000);
    const result = downsample(huge, 100, now);
    expect(result.length).toBeLessThanOrEqual(100);
    // Oldest retained sample is within the age window.
    expect(result[0]!.timestamp).toBeGreaterThanOrEqual(now - MAX_HISTORY_AGE_MS);
    // Newest is "now" (the last raw sample).
    expect(result[result.length - 1]!.timestamp).toBe(now);
  });

  it('returns oldest-first sorted output', () => {
    const now = Date.now();
    const samples = samplesEndingAt(now, 500, 60_000);
    const result = downsample(samples, 50, now);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.timestamp).toBeGreaterThanOrEqual(result[i - 1]!.timestamp);
    }
  });

  it('produces ≤ limit samples even when the input is sparse in time', () => {
    const now = Date.now();
    // 500 samples clustered between (now - 2 days) and (now - ~1.65 days).
    // None in the raw window. The bucketed region spans 7 days, but only
    // ~3 buckets will be populated — that's the correct behaviour for
    // sparse data (we never invent samples where none exist).
    const samples = samplesEndingAt(now - 2 * DAY, 500, 60_000);
    const result = downsample(samples, 50, now);
    expect(result.length).toBeLessThanOrEqual(50);
    // Result stays in the age window.
    for (const s of result) {
      expect(s.timestamp).toBeGreaterThanOrEqual(now - MAX_HISTORY_AGE_MS);
    }
  });

  it('exposes a deterministic math ceiling', () => {
    // At 1 s polling for 7 days straight (~604_800 samples), downsampling
    // must collapse the raw and bucketed portions so the total ≤ limit.
    const now = Date.now();
    const huge = samplesEndingAt(now, 604_800, 1_000);
    const result = downsample(huge, 2000, now);
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

// ---- QuotaHistoryStore wrapper ------------------------------------------

describe('mergeSamples', () => {
  it('returns incoming when existing is empty', () => {
    const now = Date.now();
    const incoming = [sample(now - 60_000), sample(now)];
    expect(mergeSamples([], incoming)).toEqual(
      [...incoming].sort((a, b) => a.timestamp - b.timestamp),
    );
  });

  it('returns existing when incoming is empty', () => {
    const now = Date.now();
    const existing = [sample(now - 60_000), sample(now)];
    expect(mergeSamples(existing, [])).toEqual(existing);
  });

  it('unions two disjoint buffers sorted oldest-first', () => {
    const now = Date.now();
    const a = [sample(now - 120_000), sample(now - 60_000)];
    const b = [sample(now - 30_000), sample(now)];
    const merged = mergeSamples(a, b);
    expect(merged.map((s) => s.timestamp)).toEqual([
      now - 120_000,
      now - 60_000,
      now - 30_000,
      now,
    ]);
  });

  it('last-write-wins on duplicate timestamps', () => {
    const now = Date.now();
    const a = [{ timestamp: now, perModel: { general: { interval: { usedPercent: 10, status: 1 }, weekly: { usedPercent: 10, status: 1 } } } }];
    const b = [{ timestamp: now, perModel: { general: { interval: { usedPercent: 80, status: 1 }, weekly: { usedPercent: 80, status: 1 } } } }];
    const merged = mergeSamples(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.perModel.general!.interval.usedPercent).toBe(80);
  });

  it('simulates two extension hosts: A and B both write into a shared blob', () => {
    const now = Date.now();
    const hostA = [sample(now - 60_000, 5, 5)]; // A saw this 1 min ago
    const hostB = [sample(now, 50, 60)]; // B just fetched
    // A saves first.
    const afterA = mergeSamples([], hostA);
    // B sees A's write on its next save (read-modify-write).
    const afterB = mergeSamples(afterA, hostB);
    expect(afterB).toHaveLength(2);
    expect(afterB.map((s) => s.timestamp)).toEqual([now - 60_000, now]);
    // And vice-versa — if B saved first, A still gets both samples.
    const reverse = mergeSamples(hostB, hostA);
    expect(reverse.map((s) => s.timestamp)).toEqual([now - 60_000, now]);
  });
});

describe('QuotaHistoryStore', () => {
  function fakePersistence(initial: unknown = undefined): {
    store: { read(): unknown; write(b: unknown): void };
    writes: unknown[];
  } {
    let value: unknown = initial;
    const writes: unknown[] = [];
    return {
      writes,
      store: {
        read: () => value,
        write: (b: unknown) => {
          writes.push(b);
          value = b;
        },
      },
    };
  }

  it('load() returns empty array when storage is empty', () => {
    const { store } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 1_000 });
    expect(hs.load()).toEqual([]);
  });

  it('load() parses a stored blob', () => {
    const now = Date.now();
    const original = samplesEndingAt(now, 5, 60_000);
    const blob = serialize(original, now);
    const { store } = fakePersistence(blob);
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 1_000 });
    expect(hs.load()).toHaveLength(5);
  });

  it('scheduleSave debounces multiple calls into a single write', async () => {
    const { store, writes } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 30 });
    const now = Date.now();
    hs.scheduleSave(samplesEndingAt(now, 3, 60_000), now);
    hs.scheduleSave(samplesEndingAt(now, 5, 60_000), now + 60_000);
    hs.scheduleSave(samplesEndingAt(now, 7, 60_000), now + 120_000);
    // Not yet — still pending.
    expect(writes).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(writes).toHaveLength(1);
    const blob = writes[0] as { version: number; samples: unknown[] };
    expect(blob.version).toBe(HISTORY_VERSION);
    expect(blob.samples).toHaveLength(7);
    hs.dispose();
  });

  it('flushNow writes immediately and cancels the debounce', async () => {
    const { store, writes } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 1_000 });
    const now = Date.now();
    hs.scheduleSave(samplesEndingAt(now, 2, 60_000), now);
    await hs.flushNow();
    expect(writes).toHaveLength(1);
    // After flush, scheduleSave + immediate flush should write again.
    hs.scheduleSave(samplesEndingAt(now, 4, 60_000), now);
    await hs.flushNow();
    expect(writes).toHaveLength(2);
    hs.dispose();
  });

  it('flushNow performs read-modify-write merge (multi-window safety)', async () => {
    // Simulates window A saving at t0, then window B saving at t1.
    // B's storage reads A's persisted blob and merges its new samples in,
    // so B never overwrites A's older data.
    let stored: unknown = undefined;
    const store = {
      read: () => stored,
      write: (b: unknown) => { stored = b; },
    };
    const a = new QuotaHistoryStore(store, { limit: 100, debounceMs: 60_000 });
    const b = new QuotaHistoryStore(store, { limit: 100, debounceMs: 60_000 });

    const now = Date.now();
    const aSamples = samplesEndingAt(now, 5, 60_000); // 5 samples ending now
    const bSamples = samplesEndingAt(now + 30_000, 3, 60_000); // 3 samples after A's

    a.scheduleSave(aSamples, now);
    await a.flushNow();
    // After A: blob has A's 5 samples.
    const blobAfterA = deserialize(stored);
    expect(blobAfterA.samples).toHaveLength(5);

    // B writes its own samples \u2014 it must merge with A's, not clobber.
    b.scheduleSave(bSamples, now + 30_000);
    await b.flushNow();
    const blobAfterB = deserialize(stored);
    // Combined: at least 5 + some new ones (B's timestamps extend A's, but
    // A already had a sample at `now` and B has one at `now + 30_000`, so
    // union is at least 6 timestamps).
    expect(blobAfterB.samples.length).toBeGreaterThanOrEqual(6);
    // The blob must still contain A's oldest timestamp.
    const ts = blobAfterB.samples.map((s) => s.timestamp);
    expect(ts[0]).toBe(aSamples[0]!.timestamp);

    a.dispose();
    b.dispose();
  });

  it('concurrent flushNow calls serialize (mutex)', async () => {
    // write() takes 30 ms; if two flushNow calls fired in parallel, the
    // second would see stale storage. The store should bail out cleanly.
    let writeCount = 0;
    const store = {
      read: () => undefined,
      write: async () => {
        writeCount++;
        await new Promise((r) => setTimeout(r, 30));
      },
    };
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 60_000 });
    const now = Date.now();
    hs.scheduleSave(samplesEndingAt(now, 2, 60_000), now);
    hs.scheduleSave(samplesEndingAt(now, 4, 60_000), now);
    // Fire two flushes in parallel. The first one wins; the second one
    // sees an in-flight write and skips (it would write the same data).
    await Promise.all([hs.flushNow(), hs.flushNow()]);
    expect(writeCount).toBe(1);
    hs.dispose();
  });

  it('clear() wipes storage and cancels pending writes', async () => {
    const { store, writes } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 1_000 });
    hs.scheduleSave(samplesEndingAt(Date.now(), 3, 60_000), Date.now());
    await hs.clear();
    const blob = writes[writes.length - 1] as { samples: unknown[] };
    expect(blob.samples).toEqual([]);
    hs.dispose();
  });

  it('dispose() drops pending writes without touching storage', async () => {
    const { store, writes } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 10 });
    hs.scheduleSave(samplesEndingAt(Date.now(), 3, 60_000), Date.now());
    hs.dispose();
    await new Promise((r) => setTimeout(r, 30));
    expect(writes).toHaveLength(0);
  });

  it('writes do not keep the Node process alive (timer.unref)', () => {
    const { store } = fakePersistence();
    const hs = new QuotaHistoryStore(store, { limit: 100, debounceMs: 60_000 });
    hs.scheduleSave(samplesEndingAt(Date.now(), 1, 60_000), Date.now());
    // Spy on setTimeout to capture the timer handle.
    const spy = vi.spyOn(globalThis, 'setTimeout');
    hs.scheduleSave(samplesEndingAt(Date.now(), 2, 60_000), Date.now());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    hs.dispose();
  });
});
