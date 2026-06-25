import type {
  TreeDataProvider} from 'vscode';
import {
  EventEmitter,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  window,
} from 'vscode';
import type { QuotaState } from '../api/quota.js';
import type { NormalizedModelQuota, NormalizedWindow} from '../api/types.js';
import { QuotaStatus } from '../api/types.js';
import { formatDuration, formatLocalTime, formatPercent } from '../utils/time.js';

/** A node in the TreeView. Discriminated union for type-safety. */
export type TreeNode =
  | EmptyNode
  | ErrorNode
  | ModelNode
  | RowNode;

export interface EmptyNode {
  kind: 'empty';
}

export interface ErrorNode {
  kind: 'error';
  message: string;
  command?: string;
}

export interface ModelNode {
  kind: 'model';
  model: NormalizedModelQuota;
  warningThreshold: number;
  errorThreshold: number;
}

export interface RowNode {
  kind: 'row';
  label: '5-hour' | 'Weekly';
  parent: string;
  window: NormalizedWindow;
}

export class QuotaTreeProvider implements TreeDataProvider<TreeNode> {
  private readonly emitter = new EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private state: QuotaState = { perModel: null, hasKey: false, history: [], inFlight: false };
  private warningThreshold = 30;
  private errorThreshold = 10;

  setThresholds(warning: number, error: number): void {
    this.warningThreshold = warning;
    this.errorThreshold = error;
    this.refresh();
  }

  update(state: QuotaState): void {
    this.state = state;
    this.refresh();
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: TreeNode): TreeItem {
    switch (node.kind) {
      case 'empty':
        return this.renderEmpty();
      case 'error':
        return this.renderError(node);
      case 'model':
        return this.renderModel(node);
      case 'row':
        return this.renderRow(node);
    }
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (node === undefined) {
      if (!this.state.hasKey) return [emptyNode()];
      if (this.state.lastError && !this.state.perModel) {
        return [errorNode(`Last fetch failed: ${this.state.lastError.message}`)];
      }
      if (!this.state.perModel || this.state.perModel.length === 0) {
        return [errorNode(this.state.inFlight ? 'Loading…' : 'No data yet')];
      }
      return this.state.perModel.map((model: NormalizedModelQuota) => ({
        kind: 'model' as const,
        model,
        warningThreshold: this.warningThreshold,
        errorThreshold: this.errorThreshold,
      }));
    }
    if (node.kind === 'model') {
      return [
        { kind: 'row' as const, label: '5-hour', parent: node.model.model_name, window: node.model.interval },
        { kind: 'row' as const, label: 'Weekly', parent: node.model.model_name, window: node.model.weekly },
      ];
    }
    return [];
  }

  // --- rendering helpers --------------------------------------------------

  private renderEmpty(): TreeItem {
    const t = new TreeItem('No API key set');
    t.iconPath = new ThemeIcon('key');
    t.tooltip = 'Run "MiniMax Usage: Set API Key" to start';
    t.command = { title: 'Set API Key', command: 'minimaxUsage.setApiKey' };
    return t;
  }

  private renderError(node: ErrorNode): TreeItem {
    const t = new TreeItem(node.message);
    t.iconPath = new ThemeIcon('error');
    t.tooltip = 'Click to view logs';
    t.command = { title: 'Show Output', command: node.command ?? 'minimaxUsage.openDashboard' };
    return t;
  }

  private renderModel(node: ModelNode): TreeItem {
    const m = node.model;
    const t = new TreeItem(m.model_name, TreeItemCollapsibleState.Collapsed);
    t.iconPath = iconFor(m, node.warningThreshold, node.errorThreshold);
    t.tooltip = tooltipFor(m);
    t.contextValue = 'model';
    t.command = { title: 'Open Dashboard', command: 'minimaxUsage.openDashboard' };
    t.description = describeHeadline(m);
    return t;
  }

  private renderRow(node: RowNode): TreeItem {
    const t = new TreeItem(node.label, TreeItemCollapsibleState.None);
    t.description = [
      formatPercent(node.window.remainingPercent),
      '•',
      `resets in ${node.window.remainsMs && node.window.remainsMs > 0 ? formatDuration(node.window.remainsMs) : '—'}`,
    ].join(' ');
    t.tooltip = [
      `${node.parent} — ${node.label}`,
      `Remaining: ${formatPercent(node.window.remainingPercent)}`,
      `Resets at: ${node.window.endTime ? formatLocalTime(node.window.endTime) : '—'}`,
    ].join('\n');
    t.iconPath = rowIcon(node.window);
    t.contextValue = 'row';
    return t;
  }
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

function errorNode(message: string, command?: string): ErrorNode {
  return { kind: 'error', message, command };
}

function iconFor(m: NormalizedModelQuota, warn: number, err: number): ThemeIcon {
  if (m.interval.status === QuotaStatus.Exhausted || m.weekly.status === QuotaStatus.Exhausted) {
    return new ThemeIcon('error');
  }
  const min = Math.min(m.interval.remainingPercent, m.weekly.remainingPercent);
  if (min < err) return new ThemeIcon('alert');
  if (min < warn) return new ThemeIcon('warning');
  return new ThemeIcon('pulse');
}

function rowIcon(w: NormalizedWindow): ThemeIcon {
  if (w.status === QuotaStatus.Exhausted) return new ThemeIcon('error');
  if (w.status === QuotaStatus.Unlimited) return new ThemeIcon('infinity');
  if (w.remainingPercent < 10) return new ThemeIcon('alert');
  if (w.remainingPercent < 30) return new ThemeIcon('warning');
  return new ThemeIcon('circle-filled');
}

function describeHeadline(m: NormalizedModelQuota): string {
  return [
    `5h ${formatPercent(m.interval.remainingPercent)}`,
    `Wk ${formatPercent(m.weekly.remainingPercent)}`,
  ].join('   •   ');
}

function tooltipFor(m: NormalizedModelQuota): string {
  const cd = (ms: number | undefined) => (ms && ms > 0 ? formatDuration(ms) : '—');
  return [
    `Model: ${m.model_name}`,
    `5-hour: ${formatPercent(m.interval.remainingPercent)}  (resets in ${cd(m.interval.remainsMs)})`,
    `Weekly: ${formatPercent(m.weekly.remainingPercent)}  (resets in ${cd(m.weekly.remainsMs)})`,
  ].join('\n');
}

/** Registers the tree view in the MiniMax Usage sidebar. */
export function registerTreeView(): { provider: QuotaTreeProvider; dispose: () => void } {
  const provider = new QuotaTreeProvider();
  const view = window.createTreeView('minimaxUsage.view', { treeDataProvider: provider });
  return {
    provider,
    dispose: () => {
      view.dispose();
    },
  };
}
