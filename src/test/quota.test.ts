import { describe, expect, it, vi } from 'vitest';
import { QuotaService } from '../api/quota.js';
import { Logger } from '../utils/logger.js';
import { QuotaStatus } from '../api/types.js';

function silentLogger(): Logger {
  const appendLine = () => {};
  return new Logger(
    {
      name: 'test',
      append: appendLine,
      appendLine,
      clear: appendLine,
      show: appendLine,
      hide: appendLine,
      dispose: appendLine,
    },
    false,
  );
}

describe('QuotaService', () => {
  it('fetches on start when an API key is configured', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 80,
              current_weekly_remaining_percent: 50,
              current_interval_status: QuotaStatus.Limited,
              current_weekly_status: QuotaStatus.Limited,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 60_000,
        historyLimit: 50,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
      });

      const seen: number[] = [];
      const unsub = svc.subscribe((s) => {
        if (s.perModel) seen.push(s.perModel[0]?.interval.remainingPercent ?? -1);
      });

      svc.start();
      // Wait a tick for the in-flight fetch to resolve.
      await new Promise((r) => setTimeout(r, 10));
      svc.dispose();
      unsub();

      expect(seen).toContain(80);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('emits lastError when fetch fails', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 60_000,
        historyLimit: 50,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
      });

      let lastError: unknown = null;
      const unsub = svc.subscribe((s) => {
        if (s.lastError) lastError = s.lastError;
      });

      await svc.refreshNow();
      svc.dispose();
      unsub();
      expect((lastError as { kind: string }).kind).toBe('server');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps a bounded history', async () => {
    // We can't easily wait for the polling loop, so we test the underlying
    // behavior by calling refreshNow() repeatedly and inspecting state.
    const fetchImpl: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 50,
              current_weekly_remaining_percent: 50,
              current_interval_status: QuotaStatus.Limited,
              current_weekly_status: QuotaStatus.Limited,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 10_000,
        historyLimit: 5,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
      });

      for (let i = 0; i < 8; i++) {
        await svc.refreshNow();
      }
      expect(svc.getState().history.length).toBeLessThanOrEqual(5);
      svc.dispose();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
