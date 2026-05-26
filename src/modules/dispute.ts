/**
 * @module modules/dispute
 * Dispute operations exposed by the VeriTix Soroban contract.
 *
 * Any party to an escrow may open a dispute to freeze the funds and request
 * arbitration by a pre-designated resolver address.
 */

import { SorobanRpc, Keypair } from '@stellar/stellar-sdk';
import type {
  DisputeRecord,
  DisputeStatus,
  NetworkConfig,
  TransactionResult,
} from '../types/index';

/**
 * Parameters required to open a new dispute against an escrow.
 */
export interface OpenDisputeParams {
  /** The escrow ID to raise a dispute on */
  escrowId: bigint;
  /** Stellar account address of the designated resolver / arbitrator */
  resolver: string;
}

/**
 * Parameters required to resolve an open dispute.
 */
export interface ResolveDisputeParams {
  /** The dispute ID to resolve */
  disputeId: bigint;
  /**
   * The resolution ruling.
   * Must be `ResolvedForBeneficiary` or `ResolvedForDepositor`.
   */
  resolution: Exclude<DisputeStatus, 'Open'>;
}

/**
 * Handles all dispute interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.dispute}.
 */
export class DisputeModule {
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
   * Fetches the on-chain record for an existing dispute.
   *
   * @param id - Numeric dispute identifier.
   * @returns The {@link DisputeRecord}, or `null` if no such dispute exists.
   *
   * @example
   * ```ts
   * const dispute = await client.dispute.getDispute(3n);
   * console.log('Status:', dispute?.status);
   * ```
   */
  async getDispute(_id: bigint): Promise<DisputeRecord | null> {
    // TODO: implement
    void this.config;
    void this.server;
    throw new Error('DisputeModule.getDispute: not implemented');
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Opens a new dispute against an escrow, freezing the funds until resolved.
   * Caller becomes the claimant.
   *
   * @param params - {@link OpenDisputeParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `DISPUTE_ALREADY_OPEN` if one is already active.
   * @throws {VeriTixError} With code `ESCROW_ALREADY_SETTLED` if escrow is settled.
   *
   * @example
   * ```ts
   * await client.dispute.openDispute({
   *   escrowId: 1n,
   *   resolver: 'GARB…',
   * });
   * ```
   */
  async openDispute(_params: OpenDisputeParams): Promise<TransactionResult> {
    // TODO: implement
    void this.keypair;
    throw new Error('DisputeModule.openDispute: not implemented');
  }

  /**
   * Resolves an open dispute. Must be called by the designated resolver.
   *
   * @param params - {@link ResolveDisputeParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `DISPUTE_INVALID_STATE` if already resolved.
   * @throws {VeriTixError} With code `ADMIN_UNAUTHORIZED` if caller is not the resolver.
   *
   * @example
   * ```ts
   * await client.dispute.resolveDispute({
   *   disputeId: 3n,
   *   resolution: DisputeStatus.ResolvedForBeneficiary,
   * });
   * ```
   */
  async resolveDispute(_params: ResolveDisputeParams): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('DisputeModule.resolveDispute: not implemented');
  }
}
