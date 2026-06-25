import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDuration,
  formatLocalTime,
  formatLocalDateTime,
  formatPercent,
  clampPercent,
  liveRemainsMs,
} from '../utils/time.js';

describe('time utils', () => {
  describe('formatDuration', () => {
    it('returns 0s for non-positive or invalid inputs', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(-1)).toBe('0s');
      expect(formatDuration(Number.NaN)).toBe('0s');
      expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0s');
    });

    it('formats seconds', () => {
      expect(formatDuration(1_000)).toBe('1s');
      expect(formatDuration(45_000)).toBe('45s');
    });

    it('formats minutes only', () => {
      expect(formatDuration(60_000)).toBe('1m');
      expect(formatDuration(59 * 60_000)).toBe('59m');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(60 * 60_000)).toBe('1h');
      expect(formatDuration(2 * 60 * 60_000 + 5 * 60_000)).toBe('2h 5m');
    });

    it('formats days and hours', () => {
      expect(formatDuration(24 * 60 * 60_000)).toBe('1d');
      expect(formatDuration(4 * 86_400_000 + 17 * 3_600_000)).toBe('4d 17h');
      expect(formatDuration(2 * 86_400_000)).toBe('2d');
    });
  });

  describe('formatLocalTime', () => {
    it('returns — for invalid timestamps', () => {
      expect(formatLocalTime(0)).toBe('—');
      expect(formatLocalTime(Number.NaN)).toBe('—');
      expect(formatLocalTime(-1)).toBe('—');
    });

    it('formats a known epoch in local time (HH:MM)', () => {
      // 2026-06-25T14:30:00Z
      const ms = Date.UTC(2026, 5, 25, 14, 30, 0);
      const out = formatLocalTime(ms);
      expect(out).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatLocalDateTime', () => {
    it('returns — for invalid timestamps', () => {
      expect(formatLocalDateTime(0)).toBe('—');
      expect(formatLocalDateTime(Number.NaN)).toBe('—');
    });

    it('formats a known epoch (YYYY-MM-DD HH:MM)', () => {
      const ms = Date.UTC(2026, 5, 25, 14, 30, 0);
      const out = formatLocalDateTime(ms);
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });
  });

  describe('formatPercent', () => {
    it('returns — for undefined / NaN', () => {
      expect(formatPercent(undefined)).toBe('—');
      expect(formatPercent(Number.NaN)).toBe('—');
    });

    it('rounds and clamps negatives to 0', () => {
      expect(formatPercent(10.4)).toBe('10%');
      expect(formatPercent(10.6)).toBe('11%');
      expect(formatPercent(-5)).toBe('0%');
    });
  });

  describe('clampPercent', () => {
    it('returns 0 for undefined / NaN', () => {
      expect(clampPercent(undefined)).toBe(0);
      expect(clampPercent(Number.NaN)).toBe(0);
    });
    it('clamps to [0, 100]', () => {
      expect(clampPercent(-1)).toBe(0);
      expect(clampPercent(0)).toBe(0);
      expect(clampPercent(50)).toBe(50);
      expect(clampPercent(101)).toBe(100);
    });
  });

  describe('liveRemainsMs', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns undefined for undefined / invalid endTime', () => {
      expect(liveRemainsMs(undefined)).toBeUndefined();
      expect(liveRemainsMs(0)).toBeUndefined();
      expect(liveRemainsMs(-1)).toBeUndefined();
      expect(liveRemainsMs(Number.NaN)).toBeUndefined();
    });

    it('returns 0 when endTime is in the past', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
      expect(liveRemainsMs(Date.UTC(2026, 5, 25, 11, 0, 0))).toBe(0);
    });

    it('returns ms until endTime', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
      const end = Date.UTC(2026, 5, 25, 13, 30, 0); // 1h30m ahead
      expect(liveRemainsMs(end)).toBe(90 * 60 * 1000);
    });
  });
});
