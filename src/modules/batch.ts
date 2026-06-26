/**
 * @module modules/batch
 * Batch operations exposed by the VeriTix Soroban contract.
 *
 * Batch methods combine multiple token operations into a single Soroban
 * invocation to reduce transaction overhead and fees.
 */

import { SorobanRpc, Keypair, Account, xdr, nativeToScVal } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { addressToScVal } from '../utils/scval';

const CLAWBACK_BATCH_MAX = 50;

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

  async mintBatch(_entries: BatchMintEntry[]): Promise<TransactionResult> {
    void this.config;
    void this.server;
    void this.keypair;
    throw new Error('BatchModule.mintBatch: not implemented');
  }

  async transferBatch(_entries: BatchTransferEntry[]): Promise<TransactionResult> {
    throw new Error('BatchModule.transferBatch: not implemented');
  }

  async freezeBatch(_addresses: string[]): Promise<TransactionResult> {
    throw new Error('BatchModule.freezeBatch: not implemented');
  }

  /**
   * Revokes (claws back) tokens from multiple accounts in a single contract
   * invocation. Typically used after a scalping incident or regulatory action.
   * Caller must be the contract admin.
   *
   * Validates that none of the target addresses is the contract ID itself,
   * preventing accidental clawback from the contract's own token pool.
   *
   * @param targets - Array of {@link BatchClawbackTarget} entries (max 50).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no admin Keypair.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 targets.
   * @throws Error if any target address equals the contract ID.
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if any amount is <= 0n.
   *
   * @example
   * ```ts
   * await client.batch.clawbackBatch([
   *   { address: 'GABC...', amount: 1_000_000n },
   *   { address: 'GXYZ...', amount: 500_000n },
   * ]);
   * ```
   */
  async clawbackBatch(targets: BatchClawbackTarget[]): Promise<TransactionResult> {
    if (targets.length === 0) throw new Error('BatchModule.clawbackBatch: targets array must not be empty');
    if (targets.length > CLAWBACK_BATCH_MAX) {
      throw new VeriTixError(VeriTixErrorCode.BatchTooLarge, `clawbackBatch supports at most ${CLAWBACK_BATCH_MAX} targets.`);
    }
    for (const t of targets) {
      if (t.amount <= 0n) {
        throw new VeriTixError(VeriTixErrorCode.InvalidAmount, 'Each clawback amount must be greater than zero.');
      }
      if (t.address === this.config.contractId) {
        throw new Error(`BatchModule.clawbackBatch: target address must not be the contract address (${this.config.contractId}).`);
      }
    }

    const entries = xdr.ScVal.scvVec(
      targets.map((t) =>
        xdr.ScVal.scvVec([
          addressToScVal(t.address),
          nativeToScVal(t.amount, { type: 'i128' }),
        ]),
      ),
    );
    return this.writeCall('clawback_batch', [entries]);
  }
}