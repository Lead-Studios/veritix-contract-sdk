/**
 * @file tests/types.test.ts
 * Compile-time type assertions for public SDK types — issue #139.
 *
 * These checks use `expect-type` to catch accidental field renames,
 * type widening, or narrowing before they reach consumers.
 */

import { expectTypeOf } from 'expect-type';
import { DisputeStatus } from '../src/types/index';
import type {
  EscrowRecord,
  SplitRecipient,
  NetworkConfig,
  StellarNetwork,
} from '../src/types/index';

describe('compile-time type assertions', () => {
  it('EscrowRecord.amount is bigint', () => {
    expectTypeOf<EscrowRecord['amount']>().toEqualTypeOf<bigint>();
  });

  it('DisputeStatus.Open value is the string "Open"', () => {
    // Runtime check that the enum value equals the literal 'Open'
    expect(DisputeStatus.Open).toBe('Open');
    // Compile-time: the typeof the Open member must be assignable to string
    expectTypeOf(DisputeStatus.Open).toBeString();
  });

  it('SplitRecipient.shareBps is number', () => {
    expectTypeOf<SplitRecipient['shareBps']>().toEqualTypeOf<number>();
  });

  it('NetworkConfig.network accepts "testnet" and "mainnet"', () => {
    expectTypeOf<NetworkConfig['network']>().toEqualTypeOf<StellarNetwork>();
    expectTypeOf<'testnet'>().toMatchTypeOf<StellarNetwork>();
    expectTypeOf<'mainnet'>().toMatchTypeOf<StellarNetwork>();
  });

  it('NetworkConfig.network does not accept "devnet"', () => {
    expectTypeOf<'devnet'>().not.toMatchTypeOf<StellarNetwork>();
  });
});
