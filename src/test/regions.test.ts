import { describe, expect, it } from 'vitest';
import { Regions } from '../utils/regions.js';

describe('Regions', () => {
  it('has the global region configured with an HTTPS API URL', () => {
    expect(Regions.global.apiBaseUrl).toMatch(/^https:/);
    expect(Regions.global.billingUrl).toMatch(/^https:/);
    expect(Regions.global.label).toBe('Global');
  });
});
