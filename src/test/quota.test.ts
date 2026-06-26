import { describe, expect, it, vi } from 'vitest';
import { QuotaService } from '../api/quota.js';
import { Logger } from '../utils/logger.js';
import { QuotaStatus } from '../api/types.js';
import { QuotaHistoryStore, serialize, type HistoryPersistence } from '../api/historyStore.js';
import type { QuotaSample } from '../api/types.js';

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
              end_time: Date.now() + 3_600_000,
              remains_time: 3_600_000,
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

      const seenUsed: number[] = [];
      const seenRemaining: number[] = [];
      const unsub = svc.subscribe((s) => {
        if (s.perModel) {
          seenUsed.push(s.perModel[0]?.interval.usedPercent ?? -1);
          seenRemaining.push(s.perModel[0]?.interval.remainingPercent ?? -1);
        }
      });

      svc.start();
      // Wait a tick for the in-flight fetch to resolve.
      await new Promise((r) => setTimeout(r, 10));
      svc.dispose();
      unsub();

      // API said 80% remaining → we surface 20% used.
      expect(seenUsed).toContain(20);
      expect(seenRemaining).toContain(80);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('derives live remainsMs from endTime', async () => {
    const endTime = Date.now() + 7_200_000; // 2h ahead
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
              end_time: endTime,
              // Intentionally bogus remains_time to prove we prefer endTime.
              remains_time: 9_999_999_999,
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
      let captured: number | undefined;
      const unsub = svc.subscribe((s) => {
        if (s.perModel) captured = s.perModel[0]?.interval.remainsMs;
      });
      await svc.refreshNow();
      svc.dispose();
      unsub();
      // Should be ~2h, NOT 9.999e12 ms (~317 years).
      expect(captured).toBeDefined();
      expect(captured!).toBeLessThan(7_200_000 + 5_000);
      expect(captured!).toBeGreaterThan(7_200_000 - 5_000);
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

  it('restores history from the persistent store on construction', () => {
    const prior: QuotaSample[] = [
      {
        timestamp: Date.now() - 5 * 60_000,
        perModel: {
          general: {
            interval: { usedPercent: 20, status: 1 },
            weekly: { usedPercent: 30, status: 1 },
          },
        },
      },
      {
        timestamp: Date.now() - 60_000,
        perModel: {
          general: {
            interval: { usedPercent: 25, status: 1 },
            weekly: { usedPercent: 31, status: 1 },
          },
        },
      },
    ];
    const blob = serialize(prior, Date.now());
    const persistence: HistoryPersistence = {
      read: () => blob,
      write: () => {},
    };
    const historyStore = new QuotaHistoryStore(persistence, { limit: 100, debounceMs: 60_000 });

    const svc = new QuotaService({
      region: 'global',
      intervalMs: 60_000,
      historyLimit: 100,
      logger: silentLogger(),
      getApiKey: async () => undefined,
      historyStore,
    });

    expect(svc.getState().history).toHaveLength(2);
    expect(svc.getState().history[0]!.timestamp).toBe(prior[0]!.timestamp);
    svc.dispose();
  });

  it('schedules a persistence write after a successful fetch', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 90,
              current_weekly_remaining_percent: 90,
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

    let writtenBlob: unknown = undefined;
    const persistence: HistoryPersistence = {
      read: () => undefined,
      write: (b) => { writtenBlob = b; },
    };
    const historyStore = new QuotaHistoryStore(persistence, { limit: 50, debounceMs: 10 });

    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 60_000,
        historyLimit: 50,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
        historyStore,
      });
      await svc.refreshNow();
      // No write yet — debounce hasn't fired.
      expect(writtenBlob).toBeUndefined();
      // Wait past the debounce window.
      await new Promise((r) => setTimeout(r, 30));
      expect(writtenBlob).toBeDefined();
      const blob = writtenBlob as { samples: unknown[] };
      expect(blob.samples).toHaveLength(1);
      svc.dispose();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('flushes pending writes synchronously on dispose', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 80,
              current_weekly_remaining_percent: 80,
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

    let writes = 0;
    const persistence: HistoryPersistence = {
      read: () => undefined,
      write: () => { writes++; },
    };
    const historyStore = new QuotaHistoryStore(persistence, { limit: 50, debounceMs: 60_000 }); // long debounce
    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 60_000,
        historyLimit: 50,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
        historyStore,
      });
      await svc.refreshNow();
      expect(writes).toBe(0);
      svc.dispose(); // should flushNow() before subscribers clear
      // Wait for the async flush to complete before asserting.
      await new Promise((r) => setTimeout(r, 5));
      expect(writes).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('clearHistory() wipes both in-memory and persisted history', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 70,
              current_weekly_remaining_percent: 70,
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

    const writes: { samples: unknown[] }[] = [];
    const persistence: HistoryPersistence = {
      read: () => undefined,
      write: (b) => { writes.push(b as { samples: unknown[] }); },
    };
    const historyStore = new QuotaHistoryStore(persistence, { limit: 50, debounceMs: 0 }); // immediate flush
    try {
      const svc = new QuotaService({
        region: 'global',
        intervalMs: 60_000,
        historyLimit: 50,
        logger: silentLogger(),
        getApiKey: async () => 'sk-test',
        historyStore,
      });
      await svc.refreshNow();
      // The debounce of 0 schedules on the next tick, so await a microtask.
      await new Promise((r) => setTimeout(r, 5));
      expect(svc.getState().history.length).toBeGreaterThan(0);
      svc.clearHistory();
      await new Promise((r) => setTimeout(r, 5));
      expect(svc.getState().history).toHaveLength(0);
      // The most recent persisted blob must also be empty.
      const last = writes[writes.length - 1]!;
      expect(last.samples).toEqual([]);
      svc.dispose();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
