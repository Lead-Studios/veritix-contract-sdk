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
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { addressToScVal, stringToScVal } from '../utils/scval';

const BATCH_MAX = 50;
const MINT_BATCH_MAX = 50;

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
 * A single recipient in a {@link BatchModule.transferBatch} call.
 */
export interface BatchTransferRecipient {
  address: string;
  amount: bigint;
}

/**
 * A single recipient in a {@link BatchModule.transferBatchWithMemo} call.
 */
export interface BatchTransferWithMemoRecipient {
  address: string;
  amount: bigint;
  memo: string;
}

export class BatchModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

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

    try {
      return await submitTransaction(this.server, transaction, this.keypair);
    } catch (err) {
      throw parseSorobanError(err);
    }
  }

  // -------------------------------------------------------------------------
  // Batch operations
  // -------------------------------------------------------------------------

  /**
   * Mints tokens to multiple recipients in a single contract invocation.
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

    try {
      return await submitTransaction(this.server, transaction, this.keypair);
    } catch (err) {
      throw parseSorobanError(err);
    }
  }

  /**
   * Distributes tokens to multiple recipients.
   */
  async transferBatch(recipients: BatchTransferRecipient[]): Promise<TransactionResult> {
    if (recipients.length === 0) {
      throw new Error('BatchModule.transferBatch: recipients array must not be empty');
    }

    if (recipients.length > BATCH_MAX) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `transferBatch supports at most ${BATCH_MAX} recipients.`,
      );
    }

    for (const r of recipients) {
      if (r.amount <= 0n) {
        throw new VeriTixError(
          VeriTixErrorCode.InvalidAmount,
          'Each transfer amount must be greater than zero.',
        );
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
   * Distributes tokens with individual memos.
   */
  async transferBatchWithMemo(
    recipients: BatchTransferWithMemoRecipient[],
  ): Promise<TransactionResult> {
    if (recipients.length === 0) {
      throw new Error('BatchModule.transferBatchWithMemo: recipients array must not be empty');
    }

    if (recipients.length > BATCH_MAX) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `transferBatchWithMemo supports at most ${BATCH_MAX} recipients.`,
      );
    }

    for (const r of recipients) {
      if (r.amount <= 0n) {
        throw new VeriTixError(
          VeriTixErrorCode.InvalidAmount,
          'Each transfer amount must be greater than zero.',
        );
      }

      const memoBytes = Buffer.byteLength(r.memo, 'utf8');
      if (memoBytes > 64) {
        throw new Error(
          `BatchModule.transferBatchWithMemo: memo exceeds 64 bytes for ${r.address} (${memoBytes} bytes).`,
        );
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