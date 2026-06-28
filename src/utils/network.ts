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

/** Network passphrase for Stellar Testnet */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Network passphrase for Stellar Mainnet */
export const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Horizon base URL for Testnet */
const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/** Horizon base URL for Mainnet */
const MAINNET_HORIZON_URL = 'https://horizon.stellar.org';

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
