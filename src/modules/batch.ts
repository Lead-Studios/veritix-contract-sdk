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
import { addressToScVal, stringToScVal } from '../utils/scval';

const BATCH_MAX = 50;

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
 * A single recipient in a {@link BatchModule.transferBatch} call.
 */
export interface BatchTransferRecipient {
  /** Recipient Stellar account address */
  address: string;
  /** Amount to transfer (in stroops) */
  amount: bigint;
}

/**
 * A single recipient in a {@link BatchModule.transferBatchWithMemo} call.
 */
export interface BatchTransferWithMemoRecipient {
  /** Recipient Stellar account address */
  address: string;
  /** Amount to transfer (in stroops) */
  amount: bigint;
  /** Memo string attached to this transfer (max 64 bytes) */
  memo: string;
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
        'A Keypair is required for this operation.',
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
   */
  async mintBatch(_entries: BatchMintEntry[]): Promise<TransactionResult> {
    void this.config;
    void this.server;
    void this.keypair;
    throw new Error('BatchModule.mintBatch: not implemented');
  }

  /**
   * Distributes tokens to multiple recipients in a single contract invocation.
   * Max 50 recipients. Calls the `"transfer_batch"` contract function.
   *
   * @param recipients - Array of {@link BatchTransferRecipient} with address and amount.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no Keypair provided.
   * @throws Error if more than 50 recipients are provided.
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if any amount is <= 0n.
   *
   * @example
   * ```ts
   * await client.batch.transferBatch([
   *   { address: 'GABC...', amount: 500_000n },
   *   { address: 'GXYZ...', amount: 750_000n },
   * ]);
   * ```
   */
  async transferBatch(recipients: BatchTransferRecipient[]): Promise<TransactionResult> {
    if (recipients.length === 0) throw new Error('BatchModule.transferBatch: recipients array must not be empty');
    if (recipients.length > BATCH_MAX) {
      throw new VeriTixError(VeriTixErrorCode.BatchTooLarge, `transferBatch supports at most ${BATCH_MAX} recipients.`);
    }
    for (const r of recipients) {
      if (r.amount <= 0n) {
        throw new VeriTixError(VeriTixErrorCode.InvalidAmount, 'Each transfer amount must be greater than zero.');
      }
    }

    const entries = xdr.ScVal.scvVec(
      recipients.map((r) =>
        xdr.ScVal.scvVec([
          addressToScVal(r.address),
          nativeToScVal(r.amount, { type: 'i128' }),
        ]),
      ),
    );
    return this.writeCall('transfer_batch', [entries]);
  }

  /**
   * Distributes tokens to multiple recipients with an individual memo per transfer.
   * Max 50 recipients. Each memo must be at most 64 bytes. Calls `"transfer_batch_with_memo"`.
   *
   * @param recipients - Array of {@link BatchTransferWithMemoRecipient} entries.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no Keypair provided.
   * @throws Error if more than 50 recipients or any memo exceeds 64 bytes.
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if any amount is <= 0n.
   *
   * @example
   * ```ts
   * await client.batch.transferBatchWithMemo([
   *   { address: 'GABC...', amount: 1_000_000n, memo: 'ticket-ref-001' },
   *   { address: 'GXYZ...', amount: 2_000_000n, memo: 'ticket-ref-002' },
   * ]);
   * ```
   */
  async transferBatchWithMemo(recipients: BatchTransferWithMemoRecipient[]): Promise<TransactionResult> {
    if (recipients.length === 0) throw new Error('BatchModule.transferBatchWithMemo: recipients array must not be empty');
    if (recipients.length > BATCH_MAX) {
      throw new VeriTixError(VeriTixErrorCode.BatchTooLarge, `transferBatchWithMemo supports at most ${BATCH_MAX} recipients.`);
    }
    for (const r of recipients) {
      if (r.amount <= 0n) {
        throw new VeriTixError(VeriTixErrorCode.InvalidAmount, 'Each transfer amount must be greater than zero.');
      }
      const memoBytes = Buffer.byteLength(r.memo, 'utf8');
      if (memoBytes > 64) {
        throw new Error(`BatchModule.transferBatchWithMemo: memo exceeds 64 bytes for recipient ${r.address} (${memoBytes} bytes).`);
      }
    }

    const entries = xdr.ScVal.scvVec(
      recipients.map((r) =>
        xdr.ScVal.scvVec([
          addressToScVal(r.address),
          nativeToScVal(r.amount, { type: 'i128' }),
          stringToScVal(r.memo),
        ]),
      ),
    );
    return this.writeCall('transfer_batch_with_memo', [entries]);
  }

  /**
   * Freezes multiple accounts in a single contract invocation.
   */
  async freezeBatch(_addresses: string[]): Promise<TransactionResult> {
    throw new Error('BatchModule.freezeBatch: not implemented');
  }
}