/**
 * @module modules/admin
 * Administrator operations exposed by the VeriTix Soroban contract.
 *
 * All methods in this module require the caller's {@link Keypair} to match the
 * contract's stored admin address.  Attempting them without admin rights throws
 * {@link VeriTixErrorCode.AdminUnauthorized}.
 */

import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { addressToScVal, scValToString } from '../utils/scval';

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

  private async simulateRead(method: string, args: xdr.ScVal[]): Promise<unknown> {
    if (!this.keypair) {
      throw new VeriTixError(VeriTixErrorCode.ReadOnlyClient, 'Keypair required for read simulation.');
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
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const result: any = await this.server.simulateTransaction(tx);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (SorobanRpc.Api.isSimulationError(result)) throw parseSorobanError(result.error);
    return result?.result?.retval ?? null;
  }

  // -------------------------------------------------------------------------
  // Admin management
  // -------------------------------------------------------------------------

  /**
   * Transfers the contract admin role to a new address.
   * Must be called by the current admin.
   */
  async setAdmin(_newAdmin: string): Promise<TransactionResult> {
    void this.config;
    void this.server;
    void this.keypair;
    throw new Error('AdminModule.setAdmin: not implemented');
  }

  /**
   * Proposes a new admin via a safe two-step rotation.
   * The proposed admin must subsequently call {@link acceptAdmin} to complete
   * the transfer. The current admin retains control until acceptance.
   *
   * @param newAdmin - Stellar account address of the proposed incoming admin.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not current admin.
   *
   * @example
   * ```ts
   * await client.admin.proposeAdmin('GNEW...');
   * ```
   */
  async proposeAdmin(newAdmin: string): Promise<TransactionResult> {
    return this.writeCall('propose_admin', [addressToScVal(newAdmin)]);
  }

  /**
   * Accepts a previously proposed admin rotation.
   * Must be called by the address nominated in {@link proposeAdmin}.
   * After this call the caller becomes the new contract admin.
   *
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} If no admin rotation is pending or caller is not the proposed admin.
   *
   * @example
   * ```ts
   * // Called by the incoming admin keypair
   * await incomingAdminClient.admin.acceptAdmin();
   * ```
   */
  async acceptAdmin(): Promise<TransactionResult> {
    return this.writeCall('accept_admin', []);
  }

  /**
   * Returns the pending admin address if a rotation has been proposed.
   * Returns `null` when no rotation is outstanding.
   *
   * @returns The pending admin Stellar address, or `null` if none.
   *
   * @example
   * ```ts
   * const pending = await client.admin.getPendingAdmin();
   * if (pending) console.log('Pending admin:', pending);
   * ```
   */
  async getPendingAdmin(): Promise<string | null> {
    const raw = await this.simulateRead('get_pending_admin', []);
    if (!raw) return null;
    try {
      return scValToString(raw as xdr.ScVal);
    } catch {
      return null;
    }
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
}