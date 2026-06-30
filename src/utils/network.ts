/**
 * @module utils/network
 * Network configuration helpers for Testnet and Mainnet Stellar / Soroban.
 *
 * Use these helpers to build a {@link NetworkConfig} that can be passed
 * directly to {@link VeriTixClient}.
 */

import { StrKey } from '@stellar/stellar-sdk';
import type { NetworkConfig, StellarNetwork } from '../types/index';
import { VeriTixError, VeriTixErrorCode } from './errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Soroban RPC URL for Stellar Testnet */
const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';

/** Soroban RPC URL for Stellar Mainnet */
const MAINNET_RPC_URL = 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc';

/**
 * A deterministic Stellar public key used as the source account for read-only
 * contract simulations.  Simulations don't require an actual funded account
 * on-chain, so we always use this static key instead of generating a fresh
 * {@link Keypair} per call (which would burn CPU on every read).
 *
 * @internal
 */
export const DUMMY_PUBLIC_KEY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

/** Network passphrase for Stellar Testnet */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Network passphrase for Stellar Mainnet */
export const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Horizon base URL for Testnet */
const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/** Horizon base URL for Mainnet */
const MAINNET_HORIZON_URL = 'https://horizon.stellar.org';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertContractId(contractId: unknown): asserts contractId is string {
  if (typeof contractId !== 'string' || contractId.trim().length === 0) {
    throw new TypeError(
      `contractId must be a non-empty string, got: ${JSON.stringify(contractId)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Config factories
// ---------------------------------------------------------------------------

/**
 * Returns a {@link NetworkConfig} pre-populated for **Testnet**.
 *
 * @param contractId - Bech32-encoded Soroban contract ID.
 * @returns A fully-populated `NetworkConfig` ready for {@link VeriTixClient}.
 *
 * @example
 * ```ts
 * const config = getTestnetConfig('CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
 * const client = new VeriTixClient(config);
 * ```
 */
export function getTestnetConfig(contractId: string): NetworkConfig {
  assertContractId(contractId);
  return {
    network: 'testnet',
    contractId,
    rpcUrl: TESTNET_RPC_URL,
    networkPassphrase: TESTNET_PASSPHRASE,
  };
}

/**
 * Returns a {@link NetworkConfig} pre-populated for **Mainnet**.
 *
 * @param contractId - Bech32-encoded Soroban contract ID.
 * @returns A fully-populated `NetworkConfig` ready for {@link VeriTixClient}.
 *
 * @example
 * ```ts
 * const config = getMainnetConfig('CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
 * const client = new VeriTixClient(config, myKeypair);
 * ```
 */
export function getMainnetConfig(contractId: string): NetworkConfig {
  assertContractId(contractId);
  return {
    network: 'mainnet',
    contractId,
    rpcUrl: MAINNET_RPC_URL,
    networkPassphrase: MAINNET_PASSPHRASE,
  };
}

// ---------------------------------------------------------------------------
// Horizon URL helper
// ---------------------------------------------------------------------------

/**
 * Returns the Horizon REST API base URL for the given network.
 *
 * @param network - `"testnet"` or `"mainnet"`.
 * @returns The Horizon base URL (no trailing slash).
 *
 * @example
 * ```ts
 * const horizonUrl = getHorizonUrl('testnet');
 * // → "https://horizon-testnet.stellar.org"
 * ```
 */
export function getHorizonUrl(network: StellarNetwork): string {
  return network === 'mainnet' ? MAINNET_HORIZON_URL : TESTNET_HORIZON_URL;
}

// ---------------------------------------------------------------------------
// Ledger math helpers
// ---------------------------------------------------------------------------

/** Approximate seconds per Stellar ledger (target close time). */
export const LEDGER_CLOSE_SECONDS = 5;

/**
 * Returns the ledger sequence number that will be reached approximately
 * `seconds` from now, given the current ledger.
 *
 * @param seconds       - Number of seconds in the future.
 * @param currentLedger - Current ledger sequence number.
 * @returns Estimated future ledger sequence.
 *
 * @example
 * ```ts
 * const expiry = ledgersFromNow(3600, currentLedger); // ~1 hour from now
 * await client.escrow.createEscrow({ ..., expiryLedger: expiry });
 * ```
 */
export function ledgersFromNow(seconds: number, currentLedger: number): number {
  return currentLedger + Math.ceil(seconds / LEDGER_CLOSE_SECONDS);
}

/**
 * Converts a future `Date` to an approximate ledger sequence number.
 *
 * @param date          - The target future date.
 * @param currentLedger - Current ledger sequence number.
 * @param currentDate   - Reference date to measure from (defaults to `new Date()`).
 * @returns Estimated ledger sequence for that date.
 *
 * @example
 * ```ts
 * const eventDate = new Date('2025-12-31T00:00:00Z');
 * const expiryLedger = ledgersFromDate(eventDate, currentLedger);
 * ```
 */
export function ledgersFromDate(date: Date, currentLedger: number, currentDate?: Date): number {
  const now = currentDate ?? new Date();
  const seconds = (date.getTime() - now.getTime()) / 1000;
  return currentLedger + Math.ceil(seconds / LEDGER_CLOSE_SECONDS);
}

/**
 * Converts a future ledger sequence number to an approximate `Date`.
 *
 * @param ledger        - The target ledger sequence number.
 * @param currentLedger - Current ledger sequence number.
 * @param currentDate   - Reference date to measure from (defaults to `new Date()`).
 * @returns Approximate `Date` for that ledger.
 *
 * @example
 * ```ts
 * const approxDate = ledgerToApproxDate(expiryLedger, currentLedger);
 * console.log('Escrow expires around:', approxDate.toISOString());
 * ```
 */
export function ledgerToApproxDate(ledger: number, currentLedger: number, currentDate?: Date): Date {
  const now = currentDate ?? new Date();
  const secondsDiff = (ledger - currentLedger) * LEDGER_CLOSE_SECONDS;
  return new Date(now.getTime() + secondsDiff * 1000);
// Address validation
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the given string is a valid Stellar Ed25519 public key
 * (starts with `G`, 56 characters, passes StrKey validation).
 */
export function isValidStellarAddress(address: string): boolean {
  return typeof address === 'string' && StrKey.isValidEd25519PublicKey(address);
}

/**
 * Throws a {@link VeriTixError} with code `INVALID_ADDRESS` if the address
 * is not a valid Stellar public key.
 *
 * @param address   - The address string to validate.
 * @param fieldName - Human-readable field name used in the error message.
 */
export function assertValidAddress(address: string, fieldName: string): void {
  if (!isValidStellarAddress(address)) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAddress,
      `${fieldName} is not a valid Stellar address: "${address}"`,
    );
  }
}
