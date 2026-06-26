/**
 * @module modules/admin
 * Administrator operations exposed by the VeriTix Soroban contract.
 *
 * All methods in this module require the caller's {@link Keypair} to match the
 * contract's stored admin address.  Attempting them without admin rights throws
 * {@link VeriTixErrorCode.AdminUnauthorized}.
 */

import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult, BatchSettlementResult } from '../types/index';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { bigintToScVal, stringToScVal } from '../utils/scval';

/**
 * Handles all admin-level interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.admin}.
 */
export class AdminModule {
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
  // Admin management
  // -------------------------------------------------------------------------

  async setAdmin(_newAdmin: string): Promise<TransactionResult> {
    void this.config;
    void this.server;
    void this.keypair;
    throw new Error('AdminModule.setAdmin: not implemented');
  }

  // -------------------------------------------------------------------------
  // Account freeze / unfreeze
  // -------------------------------------------------------------------------

  async freeze(_address: string): Promise<TransactionResult> {
    throw new Error('AdminModule.freeze: not implemented');
  }

  async unfreeze(_address: string): Promise<TransactionResult> {
    throw new Error('AdminModule.unfreeze: not implemented');
  }

  // -------------------------------------------------------------------------
  // Clawback
  // -------------------------------------------------------------------------

  async clawback(_from: string, _amount: bigint): Promise<TransactionResult> {
    throw new Error('AdminModule.clawback: not implemented');
  }

  // -------------------------------------------------------------------------
  // Contract pause
  // -------------------------------------------------------------------------

  async pause(): Promise<TransactionResult> {
    throw new Error('AdminModule.pause: not implemented');
  }

  async unpause(): Promise<TransactionResult> {
    throw new Error('AdminModule.unpause: not implemented');
  }

  // -------------------------------------------------------------------------
  // Emergency operations
  // -------------------------------------------------------------------------

  /**
   * Cancels an event by force-refunding all specified escrow IDs in chunks.
   * Guards that the caller holds the admin Keypair.
   *
   * Escrow IDs are processed in batches of 50. Each batch is submitted as a
   * separate `"cancel_event"` transaction. Partial failures are collected and
   * returned without aborting remaining batches.
   *
   * @param escrowIds - Array of escrow IDs to cancel and refund.
   * @returns A {@link BatchSettlementResult} with settled/failed counts and hashes.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if no admin Keypair provided.
   * @throws Error if the escrowIds array is empty.
   *
   * @example
   * ```ts
   * const result = await client.admin.cancelEvent([1n, 2n, 3n]);
   * console.log(`Cancelled ${result.settled}, failed: ${result.failed.length}`);
   * ```
   */
  async cancelEvent(escrowIds: bigint[]): Promise<BatchSettlementResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.AdminUnauthorized,
        'Admin Keypair is required to cancel an event.',
      );
    }
    if (escrowIds.length === 0) throw new Error('AdminModule.cancelEvent: escrowIds array must not be empty');

    const CHUNK = 50;
    const result: BatchSettlementResult = { settled: 0, failed: [], txHashes: [] };

    for (let i = 0; i < escrowIds.length; i += CHUNK) {
      const chunk = escrowIds.slice(i, i + CHUNK);
      const idsScVal = xdr.ScVal.scvVec(chunk.map((id) => bigintToScVal(id, 'u64')));
      try {
        const txResult = await this.writeCall('cancel_event', [idsScVal]);
        result.settled += chunk.length;
        result.txHashes.push(txResult.hash);
      } catch {
        result.failed.push(...chunk);
      }
    }

    return result;
  }

  /**
   * Forces a manual refund for a single escrow — for use when automated
   * settlement cannot proceed (e.g. organizer dispute, technical failure).
   *
   * @param escrowId - The escrow ID to force-refund.
   * @param reason   - Human-readable reason string (encoded as on-chain bytes).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   *
   * @example
   * ```ts
   * await client.admin.manualRefund(42n, 'Organizer failed to deliver');
   * ```
   */
  async manualRefund(escrowId: bigint, reason: string): Promise<TransactionResult> {
    return this.writeCall('force_refund_escrow', [
      bigintToScVal(escrowId, 'u64'),
      stringToScVal(reason),
    ]);
  }
}