/**
 * Persistence for the dashboard history.
 *
 * The QuotaService keeps a bounded ring buffer of samples in memory. We
 * mirror that buffer to VS Code `globalState` so the charts survive restarts.
 *
 * To keep the on-disk footprint deterministic regardless of how long the
 * extension has been running, we downsample on every save:
 *
 *   raw window (last 1 h, no bucketing)        +  adaptive buckets for the rest
 *   ----------------------------------------------------------------------
 *   hard ceiling: historySampleLimit samples  ≤  7 days of data
 *
 * At default settings (limit = 100), the worst-case on-disk size is ~5 KB.
 * At the maximum (limit = 2000), it's ~100 KB. Both fit comfortably inside
 * VS Code's per-key globalState budget.
 *
 * Everything in this file is pure (no VS Code imports) so it's unit-tested
 * in isolation. The thin `QuotaHistoryStore` wrapper just glues it to a
 * debounced `globalState` writer.
 */

import type { QuotaSample } from './types.js';

/** Current on-disk schema version. Bump when the layout changes. */
export const HISTORY_VERSION = 1;

/** Storage key under `globalState`. */
export const HISTORY_KEY = 'history.v1';

/** Hard upper bound on the age of any retained sample. */
export const MAX_HISTORY_AGE_MS = 7 * 86_400_000;

/** Length of the raw (un-bucketed) window at the tail of the buffer. */
export const RAW_WINDOW_MS = 60 * 60_000; // 1 hour

/** Shape written to globalState. */
export interface HistoryBlob {
  version: 1;
  samples: QuotaSample[];
  /** ms since epoch when the blob was written. Useful for debugging only. */
  savedAt: number;
}

/**
 * Minimal storage interface. Implemented by `QuotaHistoryStore` over
 * `globalState`. Tests pass an in-memory map.
 *
 * `write` may return a Promise (e.g. `globalState.update` is async); the
 * store awaits it to serialize concurrent flushes within the same window.
 */
export interface HistoryPersistence {
  read(): unknown;
  write(blob: HistoryBlob): void | Promise<void>;
}

/**
 * Serializes samples for storage. Does not downsample — callers should
 * pass already-bounded samples.
 */
export function serialize(samples: readonly QuotaSample[], now: number): HistoryBlob {
  // Defensive copy + sort to make the on-disk layout deterministic.
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  return {
    version: HISTORY_VERSION,
    samples: sorted.map(cloneSample),
    savedAt: now,
  };
}

function cloneSample(s: QuotaSample): QuotaSample {
  const perModel: QuotaSample['perModel'] = {};
  for (const model of Object.keys(s.perModel)) {
    const m = s.perModel[model]!;
    perModel[model] = {
      interval: { usedPercent: m.interval.usedPercent, status: m.interval.status },
      weekly: { usedPercent: m.weekly.usedPercent, status: m.weekly.status },
    };
  }
  return { timestamp: s.timestamp, perModel };
}

/**
 * Parses a stored blob into a clean `QuotaSample[]`.
 *
 * Drops malformed entries silently (defensive — same policy as the rest
 * of the codebase when handling unknown upstream payloads). Returns the
 * number of dropped entries so the caller can log it.
 */
export function deserialize(blob: unknown): { samples: QuotaSample[]; dropped: number } {
  if (!isObject(blob)) return { samples: [], dropped: 0 };
  if (blob.version !== HISTORY_VERSION) {
    // Unknown schema — bail out rather than guess.
    return { samples: [], dropped: 0 };
  }
  const rawSamples = blob.samples;
  if (!Array.isArray(rawSamples)) return { samples: [], dropped: 0 };

  const out: QuotaSample[] = [];
  let dropped = 0;
  for (const entry of rawSamples) {
    const s = coerceSample(entry);
    if (s) out.push(s);
    else dropped++;
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return { samples: out, dropped };
}

function coerceSample(v: unknown): QuotaSample | null {
  if (!isObject(v)) return null;
  const ts = toFiniteNumber(v.timestamp);
  if (ts === null) return null;
  const perModelRaw = v.perModel;
  if (!isObject(perModelRaw)) return null;
  const perModel: QuotaSample['perModel'] = {};
  for (const model of Object.keys(perModelRaw)) {
    const entry = (perModelRaw as Record<string, unknown>)[model];
    if (!isObject(entry)) return null;
    const intervalRaw = entry.interval;
    const weeklyRaw = entry.weekly;
    if (!isObject(intervalRaw) || !isObject(weeklyRaw)) return null;
    const intervalUsed = toFiniteNumber(intervalRaw.usedPercent);
    const intervalStatus = toFiniteNumber(intervalRaw.status);
    const weeklyUsed = toFiniteNumber(weeklyRaw.usedPercent);
    const weeklyStatus = toFiniteNumber(weeklyRaw.status);
    if (
      intervalUsed === null ||
      intervalStatus === null ||
      weeklyUsed === null ||
      weeklyStatus === null
    ) {
      return null;
    }
    perModel[model] = {
      interval: { usedPercent: clamp(intervalUsed), status: intervalStatus },
      weekly: { usedPercent: clamp(weeklyUsed), status: weeklyStatus },
    };
  }
  return { timestamp: ts, perModel };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Merges a buffer of incoming samples with an existing buffer. Used by the
 * read-modify-write writer so two VS Code windows can't clobber each other's
 * samples when they save at the same time. Strategy: union by timestamp,
 * keep the most recent sample per timestamp (later-write-wins on equality
 * is fine because the same data fetch produces identical values).
 *
 * The result is sorted oldest-first and may exceed `limit` — callers
 * should pass the output through `downsample` before persisting.
 */
export function mergeSamples(
  existing: readonly QuotaSample[],
  incoming: readonly QuotaSample[],
): QuotaSample[] {
  if (existing.length === 0) return [...incoming].sort((a, b) => a.timestamp - b.timestamp);
  if (incoming.length === 0) return [...existing].sort((a, b) => a.timestamp - b.timestamp);
  const map = new Map<number, QuotaSample>();
  for (const s of existing) map.set(s.timestamp, s);
  for (const s of incoming) map.set(s.timestamp, s); // later-write-wins on duplicate ts
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Bounds a sample buffer to at most `limit` entries while preserving the
 * most informative view of the data.
 *
 * Algorithm:
 *   1. Drop samples older than MAX_HISTORY_AGE_MS (7 days).
 *   2. Split into the last RAW_WINDOW_MS (1 h) and everything older.
 *   3. The raw window gets at most 60 % of the budget. If it overflows,
 *      bucket it. The older portion fills the remaining 40 %.
 *   4. Pick the last sample of each bucket (standard, predictable
 *      time-series downsample). Output is sorted oldest-first and
 *      length ≤ `limit` by construction.
 */
export function downsample(
  samples: readonly QuotaSample[],
  limit: number,
  now: number,
): QuotaSample[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  if (samples.length === 0) return [];

  // 1. Age cutoff.
  const ageCutoff = now - MAX_HISTORY_AGE_MS;
  const recent = samples.filter((s) => s.timestamp >= ageCutoff);
  if (recent.length === 0) return [];

  // 2. Split raw (last 1 h) vs old (> 1 h).
  const rawCutoff = now - RAW_WINDOW_MS;
  const raw: QuotaSample[] = [];
  const old: QuotaSample[] = [];
  for (const s of recent) {
    (s.timestamp >= rawCutoff ? raw : old).push(s);
  }
  raw.sort((a, b) => a.timestamp - b.timestamp);
  old.sort((a, b) => a.timestamp - b.timestamp);

  // 3. Bucket raw if it overflows its budget.
  const rawBudget = Math.max(1, Math.floor(limit * 0.6));
  const bucketedRaw = raw.length > rawBudget ? bucketize(raw, rawBudget, rawCutoff, now) : raw;

  // 4. Bucket old to fit the remaining budget.
  const oldBudget = Math.max(0, limit - bucketedRaw.length);
  const bucketedOld = oldBudget === 0 ? [] : bucketize(old, oldBudget, ageCutoff, rawCutoff);

  return [...bucketedOld, ...bucketedRaw];
}

/**
 * Splits `samples` into `bucketCount` evenly-spaced buckets across the
 * `[rangeStart, rangeEnd)` range and returns the last sample of each
 * populated bucket. Empty buckets are skipped, so output may be shorter
 * than `bucketCount` if the input is sparse in time.
 */
function bucketize(
  samples: readonly QuotaSample[],
  bucketCount: number,
  rangeStart: number,
  rangeEnd: number,
): QuotaSample[] {
  if (samples.length === 0) return [];
  if (bucketCount <= 0) return [];
  if (samples.length <= bucketCount) return [...samples].sort((a, b) => a.timestamp - b.timestamp);

  const span = Math.max(1, rangeEnd - rangeStart);
  const bucketMs = Math.max(1, span / bucketCount);
  const buckets: QuotaSample[][] = [];
  for (const s of samples) {
    const offset = s.timestamp - rangeStart;
    let idx = Math.floor(offset / bucketMs);
    if (idx < 0) idx = 0;
    else if (idx >= bucketCount) idx = bucketCount - 1;
    const list = buckets[idx];
    if (list) list.push(s);
    else buckets[idx] = [s];
  }
  const picked: QuotaSample[] = [];
  for (const list of buckets) {
    if (!list || list.length === 0) continue;
    picked.push(list[list.length - 1]!);
  }
  picked.sort((a, b) => a.timestamp - b.timestamp);
  return picked;
}

// ---- thin wrapper around the storage backend -----------------------------

/**
 * Options for the store. `mergeWithStorage` defaults to true: every write
 * reads what's currently in storage, merges the new samples in by
 * timestamp, and writes the union back. This makes the store safe to use
 * with multiple VS Code windows open against the same `globalState` —
 * without merging, the second window's save would clobber the first's.
 */
export interface QuotaHistoryStoreOptions {
  /** Bounded sample capacity. The store writes exactly `limit` samples
   *  (or fewer) per save so the on-disk footprint stays predictable. */
  limit: number;
  /** Debounce window for `scheduleSave`. Defaults to 5 s. */
  debounceMs?: number;
}

/**
 * Debounced writer + reader. Lives in the extension host (depends on
 * `globalState`), but the persistence *shape* is pure — the `read()` /
 * `write()` methods are what bind it to VS Code.
 */
export class QuotaHistoryStore {
  private readonly persistence: HistoryPersistence;
  private readonly opts: QuotaHistoryStoreOptions;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSamples: QuotaSample[] | null = null;
  private pendingNow: number | null = null;
  private writing = false;

  constructor(persistence: HistoryPersistence, opts: QuotaHistoryStoreOptions) {
    this.persistence = persistence;
    this.opts = { debounceMs: 5_000, ...opts };
  }

  /**
   * Reads and parses the stored history. Returns an empty array if the
   * blob is missing, malformed, or from an unknown schema version.
   */
  load(): QuotaSample[] {
    const { samples } = deserialize(this.persistence.read());
    return samples;
  }

  /**
   * Schedules a write. Multiple calls within `debounceMs` collapse into a
   * single save (the most recent samples win). On fire, the writer
   * merges the pending samples with whatever is currently in storage
   * (read-modify-write), then downsample-trims to `opts.limit` so we
   * don't grow the blob when another window has been adding samples.
   */
  scheduleSave(samples: readonly QuotaSample[], now: number): void {
    this.pendingSamples = [...samples];
    this.pendingNow = now;
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushNow();
    }, this.opts.debounceMs);
    // Don't keep the Node process alive solely for this timer.
    if (typeof (this.flushTimer as { unref?: () => void }).unref === 'function') {
      (this.flushTimer as { unref: () => void }).unref();
    }
  }

  /**
   * Flushes any pending write immediately. Safe to call when nothing is
   * pending. Call this from `deactivate()` so we don't lose the last batch.
   *
   * Uses an internal mutex (`writing`) so a slow `persistence.write` (e.g.
   * an async `globalState.update`) can't cause a second save to race the
   * first in the same window.
   */
  async flushNow(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingSamples === null || this.pendingNow === null) return;
    if (this.writing) return; // a flush is already in flight; the pending set is the newest
    this.writing = true;
    try {
      const incoming = this.pendingSamples;
      const now = this.pendingNow;
      this.pendingSamples = null;
      this.pendingNow = null;

      // Read-modify-write: pull whatever the other window may have just
      // written and union it with our pending samples.
      const existing = deserialize(this.persistence.read()).samples;
      const merged = mergeSamples(existing, incoming);
      // Trim to limit (downsampler drops age + buckets to fit the budget).
      const trimmed = downsample(merged, this.opts.limit, now);
      const blob = serialize(trimmed, now);
      await this.persist(blob);
    } finally {
      this.writing = false;
    }
  }

  /** Removes the stored history entirely. */
  clear(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingSamples = null;
    this.pendingNow = null;
    void this.persist({ version: HISTORY_VERSION, samples: [], savedAt: Date.now() });
  }

  /** Drops any pending write without touching storage. */
  dispose(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingSamples = null;
    this.pendingNow = null;
  }

  /**
   * Awaits the underlying persistence write if it returns a Promise.
   * Synchronous implementations (e.g. the in-memory test double) work
   * just as well — `await` on a non-Promise is a no-op.
   */
  private async persist(blob: HistoryBlob): Promise<void> {
    const result = this.persistence.write(blob);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      await (result as Promise<unknown>);
    }
  }
}
