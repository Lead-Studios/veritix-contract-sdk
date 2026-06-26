/**
 * @module modules/batch
 * Batch operations exposed by the VeriTix Soroban contract.
 *
 * Batch methods combine multiple token operations into a single Soroban
 * invocation to reduce transaction overhead and fees.
 */

import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { addressToScVal } from '../utils/scval';

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

  async mintBatch(_entries: BatchMintEntry[]): Promise<TransactionResult> {
    void this.config;
    void this.server;
    void this.keypair;
    throw new Error('BatchModule.mintBatch: not implemented');
  }

  async transferBatch(_entries: BatchTransferEntry[]): Promise<TransactionResult> {
    throw new Error('BatchModule.transferBatch: not implemented');
  }

  /**
   * Freezes multiple Stellar accounts in a single contract invocation.
   * Prevents frozen accounts from sending or receiving tokens via this contract.
   * Caller must be the contract admin.
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
   * Restores the ability to send and receive tokens for the specified accounts.
   * Caller must be the contract admin.
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
}