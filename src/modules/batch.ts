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
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

const MINT_BATCH_MAX = 50;
const FREEZE_BATCH_MAX = 50;

/**
 * A single mint instruction within a batch.
 */
export interface BatchMintEntry {
  to: string;
  amount: bigint;
}

/**
 * A single transfer instruction within a batch.
 */
export interface BatchTransferEntry {
  from: string;
  to: string;
  amount: bigint;
}

/**
 * A single clawback target in a {@link BatchModule.clawbackBatch} call.
 */
export interface BatchClawbackTarget {
  /** Stellar account address to claw back tokens from */
  address: string;
  /** Amount to claw back (in stroops) */
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
  // Internal helpers
  // -------------------------------------------------------------------------

  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.AdminUnauthorized,
        'A Keypair with admin rights is required for this operation.',
      );
    }
    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );
    const { transaction } = await simulateTransaction(this.server, tx);
    return submitTransaction(this.server, transaction, this.keypair);
  }

  // -------------------------------------------------------------------------
  // Batch operations
  // -------------------------------------------------------------------------

  /**
   * Mints tokens to multiple recipients in a single contract invocation.
   *
   * @param entries - Array of {@link BatchMintEntry} instructions (max 50).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 entries.
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if any amount is <= 0n.
   * @throws {Error} If duplicate recipient addresses are detected.
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
    return submitTransaction(this.server, transaction, this.keypair);
  }

  /**
   * Executes multiple token transfers in a single contract invocation.
   *
   * @param entries - Array of {@link BatchTransferEntry} instructions.
   * @returns A {@link TransactionResult} on success.
   */
  async transferBatch(_entries: BatchTransferEntry[]): Promise<TransactionResult> {
    throw new Error('BatchModule.transferBatch: not implemented');
  }

  /**
   * Freezes multiple Stellar accounts in a single contract invocation.
   *
   * @param addresses - Array of Stellar account addresses to freeze (max 50).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no admin Keypair provided.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 addresses.
   * @throws Error if the addresses array is empty.
   *
   * @example
   * ```ts
   * await client.batch.freezeBatch(['GABC...', 'GXYZ...']);
   * ```
   */
  async freezeBatch(addresses: string[]): Promise<TransactionResult> {
    if (addresses.length === 0) throw new Error('BatchModule.freezeBatch: addresses array must not be empty');
    if (addresses.length > FREEZE_BATCH_MAX) {
      throw new VeriTixError(VeriTixErrorCode.BatchTooLarge, `freezeBatch supports at most ${FREEZE_BATCH_MAX} addresses.`);
    }
    const addrsScVal = xdr.ScVal.scvVec(addresses.map((a) => addressToScVal(a)));
    return this.writeCall('freeze_batch', [addrsScVal]);
  }

  /**
   * Unfreezes multiple Stellar accounts in a single contract invocation.
   *
   * @param addresses - Array of Stellar account addresses to unfreeze (max 50).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no admin Keypair provided.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 addresses.
   * @throws Error if the addresses array is empty.
   *
   * @example
   * ```ts
   * await client.batch.unfreezeBatch(['GABC...', 'GXYZ...']);
   * ```
   */
  async unfreezeBatch(addresses: string[]): Promise<TransactionResult> {
    if (addresses.length === 0) throw new Error('BatchModule.unfreezeBatch: addresses array must not be empty');
    if (addresses.length > FREEZE_BATCH_MAX) {
      throw new VeriTixError(VeriTixErrorCode.BatchTooLarge, `unfreezeBatch supports at most ${FREEZE_BATCH_MAX} addresses.`);
    }
    const addrsScVal = xdr.ScVal.scvVec(addresses.map((a) => addressToScVal(a)));
    return this.writeCall('unfreeze_batch', [addrsScVal]);
  }

  async clawbackBatch(_targets: BatchClawbackTarget[]): Promise<TransactionResult> {
    throw new Error('BatchModule.clawbackBatch: not implemented');
  }
}
