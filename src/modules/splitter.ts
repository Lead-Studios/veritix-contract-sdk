/**
 * @module modules/splitter
 * Payment splitter operations exposed by the VeriTix Soroban contract.
 *
 * A split lets a sender atomically distribute a lump-sum across multiple
 * recipients according to basis-point shares (1 bps = 0.01 %, total must
 * equal 10 000 bps).
 */

import { SorobanRpc, Keypair } from '@stellar/stellar-sdk';
import type {
  NetworkConfig,
  SplitRecord,
  SplitRecipient,
  TransactionResult,
} from '../types/index';

/**
 * Parameters required to create a new payment split.
 */
export interface CreateSplitParams {
  /** Ordered list of recipients with their basis-point share allocations */
  recipients: SplitRecipient[];
  /** Total amount to split and distribute (in stroops) */
  totalAmount: bigint;
}

/**
 * Handles all payment-splitter interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.splitter}.
 */
export class SplitterModule {
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
   * Fetches the on-chain record for an existing split.
   *
   * @param id - Numeric split identifier.
   * @returns The {@link SplitRecord}, or `null` if no such split exists.
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

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Creates a new split instruction on-chain.
   * Locks `totalAmount` tokens from the caller's balance.
   *
   * Basis points for all recipients must sum to exactly **10 000**.
   *
   * @param params - {@link CreateSplitParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `SPLIT_INVALID_SHARES` if BPS don't total 10 000.
   *
   * @example
   * ```ts
   * await client.splitter.createSplit({
   *   recipients: [
   *     { address: 'GABC…', shareBps: 7000 },  // 70 %
   *     { address: 'GXYZ…', shareBps: 3000 },  // 30 %
   *   ],
   *   totalAmount: 10_000_000n,
   * });
   * ```
   */
  async createSplit(_params: CreateSplitParams): Promise<TransactionResult> {
    // TODO: implement
    void this.keypair;
    throw new Error('SplitterModule.createSplit: not implemented');
  }

  /**
   * Distributes the locked funds to all recipients according to their shares.
   * May only be called once per split.
   *
   * @param id - Numeric split identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `SPLIT_ALREADY_DISTRIBUTED` if already done.
   */
  async distribute(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('SplitterModule.distribute: not implemented');
  }
}
