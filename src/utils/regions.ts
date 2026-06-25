/**
 * Region configuration. Only the live-verified global region is shipped.
 * If/when a separate CN endpoint is officially published by MiniMax, add a
 * second entry here and thread a selector through `extension.ts`.
 */
export const Regions = {
  global: {
    /** Base URL of the API for this region. */
    apiBaseUrl: 'https://api.minimax.io',
    /** Human-readable name for the billing portal. */
    billingUrl: 'https://platform.minimax.io/console/plan',
    /** ISO-3166-ish label shown in the dashboard. */
    label: 'Global',
  },
} as const satisfies Record<string, { apiBaseUrl: string; billingUrl: string; label: string }>;

export type RegionKey = keyof typeof Regions;
