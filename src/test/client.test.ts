import { describe, expect, it } from 'vitest';
import { ApiError, QuotaClient, parseResponse } from '../api/client.js';
import { QuotaResponse, QuotaStatus } from '../api/types.js';

describe('parseResponse', () => {
  it('throws on null body', () => {
    expect(() => parseResponse(null)).toThrow(ApiError);
  });

  it('throws on non-object body', () => {
    expect(() => parseResponse(42)).toThrow(ApiError);
    expect(() => parseResponse('nope')).toThrow(ApiError);
  });

  it('drops model_remains entries without a model_name', () => {
    const r = parseResponse({
      model_remains: [
        { model_name: 'general', current_interval_remaining_percent: 10 },
        { current_interval_remaining_percent: 50 },
      ],
      base_resp: { status_code: 0, status_msg: 'success' },
    });
    expect(r.model_remains).toHaveLength(1);
    expect(r.model_remains?.[0]?.model_name).toBe('general');
    expect(r.base_resp?.status_code).toBe(0);
  });

  it('coerces missing base_resp to a -1 / placeholder', () => {
    const r = parseResponse({ model_remains: [] });
    expect(r.base_resp?.status_code).toBe(-1);
    expect(typeof r.base_resp?.status_msg).toBe('string');
  });
});

describe('QuotaClient', () => {
  it('throws on empty key', () => {
    expect(() => new QuotaClient({ apiKey: '   ' })).toThrow(ApiError);
  });

  it('throws on unknown region', () => {
    // @ts-expect-error — intentionally invalid region to exercise the guard
    expect(() => new QuotaClient({ apiKey: 'sk-test', region: 'unknown' })).toThrow(/unknown region/i);
  });

  it('maps 401/403 to auth error', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const c = new QuotaClient({ apiKey: 'sk-test', fetchImpl });
    await expect(c.getRemains()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps 429 to rate_limit error', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('{}', { status: 429 })) as unknown as typeof fetch;
    const c = new QuotaClient({ apiKey: 'sk-test', fetchImpl });
    await expect(c.getRemains()).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('maps 5xx to server error', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const c = new QuotaClient({ apiKey: 'sk-test', fetchImpl });
    await expect(c.getRemains()).rejects.toMatchObject({ kind: 'server' });
  });

  it('parses a successful response', async () => {
    const body: QuotaResponse = {
      model_remains: [
        {
          model_name: 'general',
          current_interval_remaining_percent: 80,
          current_weekly_remaining_percent: 50,
          current_interval_status: QuotaStatus.Limited,
          current_weekly_status: QuotaStatus.Limited,
          remains_time: 60_000,
          weekly_remains_time: 86400_000,
        },
      ],
      base_resp: { status_code: 0, status_msg: 'success' },
    };
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const c = new QuotaClient({ apiKey: 'sk-test', fetchImpl });
    const r = await c.getRemains();
    expect(r.base_resp?.status_code).toBe(0);
    expect(r.model_remains?.[0]?.current_interval_remaining_percent).toBe(80);
  });

  it('maps non-JSON body to parse error', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('not json', { status: 200 })) as unknown as typeof fetch;
    const c = new QuotaClient({ apiKey: 'sk-test', fetchImpl });
    await expect(c.getRemains()).rejects.toMatchObject({ kind: 'parse' });
  });
});
