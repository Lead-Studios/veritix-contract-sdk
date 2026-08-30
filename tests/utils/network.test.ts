/**
 * @file tests/utils/network.test.ts
 * Unit tests for address validation, the DUMMY_PUBLIC_KEY constant, network
 * config factories, Horizon URL helper, and ledger math helpers.
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';

import {
  DUMMY_PUBLIC_KEY,
  LEDGER_CLOSE_SECONDS,
  assertValidAddress,
  getHorizonUrl,
  getMainnetConfig,
  getTestnetConfig,
  isValidStellarAddress,
  ledgerToApproxDate,
  ledgersFromDate,
  ledgersFromNow,
} from '../../src/utils/network';
import { VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

// A keypair-randomised account address (valid Ed25519 public key).
const VALID_ADDRESS = Keypair.random().publicKey();
// The canonical Soroban contract ID used across the codebase for tests.
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

// ---------------------------------------------------------------------------
// DUMMY_PUBLIC_KEY
// ---------------------------------------------------------------------------

describe('DUMMY_PUBLIC_KEY', () => {
  it('is a valid Stellar G-address', () => {
    expect(DUMMY_PUBLIC_KEY.startsWith('G')).toBe(true);
    expect(DUMMY_PUBLIC_KEY.length).toBe(56);
    expect(StrKey.isValidEd25519PublicKey(DUMMY_PUBLIC_KEY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Address validation helpers
// ---------------------------------------------------------------------------

describe('isValidStellarAddress', () => {
  it('returns true for a valid G-address', () => {
    expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('returns false for a C-address (contract ID)', () => {
    expect(isValidStellarAddress(CONTRACT_ID)).toBe(false);
  });

  it('returns false for a truncated address', () => {
    expect(isValidStellarAddress(VALID_ADDRESS.slice(0, 20))).toBe(false);
  });

  it('returns false for a non-string value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidStellarAddress(null as any)).toBe(false);
  });
});

describe('assertValidAddress', () => {
  it('accepts a valid G-address', () => {
    expect(() => assertValidAddress(VALID_ADDRESS, 'beneficiary')).not.toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => assertValidAddress('', 'beneficiary')).toThrow(VeriTixError);
  });

  it('rejects a C-address by default', () => {
    try {
      assertValidAddress(CONTRACT_ID, 'recipient');
      throw new Error('expected assertValidAddress to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(VeriTixError);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
    }
  });

  it('accepts a C-address when allowContract is true', () => {
    expect(() =>
      assertValidAddress(CONTRACT_ID, 'contract', { allowContract: true }),
    ).not.toThrow();
  });

  it('throws INVALID_ADDRESS for garbage input and includes the field name', () => {
    try {
      assertValidAddress('not-an-address', 'depositor');
      throw new Error('expected assertValidAddress to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(VeriTixError);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
      expect((err as VeriTixError).message).toContain('depositor');
    }
  });
});

// ---------------------------------------------------------------------------
// Network config factories
// ---------------------------------------------------------------------------

describe('getTestnetConfig', () => {
  it('returns the correct rpcUrl and network', () => {
    const cfg = getTestnetConfig(CONTRACT_ID);
    expect(cfg.network).toBe('testnet');
    expect(cfg.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(cfg.contractId).toBe(CONTRACT_ID);
  });

  it('throws on an empty contractId', () => {
    expect(() => getTestnetConfig('')).toThrow(TypeError);
  });
});

describe('getMainnetConfig', () => {
  it('returns the correct rpcUrl and network', () => {
    const cfg = getMainnetConfig(CONTRACT_ID);
    expect(cfg.network).toBe('mainnet');
    expect(cfg.rpcUrl).toBe('https://mainnet.stellar.validationcloud.io/v1/soroban/rpc');
    expect(cfg.contractId).toBe(CONTRACT_ID);
  });

  it('throws on a blank contractId', () => {
    expect(() => getMainnetConfig('   ')).toThrow(TypeError);
  });
});

describe('getHorizonUrl', () => {
  it('returns the testnet Horizon URL', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });

  it('returns the mainnet Horizon URL', () => {
    expect(getHorizonUrl('mainnet')).toBe('https://horizon.stellar.org');
  });
});

// ---------------------------------------------------------------------------
// Ledger math helpers
// ---------------------------------------------------------------------------

describe('LEDGER_CLOSE_SECONDS', () => {
  it('is 5', () => {
    expect(LEDGER_CLOSE_SECONDS).toBe(5);
  });
});

describe('ledgersFromNow', () => {
  it('adds the ceiling of seconds / LEDGER_CLOSE_SECONDS', () => {
    expect(ledgersFromNow(10, 1000)).toBe(1002); // 10 / 5 = 2
    expect(ledgersFromNow(11, 1000)).toBe(1003); // ceil(11 / 5) = 3
    expect(ledgersFromNow(0, 1000)).toBe(1000); // 0 seconds → no change
    expect(ledgersFromNow(3600, 500)).toBe(1220); // ceil(3600 / 5) = 720
  });
});

describe('ledgersFromDate', () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const currentLedger = 1000;

  it('converts a future date to a ledger number', () => {
    const future = new Date('2024-01-01T00:01:40Z'); // 100s from now
    expect(ledgersFromDate(future, currentLedger, now)).toBe(1020);
  });

  it('handles exact multiples of LEDGER_CLOSE_SECONDS', () => {
    const future = new Date(now.getTime() + 500_000); // 500s
    expect(ledgersFromDate(future, 0, now)).toBe(100);
  });
});

describe('ledgerToApproxDate', () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const currentLedger = 1000;

  it('converts a future ledger back to an approximate date', () => {
    const result = ledgerToApproxDate(1020, currentLedger, now);
    expect(result.getTime()).toBe(now.getTime() + 100_000); // 20 ledgers × 5s
  });

  it('is the approximate inverse of ledgersFromDate', () => {
    const future = new Date(now.getTime() + 10_000);
    const ledger = ledgersFromDate(future, currentLedger, now);
    const backToDate = ledgerToApproxDate(ledger, currentLedger, now);
    // Allow 5s of error due to ceiling rounding.
    expect(Math.abs(backToDate.getTime() - future.getTime())).toBeLessThanOrEqual(5000);
  });
});