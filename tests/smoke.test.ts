/**
 * @file tests/smoke.test.ts
 * Module-load smoke test.
 *
 * A broken re-export in `src/index.ts` fails at runtime, not at build time —
 * these tests import the public barrel and assert the headline exports are
 * actually there, so a bad barrel is caught by CI instead of by consumers.
 */

import {
  VeriTixClient,
  VeriTixError,
  VeriTixErrorCode,
  getTestnetConfig,
} from '../src/index';

describe('SDK module loads', () => {
  it('exports VeriTixClient', () => expect(VeriTixClient).toBeDefined());
  it('exports VeriTixError', () => expect(VeriTixError).toBeDefined());
  it('exports VeriTixErrorCode', () => expect(VeriTixErrorCode).toBeDefined());
  it('exports getTestnetConfig', () => expect(getTestnetConfig).toBeDefined());

  it('getTestnetConfig returns a valid config', () => {
    const cfg = getTestnetConfig('CXXXXXXX...');
    expect(cfg.network).toBe('testnet');
    expect(cfg.rpcUrl).toContain('soroban');
  });
});
