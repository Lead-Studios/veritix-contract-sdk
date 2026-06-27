/**
 * @module modules/batch
 * Batch operations exposed by the VeriTix Soroban contract.
 *
 * Batch methods combine multiple token operations into a single Soroban
 * invocation to reduce transaction overhead and fees.
 */

import { SorobanRpc, Keypair, Account, xdr, nativeToScVal } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import { addressToScVal } from '../utils/scval';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';

const MINT_BATCH_MAX = 50;

/**
 * A single mint instruction within a batch.
 */
export interface BatchMintEntry {
  /** Recipient Stellar account address */
  to: string;
  /** Amount to mint (in stroops) */
  amount: bigint;
}

/**
 * A single transfer instruction within a batch.
 */
export interface BatchTransferEntry {
  /** Sender Stellar account address */
  from: string;
  /** Recipient Stellar account address */
  to: string;
  /** Amount to transfer (in stroops) */
  amount: bigint;
}

/**
 * Handles all batch-operation interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.batch}.
 */
export class BatchModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

  /** @internal */
  constructor(config: NetworkConfig, server: SorobanRpc.Server, keypair?: Keypair) {
    this.config = config;
    this.server = server;
    this.keypair = keypair;
  }

  // -------------------------------------------------------------------------
  // Batch operations
  // -------------------------------------------------------------------------

  /**
   * Mints tokens to multiple recipients in a single contract invocation.
   * Caller must be the contract admin.
   *
   * @param entries - Array of {@link BatchMintEntry} instructions (max 50).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 entries are provided.
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if any amount is <= 0n.
   * @throws {Error} If duplicate recipient addresses are detected.
   *
   * @example
   * ```ts
   * await client.batch.mintBatch([
   *   { to: 'GABC...', amount: 1_000_000n },
   *   { to: 'GXYZ...', amount: 2_000_000n },
   * ]);
   * ```
   */
  async mintBatch(entries: BatchMintEntry[]): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.AdminUnauthorized,
        'BatchModule.mintBatch: admin Keypair required',
      );
    }

    if (entries.length === 0) {
      throw new Error('BatchModule.mintBatch: entries array must not be empty');
    }

    if (entries.length > MINT_BATCH_MAX) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `BatchModule.mintBatch: max ${MINT_BATCH_MAX} recipients per batch, got ${entries.length}`,
      );
    }

    for (const entry of entries) {
      if (entry.amount <= 0n) {
        throw new VeriTixError(
          VeriTixErrorCode.InvalidAmount,
          `BatchModule.mintBatch: all amounts must be > 0, got ${entry.amount} for ${entry.to}`,
        );
      }
    }

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.to)) {
        throw new Error(
          `BatchModule.mintBatch: duplicate recipient address detected: ${entry.to}`,
        );
      }
      seen.add(entry.to);
    }

    const admin = this.keypair.publicKey();
    const sourceAccount = new Account(admin, '0');

    const recipients = xdr.ScVal.scvVec(
      entries.map((e) =>
        xdr.ScVal.scvVec([
          addressToScVal(e.to),
          nativeToScVal(e.amount, { type: 'i128' }),
        ]),
      ),
    );

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'mint_batch',
      [addressToScVal(admin), recipients],
      this.config.networkPassphrase,
    );

    const { transaction } = await simulateTransaction(this.server, tx);
    const result = await submitTransaction(this.server, transaction, this.keypair);

    return result;
  }

  /**
   * Executes multiple token transfers in a single contract invocation.
   * Each transfer is independently authorised; if any fails the entire
   * batch reverts.
   *
   * @param entries - Array of {@link BatchTransferEntry} instructions.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.batch.transferBatch([
   *   { from: 'GABC...', to: 'G111...', amount: 500_000n },
   *   { from: 'GABC...', to: 'G222...', amount: 500_000n },
   * ]);
   * ```
   */
  async transferBatch(_entries: BatchTransferEntry[]): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('BatchModule.transferBatch: not implemented');
  }

  /**
   * Freezes multiple accounts in a single contract invocation.
   * Caller must be the contract admin.
   *
   * @param addresses - Array of Stellar account addresses to freeze.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   *
   * @example
   * ```ts
   * await client.batch.freezeBatch(['GABC…', 'GXYZ…', 'GDEF…']);
   * ```
   */
  async freezeBatch(_addresses: string[]): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('BatchModule.freezeBatch: not implemented');
  }
}
