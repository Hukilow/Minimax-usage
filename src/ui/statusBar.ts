import type { ExtensionContext, StatusBarItem, Command } from 'vscode';
import { StatusBarAlignment, ThemeColor, window } from 'vscode';
import type { QuotaState } from '../api/quota.js';
import { QuotaStatus } from '../api/types.js';
import type { NormalizedModelQuota } from '../api/types.js';
import { formatDuration, formatLocalTime, formatPercent, liveRemainsMs } from '../utils/time.js';

export interface StatusBarOptions {
  /** When true, the inline reset countdown (e.g. '2h 14m') is appended to
   *  each status bar item. Toggled at runtime via the
   *  `toggleStatusBarCountdown` command. */
  showCountdown: boolean;
  /** Thresholds (0..100). */
  warningThreshold: number;
  errorThreshold: number;
  /** Command to run when an item is clicked. */
  onClick: () => void;
}

/** Two-pane status bar (5h + weekly) with color tiers and reset tooltips. */
export class StatusBar {
  private readonly opts: StatusBarOptions;
  private readonly item5h: StatusBarItem;
  private readonly itemWk: StatusBarItem;
  private showCountdown: boolean;
  private disposeFns: Array<() => void> = [];

  constructor(_ctx: ExtensionContext, opts: StatusBarOptions) {
    this.opts = opts;
    this.showCountdown = opts.showCountdown;

    // High priority keeps us on the right side of the status bar; alignment
    // 'Right' places us in the bottom-right corner by default.
    this.item5h = window.createStatusBarItem('minimaxUsage.statusBar.5h', StatusBarAlignment.Right, 99);
    this.item5h.name = 'Minimax Usage — 5h';
    this.item5h.command = { title: 'Open Dashboard', command: 'minimaxUsage.openDashboard' } as Command;
    this.item5h.tooltip = 'MiniMax Usage — 5h window (click to open dashboard)';
    this.item5h.show();

    this.itemWk = window.createStatusBarItem('minimaxUsage.statusBar.wk', StatusBarAlignment.Right, 98);
    this.itemWk.name = 'Minimax Usage — Weekly';
    this.itemWk.command = { title: 'Open Dashboard', command: 'minimaxUsage.openDashboard' } as Command;
    this.itemWk.tooltip = 'MiniMax Usage — Weekly window (click to open dashboard)';
    this.itemWk.show();

    const click = (item: StatusBarItem) => {
      item.command = {
        title: 'Open Dashboard',
        command: 'minimaxUsage.openDashboard',
      } as Command;
    };
    click(this.item5h);
    click(this.itemWk);

    this.disposeFns.push(
      () => this.item5h.dispose(),
      () => this.itemWk.dispose(),
    );
  }

  /**
   * Switches whether the inline reset countdown is rendered next to each
   * status bar item. The next `render()` call picks it up; nothing else
   * needs to happen because `QuotaService` re-emits a state on every poll,
   * and `formatLine` is pure over `this.showCountdown`.
   */
  setShowCountdown(show: boolean): void {
    if (this.showCountdown === show) return;
    this.showCountdown = show;
  }

  /** Read-only accessor used by the config-change watcher / tests. */
  getShowCountdown(): boolean {
    return this.showCountdown;
  }

  /** Updates both status bar items from a QuotaState snapshot. */
  render(state: QuotaState): void {
    if (!state.hasKey) {
      this.item5h.text = '$(key) Set API Key';
      this.item5h.tooltip = 'MiniMax Usage — Click to set your API key';
      this.item5h.backgroundColor = undefined;
      this.item5h.color = new ThemeColor('statusBarItem.warningForeground');

      this.itemWk.text = '$(key) Set API Key';
      this.itemWk.tooltip = 'MiniMax Usage — Click to set your API key';
      this.itemWk.backgroundColor = undefined;
      this.itemWk.color = new ThemeColor('statusBarItem.warningForeground');
      return;
    }

    if (!state.perModel || state.perModel.length === 0) {
      const loading = state.inFlight ? 'loading…' : 'no data';
      this.item5h.text = `$(pulse) 5h ${loading}`;
      this.itemWk.text = `$(history) Wk ${loading}`;
      this.item5h.tooltip = this.tooltipNoData('5h', state);
      this.itemWk.tooltip = this.tooltipNoData('Weekly', state);
      this.item5h.backgroundColor = undefined;
      this.itemWk.backgroundColor = undefined;
      this.item5h.color = undefined;
      this.itemWk.color = undefined;
      return;
    }

    // Aggregate across models (worst-case used %).
    const agg = aggregate(state.perModel);

    // 5h item — cap countdown at 5h (the window cannot reset later than that).
    this.item5h.text = this.formatLine('$(pulse) 5h', agg.interval, 5 * 60 * 60 * 1000);
    this.item5h.tooltip = this.tooltipFor('5-hour window', agg.interval, state);
    this.applyTierStyle(this.item5h, agg.interval.usedPercent, agg.interval.status, this.opts.warningThreshold, this.opts.errorThreshold);

    // Weekly item — cap countdown at 7 days.
    this.itemWk.text = this.formatLine('$(history) Wk', agg.weekly, 7 * 24 * 60 * 60 * 1000);
    this.itemWk.tooltip = this.tooltipFor('Weekly window', agg.weekly, state);
    this.applyTierStyle(this.itemWk, agg.weekly.usedPercent, agg.weekly.status, this.opts.warningThreshold, this.opts.errorThreshold);
  }

  dispose(): void {
    for (const fn of this.disposeFns) fn();
    this.disposeFns = [];
  }

  // --- formatting ----------------------------------------------------------

  private formatLine(
    prefix: string,
    w: { usedPercent: number; remainingPercent: number; status: number; endTime?: number; remainsMs?: number },
    maxMs?: number,
  ): string {
    const pct = formatPercent(w.usedPercent);
    const tier = dots(w.usedPercent);
    // Defensive clamp: a rolling 5h window cannot have more than 5h until
    // reset, and a weekly window cannot have more than 7 days. The upstream
    // API can return stale or unit-mismatched endTime values; capping here
    // guarantees we never display an impossible countdown.
    let cd = liveRemainsMs(w.endTime);
    if (cd !== undefined && maxMs !== undefined && cd > maxMs) {
      cd = maxMs;
    }
    if (this.showCountdown && cd && cd > 0) {
      return `${prefix} ${tier} ${pct} $(clock) ${formatDuration(cd)}`;
    }
    return `${prefix} ${tier} ${pct}`;
  }

  private tooltipFor(label: string, w: { usedPercent: number; remainingPercent: number; status: number; endTime?: number; remainsMs?: number }, state: QuotaState): string {
    const used = formatPercent(w.usedPercent);
    const remaining = formatPercent(w.remainingPercent);
    const status = describeStatus(w.status);
    const end = w.endTime ? formatLocalTime(w.endTime) : '—';
    const cd = liveRemainsMs(w.endTime);
    const cdStr = cd && cd > 0 ? formatDuration(cd) : '—';
    const lastOk = state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString() : 'never';
    return [
      `MiniMax Usage — ${label}`,
      `Used: ${used}   (${remaining} remaining, ${status})`,
      `Resets at: ${end}  (in ${cdStr})`,
      `Last fetch: ${lastOk}`,
    ].join('\n');
  }



  private tooltipNoData(label: string, state: QuotaState): string {
    if (!state.hasKey) return 'MiniMax Usage — click to set your API key';
    if (state.lastError) {
      return `MiniMax Usage — ${label}\nLast fetch failed: ${state.lastError.message}`;
    }
    return 'MiniMax Usage — no data yet (waiting for first fetch)';
  }

  private applyTierStyle(
    item: StatusBarItem,
    usedPercent: number,
    status: number,
    warn: number,
    err: number,
  ): void {
    item.color = undefined;
    item.backgroundColor = undefined;

    if (status === QuotaStatus.Exhausted) {
      item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
      item.color = new ThemeColor('statusBarItem.errorForeground');
      return;
    }
    if (status === QuotaStatus.Unlimited) {
      // No decoration; the icon will be overridden below.
      return;
    }
    // Thresholds are expressed in "used %" terms (warn at X% used, error at Y% used).
    if (usedPercent >= err) {
      item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
      item.color = new ThemeColor('statusBarItem.errorForeground');
    } else if (usedPercent >= warn) {
      item.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
      item.color = new ThemeColor('statusBarItem.warningForeground');
    }
  }
}

// ---- pure helpers (kept here so they're easy to test) ---------------------

/** Exported for testing only — the multi-model aggregation logic. */
export function aggregate(perModel: NonNullable<QuotaState['perModel']>) {
  // Worst-case (highest usage) across all models. Status is the "most
  // severe" — exhausted wins, then limited, then unlimited.
  // The endTime/remainingPercent MUST come from the same model that gave us
  // the worst-case used% — otherwise the countdown and the % can disagree
  // (e.g. a "20% used" model paired with a far-future reset timestamp
  // from a sibling model would render "resets in 6h 30m" for a 5h window,
  // which is impossible). We pick the worst-case model first, then mirror
  // its window fields.
  let intervalUsed = 0;
  let weeklyUsed = 0;
  let intervalStatus: number = QuotaStatus.Unlimited;
  let weeklyStatus: number = QuotaStatus.Unlimited;
  let intervalBest: NormalizedModelQuota['interval'] | undefined;
  let weeklyBest: NormalizedModelQuota['weekly'] | undefined;

  for (const m of perModel) {
    if (m.interval.usedPercent >= intervalUsed) {
      // Tie-break: prefer the more severe status, then the earliest reset
      // (so the countdown reflects the soonest model).
      const earlierEnd =
        intervalBest?.endTime !== undefined && m.interval.endTime !== undefined
          ? m.interval.endTime < intervalBest.endTime
          : m.interval.endTime !== undefined;
      if (m.interval.usedPercent > intervalUsed || earlierEnd || intervalBest === undefined) {
        intervalUsed = m.interval.usedPercent;
        intervalBest = m.interval;
        intervalStatus = worse(intervalStatus, m.interval.status);
      } else if (intervalBest === undefined) {
        intervalBest = m.interval;
      }
    }
    if (m.weekly.usedPercent >= weeklyUsed) {
      const earlierEnd =
        weeklyBest?.endTime !== undefined && m.weekly.endTime !== undefined
          ? m.weekly.endTime < weeklyBest.endTime
          : m.weekly.endTime !== undefined;
      if (m.weekly.usedPercent > weeklyUsed || earlierEnd || weeklyBest === undefined) {
        weeklyUsed = m.weekly.usedPercent;
        weeklyBest = m.weekly;
        weeklyStatus = worse(weeklyStatus, m.weekly.status);
      } else if (weeklyBest === undefined) {
        weeklyBest = m.weekly;
      }
    }
  }

  // Fall back to any model if nothing matched (shouldn't happen, but be safe).
  if (!intervalBest) intervalBest = perModel[0]!.interval;
  if (!weeklyBest) weeklyBest = perModel[0]!.weekly;

  return {
    interval: {
      usedPercent: intervalUsed,
      remainingPercent: intervalBest.remainingPercent,
      status: intervalStatus,
      endTime: intervalBest.endTime,
      remainsMs: liveRemainsMs(intervalBest.endTime),
    },
    weekly: {
      usedPercent: weeklyUsed,
      remainingPercent: weeklyBest.remainingPercent,
      status: weeklyStatus,
      endTime: weeklyBest.endTime,
      remainsMs: liveRemainsMs(weeklyBest.endTime),
    },
  };
}

function worse(a: number, b: number): number {
  const order: Record<number, number> = {
    [QuotaStatus.Unlimited]: 0,
    [QuotaStatus.Limited]: 1,
    [QuotaStatus.Exhausted]: 2,
  };
  const oa = order[a] ?? 1;
  const ob = order[b] ?? 1;
  return oa >= ob ? a : b;
}

function describeStatus(s: number): string {
  if (s === QuotaStatus.Exhausted) return 'exhausted';
  if (s === QuotaStatus.Unlimited) return 'unlimited';
  return 'limited';
}

function dots(percent: number): string {
  // 5-dot sparkline, filled proportional to usage.
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 5);
  return '●'.repeat(filled) + '○'.repeat(5 - filled);
}
