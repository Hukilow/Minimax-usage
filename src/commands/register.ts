/**
 * Centralized command registration. Each command is a thin handler that
 * delegates to a service (QuotaService, SecretsStore, DetailsWebview, etc.)
 * registered in the extension context.
 */

import type { Disposable} from 'vscode';
import { commands, env, Uri, window } from 'vscode';
import type { SecretsStore } from '../auth/secrets.js';
import type { QuotaService } from '../api/quota.js';
import type { DetailsWebview } from '../ui/detailsWebview.js';
import type { Logger } from '../utils/logger.js';
import { Regions } from '../utils/regions.js';
import type { StatusBar, StatusBarMode } from '../ui/statusBar.js';

export interface CommandDeps {
  secrets: SecretsStore;
  quota: QuotaService;
  statusBar: StatusBar;
  details: DetailsWebview;
  logger: Logger;
  /** Reads/writes the current status bar mode. */
  getStatusBarMode: () => StatusBarMode;
  setStatusBarMode: (m: StatusBarMode) => void;
  /** Reads/writes the sidebar visibility. */
  getSidebarVisible: () => boolean;
  setSidebarVisible: (v: boolean) => void;
}

export function registerCommands(deps: CommandDeps): Disposable[] {
  return [
    commands.registerCommand('minimaxUsage.setApiKey', () => setApiKey(deps)),
    commands.registerCommand('minimaxUsage.clearApiKey', () => clearApiKey(deps)),
    commands.registerCommand('minimaxUsage.refresh', () => refresh(deps)),
    commands.registerCommand('minimaxUsage.openDashboard', () => openDashboard(deps)),
    commands.registerCommand('minimaxUsage.openBilling', () => openBilling()),
    commands.registerCommand('minimaxUsage.toggleStatusBar', () => toggleStatusBar(deps)),
    commands.registerCommand('minimaxUsage.toggleSidebar', () => toggleSidebar(deps)),
  ];
}

// --- handlers --------------------------------------------------------------

async function setApiKey(deps: CommandDeps): Promise<void> {
  const current = await deps.secrets.getApiKey();
  const input = await window.showInputBox({
    title: 'MiniMax Usage — Set API Key',
    prompt: 'Paste your MiniMax Token Plan Subscription Key',
    placeHolder: 'sk-cp-…',
    password: true,
    value: current ?? '',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim().length > 10 ? null : 'Key looks too short'),
  });
  if (input === undefined) return;
  try {
    await deps.secrets.setApiKey(input);
    void window.showInformationMessage('MiniMax Usage: API key saved.');
    deps.logger.info('API key updated');
    void deps.quota.refreshNow();
  } catch (err) {
    deps.logger.error('Failed to save API key', err);
    void window.showErrorMessage('MiniMax Usage: failed to save API key.');
  }
}

async function clearApiKey(deps: CommandDeps): Promise<void> {
  const confirm = await window.showWarningMessage(
    'MiniMax Usage — Clear API Key?',
    { modal: true },
    'Clear',
  );
  if (confirm !== 'Clear') return;
  await deps.secrets.clearApiKey();
  void window.showInformationMessage('MiniMax Usage: API key cleared.');
  deps.logger.info('API key cleared');
  void deps.quota.refreshNow();
}

async function refresh(deps: CommandDeps): Promise<void> {
  await deps.quota.refreshNow();
}

function openDashboard(deps: CommandDeps): void {
  deps.details.show();
}

function openBilling(): void {
  void env.openExternal(Uri.parse(Regions.global.billingUrl));
}

function toggleStatusBar(deps: CommandDeps): void {
  const next: StatusBarMode = deps.getStatusBarMode() === 'compact' ? 'split' : 'compact';
  deps.setStatusBarMode(next);
  deps.statusBar.setMode(next);
  deps.logger.info(`status bar mode = ${next}`);
}

function toggleSidebar(deps: CommandDeps): void {
  const next = !deps.getSidebarVisible();
  deps.setSidebarVisible(next);
  void window.showInformationMessage(
    `MiniMax Usage sidebar: ${next ? 'visible (reload window to apply)' : 'hidden (reload window to apply)'}`,
  );
}
