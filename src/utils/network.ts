/**
 * @module utils/network
 * Network config factories, address validation, and ledger math helpers
 * (rebuild issue #583).
 *
 * Everything a module needs to talk to the network lives here so module
 * implementations never hard-code endpoints or passphrases.
 */
import { StrKey } from '@stellar/stellar-sdk';

import { VeriTixError, VeriTixErrorCode } from './errors';

export interface NetworkConfig {
  /** Deployed VeriTix Soroban contract ID (C… strkey). */
  contractId: string;
  /** Target network. */
  network: 'testnet' | 'mainnet';
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Stellar network passphrase, used when building transactions. */
  networkPassphrase: string;
  /** Horizon endpoint URL for account lookups. */
  horizonUrl: string;
  /** Connection retry count used by client.connect(). */
  retries?: number;
  /** Delay (ms) between connection retry attempts. */
  retryDelayMs?: number;
}

/** Deterministic dummy source account used to build simulation transactions. */
export const DUMMY_PUBLIC_KEY = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57';

/** Stellar ledger close time in seconds. */
export const LEDGER_CLOSE_SECONDS = 5;

/**
 * Returns whether `address` is a valid Stellar account (G…) strkey.
 * Contract IDs (C…) intentionally return `false`.
 */
export function isValidStellarAddress(address: unknown): address is string {
  return typeof address === 'string' && StrKey.isValidEd25519PublicKey(address);
}

/**
 * Validates that `address` is a usable Stellar address, throwing a typed
 * {@link VeriTixError} (code {@link VeriTixErrorCode.InvalidAddress}) when it
 * is not.
 *
 * @param address - The address to validate.
 * @param field   - Name of the field, included in the error message.
 * @param options - Set `allowContract: true` to also accept contract IDs.
 */
export function assertValidAddress(
  address: string,
  field: string,
  options: { allowContract?: boolean } = {},
): void {
  const isAccount = StrKey.isValidEd25519PublicKey(address);
  const isContract = options.allowContract === true && StrKey.isValidContract(address);
  if (!isAccount && !isContract) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAddress,
      `Invalid ${field} address — expected a valid Stellar address, got "${String(address)}"`,
    );
  }
}

/** Returns the Horizon URL for the given network. */
export function getHorizonUrl(network: 'testnet' | 'mainnet'): string {
  return network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org';
}

/**
 * Builds a testnet {@link NetworkConfig}.
 *
 * @throws {TypeError} when `contractId` is empty or blank.
 */
export function getTestnetConfig(contractId: string): NetworkConfig {
  if (typeof contractId !== 'string' || contractId.trim().length === 0) {
    throw new TypeError('getTestnetConfig: contractId is required');
  }
  return {
    contractId: contractId.trim(),
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: getHorizonUrl('testnet'),
    retries: 3,
    retryDelayMs: 1000,
  };
}

/**
 * Builds a mainnet {@link NetworkConfig}.
 *
 * @throws {TypeError} when `contractId` is empty or blank.
 */
export function getMainnetConfig(contractId: string): NetworkConfig {
  if (typeof contractId !== 'string' || contractId.trim().length === 0) {
    throw new TypeError('getMainnetConfig: contractId is required');
  }
  return {
    contractId: contractId.trim(),
    network: 'mainnet',
    rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: getHorizonUrl('mainnet'),
    retries: 3,
    retryDelayMs: 1000,
  };
}

/** Adds the number of ledger closes covering `seconds` to `currentLedger`. */
export function ledgersFromNow(seconds: number, currentLedger: number): number {
  return currentLedger + Math.ceil(seconds / LEDGER_CLOSE_SECONDS);
}

/** Converts a wall-clock date into a ledger sequence number. */
export function ledgersFromDate(date: Date, currentLedger = 0, now = new Date()): number {
  const seconds = Math.max(0, (date.getTime() - now.getTime()) / 1000);
  return currentLedger + Math.ceil(seconds / LEDGER_CLOSE_SECONDS);
}

/** Approximate wall-clock time at which `ledger` was/is reached. */
export function ledgerToApproxDate(ledger: number, currentLedger = 0, now = new Date()): Date {
  return new Date(now.getTime() + (ledger - currentLedger) * LEDGER_CLOSE_SECONDS * 1000);
}