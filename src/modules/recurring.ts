/**
 * @module modules/recurring
 * Recurring / subscription payment operations exposed by the VeriTix contract.
 *
 * A recurring payment lets a payer pre-authorise periodic charges to a payee
 * at a fixed interval measured in Stellar ledger count.
 */

import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, RecurringRecord, RecurringExecutionEntry, TransactionResult } from '../types/index';
import { bigintToScVal } from '../utils/scval';
import { buildContractCall } from '../utils/transaction';
import { parseSorobanError } from '../utils/errors';
import { parseRecurringExecutionEntry } from '../utils/parsers';

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
   */
  async cancel(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('RecurringModule.cancel: not implemented');
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
   */
  async getRecurringHistory(id: bigint): Promise<RecurringExecutionEntry[]> {
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

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
      } catch {
        failed.push(id);
      }
    }

    return { executed, skipped, failed };
  }
}
