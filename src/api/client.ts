import type { QuotaResponse, QuotaModelRemain} from './types.js';
import { QuotaStatus } from './types.js';
import { Regions } from '../utils/regions.js';

/**
 * Custom error thrown by the API client.
 *
 * - `auth`        — invalid / missing / revoked key
 * - `rate_limit`  — too many requests (HTTP 429)
 * - `network`     — DNS, TCP, TLS, abort
 * - `server`      — HTTP 5xx
 * - `parse`       — response body was not valid JSON or had an unexpected shape
 * - `api`         — API returned `base_resp.status_code !== 0`
 */
export type ApiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'parse'
  | 'api';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly upstreamCode?: number;
  readonly upstreamMsg?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    opts: { status?: number; upstreamCode?: number; upstreamMsg?: string } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = opts.status;
    this.upstreamCode = opts.upstreamCode;
    this.upstreamMsg = opts.upstreamMsg;
  }
}

/** Options for the API client. */
export interface QuotaClientOptions {
  /** Subscription key (Bearer token). */
  apiKey: string;
  /** Region: 'global' uses api.minimax.io (the only live-verified endpoint). */
  region?: keyof typeof Regions;
  /** Total request timeout in ms. Defaults to 15s. */
  timeoutMs?: number;
  /** AbortSignal forwarded to fetch. */
  signal?: AbortSignal;
  /** Optional fetch implementation (for testing). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thin fetch wrapper around the MiniMax Token Plan API.
 *
 * The class is intentionally minimal: no retries, no caching — that's the
 * QuotaService's job. We just want clean error mapping and a single place
 * to change headers / base URL.
 */
export class QuotaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: QuotaClientOptions) {
    if (!opts.apiKey || !opts.apiKey.trim()) {
      throw new ApiError('auth', 'API key is empty');
    }
    this.apiKey = opts.apiKey.trim();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const region = opts.region ?? 'global';
    const cfg = Regions[region];
    if (!cfg) {
      throw new ApiError('api', `Unknown region: ${String(region)}`);
    }
    this.baseUrl = cfg.apiBaseUrl;
  }

  /** Fetches a snapshot of the user's quota. */
  async getRemains(signal?: AbortSignal): Promise<QuotaResponse> {
    const url = `${this.baseUrl}/v1/token_plan/remains`;
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs);
    const onAbort = () => ctl.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'minimax-usage-vscode',
        },
        signal: ctl.signal,
      });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') {
        throw new ApiError('network', `Request aborted: ${e.message ?? 'unknown'}`);
      }
      throw new ApiError('network', `Network error: ${e?.message ?? String(err)}`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ApiError('auth', `Authentication failed (HTTP ${response.status})`, {
        status: response.status,
      });
    }
    if (response.status === 429) {
      throw new ApiError('rate_limit', 'Rate limited by MiniMax API (HTTP 429)', {
        status: 429,
      });
    }
    if (response.status >= 500) {
      throw new ApiError('server', `Server error (HTTP ${response.status})`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ApiError('server', `Unexpected HTTP status ${response.status}`, {
        status: response.status,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new ApiError('parse', `Invalid JSON response: ${(err as Error).message}`);
    }

    const parsed = parseResponse(body);
    return parsed;
  }
}

/** Defensive parser that turns an unknown value into a QuotaResponse. */
export function parseResponse(raw: unknown): QuotaResponse {
  if (!isObject(raw)) {
    throw new ApiError('parse', 'Response is not an object');
  }
  const top = raw as { model_remains?: unknown; base_resp?: unknown };

  let modelRemains: QuotaModelRemain[] = [];
  if (Array.isArray(top.model_remains)) {
    modelRemains = top.model_remains
      .filter(isObject)
      .map((m) => m as unknown as QuotaModelRemain)
      .filter((m) => typeof m.model_name === 'string' && m.model_name.length > 0);
  }

  const baseResp = isObject(top.base_resp)
    ? {
        status_code: numberOr(top.base_resp.status_code, -1),
        status_msg: stringOr(top.base_resp.status_msg, ''),
      }
    : { status_code: -1, status_msg: 'missing base_resp' };

  return {
    model_remains: modelRemains,
    base_resp: baseResp,
  };
}

// ---- tiny type guards -----------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** Coerces an unknown status to a QuotaStatus enum, defaulting to Limited. */
export function coerceStatus(v: unknown): QuotaStatus {
  if (typeof v === 'number' && (v === 1 || v === 2 || v === 3)) {
    return v as QuotaStatus;
  }
  return QuotaStatus.Limited;
}
