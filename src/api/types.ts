/**
 * Types for the MiniMax Token Plan API.
 *
 * The API is point-in-time only: every response is a snapshot of the user's
 * current 5-hour and weekly quota. We build history locally by polling and
 * storing samples in a ring buffer.
 *
 * Field semantics are based on the upstream `MiniMax-AI/cli` types and on
 * live captures of the response. All fields are defensive: missing or
 * unknown fields must not break the UI.
 *
 * @see https://platform.minimax.io/docs/token-plan/intro
 */

/** Group of resources returned by the API (e.g. general, video). */
export type ModelGroup = 'general' | 'video' | (string & {});

/** Status code reported by the API for a quota window. */
export const enum QuotaStatus {
  /** Quota is in normal limited state. */
  Limited = 1,
  /** Quota is exhausted (zero remaining). */
  Exhausted = 2,
  /** User is unlimited (e.g. internal team). */
  Unlimited = 3,
}

/** Server-side base response envelope. */
export interface BaseResp {
  /** `0` means success. */
  status_code: number;
  status_msg: string;
}

/** A single window (5h or weekly) in the response. */
export interface QuotaWindow {
  /** Server-side count of total units allocated for the window. */
  total_count?: number;
  /** Server-side count of units already used in the window. */
  usage_count?: number;
  /** Server-authoritative remaining percent (0..100, may exceed 100 with boost). */
  remaining_percent?: number;
  /** Status of the window. */
  status?: QuotaStatus | number;
  /** Display multiplier in permille (e.g. 1500 ⇒ display up to 150%). */
  boost_permille?: number;
}

/** Per-model quota data in the response. */
export interface QuotaModelRemain {
  model_name: ModelGroup;
  /** 5h window — start (ms since epoch). */
  start_time?: number;
  /** 5h window — end (ms since epoch). */
  end_time?: number;
  /** 5h window — ms until reset. */
  remains_time?: number;
  /** 5h window fields. */
  current_interval_total_count?: number;
  current_interval_usage_count?: number;
  current_interval_remaining_percent?: number;
  current_interval_status?: QuotaStatus | number;
  /** Weekly window fields. */
  current_weekly_total_count?: number;
  current_weekly_usage_count?: number;
  current_weekly_remaining_percent?: number;
  current_weekly_status?: QuotaStatus | number;
  weekly_start_time?: number;
  weekly_end_time?: number;
  weekly_remains_time?: number;
  weekly_boost_permille?: number;
  base_resp?: BaseResp;
}

/** Full top-level API response. */
export interface QuotaResponse {
  model_remains?: QuotaModelRemain[];
  base_resp?: BaseResp;
}

/** Normalized view used by the UI (after defensive parsing). */
export interface NormalizedModelQuota {
  model_name: ModelGroup;
  interval: NormalizedWindow;
  weekly: NormalizedWindow;
}

export interface NormalizedWindow {
  /** Server-claimed remaining percent (0..100, may exceed 100 with boost). */
  remainingPercent: number;
  /** Inverse: percent of the window already consumed, clamped to [0, 100]. */
  usedPercent: number;
  status: QuotaStatus;
  /** Server-claimed end timestamp (ms since epoch). Used to compute the live countdown. */
  endTime?: number;
  /** Snapshot of the countdown (ms) at fetch time. Display code should prefer `liveRemainsMs(endTime)`. */
  remainsMs?: number;
  /** Raw server value (kept for debugging). */
  rawPercent?: number;
  /** Boost permille if present (1000 = no boost). */
  boostPermille?: number;
}

/** A single historical sample, stored in the local ring buffer. */
export interface QuotaSample {
  /** ms since epoch when the sample was taken. */
  timestamp: number;
  perModel: Record<string, {
    interval: { usedPercent: number; status: number };
    weekly: { usedPercent: number; status: number };
  }>;
}
