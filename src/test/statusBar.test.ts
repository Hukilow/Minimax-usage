import { describe, expect, it } from 'vitest';
import { aggregate } from '../ui/statusBar.js';
import type { NormalizedModelQuota } from '../api/types.js';
import { QuotaStatus } from '../api/types.js';

function model(
  modelName: string,
  intervalUsed: number,
  weeklyUsed: number,
  intervalEndTime?: number,
  weeklyEndTime?: number,
): NormalizedModelQuota {
  return {
    model_name: modelName,
    interval: {
      usedPercent: intervalUsed,
      remainingPercent: 100 - intervalUsed,
      status: QuotaStatus.Limited,
      endTime: intervalEndTime,
      remainsMs: intervalEndTime ? Math.max(0, intervalEndTime - Date.now()) : undefined,
    },
    weekly: {
      usedPercent: weeklyUsed,
      remainingPercent: 100 - weeklyUsed,
      status: QuotaStatus.Limited,
      endTime: weeklyEndTime,
      remainsMs: weeklyEndTime ? Math.max(0, weeklyEndTime - Date.now()) : undefined,
    },
  };
}

describe('aggregate', () => {
  it('picks endTime from the worst-case model so the countdown cannot exceed the window', () => {
    const now = Date.now();
    // Two models — the worst-case used% (50%) belongs to `general` whose
    // 5h window resets in 30 min. `video` has lower usage but a far-future
    // (and impossible for a 5h window) endTime. The previous implementation
    // would surface video's endTime and display "6h 30m" for the 5h bar.
    const perModel = [
      model('general', 50, 50, now + 30 * 60_000, now + 2 * 86_400_000),
      model('video', 10, 10, now + 6.5 * 60 * 60_000, now + 5 * 86_400_000),
    ];
    const agg = aggregate(perModel);
    expect(agg.interval.usedPercent).toBe(50);
    // 5h countdown must come from the worst-case model: ~30 min.
    expect(agg.interval.endTime).toBe(now + 30 * 60_000);
    expect(agg.interval.remainsMs).toBeLessThan(31 * 60_000);
    expect(agg.interval.remainsMs).toBeGreaterThan(29 * 60_000);
  });

  it('weekly countdown comes from the worst-case weekly model', () => {
    const now = Date.now();
    const perModel = [
      model('general', 10, 40, now + 4 * 60 * 60_000, now + 3 * 86_400_000),
      model('video', 5, 80, now + 3 * 60 * 60_000, now + 6 * 86_400_000),
    ];
    const agg = aggregate(perModel);
    expect(agg.weekly.usedPercent).toBe(80);
    expect(agg.weekly.endTime).toBe(now + 6 * 86_400_000);
  });

  it('handles a single model', () => {
    const now = Date.now();
    const perModel = [model('general', 25, 60, now + 2 * 60 * 60_000, now + 4 * 86_400_000)];
    const agg = aggregate(perModel);
    expect(agg.interval.usedPercent).toBe(25);
    expect(agg.weekly.usedPercent).toBe(60);
  });

  it('handles missing endTimes without crashing', () => {
    const perModel = [
      model('general', 30, 40, undefined, undefined),
      model('video', 10, 5, undefined, undefined),
    ];
    const agg = aggregate(perModel);
    expect(agg.interval.usedPercent).toBe(30);
    expect(agg.weekly.usedPercent).toBe(40);
    expect(agg.interval.endTime).toBeUndefined();
    expect(agg.weekly.endTime).toBeUndefined();
  });
});
