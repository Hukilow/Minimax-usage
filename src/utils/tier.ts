/**
 * Pure helpers shared between the webview and tests.
 *
 * Lives in `utils/` (not `webview/`) so it can be imported by Vitest in a
 * Node environment without dragging in DOM globals from `webview/main.ts`.
 */

export type Tier = 'ok' | 'warn' | 'err';

/**
 * Maps a used-% value to a CSS tier for the bar fill.
 * Tier order is calibrated against "used %" thresholds:
 *   - below warningThreshold → ok (green)
 *   - warningThreshold..errorThreshold → warn (yellow)
 *   - errorThreshold and above → err (red)
 */
export function tierFor(
  pct: number,
  t: { warning: number; error: number },
): Tier {
  if (pct >= t.error) return 'err';
  if (pct >= t.warning) return 'warn';
  return 'ok';
}
