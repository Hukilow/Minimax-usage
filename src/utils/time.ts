/**
 * Time formatting helpers. All functions are pure (no Date.now() side-effects)
 * so they can be tested deterministically.
 */

/**
 * Formats a duration in ms as a compact human-readable string.
 *   45_000           → "45s"
 *   3_600_000        → "1h"
 *   7_500_000        → "2h 5m"
 *   86_400_000       → "1d"
 *   414_000_000      → "4d 19h"
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/** Formats an epoch-ms timestamp as a short local time: "14:30". */
export function formatLocalTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—';
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Formats an epoch-ms timestamp as a short local datetime: "2026-06-25 14:30". */
export function formatLocalDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—';
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}`;
}

/** Formats the remaining % for the status bar: "10%" / "—". */
export function formatPercent(p: number | undefined): string {
  if (p === undefined || !Number.isFinite(p)) return '—';
  return `${Math.max(0, Math.round(p))}%`;
}

/** Clamps a percent to [0, 100], rounding to integer. */
export function clampPercent(p: number | undefined): number {
  if (p === undefined || !Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p)));
}
