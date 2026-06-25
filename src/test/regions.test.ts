import { describe, expect, it } from 'vitest';
import { Regions } from '../utils/regions.js';

describe('Regions', () => {
  it('has global region enabled', () => {
    expect(Regions.global.enabled).toBe(true);
    expect(Regions.global.apiBaseUrl).toMatch(/^https:/);
  });

  it('has CN region disabled in v1', () => {
    expect(Regions.cn.enabled).toBe(false);
  });
});
