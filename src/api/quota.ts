import { QuotaClient, ApiError, coerceStatus } from './client.js';
import type {
  QuotaResponse,
  QuotaModelRemain,
  NormalizedModelQuota,
  NormalizedWindow,
  QuotaSample,
} from './types.js';
import { RingBuffer } from '../utils/ringBuffer.js';
import type { Logger } from '../utils/logger.js';
import type { RegionKey } from '../utils/regions.js';
import { liveRemainsMs } from '../utils/time.js';

export interface QuotaServiceOptions {
  /** Region key (must be enabled). */
  region: RegionKey;
  /** Polling interval in ms. */
  intervalMs: number;
  /** Maximum number of historical samples to keep. */
  historyLimit: number;
  /** Logger (used at debug level only). */
  logger: Logger;
  /** Function that returns the current API key (called on every poll). */
  getApiKey: () => Promise<string | undefined>;
}

/** State observable by the UI. */
export interface QuotaState {
  /** Per-model normalized quota, or `null` if no successful fetch yet. */
  perModel: NormalizedModelQuota[] | null;
  /** ms since epoch of the last successful fetch. */
  lastSuccessAt?: number;
  /** ms since epoch of the last fetch attempt (success or failure). */
  lastFetchAt?: number;
  /** Last error, or `undefined` if the last attempt succeeded. */
  lastError?: ApiError;
  /** Whether the user has an API key configured. */
  hasKey: boolean;
  /** Historical samples (oldest first). */
  history: QuotaSample[];
  /** Whether the service is currently fetching. */
  inFlight: boolean;
}

/** Subscriber callback signature. */
export type QuotaSubscriber = (state: QuotaState) => void;

/**
 * Owns the polling loop, the cache, the history, and the subscriber list.
 * UI components subscribe; this class is the single source of truth.
 */
export class QuotaService {
  private readonly opts: QuotaServiceOptions;
  private client: QuotaClient | null = null;
  private state: QuotaState;
  private readonly history: RingBuffer<QuotaSample>;
  private readonly subscribers = new Set<QuotaSubscriber>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private disposed = false;
  private currentIntervalMs: number;

  constructor(opts: QuotaServiceOptions) {
    this.opts = opts;
    this.currentIntervalMs = opts.intervalMs;
    this.history = new RingBuffer<QuotaSample>(opts.historyLimit);
    this.state = {
      perModel: null,
      hasKey: false,
      history: [],
      inFlight: false,
    };
  }

  /** Starts the polling loop. Idempotent. */
  start(): void {
    if (this.disposed) return;
    if (this.timer !== null) return;
    void this.tick();
    this.scheduleNext();
  }

  /** Stops the polling loop and releases the timer. */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.subscribers.clear();
  }

  /** Updates the polling interval (and reschedules). */
  setIntervalMs(ms: number): void {
    if (ms === this.currentIntervalMs) return;
    this.currentIntervalMs = ms;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.scheduleNext();
    }
  }

  /** Updates the history capacity (existing samples are kept). */
  setHistoryLimit(limit: number): void {
    // Re-create the buffer, preserving current contents (best-effort).
    const samples = this.history.toArray();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = this.history.constructor as new (n: number) => RingBuffer<any>;
    const next = new Ctor(limit);
    for (const s of samples.slice(-limit)) {
      next.push(s);
    }
     
    const self = this as unknown as { history: RingBuffer<QuotaSample> };
    self.history = next;
    this.emit();
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  subscribe(fn: QuotaSubscriber): () => void {
    this.subscribers.add(fn);
    fn(this.state);
    return () => this.subscribers.delete(fn);
  }

  /** Returns a snapshot of the current state. */
  getState(): QuotaState {
    return {
      ...this.state,
      history: this.history.toArray(),
    };
  }

  /** Forces an immediate refresh. */
  async refreshNow(): Promise<void> {
    if (this.inFlight) return;
    await this.tick();
    this.scheduleNext();
  }

  // --- internals -----------------------------------------------------------

  private scheduleNext(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick().finally(() => this.scheduleNext());
    }, this.currentIntervalMs);
    // Don't keep the Node process alive solely for this timer.
    if (typeof (this.timer as { unref?: () => void }).unref === 'function') {
      (this.timer as { unref: () => void }).unref();
    }
  }

  private async tick(): Promise<void> {
    if (this.disposed) return;
    this.inFlight = true;
    this.emit();
    try {
      const key = await this.opts.getApiKey();
      this.state = { ...this.state, hasKey: !!key };
      if (!key) {
        this.state = {
          ...this.state,
          perModel: null,
          lastError: undefined,
          lastFetchAt: Date.now(),
        };
        return;
      }
      if (!this.client || this.clientNeedsReinit(key)) {
        this.client = new QuotaClient({ apiKey: key, region: this.opts.region });
      }
      const resp = await this.client.getRemains();
      this.handleSuccess(resp);
    } catch (err) {
      this.handleError(err);
    } finally {
      this.inFlight = false;
      this.emit();
    }
  }

  private clientNeedsReinit(_key: string): boolean {
    // QuotaClient is cheap to re-create; we do it per fetch for safety so a
    // key rotation is picked up without restarting the extension.
    return true;
  }

  private handleSuccess(resp: QuotaResponse): void {
    const baseCode = resp.base_resp?.status_code;
    if (baseCode !== undefined && baseCode !== 0) {
      this.handleError(
        new ApiError('api', `API error: ${resp.base_resp?.status_msg ?? baseCode}`, {
          upstreamCode: baseCode,
          upstreamMsg: resp.base_resp?.status_msg,
        }),
      );
      return;
    }
    const models = (resp.model_remains ?? []).map(normalizeModel);
    const now = Date.now();
    this.state = {
      ...this.state,
      perModel: models,
      lastSuccessAt: now,
      lastFetchAt: now,
      lastError: undefined,
    };
    this.history.push(buildSample(now, models));
  }

  private handleError(err: unknown): void {
    const apiErr = err instanceof ApiError ? err : new ApiError('network', String(err));
    this.state = {
      ...this.state,
      lastError: apiErr,
      lastFetchAt: Date.now(),
    };
    this.opts.logger.warn(`Fetch failed: ${apiErr.message}`);
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const fn of this.subscribers) {
      try {
        fn(snapshot);
      } catch (err) {
        this.opts.logger.error('subscriber threw', err);
      }
    }
  }
}

// ---- normalization helpers -------------------------------------------------

function normalizeModel(m: QuotaModelRemain): NormalizedModelQuota {
  return {
    model_name: m.model_name,
    interval: normalizeWindow({
      remainingPercent: m.current_interval_remaining_percent,
      status: m.current_interval_status,
      endTime: m.end_time,
      remainsMs: m.remains_time,
      boostPermille: m.weekly_boost_permille, // present on weekly in some captures
    }),
    weekly: normalizeWindow({
      remainingPercent: m.current_weekly_remaining_percent,
      status: m.current_weekly_status,
      endTime: m.weekly_end_time,
      remainsMs: m.weekly_remains_time,
      boostPermille: m.weekly_boost_permille,
    }),
  };
}

function normalizeWindow(input: {
  remainingPercent?: number;
  status?: number;
  endTime?: number;
  remainsMs?: number;
  boostPermille?: number;
}): NormalizedWindow {
  const status = coerceStatus(input.status);
  let raw = typeof input.remainingPercent === 'number' ? input.remainingPercent : 0;
  if (typeof input.boostPermille === 'number' && input.boostPermille > 0) {
    raw = (raw * input.boostPermille) / 1000;
  }
  // Clamp display to [0, 999] so a bad upstream value can't blow out the UI.
  const remainingPercent = Math.max(0, Math.min(999, Math.round(raw)));
  // `used` is the natural read of "how much of the window have I burned".
  // Display layer compares against thresholds in these terms.
  const usedPercent = Math.max(0, Math.min(100, 100 - remainingPercent));

  // Prefer computing the countdown from endTime (epoch ms, unit-agnostic).
  // Fall back to the server-provided remainsMs if endTime is missing/invalid.
  const live = liveRemainsMs(input.endTime);
  const remainsMs = live !== undefined ? live : input.remainsMs;

  return {
    remainingPercent,
    usedPercent,
    status,
    endTime: input.endTime,
    remainsMs,
    rawPercent: input.remainingPercent,
    boostPermille: input.boostPermille,
  };
}

function buildSample(timestamp: number, models: NormalizedModelQuota[]): QuotaSample {
  const perModel: QuotaSample['perModel'] = {};
  for (const m of models) {
    perModel[m.model_name] = {
      interval: {
        usedPercent: m.interval.usedPercent,
        status: m.interval.status,
      },
      weekly: {
        usedPercent: m.weekly.usedPercent,
        status: m.weekly.status,
      },
    };
  }
  return { timestamp, perModel };
}
