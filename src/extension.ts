/**
 * MiniMax Usage — VS Code extension entrypoint.
 *
 * This file is intentionally small. It wires the services together and
 * registers the lifecycle hooks. All real logic lives in dedicated modules.
 */

import type { ConfigurationChangeEvent, ExtensionContext} from 'vscode';
import { commands, window, workspace } from 'vscode';

import { Logger } from './utils/logger.js';
import { SecretsStore } from './auth/secrets.js';
import { QuotaService } from './api/quota.js';
import type { StatusBarMode } from './ui/statusBar.js';
import { StatusBar } from './ui/statusBar.js';
import type { QuotaTreeProvider} from './ui/treeView.js';
import { registerTreeView } from './ui/treeView.js';
import { DetailsWebview } from './ui/detailsWebview.js';
import { registerCommands } from './commands/register.js';
import type { RegionKey } from './utils/regions.js';

const CONFIG_PREFIX = 'minimaxUsage';

let logger: Logger;
let secrets: SecretsStore;
let quota: QuotaService;
let statusBar: StatusBar;
let treeView: QuotaTreeProvider;
let details: DetailsWebview;
let treeDispose: () => void;

export function activate(context: ExtensionContext): void {
  // 1. Output channel + logger.
  const channel = window.createOutputChannel('Minimax Usage');
  logger = new Logger(channel, readConfigBoolean('debug', false));
  context.subscriptions.push(channel);

  // 2. Secrets store.
  secrets = new SecretsStore(context);

  // 3. Settings (read once + watch for changes).
  const mode = readConfigEnum<StatusBarMode>('statusBarDisplayMode', ['compact', 'split'], 'compact');
  const refreshSeconds = readConfigNumber('refreshIntervalSeconds', 60);
  const historyLimit = readConfigNumber('historySampleLimit', 100);
  const warning = readConfigNumber('warningThreshold', 70);
  const error = readConfigNumber('errorThreshold', 90);
  const region: RegionKey = 'global';

  // 4. Quota service.
  quota = new QuotaService({
    region,
    intervalMs: refreshSeconds * 1000,
    historyLimit,
    logger,
    getApiKey: () => secrets.getApiKey(),
  });
  context.subscriptions.push(quota);

  // 5. Status bar.
  statusBar = new StatusBar(context, {
    defaultMode: mode,
    warningThreshold: warning,
    errorThreshold: error,
    onClick: () => details.show(),
  });
  context.subscriptions.push(statusBar);

  // 6. Sidebar tree view.
  const tree = registerTreeView();
  treeView = tree.provider;
  treeView.setThresholds(warning, error);
  treeDispose = tree.dispose;
  context.subscriptions.push({ dispose: () => treeDispose() });

  // 7. Detail webview.
  details = new DetailsWebview(context, {
    onRefresh: () => quota.refreshNow(),
    onOpenBilling: () => commands.executeCommand('minimaxUsage.openBilling'),
    onSetApiKey: () => commands.executeCommand('minimaxUsage.setApiKey'),
  });
  context.subscriptions.push(details);

  // 8. Pipe QuotaState into all UI surfaces.
  quota.subscribe((state) => {
    statusBar.render(state);
    treeView.update(state);
    details.update(state);
  });

  // 9. Start polling.
  quota.start();

  // 10. Watch for config changes.
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
      if (!e.affectsConfiguration(CONFIG_PREFIX)) return;
      applyConfigChange(e);
    }),
  );

  // 11. Register palette commands.
  const cmdDeps = {
    secrets,
    quota,
    statusBar,
    details,
    logger,
    getStatusBarMode: () => readConfigEnum<StatusBarMode>('statusBarDisplayMode', ['compact', 'split'], 'compact'),
    setStatusBarMode: (m: StatusBarMode) => workspace.getConfiguration(CONFIG_PREFIX).update('statusBarDisplayMode', m),
    getSidebarVisible: () => readConfigBoolean('showSidebar', true),
    setSidebarVisible: (v: boolean) => workspace.getConfiguration(CONFIG_PREFIX).update('showSidebar', v),
  };
  for (const d of registerCommands(cmdDeps)) context.subscriptions.push(d);

  logger.info('activated');
}

export function deactivate(): void {
  logger?.info('deactivated');
  if (treeDispose) treeDispose();
}

function applyConfigChange(e: ConfigurationChangeEvent): void {
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.refreshIntervalSeconds`)) {
    const s = readConfigNumber('refreshIntervalSeconds', 60);
    quota.setIntervalMs(s * 1000);
    logger.info(`refresh interval = ${s}s`);
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.statusBarDisplayMode`)) {
    const m = readConfigEnum<StatusBarMode>('statusBarDisplayMode', ['compact', 'split'], 'compact');
    statusBar.setMode(m);
  }
  if (
    e.affectsConfiguration(`${CONFIG_PREFIX}.warningThreshold`) ||
    e.affectsConfiguration(`${CONFIG_PREFIX}.errorThreshold`)
  ) {
    const w = readConfigNumber('warningThreshold', 70);
    const err = readConfigNumber('errorThreshold', 90);
    treeView.setThresholds(w, err);
    statusBar.setMode(readConfigEnum<StatusBarMode>('statusBarDisplayMode', ['compact', 'split'], 'compact'));
    // Re-render by triggering a refresh.
    void quota.refreshNow();
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.historySampleLimit`)) {
    quota.setHistoryLimit(readConfigNumber('historySampleLimit', 100));
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.debug`)) {
    logger.setDebug(readConfigBoolean('debug', false));
  }
}

// ---- config helpers --------------------------------------------------------

function cfg<T>(key: string, fallback: T, parse: (raw: unknown) => T): T {
  const v = workspace.getConfiguration(CONFIG_PREFIX).get<T>(key);
  return v === undefined ? fallback : parse(v);
}

function readConfigNumber(key: string, fallback: number): number {
  return cfg(key, fallback, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback));
}

function readConfigBoolean(key: string, fallback: boolean): boolean {
  return cfg(key, fallback, (v) => (typeof v === 'boolean' ? v : fallback));
}

function readConfigEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  return cfg(key, fallback, (v) => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback));
}
