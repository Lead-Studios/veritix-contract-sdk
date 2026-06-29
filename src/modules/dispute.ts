/**
 * @module modules/dispute
 * Dispute operations exposed by the VeriTix Soroban contract.
 *
 * Any party to an escrow may open a dispute to freeze the funds and request
 * arbitration by a pre-designated resolver address.
 */

import { SorobanRpc, Keypair, Account, xdr, scValToNative } from '@stellar/stellar-sdk';
import {
  DisputeRecord,
  DisputeStatus,
  NetworkConfig,
  TransactionResult,
} from '../types/index';
import { addressToScVal, bigintToScVal, boolToScVal, scValToBoolean } from '../utils/scval';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { parseDisputeRecord } from '../utils/parsers';
import { DUMMY_PUBLIC_KEY } from '../utils/network';

/**
 * Parameters required to open a new dispute against an escrow.
 */
export interface OpenDisputeParams {
  /** The escrow ID to raise a dispute on */
  escrowId: bigint;
  /** Stellar account address of the designated resolver / arbitrator */
  resolver: string;
  /** Optional evidence text attached to the dispute */
  evidence?: string;
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
  async getDispute(id: bigint): Promise<DisputeRecord | null> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_dispute',
      [bigintToScVal(id, 'u64')],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    if (!returnValue) {
      return null;
    }

    return parseDisputeRecord(returnValue);
  }

  /**
   * Checks if an open dispute exists for the given escrow.
   *
   * @param escrowId - Numeric escrow identifier.
   * @returns `true` if an open dispute exists, `false` otherwise.
   *
   * @example
   * ```ts
   * const isOpen = await client.dispute.isDisputeOpen(1n);
   * if (isOpen) {
   *   console.log('Cannot release/refund: dispute is open');
   * }
   * ```
   */
  async isDisputeOpen(escrowId: bigint): Promise<boolean> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'is_dispute_open',
      [bigintToScVal(escrowId, 'u64')],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    if (!returnValue) {
      return false;
    }

    return scValToBoolean(returnValue);
  }

  /**
   * Fetches all open dispute IDs across the contract.
   *
   * @returns Array of open dispute IDs.
   *
   * @example
   * ```ts
   * const openDisputes = await client.dispute.getOpenDisputes();
   * console.log('Open disputes:', openDisputes);
   * ```
   */
  async getOpenDisputes(): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_open_disputes',
      [],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    if (!returnValue) {
      return [];
    }

    const native = scValToNative(returnValue);
    if (!Array.isArray(native)) {
      throw new Error('Expected array from get_open_disputes');
    }

    return native.map((id) => {
      if (typeof id === 'bigint') return id;
      if (typeof id === 'number') return BigInt(id);
      throw new Error(`Unexpected type in disputes array: ${typeof id}`);
    });
  }

  /**
   * Fetches all dispute IDs assigned to a specific resolver.
   *
   * @param resolver - Stellar account address of the resolver.
   * @returns Array of dispute IDs for the resolver.
   *
   * @example
   * ```ts
   * const disputes = await client.dispute.getDisputesByResolver('GARB…');
   * console.log('Resolver disputes:', disputes);
   * ```
   */
  async getDisputesByResolver(resolver: string): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_disputes_by_resolver',
      [addressToScVal(resolver)],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    if (!returnValue) {
      return [];
    }

    const native = scValToNative(returnValue);
    if (!Array.isArray(native)) {
      throw new Error('Expected array from get_disputes_by_resolver');
    }

    return native.map((id) => {
      if (typeof id === 'bigint') return id;
      if (typeof id === 'number') return BigInt(id);
      throw new Error(`Unexpected type in disputes array: ${typeof id}`);
    });
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Fetches the complete dispute history for an escrow, including resolved disputes.
   *
   * @param escrowId - Numeric escrow identifier.
   * @returns Array of all dispute IDs (both open and resolved) associated with this escrow,
   *          in chronological order. Returns an empty array if no disputes exist.
   *
   * @example
   * ```ts
   * const disputeIds = await client.dispute.getDisputeHistory(1n);
   * for (const id of disputeIds) {
   *   const dispute = await client.dispute.getDispute(id);
   *   console.log(`Dispute ${id}: ${dispute?.status}`);
   * }
   * ```
   */
  async getDisputeHistory(escrowId: bigint): Promise<bigint[]> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_dispute_history_for_escrow',
      [bigintToScVal(escrowId, 'u64')],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    if (!returnValue) {
      return [];
    }

    // Convert ScVal vector to native array
    const native = scValToNative(returnValue);

    // Ensure we have an array
    if (!Array.isArray(native)) {
      throw new Error(
        `Expected get_dispute_history_for_escrow to return a vector, got ${typeof native}`,
      );
    }

    // Convert each element to bigint
    return native.map((id) => {
      if (typeof id === 'bigint') {
        return id;
      }
      if (typeof id === 'number') {
        return BigInt(id);
      }
      throw new Error(`Expected dispute ID to be numeric, got ${typeof id}`);
    });
  }

  /**
   * Opens a dispute against an escrow and freezes the funds pending resolution.
   *
   * @param escrowId - The escrow ID to raise a dispute on.
   * @param resolver - Stellar account address of the designated resolver.
   * @param evidence - Optional evidence text attached to the dispute.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `DISPUTE_ALREADY_OPEN` if one is already active.
   * @throws {VeriTixError} With code `ESCROW_ALREADY_SETTLED` if escrow is settled.
   * @throws {Error} If the resolver is the caller or evidence exceeds 128 bytes.
   *
   * @example
   * ```ts
   * await client.dispute.openDispute(1n, 'GARB…', 'ticket not delivered');
   * ```
   */
  async openDispute(
    escrowId: bigint,
    resolver: string,
    evidence?: string,
  ): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('DisputeModule.openDispute: signing keypair required');
    }

    const claimant = this.keypair.publicKey();
    if (resolver === claimant) {
      throw new Error('DisputeModule.openDispute: resolver cannot be the caller');
    }

    const evidenceBytes = new TextEncoder().encode(evidence ?? '');
    if (evidenceBytes.length > 128) {
      throw new Error('DisputeModule.openDispute: evidence must be 128 bytes or less');
    }

    const tx = await buildContractCall(
      this.server,
      new Account(claimant, '0'),
      this.config.contractId,
      'open_dispute',
      [
        addressToScVal(claimant),
        bigintToScVal(escrowId, 'u64'),
        addressToScVal(resolver),
        xdr.ScVal.scvBytes(Buffer.from(evidenceBytes)),
      ],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    const result = await submitTransaction(this.server, assembled, this.keypair);

    return {
      ...result,
      returnValue,
    };
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
  async resolveDispute(
    disputeId: bigint,
    forBeneficiary: boolean,
    note?: string,
  ): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('DisputeModule.resolveDispute: signing keypair required');
    }

    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new VeriTixError(
        VeriTixErrorCode.DisputeNotFound,
        'Dispute not found',
      );
    }

    if (dispute.status !== DisputeStatus.Open) {
      throw new VeriTixError(
        VeriTixErrorCode.DisputeAlreadyResolved,
        'Dispute already resolved',
      );
    }

    const resolver = this.keypair.publicKey();
    const noteBytes = new TextEncoder().encode(note ?? '');
    if (noteBytes.length > 128) {
      throw new Error('DisputeModule.resolveDispute: note must be 128 bytes or less');
    }

    const tx = await buildContractCall(
      this.server,
      new Account(resolver, '0'),
      this.config.contractId,
      'resolve_dispute',
      [
        addressToScVal(resolver),
        bigintToScVal(disputeId, 'u64'),
        boolToScVal(forBeneficiary),
        xdr.ScVal.scvBytes(Buffer.from(noteBytes)),
      ],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result
        ? raw.result.retval
        : undefined;

    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    const result = await submitTransaction(this.server, assembled, this.keypair);

    return {
      ...result,
      returnValue,
    };
  }
}
