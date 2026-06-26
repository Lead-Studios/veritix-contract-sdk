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
import { addressToScVal, bigintToScVal, scValToString, scValToBoolean } from '../utils/scval';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';

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
  // Private helpers
  // -------------------------------------------------------------------------

  private async simulateRead(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const sourceAccount = new Account(Keypair.random().publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );

    const simResult = await this.server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw parseSorobanError(simResult.error);
    }

    const retval = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return retval !== undefined ? scValToBoolean(retval) : undefined;
  }

  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }

    const sourceAccount = await this.server.getAccount(this.keypair.publicKey());
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

  /**
   * Transfers the contract admin role to a new address.
   * Must be called by the current admin.
   *
   * @param newAdmin - Stellar account address of the incoming admin.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   *
   * @example
   * ```ts
   * await client.admin.setAdmin('GNEW…');
   * ```
   */
  async setAdmin(newAdmin: string): Promise<TransactionResult> {
    return this.writeCall('set_admin', [addressToScVal(newAdmin)]);
  }

  /**
   * Returns the current contract admin address.
   *
   * @returns The Stellar account address of the contract admin.
   *
   * @example
   * ```ts
   * const admin = await client.admin.getAdmin();
   * console.log('Admin:', admin);
   * ```
   */
  async getAdmin(): Promise<string> {
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_admin',
      [],
      this.config.networkPassphrase,
    );

    const simResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw parseSorobanError(simResult.error);
    }

    const retval = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!retval) {
      throw new Error('AdminModule.getAdmin: no return value from contract');
    }

    return scValToString(retval);
  }

  // -------------------------------------------------------------------------
  // Account freeze / unfreeze
  // -------------------------------------------------------------------------

  /**
   * Freezes a Stellar account, preventing it from sending or receiving tokens
   * via this contract.
   *
   * @param address - Stellar account address to freeze.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   */
  async freeze(address: string): Promise<TransactionResult> {
    return this.writeCall('freeze', [addressToScVal(address)]);
  }

  /**
   * Unfreezes a previously frozen Stellar account.
   *
   * @param address - Stellar account address to unfreeze.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   */
  async unfreeze(address: string): Promise<TransactionResult> {
    return this.writeCall('unfreeze', [addressToScVal(address)]);
  }

  /**
   * Checks whether multiple accounts are frozen.
   *
   * @param addresses - Array of Stellar account addresses (max 100).
   * @returns Array of booleans indicating frozen status, in input order.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 100 addresses are supplied.
   *
   * @example
   * ```ts
   * const statuses = await client.admin.isFrozenBatch(['GABC…', 'GXYZ…']);
   * console.log('Frozen:', statuses);
   * ```
   */
  async isFrozenBatch(addresses: string[]): Promise<boolean[]> {
    if (addresses.length > 100) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `isFrozenBatch: max 100 addresses allowed, got ${addresses.length}`,
      );
    }
    return Promise.all(addresses.map((addr) => this.isFrozen(addr)));
  }

  /**
   * Checks whether a specific account is frozen.
   *
   * @param address - Stellar account address to check.
   * @returns `true` if the account is frozen, `false` otherwise.
   */
  async isFrozen(address: string): Promise<boolean> {
    const result = await this.simulateRead('is_frozen', [
      addressToScVal(address),
    ]);
    return result === true;
  }

  // -------------------------------------------------------------------------
  // Mint
  // -------------------------------------------------------------------------

  /**
   * Mints new tokens to a recipient. Caller must be the contract admin.
   *
   * @param to     - Recipient Stellar account address.
   * @param amount - Amount to mint (in stroops).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   *
   * @example
   * ```ts
   * await client.admin.mint('GABC…', 1_000_000n);
   * ```
   */
  async mint(to: string, amount: bigint): Promise<TransactionResult> {
    return this.writeCall('mint', [
      addressToScVal(to),
      bigintToScVal(amount, 'i128'),
    ]);
  }

  // -------------------------------------------------------------------------
  // Clawback
  // -------------------------------------------------------------------------

  /**
   * Claws back (burns) tokens from an account — typically a frozen one.
   * Required by some regulatory / compliance use cases.
   *
   * @param from   - Stellar account address to claw back from.
   * @param amount - Amount to claw back (in stroops).
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   */
  async clawback(from: string, amount: bigint): Promise<TransactionResult> {
    if (amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'clawback: amount must be greater than 0',
      );
    }
    return this.writeCall('clawback', [
      addressToScVal(from),
      bigintToScVal(amount, 'i128'),
    ]);
  }

  // -------------------------------------------------------------------------
  // Contract pause
  // -------------------------------------------------------------------------

  /**
   * Pauses the entire contract, blocking all non-admin transactions.
   * Use in emergencies (e.g. discovered vulnerability).
   *
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   */
  async pause(): Promise<TransactionResult> {
    return this.writeCall('pause', []);
  }

  /**
   * Unpauses the contract, restoring normal operation.
   *
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not admin.
   */
  async unpause(): Promise<TransactionResult> {
    return this.writeCall('unpause', []);
  }

  /**
   * Checks whether the contract is currently paused.
   *
   * @returns `true` if the contract is paused, `false` otherwise.
   */
  async isPaused(): Promise<boolean> {
    const result = await this.simulateRead('is_paused', []);
    return result === true;
  }

  /**
   * Alias for {@link isPaused}. Checks whether the contract is paused.
   *
   * @returns `true` if the contract is paused, `false` otherwise.
   */
  async isContractPaused(): Promise<boolean> {
    return this.isPaused();
  }
}
