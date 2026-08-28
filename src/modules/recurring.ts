/**
 * @module modules/recurring
 * Recurring / subscription payment operations exposed by the VeriTix contract.
 *
 * A recurring payment lets a payer pre-authorise periodic charges to a payee
 * at a fixed interval measured in Stellar ledger count.
 */

/**
 * @module RecurringModule
 *
 * Provides recurring payment subscription methods for the VeriTix platform.
 * Handles subscription creation, renewal, cancellation, and automated
 * recurring charge processing for season passes and memberships.
 */
import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, RecurringRecord, RecurringExecutionEntry, TransactionResult } from '../types/index';
import { addressToScVal, bigintToScVal } from '../utils/scval';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { parseRecurringExecutionEntry } from '../utils/parsers';
import { DUMMY_PUBLIC_KEY } from '../utils/network';

/**
 * Parameters required to set up a new recurring payment.
 */
export interface SetupRecurringParams {
  /** Stellar account address of the payee */
  payee: string;
  /** Amount charged per interval (in stroops) */
  amount: bigint;
  /** Charge interval in ledgers (e.g. 17 280 ≈ 1 day at 5 s/ledger) */
  interval: number;
}

/**
 * Handles all recurring-payment interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.recurring}.
 */
export class RecurringModule {
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
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Fetches the on-chain record for an existing recurring payment.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns The {@link RecurringRecord}, or `null` if it does not exist.
   *
   * @example
   * ```ts
   * const rec = await client.recurring.getRecurring(5n);
   * console.log('Active:', rec?.active);
   * ```
   *
   * @since 0.1.0
   */
  async getRecurring(_id: bigint): Promise<RecurringRecord | null> {
    // TODO: implement
    void this.config;
    void this.server;
    throw new Error('RecurringModule.getRecurring: not implemented');
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Sets up a new recurring payment authorisation on-chain.
   * The caller becomes the payer.
   *
   * @param params - {@link SetupRecurringParams}
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.recurring.setup({
   *   payee: 'GABC…',
   *   amount: 500_000n,     // 0.05 XLM per interval
   *   interval: 17_280,     // roughly daily
   * });
   * ```
   *
   * @since 0.1.0
   */
  async setup(_params: SetupRecurringParams): Promise<TransactionResult> {
    // TODO: implement
    void this.keypair;
    throw new Error('RecurringModule.setup: not implemented');
  }

  /**
   * Executes a due recurring charge, transferring `amount` to the payee.
   * Callable by anyone once the interval has elapsed.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `RECURRING_INTERVAL_NOT_ELAPSED` if too soon.
   *
   * @since 0.1.0
   */
  async execute(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('RecurringModule.execute: not implemented');
  }

  /**
   * Cancels an active recurring payment. Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   *
   * @since 0.1.0
   */
  async cancel(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('RecurringModule.cancel: not implemented');
  }

  /**
   * Pauses an active recurring payment. Must be called by the payer.
   * The payment will not execute until resumed.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is provided.
   * @throws {Error} If the recurring payment is not active.
   *
   * @example
   * ```ts
   * await client.recurring.pauseRecurring(1n);
   * ```
   *
   * @since 0.1.0
   * Added as a bug fix - was missing in the initial scaffold.
   */
  async pauseRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.pauseRecurring: signing keypair required');
    }

    const record = await this.getRecurring(id);
    if (record && !record.active) {
      throw new Error('RecurringModule.pauseRecurring: recurring payment is not active');
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'pause_recurring',
      [bigintToScVal(id, 'u64')],
      this.config.networkPassphrase,
    );
    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }
    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    return submitTransaction(this.server, assembled, this.keypair);
  }

  /**
   * Resumes a paused recurring payment. Must be called by the payer.
   * The payment will resume executing according to its interval.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is provided.
   * @throws {Error} If the recurring payment is not paused.
   *
   * @example
   * ```ts
   * await client.recurring.resumeRecurring(1n);
   * ```
   *
   * @since 0.1.0
   * Added as a bug fix - was missing in the initial scaffold.
   */
  async resumeRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.resumeRecurring: signing keypair required');
    }

    const record = await this.getRecurring(id);
    if (record && record.active) {
      throw new Error('RecurringModule.resumeRecurring: recurring payment is not paused');
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'resume_recurring',
      [bigintToScVal(id, 'u64')],
      this.config.networkPassphrase,
    );
    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }
    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    return submitTransaction(this.server, assembled, this.keypair);
  }

  /**
   * Amends an existing recurring payment's amount and/or interval.
   * Must be called by the payer. At least one of `amount` or `interval` must be provided.
   *
   * @param id       - Numeric recurring-payment identifier.
   * @param params   - Object with optional `amount` and/or `interval` fields to update.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If neither `amount` nor `interval` is provided.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not the payer.
   *
   * @example
   * ```ts
   * await client.recurring.amendRecurring(1n, { amount: 750_000n });
   * ```
   *
   * @since 0.1.0
   */
  async amendRecurring(
    id: bigint,
    params: { amount?: bigint; interval?: number },
  ): Promise<TransactionResult> {
    if (params.amount === undefined && params.interval === undefined) {
      throw new Error('RecurringModule.amendRecurring: at least one of amount or interval must be provided');
    }
    if (!this.keypair) {
      throw new Error('RecurringModule.amendRecurring: signing keypair required');
    }

    const args = [bigintToScVal(id, 'u64')];
    if (params.amount !== undefined) {
      args.push(bigintToScVal(params.amount, 'i128'));
    }
    if (params.interval !== undefined) {
      args.push(bigintToScVal(BigInt(params.interval), 'u64'));
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'amend_recurring',
      args,
      this.config.networkPassphrase,
    );
    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }
    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    return submitTransaction(this.server, assembled, this.keypair);
  }

  /**
   * Transfers the payer role of a recurring payment to a new payer.
   * Requires authorisation from both the current payer and the new payer.
   *
   * @param id       - Numeric recurring-payment identifier.
   * @param newPayer - Stellar account address of the incoming payer.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If `newPayer` is the same as the current payer's address.
   * @throws {Error} If the recurring payment is inactive.
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * await client.recurring.transferPayer(1n, 'GNEW…');
   * ```
   *
   * @since 0.1.0
   */
  async transferPayer(id: bigint, newPayer: string): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.transferPayer: signing keypair required');
    }
    if (newPayer === this.keypair.publicKey()) {
      throw new Error('RecurringModule.transferPayer: new payer must differ from the current payer');
    }

    const record = await this.getRecurring(id);
    if (record && !record.active) {
      throw new Error('RecurringModule.transferPayer: recurring payment is inactive');
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'transfer_payer',
      [bigintToScVal(id, 'u64'), addressToScVal(newPayer)],
      this.config.networkPassphrase,
    );
    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }
    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    return submitTransaction(this.server, assembled, this.keypair);
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  /**
   * Fetches the execution history for a recurring payment.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns Array of {@link RecurringExecutionEntry} records, ordered by most recent first.
   *
   * @example
   * ```ts
   * const history = await client.recurring.getRecurringHistory(1n);
   * for (const entry of history) {
   *   console.log(`Ledger ${entry.executedAtLedger}: ${entry.amount} stroops`);
   * }
   * ```
   *
   * @since 0.1.0
   */
  async getRecurringHistory(id: bigint): Promise<RecurringExecutionEntry[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_recurring_history',
      [bigintToScVal(id, 'u64')],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result ? raw.result.retval : undefined;

    if (!returnValue || returnValue.switch() === xdr.ScValType.scvVoid()) {
      return [];
    }

    if (returnValue.switch() !== xdr.ScValType.scvVec()) {
      throw new Error('RecurringModule.getRecurringHistory: expected ScvVec result');
    }

    return (returnValue.vec() ?? []).map((item) => parseRecurringExecutionEntry(item));
  }

  // -------------------------------------------------------------------------
  // Helpers (private)
  // -------------------------------------------------------------------------

  /** Returns all recurring payment IDs for a payer. @internal */
  private async getRecurringByPayer(_payer: string): Promise<bigint[]> {
    // TODO: implement contract call
    void this.config;
    void this.server;
    return [];
  }

  /** Returns true if the recurring payment is active and due. @internal */
  private async isExecutable(id: bigint): Promise<boolean> {
    const record = await this.getRecurring(id);
    if (!record || !record.active) return false;
    return true;
  }

  /**
   * Executes all due recurring payments for the given payer.
   * Skips inactive / not-yet-due payments; collects failures without throwing.
   *
   * @param payer - Stellar account address of the payer.
   * @returns Summary with executed, skipped, and failed payment IDs.
   *
   * @example
   * ```ts
   * const { executed, skipped, failed } = await client.recurring.executeAllDue(keypair.publicKey());
   * console.log(`Executed ${executed.length} payments, ${failed.length} failed`);
   * ```
   *
   * @since 0.1.0
   */
  async executeAllDue(payer: string): Promise<{ executed: bigint[]; skipped: bigint[]; failed: bigint[] }> {
    const ids = await this.getRecurringByPayer(payer);
    const executed: bigint[] = [];
    const skipped: bigint[] = [];
    const failed: bigint[] = [];

    for (const id of ids) {
      const due = await this.isExecutable(id);
      if (!due) {
        skipped.push(id);
        continue;
      }
      try {
        await this.execute(id);
        executed.push(id);
      } catch (err) {
        if (
          err instanceof VeriTixError &&
          err.code === VeriTixErrorCode.RecurringIntervalNotElapsed
        ) {
          skipped.push(id);
        } else {
          failed.push(id);
        }
      }
    }

    return { executed, skipped, failed };
  }
}