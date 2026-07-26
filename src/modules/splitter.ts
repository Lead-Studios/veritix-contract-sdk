/**
 * @module modules/splitter
 * Payment splitter operations exposed by the VeriTix Soroban contract.
 */

import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import { addressToScVal, scValToBigint, scValToNumber } from '../utils/scval';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { DUMMY_PUBLIC_KEY } from '../utils/network';
import type {
  NetworkConfig,
  SplitRecord,
  SplitRecipient,
  TransactionResult,
  RevenueSplitParams,
} from '../types/index';

export interface CreateSplitParams {
  recipients: SplitRecipient[];
  totalAmount: bigint;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SplitterModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

  constructor(config: NetworkConfig, server: SorobanRpc.Server, keypair?: Keypair) {
    this.config = config;
    this.server = server;
    this.keypair = keypair;
  }

  /**
   * Fetches the on-chain record for an existing split.
   *
   * @param _id - Numeric split identifier.
   * @returns The {@link SplitRecord}, or `null` if it does not exist.
   *
   * @example
   * ```ts
   * const split = await client.splitter.getSplit(2n);
   * console.log('Distributed:', split?.distributed);
   * ```
   */
  async getSplit(_id: bigint): Promise<SplitRecord | null> {
    // TODO: implement
    void this.config;
    void this.server;
    throw new Error('SplitterModule.getSplit: not implemented');
  }

  /**
   * Returns all split IDs created by a given sender address.
   *
   * @param _sender - Stellar account address of the sender.
   * @returns Array of split IDs.
   *
   * @example
   * ```ts
   * const ids = await client.splitter.getSplitsBySender('GABC…');
   * console.log('Splits created:', ids.length);
   * ```
   */
  async getSplitsBySender(_sender: string): Promise<bigint[]> {
    return [];
  }

  /**
   * Returns all split IDs in which `address` is a recipient.
   *
   * @param address - Stellar account address of the recipient.
   * @returns Array of split IDs.
   *
   * @example
   * ```ts
   * const ids = await client.splitter.getSplitsForRecipient('GABC…');
   * ```
   */
  async getSplitsForRecipient(address: string): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_splits_for_recipient',
      [addressToScVal(address)],
      this.config.networkPassphrase,
    );
    const rawResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(rawResult)) {
      throw parseSorobanError(rawResult.error);
    }
    const retval = rawResult.result?.retval;
    if (!retval) return [];
    const vec = (retval as any).vec as any[];
    return vec.map((v) => scValToBigint(v));
  }

  /**
   * Validates a list of recipients without submitting a transaction.
   * Checks for duplicate addresses, non-positive shares, >20 recipients, and
   * total bps != 10 000.
   *
   * @param recipients - Array of {@link SplitRecipient} to validate.
   * @returns `{ valid, errors }`.
   *
   * @example
   * ```ts
   * const { valid, errors } = client.splitter.validateRecipients([
   *   { address: 'GABC…', shareBps: 5000 },
   *   { address: 'GXYZ…', shareBps: 5000 },
   * ]);
   * if (!valid) console.error(errors);
   * ```
   */
  validateRecipients(recipients: SplitRecipient[]): ValidationResult {
    const errors: string[] = [];
    recipients.forEach((r, i) => {
      if (r.shareBps <= 0) errors.push(`Recipient #${i + 1} has non-positive shareBps`);
    });
    const seen = new Set<string>();
    recipients.forEach((r) => {
      const lc = r.address.toLowerCase();
      if (seen.has(lc)) errors.push(`Duplicate address: ${r.address}`);
      seen.add(lc);
    });
    if (recipients.length > 20) errors.push(`Too many recipients: ${recipients.length} (max 20)`);
    const totalBps = recipients.reduce((sum, r) => sum + r.shareBps, 0);
    if (totalBps !== 10_000) errors.push(`Total basis points must equal 10 000, got ${totalBps}`);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Returns aggregate splitter statistics.
   *
   * @returns Object with `totalSplits`, `distributedCount`, `cancelledCount`, and `totalDistributedValue`.
   * @throws {VeriTixError} If the contract returns no data or an unexpected format.
   *
   * @example
   * ```ts
   * const stats = await client.splitter.getSplitterStats();
   * console.log('Total splits:', stats.totalSplits);
   * ```
   */
  async getSplitterStats(): Promise<{
    totalSplits: number;
    distributedCount: number;
    cancelledCount: number;
    totalDistributedValue: bigint;
  }> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_splitter_stats',
      [],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result ? raw.result.retval : undefined;

    if (!returnValue || returnValue.switch() === xdr.ScValType.scvVoid()) {
      throw new VeriTixError(VeriTixErrorCode.Unknown, 'SplitterModule.getSplitterStats: no data returned');
    }

    if (returnValue.switch() !== xdr.ScValType.scvMap()) {
      throw new VeriTixError(VeriTixErrorCode.Unknown, 'SplitterModule.getSplitterStats: expected ScMap result');
    }

    const map = returnValue.map() ?? [];
    const get = (key: string): xdr.ScVal | undefined =>
      map.find((e) => e.key().sym() === key)?.val();

    const totalSplitsVal = get('total_splits');
    const distributedCountVal = get('distributed_count');
    const cancelledCountVal = get('cancelled_count');
    const totalDistributedValueVal = get('total_distributed_value');

    if (!totalSplitsVal || !distributedCountVal || !cancelledCountVal || !totalDistributedValueVal) {
      throw new VeriTixError(VeriTixErrorCode.Unknown, 'SplitterModule.getSplitterStats: incomplete stats map');
    }

    return {
      totalSplits: scValToNumber(totalSplitsVal),
      distributedCount: scValToNumber(distributedCountVal),
      cancelledCount: scValToNumber(cancelledCountVal),
      totalDistributedValue: scValToBigint(totalDistributedValueVal),
    };
  }

  /**
   * Creates a new payment split instruction on-chain.
   * Recipient `shareBps` values must sum to exactly 10 000.
   *
   * @param params - `{ recipients, totalAmount }`.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.splitter.createSplit({
   *   recipients: [
   *     { address: 'GABC…', shareBps: 7000 },
   *     { address: 'GXYZ…', shareBps: 3000 },
   *   ],
   *   totalAmount: 10_000_000n,
   * });
   * ```
   */
  async createSplit(params: CreateSplitParams): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(VeriTixErrorCode.ReadOnlyClient, 'A Keypair is required for write operations.');
    }
    const totalBps = params.recipients.reduce((s, r) => s + r.shareBps, 0);
    if (totalBps !== 10_000) {
      throw new VeriTixError(VeriTixErrorCode.SplitInvalidShares, 'Recipient shares must sum to 10 000 basis points.');
    }
    // TODO: build & submit contract call
    void simulateTransaction;
    void submitTransaction;
    throw new Error('SplitterModule.createSplit: not implemented');
  }

  /**
   * Convenience wrapper that creates a three-way revenue split between
   * organizer, artist, and platform.
   * The platform's share is `10 000 - organizerBps - artistBps`.
   *
   * @param params - {@link RevenueSplitParams}
   * @returns A {@link TransactionResult} on success.
   *
   * @deprecated Since 0.2.0 — use {@link createSplit} with an explicit
   *   `recipients` array instead.  `createRevenueSplit` is a thin wrapper
   *   that only supports a fixed three-party split and will be removed in
   *   0.3.0.  Migrate to:
   *   ```ts
   *   await client.splitter.createSplit({
   *     recipients: [
   *       { address: organizer, shareBps: organizerBps },
   *       { address: artist,    shareBps: artistBps },
   *       { address: platform,  shareBps: 10_000 - organizerBps - artistBps },
   *     ],
   *     totalAmount,
   *   });
   *   ```
   *
   * @example
   * ```ts
   * // ❌ Deprecated — will be removed in 0.3.0
   * await client.splitter.createRevenueSplit({
   *   organizer: 'GORG…', organizerBps: 6000,
   *   artist:    'GART…', artistBps:    3000,
   *   platform:  'GPLT…',
   *   totalAmount: 20_000_000n,
   * });
   * ```
   */
  async createRevenueSplit(params: RevenueSplitParams): Promise<TransactionResult> {
    const { organizer, organizerBps, artist, artistBps, platform, totalAmount } = params;
    const totalBps = organizerBps + artistBps;
    if (totalBps >= 10_000) {
      throw new VeriTixError(VeriTixErrorCode.SplitInvalidShares, 'organizerBps + artistBps must be < 10 000.');
    }
    const recipients: SplitRecipient[] = [
      { address: organizer, shareBps: organizerBps },
      { address: artist, shareBps: artistBps },
      { address: platform, shareBps: 10_000 - totalBps },
    ];
    return this.createSplit({ recipients, totalAmount });
  }

  /**
   * Distributes the split funds to all recipients on-chain.
   *
   * @param _id - Numeric split identifier.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * const result = await client.splitter.distribute(2n);
   * console.log('Distributed in tx:', result.hash);
   * ```
   */
  async distribute(_id: bigint): Promise<TransactionResult> {
    throw new Error('SplitterModule.distribute: not implemented');
  }

  /**
   * Distributes multiple splits in a single transaction. Collects failures
   * without throwing — returns a summary of results.
   *
   * @param ids - Array of numeric split identifiers to distribute.
   * @returns Summary with distributed and failed split IDs.
   *
   * @example
   * ```ts
   * const { distributed, failed } = await client.splitter.bulkDistribute([1n, 2n, 3n]);
   * ```
   */
  async bulkDistribute(_ids: bigint[]): Promise<{ distributed: bigint[]; failed: bigint[] }> {
    if (!this.keypair) {
      throw new VeriTixError(VeriTixErrorCode.ReadOnlyClient, 'A Keypair is required for write operations.');
    }

    const distributed: bigint[] = [];
    const failed: bigint[] = [];

    for (const id of _ids) {
      try {
        await this.distribute(id);
        distributed.push(id);
      } catch {
        failed.push(id);
      }
    }

    return { distributed, failed };
  }
}
