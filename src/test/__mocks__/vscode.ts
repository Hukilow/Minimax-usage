/**
 * Minimal vscode mock for unit tests. Only what the modules under test
 * actually import. Extend as needed.
 */

import { EventEmitter } from 'node:events';

// Hoisted above all other declarations so the `export const EventEmitter =
// EventEmitter_Node` alias further down never hits a temporal-dead-zone.
class EventEmitter_Node {
  private listeners: Array<(e: unknown) => void> = [];
  readonly event = (listener: (e: unknown) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(e: unknown): void {
    for (const l of this.listeners) l(e);
  }
}

export class Uri {
  static parse(value: string): Uri {
    return new Uri(value);
  }
  static file(path: string): Uri {
    return new Uri(path);
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(`${base.value}/${parts.join('/')}`);
  }
  private constructor(public readonly value: string) {}
  toString(): string {
    return this.value;
  }
  with(_change: { scheme?: string; path?: string }): Uri {
    return this;
  }
  fsPath: string = this.value;
  scheme: string = 'file';
  path: string = this.value;
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export const window = {
  createOutputChannel(_name: string): OutputChannel {
    return new OutputChannel();
  },
  createStatusBarItem(_id?: string, _priority?: number, _alignment?: number): StatusBarItem {
    return new StatusBarItem();
  },
  createTreeView(_id: string, _options: unknown): { dispose: () => void } {
    return { dispose: () => {} };
  },
  createWebviewPanel(
    _id: string,
    _title: string,
    _viewColumn: number,
    _options: unknown,
  ): WebviewPanel {
    return new WebviewPanel();
  },
  showInputBox(_opts: unknown): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showInformationMessage(_msg: string): Promise<undefined> {
    return Promise.resolve(undefined);
  },
  showWarningMessage(_msg: string, _opts?: unknown, ..._items: string[]): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showErrorMessage(_msg: string): Promise<undefined> {
    return Promise.resolve(undefined);
  },
};

export const env = {
  openExternal(_uri: Uri): Promise<boolean> {
    return Promise.resolve(true);
  },
};

export const commands = {
  registerCommand(_cmd: string, _fn: (...args: unknown[]) => unknown): { dispose: () => void } {
    return { dispose: () => {} };
  },
  executeCommand(_cmd: string, ..._args: unknown[]): Promise<unknown> {
    return Promise.resolve();
  },
};

export const workspace = {
  getConfiguration(_section?: string): { get: <T>(k: string) => T | undefined; update: (k: string, v: unknown) => Promise<void> } {
    return { get: () => undefined, update: async () => {} };
  },
  onDidChangeConfiguration(_fn: (e: unknown) => void): { dispose: () => void } {
    return { dispose: () => {} };
  },
};

export const ViewColumn = { Active: 1, Beside: 2, One: 3, Two: 4, Three: 5 };
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const EventEmitter = EventEmitter_Node;

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  iconPath?: ThemeIcon;
  contextValue?: string;
  command?: { title: string; command: string };
  collapsibleState?: number;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export interface TreeDataProvider<T> {
  getTreeItem(node: T): unknown;
  getChildren(node?: T): T[];
  onDidChangeTreeData?: unknown;
}


export class OutputChannel {
  private buf: string[] = [];
  name = 'mock';
  append(text: string): void {
    this.buf.push(text);
  }
  appendLine(text: string): void {
    this.buf.push(text + '\n');
  }
  clear(): void {
    this.buf = [];
  }
  show(_preserve?: boolean): void {}
  hide(): void {}
  dispose(): void {}
}

export class StatusBarItem {
  text = '';
  tooltip?: string;
  backgroundColor?: unknown;
  color?: unknown;
  command?: Command;
  name = '';
  show(): void {}
  hide(): void {}
  dispose(): void {}
}

/** Mirrors the real `Command` shape — minimal stub for the type-only import. */
export interface Command {
  title: string;
  command: string;
  tooltip?: string;
  arguments?: unknown[];
}

export class WebviewPanel {
  webview = new Webview();
  iconPath?: Uri;
  onDidReceiveMessage(_fn: (msg: unknown) => void, _thisArg?: unknown, _disposables?: unknown[]): { dispose: () => void } {
    return { dispose: () => {} };
  }
  onDidDispose(_fn: () => void): { dispose: () => void } {
    return { dispose: () => {} };
  }
  reveal(_col?: unknown): void {}
  dispose(): void {}
}

export class Webview {
  html = '';
  cspSource = "'self'";
  options: Record<string, unknown> = {};
  postMessage(_msg: unknown): Promise<boolean> {
    return Promise.resolve(true);
  }
  asWebviewUri(uri: Uri): Uri {
    return uri;
  }
  onDidReceiveMessage(_fn: (msg: unknown) => void): { dispose: () => void } {
    return { dispose: () => {} };
  }
}

export interface ExtensionContext {
  subscriptions: Array<{ dispose: () => void }>;
  secrets: SecretStorage;
  extensionUri: Uri;
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
