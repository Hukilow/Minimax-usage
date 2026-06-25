/**
 * Region configuration. CN region is intentionally disabled in v1 per user
 * decision but the code paths are stubbed so we can flip the switch later
 * without touching call sites.
 */
export const Regions = {
  global: {
    /** Whether this region is currently enabled. */
    enabled: true,
    /** Base URL of the API for this region. */
    apiBaseUrl: 'https://api.minimax.io',
    /** Human-readable name for the billing portal. */
    billingUrl: 'https://platform.minimax.io/user-center/payment/token-plan',
    /** ISO-3166-ish label shown in the dashboard. */
    label: 'Global',
  },
  cn: {
    enabled: false,
    apiBaseUrl: 'https://api.MiniMax.cn',
    billingUrl: 'https://platform.MiniMax.cn/user-center/payment/token-plan',
    label: 'China',
  },
} as const satisfies Record<string, { enabled: boolean; apiBaseUrl: string; billingUrl: string; label: string }>;

export type RegionKey = keyof typeof Regions;
