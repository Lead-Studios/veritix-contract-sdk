/**
 * @file tests/utils/network.test.ts
 * Unit tests for ledger math helpers and network config factories.
 */

import {
  ledgersFromNow,
  ledgersFromDate,
  ledgerToApproxDate,
  LEDGER_CLOSE_SECONDS,
  getTestnetConfig,
  getMainnetConfig,
  getHorizonUrl,
} from '../../src/utils/network';

describe('LEDGER_CLOSE_SECONDS', () => {
  it('is 5', () => {
    expect(LEDGER_CLOSE_SECONDS).toBe(5);
  });
});

describe('ledgersFromNow', () => {
  it('adds ceiling of seconds/5 to currentLedger', () => {
    expect(ledgersFromNow(10, 1000)).toBe(1002);   // 10/5 = 2
    expect(ledgersFromNow(11, 1000)).toBe(1003);   // ceil(11/5) = 3
    expect(ledgersFromNow(0, 1000)).toBe(1000);    // 0 seconds
    expect(ledgersFromNow(3600, 500)).toBe(1220);  // ceil(3600/5) = 720
  });

  it('rounds up fractional ledgers', () => {
    expect(ledgersFromNow(1, 0)).toBe(1);  // ceil(1/5) = 1
    expect(ledgersFromNow(4, 0)).toBe(1);  // ceil(4/5) = 1
    expect(ledgersFromNow(5, 0)).toBe(1);  // ceil(5/5) = 1
    expect(ledgersFromNow(6, 0)).toBe(2);  // ceil(6/5) = 2
  });
});

describe('ledgersFromDate', () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const currentLedger = 1000;

  it('converts a future date to a ledger number', () => {
    const future = new Date('2024-01-01T00:01:40Z'); // 100s from now
    // ceil(100/5) = 20 ledgers
    expect(ledgersFromDate(future, currentLedger, now)).toBe(1020);
  });

  it('uses Date.now() when currentDate is omitted', () => {
    const future = new Date(Date.now() + 50_000); // 50s ahead
    const result = ledgersFromDate(future, 0);
    expect(result).toBe(Math.ceil(50_000 / 1000 / 5)); // ceil(50/5) = 10
  });

  it('handles exact multiples', () => {
    const future = new Date(now.getTime() + 500_000); // 500s
    expect(ledgersFromDate(future, 0, now)).toBe(100);  // 500/5 = 100
  });
});

describe('ledgerToApproxDate', () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const currentLedger = 1000;

  it('converts a future ledger back to a date', () => {
    // 20 ledgers × 5s = 100s
    const result = ledgerToApproxDate(1020, currentLedger, now);
    expect(result.getTime()).toBe(now.getTime() + 100_000);
  });

  it('returns the current date when ledger == currentLedger', () => {
    const result = ledgerToApproxDate(currentLedger, currentLedger, now);
    expect(result.getTime()).toBe(now.getTime());
  });

  it('uses Date.now() when currentDate is omitted', () => {
    const before = Date.now();
    const result = ledgerToApproxDate(1000, 0);
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 1000 * 5 * 1000 - 10);
  });

  it('is the approximate inverse of ledgersFromDate', () => {
    const future = new Date(now.getTime() + 10_000);
    const ledger = ledgersFromDate(future, currentLedger, now);
    const backToDate = ledgerToApproxDate(ledger, currentLedger, now);
    // Allow 5s error due to ceiling
    expect(Math.abs(backToDate.getTime() - future.getTime())).toBeLessThanOrEqual(5000);
  });
});

describe('getTestnetConfig', () => {
  it('returns correct network fields', () => {
    const cfg = getTestnetConfig('CABC');
    expect(cfg.network).toBe('testnet');
    expect(cfg.contractId).toBe('CABC');
    expect(cfg.rpcUrl).toContain('testnet');
  });

  it('throws on empty contractId', () => {
    expect(() => getTestnetConfig('')).toThrow(TypeError);
  });
});

describe('getMainnetConfig', () => {
  it('returns correct network fields', () => {
    const cfg = getMainnetConfig('CXYZ');
    expect(cfg.network).toBe('mainnet');
    expect(cfg.contractId).toBe('CXYZ');
  });

  it('throws on empty contractId', () => {
    expect(() => getMainnetConfig('  ')).toThrow(TypeError);
  });
});

describe('getHorizonUrl', () => {
  it('returns testnet URL', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });

  it('returns mainnet URL', () => {
    expect(getHorizonUrl('mainnet')).toBe('https://horizon.stellar.org');
import { Keypair } from '@stellar/stellar-sdk';
import { isValidStellarAddress, assertValidAddress } from '../../src/utils/network';
import { VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

const VALID_ADDRESS = Keypair.random().publicKey();

describe('isValidStellarAddress', () => {
  it('returns true for a valid Ed25519 public key', () => {
    expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('returns false for an address starting with G but wrong length', () => {
    expect(isValidStellarAddress('GABC')).toBe(false);
  });

  it('returns false for a non-string value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidStellarAddress(null as any)).toBe(false);
  });

  it('returns false for a contract ID (starts with C)', () => {
    expect(isValidStellarAddress('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4')).toBe(
      false,
    );
  });
});

describe('assertValidAddress', () => {
  it('does not throw for a valid address', () => {
    expect(() => assertValidAddress(VALID_ADDRESS, 'beneficiary')).not.toThrow();
  });

  it('throws VeriTixError with INVALID_ADDRESS for an invalid address', () => {
    expect(() => assertValidAddress('not-an-address', 'beneficiary')).toThrow(VeriTixError);
  });

  it('throws with code INVALID_ADDRESS', () => {
    try {
      assertValidAddress('bad', 'recipient');
    } catch (err) {
      expect(err).toBeInstanceOf(VeriTixError);
      expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
    }
  });

  it('includes the fieldName in the error message', () => {
    try {
      assertValidAddress('bad', 'depositor');
    } catch (err) {
      expect((err as VeriTixError).message).toContain('depositor');
    }
  });
});
