import { describe, expect, it } from 'vitest';
import { tierFor } from '../utils/tier.js';

describe('tierFor', () => {
  const t = { warning: 70, error: 90 };

  it('returns ok below the warning threshold', () => {
    expect(tierFor(0, t)).toBe('ok');
    expect(tierFor(20, t)).toBe('ok');
    expect(tierFor(69, t)).toBe('ok');
  });

  it('returns warn between warning and error thresholds', () => {
    expect(tierFor(70, t)).toBe('warn');
    expect(tierFor(80, t)).toBe('warn');
    expect(tierFor(89, t)).toBe('warn');
  });

  it('returns err at or above the error threshold', () => {
    expect(tierFor(90, t)).toBe('err');
    expect(tierFor(100, t)).toBe('err');
  });

  it('regression: 20% used must NOT be red with default thresholds', () => {
    // Bug history: tierFor returned 'err' for pct < error because the
    // comparisons were inverted. This guard fails fast if that regresses.
    expect(tierFor(20, { warning: 70, error: 90 })).not.toBe('err');
    expect(tierFor(20, { warning: 70, error: 90 })).toBe('ok');
  });
});
