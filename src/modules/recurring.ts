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
import { addressToScVal, bigintToScVal, scValToBigint } from '../utils/scval';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { parseRecurringExecutionEntry, parseRecurringRecord } from '../utils/parsers';
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
   * if (rec) {
   *   console.log(`Active: ${rec.active}, Payer: ${rec.payer}, Payee: ${rec.payee}`);
   * }
   * ```
   */
  async getRecurring(id: bigint): Promise<RecurringRecord | null> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_recurring',
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
      return null;
    }

    return parseRecurringRecord(returnValue);
  }

  /**
   * Returns all recurring payment IDs for a given payer address.
   *
   * @param payer - Stellar account address of the payer.
   * @returns Array of numeric recurring payment IDs.
   *
   * @example
   * ```ts
   * const ids = await client.recurring.getRecurringByPayer('GPAYER…');
   * console.log('Payer recurring IDs:', ids);
   * ```
   */
  async getRecurringByPayer(payer: string): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'recurring_by_payer',
      [addressToScVal(payer)],
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
      return [];
    }
    return (returnValue.vec() ?? []).map((item) => scValToBigint(item));
  }

  /**
   * Returns all recurring payment IDs for a given payee address.
   *
   * @param payee - Stellar account address of the payee.
   * @returns Array of numeric recurring payment IDs.
   *
   * @example
   * ```ts
   * const ids = await client.recurring.getRecurringByPayee('GPAYEE…');
   * console.log('Payee recurring IDs:', ids);
   * ```
   */
  async getRecurringByPayee(payee: string): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'recurring_by_payee',
      [addressToScVal(payee)],
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
      return [];
    }
    return (returnValue.vec() ?? []).map((item) => scValToBigint(item));
  }

  /**
   * Checks whether a recurring payment is currently active and eligible to be charged.
   *
   * @param id - Numeric recurring-payment identifier.
   * @param currentLedger - Optional ledger sequence number to evaluate against.
   * @returns `true` if active and the interval has elapsed since the last charge, `false` otherwise.
   *
   * @example
   * ```ts
   * const executable = await client.recurring.isExecutable(1n);
   * if (executable) {
   *   await client.recurring.execute(1n);
   * }
   * ```
   */
  async isExecutable(id: bigint, currentLedger?: number): Promise<boolean> {
    const record = await this.getRecurring(id);
    if (!record || !record.active) return false;
    if (record.lastChargedLedger === 0) return true;
    const ledger = currentLedger ?? (await this.server.getLatestLedger()).sequence;
    return ledger >= record.lastChargedLedger + record.interval;
  }

  /**
   * Computes the execution schedule for a recurring payment.
   *
   * @param id - Numeric recurring-payment identifier.
   * @param currentLedger - Optional current ledger sequence. If not provided, fetches from the server.
   * @returns Object containing schedule details (`nextLedger`, `interval`, `lastChargedLedger`, `isDue`), or `null` if not found.
   *
   * @example
   * ```ts
   * const schedule = await client.recurring.getExecutionSchedule(1n);
   * if (schedule) {
   *   console.log(`Next execution due at ledger: ${schedule.nextLedger}, isDue: ${schedule.isDue}`);
   * }
   * ```
   */
  async getExecutionSchedule(
    id: bigint,
    currentLedger?: number,
  ): Promise<{
    nextLedger: number;
    interval: number;
    lastChargedLedger: number;
    isDue: boolean;
  } | null> {
    const record = await this.getRecurring(id);
    if (!record) return null;
    const ledger = currentLedger ?? (await this.server.getLatestLedger()).sequence;
    const nextLedger = record.lastChargedLedger === 0 ? ledger : record.lastChargedLedger + record.interval;
    const isDue = record.active && ledger >= nextLedger;
    return {
      nextLedger,
      interval: record.interval,
      lastChargedLedger: record.lastChargedLedger,
      isDue,
    };
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
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * const result = await client.recurring.setup({
   *   payee: 'GABC…',
   *   amount: 500_000n,     // 0.05 XLM per interval
   *   interval: 17_280,     // roughly daily (~5s per ledger)
   * });
   * console.log('Recurring payment setup in tx:', result.hash);
   * ```
   */
  async setup(params: SetupRecurringParams): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.setup: signing keypair required');
    }
    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'setup_recurring',
      [
        addressToScVal(params.payee),
        bigintToScVal(params.amount, 'i128'),
        bigintToScVal(BigInt(params.interval), 'u64'),
      ],
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
   * Executes a due recurring charge, transferring `amount` to the payee.
   * Callable by anyone once the interval has elapsed.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `RECURRING_INTERVAL_NOT_ELAPSED` if too soon.
   *
   * @example
   * ```ts
   * const result = await client.recurring.execute(1n);
   * console.log('Charge executed in tx:', result.hash);
   * ```
   */
  async execute(id: bigint): Promise<TransactionResult> {
    const caller = this.keypair ? this.keypair.publicKey() : DUMMY_PUBLIC_KEY;
    const sourceAccount = new Account(caller, '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'execute_recurring',
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
   * Cancels an active recurring payment. Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * const result = await client.recurring.cancel(1n);
   * console.log('Cancelled recurring payment in tx:', result.hash);
   * ```
   */
  async cancel(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.cancel: signing keypair required');
    }
    const sourceAccount = new Account(this.keypair.publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'cancel_recurring',
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
   * Cancels multiple active recurring payments in batch.
   *
   * @param ids - Array of recurring payment identifiers to cancel.
   * @returns Array of {@link TransactionResult} for each cancelled payment.
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * const results = await client.recurring.cancelBatch([1n, 2n, 3n]);
   * console.log(`Cancelled ${results.length} recurring payments`);
   * ```
   */
  async cancelBatch(ids: bigint[]): Promise<TransactionResult[]> {
    if (!this.keypair) {
      throw new Error('RecurringModule.cancelBatch: signing keypair required');
    }
    const results: TransactionResult[] = [];
    for (const id of ids) {
      const res = await this.cancel(id);
      results.push(res);
    }
    return results;
  }

  /**
   * Pauses an active recurring payment. Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * const result = await client.recurring.pauseRecurring(1n);
   * console.log('Paused recurring payment in tx:', result.hash);
   * ```
   */
  async pauseRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.pauseRecurring: signing keypair required');
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
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is provided.
   *
   * @example
   * ```ts
   * const result = await client.recurring.resumeRecurring(1n);
   * console.log('Resumed recurring payment in tx:', result.hash);
   * ```
   */
  async resumeRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.resumeRecurring: signing keypair required');
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
   * Pauses an active recurring payment so future charges are skipped.
   * Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `READ_ONLY_CLIENT` if no keypair is present.
   *
   * @example
   * ```ts
   * await client.recurring.pauseRecurring(1n);
   * ```
   */
  async pauseRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'RecurringModule.pauseRecurring: signing keypair required',
      );
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
   * Resumes a previously paused recurring payment so charges resume.
   * Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `READ_ONLY_CLIENT` if no keypair is present.
   *
   * @example
   * ```ts
   * await client.recurring.resumeRecurring(1n);
   * ```
   */
  async resumeRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'RecurringModule.resumeRecurring: signing keypair required',
      );
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
   * const result = await client.recurring.amendRecurring(1n, {
   *   amount: 750_000n,
   *   interval: 34_560,
   * });
   * console.log('Amended recurring payment in tx:', result.hash);
   * ```
   */
  async amendRecurring(
    id: bigint,
    params: { amount?: bigint; interval?: number },
  ): Promise<TransactionResult> {
    if (params.amount === undefined && params.interval === undefined) {
      throw new Error('RecurringModule.amendRecurring: at least one of amount or interval must be provided');
    }
    if (!this.keypair) {
      throw new VeriTixError(VeriTixErrorCode.ReadOnlyClient, 'RecurringModule.amendRecurring: signing keypair required');
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
   * const result = await client.recurring.transferPayer(1n, 'GNEWPAYER…');
   * console.log('Payer role transferred in tx:', result.hash);
   * ```
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

  /**
   * Pauses an active recurring payment. Must be called by the payer.
   * A paused payment will not be executed until it is resumed.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is available.
   *
   * @example
   * ```ts
   * await client.recurring.pauseRecurring(1n);
   * ```
   */
  async pauseRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.pauseRecurring: signing keypair required');
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
   * Resumes a previously paused recurring payment. Must be called by the payer.
   *
   * @param id - Numeric recurring-payment identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no signing keypair is available.
   *
   * @example
   * ```ts
   * await client.recurring.resumeRecurring(1n);
   * ```
   */
  async resumeRecurring(id: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('RecurringModule.resumeRecurring: signing keypair required');
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
   *   console.log(`Ledger ${entry.executedAtLedger}: ${entry.amount} stroops, success: ${entry.success}`);
   * }
   * ```
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

  /**
   * Executes all due recurring payments for the given payer.
   * Skips inactive / not-yet-due payments; collects failures without throwing.
   *
   * @param payer - Stellar account address of the payer.
   * @returns Summary with executed, skipped, and failed payment IDs.
   *
   * @example
   * ```ts
   * const { executed, skipped, failed } = await client.recurring.executeAllDue('GPAYER…');
   * console.log(`Executed: ${executed.length}, Skipped: ${skipped.length}, Failed: ${failed.length}`);
   * ```
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