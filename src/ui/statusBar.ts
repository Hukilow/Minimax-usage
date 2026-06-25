import type { ExtensionContext, StatusBarItem, Command } from 'vscode';
import { StatusBarAlignment, ThemeColor, window } from 'vscode';
import type { QuotaState } from '../api/quota.js';
import { QuotaStatus } from '../api/types.js';
import { formatDuration, formatLocalTime, formatPercent } from '../utils/time.js';

export type StatusBarMode = 'compact' | 'split';

export interface StatusBarOptions {
  /** Default mode if no setting is found. */
  defaultMode?: StatusBarMode;
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
  private mode: StatusBarMode;
  private disposeFns: Array<() => void> = [];

  constructor(_ctx: ExtensionContext, opts: StatusBarOptions) {
    this.opts = opts;
    this.mode = opts.defaultMode ?? 'compact';

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

  setMode(mode: StatusBarMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
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

    // Aggregate across models (worst-case remaining %).
    const agg = aggregate(state.perModel);

    // 5h item
    this.item5h.text = this.formatLine('$(pulse) 5h', agg.interval);
    this.item5h.tooltip = this.tooltipFor('5-hour window', agg.interval, state);
    this.applyTierStyle(this.item5h, agg.interval, this.opts.warningThreshold, this.opts.errorThreshold);

    // Weekly item
    this.itemWk.text = this.formatLine('$(history) Wk', agg.weekly);
    this.itemWk.tooltip = this.tooltipFor('Weekly window', agg.weekly, state);
    this.applyTierStyle(this.itemWk, agg.weekly, this.opts.warningThreshold, this.opts.errorThreshold);
  }

  dispose(): void {
    for (const fn of this.disposeFns) fn();
    this.disposeFns = [];
  }

  // --- formatting ----------------------------------------------------------

  private formatLine(prefix: string, w: { remainingPercent: number; status: number; remainsMs?: number }): string {
    const pct = formatPercent(w.remainingPercent);
    const tier = dots(w.remainingPercent);
    if (this.mode === 'split' && w.remainsMs && w.remainsMs > 0) {
      const cd = formatDuration(w.remainsMs);
      return `${prefix} ${tier} ${pct} $(clock) ${cd}`;
    }
    return `${prefix} ${tier} ${pct}`;
  }

  private tooltipFor(label: string, w: { remainingPercent: number; status: number; endTime?: number; remainsMs?: number }, state: QuotaState): string {
    const pct = formatPercent(w.remainingPercent);
    const status = describeStatus(w.status);
    const end = w.endTime ? formatLocalTime(w.endTime) : '—';
    const cd = w.remainsMs && w.remainsMs > 0 ? formatDuration(w.remainsMs) : '—';
    const lastOk = state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString() : 'never';
    return [
      `MiniMax Usage — ${label}`,
      `Remaining: ${pct}   (${status})`,
      `Resets at: ${end}  (in ${cd})`,
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
    w: { remainingPercent: number; status: number },
    warn: number,
    err: number,
  ): void {
    item.color = undefined;
    item.backgroundColor = undefined;

    if (w.status === QuotaStatus.Exhausted) {
      item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
      item.color = new ThemeColor('statusBarItem.errorForeground');
      return;
    }
    if (w.status === QuotaStatus.Unlimited) {
      // No decoration; the icon will be overridden below.
      return;
    }
    if (w.remainingPercent < err) {
      item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
      item.color = new ThemeColor('statusBarItem.errorForeground');
    } else if (w.remainingPercent < warn) {
      item.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
      item.color = new ThemeColor('statusBarItem.warningForeground');
    }
  }
}

// ---- pure helpers (kept here so they're easy to test) ---------------------

function aggregate(perModel: NonNullable<QuotaState['perModel']>) {
  // Worst-case (lowest remaining) across all models. Status is the "most
  // severe" — exhausted wins, then limited, then unlimited.
  let intervalPct = 100;
  let weeklyPct = 100;
  let intervalStatus: number = QuotaStatus.Unlimited;
  let weeklyStatus: number = QuotaStatus.Unlimited;
  let intervalEnd: number | undefined;
  let intervalRemains: number | undefined;
  let weeklyEnd: number | undefined;
  let weeklyRemains: number | undefined;

  for (const m of perModel) {
    intervalPct = Math.min(intervalPct, m.interval.remainingPercent);
    weeklyPct = Math.min(weeklyPct, m.weekly.remainingPercent);
    intervalStatus = worse(intervalStatus, m.interval.status);
    weeklyStatus = worse(weeklyStatus, m.weekly.status);
    if (m.interval.endTime !== undefined) intervalEnd = m.interval.endTime;
    if (m.interval.remainsMs !== undefined) intervalRemains = m.interval.remainsMs;
    if (m.weekly.endTime !== undefined) weeklyEnd = m.weekly.endTime;
    if (m.weekly.remainsMs !== undefined) weeklyRemains = m.weekly.remainsMs;
  }

  return {
    interval: {
      remainingPercent: intervalPct,
      status: intervalStatus,
      endTime: intervalEnd,
      remainsMs: intervalRemains,
    },
    weekly: {
      remainingPercent: weeklyPct,
      status: weeklyStatus,
      endTime: weeklyEnd,
      remainsMs: weeklyRemains,
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
  // 5-dot sparkline, filled proportional to remaining %.
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 5);
  return '●'.repeat(filled) + '○'.repeat(5 - filled);
}
