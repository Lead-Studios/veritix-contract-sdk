/**
 * @module modules/escrow
 * Escrow operations exposed by the VeriTix Soroban contract.
 *
 * Escrows allow a depositor to lock funds on-chain until a beneficiary
 * condition is met, a resolver adjudicates a dispute, or the escrow expires.
 */

import { SorobanRpc, Keypair, Account, xdr, Address } from '@stellar/stellar-sdk';
import { SorobanRpc, Keypair, Account, xdr } from '@stellar/stellar-sdk';
import type {
  EscrowRecord,
  NetworkConfig,
  TicketEscrowParams,
  TransactionResult,
  BatchSettlementResult,
} from '../types/index';
import { addressToScVal, bigintToScVal, scValToBigint, stringToScVal } from '../utils/scval';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { parseEscrowRecord } from '../utils/parsers';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { bigintToScVal } from '../utils/scval';
import { parseSorobanError } from '../utils/errors';

/**
 * Parameters required to create a new escrow.
 */
export interface CreateEscrowParams {
  /** Stellar account address of the intended beneficiary */
  beneficiary: string;
  /** Amount to lock in escrow (in stroops) */
  amount: bigint;
  /** Ledger sequence number after which the depositor may reclaim funds */
  expiryLedger: number;
  /** Optional free-form memo strings to attach to the record */
  memos?: string[];
}

/**
 * Handles all escrow interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.escrow}.
 */
export class EscrowModule {
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
   * Fetches the on-chain record for an existing escrow.
   *
   * @param id - Numeric escrow identifier.
   * @returns The {@link EscrowRecord}, or `null` if no escrow with that ID exists.
   *
   * @example
   * ```ts
   * const record = await client.escrow.getEscrow(1n);
   * if (!record) throw new Error('Escrow not found');
   * console.log('Beneficiary:', record.beneficiary);
   * ```
   */
  async getEscrow(id: bigint): Promise<EscrowRecord | null> {
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_escrow',
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

    if (returnValue.switch() === xdr.ScValType.scvOption()) {
      const option = returnValue.option();
      if (!option || !option.value()) {
        return null;
      }
      return parseEscrowRecord(option.value());
    }

    return parseEscrowRecord(returnValue);
  }

  /**
   * Lists all escrow IDs created by a given depositor address.
   *
   * @param address - Stellar account address of the depositor.
   * @returns Array of escrow IDs owned by that depositor.
   */
  async getEscrowsByDepositor(address: string): Promise<bigint[]> {
    return this.getEscrowIdsByAddress('escrows_by_depositor', address);
  }

  /**
   * Lists all escrow IDs whose beneficiary matches the given address.
   *
   * @param address - Stellar account address of the beneficiary.
   * @returns Array of escrow IDs for that beneficiary.
   */
  async getEscrowsByBeneficiary(address: string): Promise<bigint[]> {
    return this.getEscrowIdsByAddress('escrows_by_beneficiary', address);
  }

  /**
   * Fetches on-chain records for multiple escrows in a single batch call.
   *
   * @param ids - Array of numeric escrow identifiers (max 50).
   * @returns Array of {@link EscrowRecord} or `null` for each ID, in input order.
   *          Missing escrows are represented as `null`.
   * @throws {VeriTixError} With code `BATCH_TOO_LARGE` if more than 50 IDs are provided.
   *
   * @example
   * ```ts
   * const records = await client.escrow.getEscrowsBatch([1n, 2n, 3n]);
   * records.forEach((record, index) => {
   *   if (record) {
   *     console.log(`Escrow ${index}: ${record.beneficiary}`);
   *   } else {
   *     console.log(`Escrow ${index}: not found`);
   *   }
   * });
   * ```
   */
  async getEscrowsBatch(ids: bigint[]): Promise<(EscrowRecord | null)[]> {
    // Validate batch size
    if (ids.length > 50) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `Batch request exceeded maximum allowed size (50 items). Received ${ids.length} IDs.`,
      );
    }

    // If empty batch, return empty array
    if (ids.length === 0) {
      return [];
    }

    // Try to use get_escrows_batch if available, otherwise fall back to individual calls
    try {
      return await this.getEscrowsBatchViaContract(ids);
    } catch (error) {
      // If contract doesn't support get_escrows_batch, fall back to individual calls
      if (error instanceof Error && error.message.includes('not implemented')) {
        return await this.getEscrowsBatchFallback(ids);
      }
      throw error;
    }
  }

  /**
   * Attempts to fetch escrows via the contract's get_escrows_batch method.
   * @internal
   */
  private async getEscrowsBatchViaContract(ids: bigint[]): Promise<(EscrowRecord | null)[]> {
    // TODO: implement contract call
    // Suggested steps:
    //   1. buildContractCall(server, account, contractId, 'get_escrows_batch', [toScVal(ids, 'vec<u64>')])
    //   2. simulateTransaction(server, tx)
    //   3. Parse ScVal result → array of (EscrowRecord | null)
    void this.config;
    void this.server;
    throw new Error('EscrowModule.getEscrowsBatchViaContract: not implemented');
  }

  /**
   * Falls back to fetching escrows individually using Promise.all.
   * @internal
   */
  private async getEscrowsBatchFallback(ids: bigint[]): Promise<(EscrowRecord | null)[]> {
    return Promise.all(ids.map((id) => this.getEscrow(id)));
   * Checks if an escrow has been settled (released or refunded).
   *
   * @param id - Numeric escrow identifier.
   * @returns `true` if the escrow is released or refunded, `false` otherwise.
   * @throws {VeriTixError} With code `ESCROW_NOT_FOUND` if the escrow does not exist.
   *
   * @example
   * ```ts
   * const settled = await client.escrow.isSettled(1n);
   * if (settled) {
   *   console.log('Escrow has been settled');
   * }
   * ```
   */
  async isSettled(id: bigint): Promise<boolean> {
    const record = await this.getEscrow(id);
    if (!record) {
      throw new Error(`EscrowModule.isSettled: escrow ${id} not found`);
    }
    return record.released || record.refunded;
  }

  /**
   * Checks if an escrow has expired and is eligible for refund.
   *
   * @param id - Numeric escrow identifier.
   * @param currentLedger - Optional current ledger sequence. If not provided, fetches from the server.
   * @returns `true` if current ledger >= escrow's expiry ledger, `false` otherwise.
   * @throws {VeriTixError} With code `ESCROW_NOT_FOUND` if the escrow does not exist.
   *
   * @example
   * ```ts
   * const expired = await client.escrow.isExpired(1n);
   * if (expired) {
   *   const result = await client.escrow.refundEscrow(1n);
   * }
   * ```
   */
  async isExpired(id: bigint, currentLedger?: number): Promise<boolean> {
    const record = await this.getEscrow(id);
    if (!record) {
      throw new Error(`EscrowModule.isExpired: escrow ${id} not found`);
    }

    const ledger = currentLedger ?? (await this.server.getLatestLedger()).sequence;
    return ledger >= record.expiryLedger;
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Creates a new escrow, locking `amount` tokens on-chain.
   * The caller becomes the depositor.
   *
   * @param params - {@link CreateEscrowParams}
   * @returns A {@link TransactionResult} on success, including the decoded
   *          `escrowId` of the newly-created escrow.
   * @throws {VeriTixError} If the depositor lacks sufficient token balance.
   *
   * @example
   * ```ts
   * const result = await client.escrow.createEscrow({
   *   beneficiary: 'GABC…',
   *   amount: 1_000_000n,   // 0.1 XLM in stroops
   *   expiryLedger: currentLedger + 17_280, // ~1 day
   * });
   * ```
   */
  async createEscrow(
    params: CreateEscrowParams,
  ): Promise<TransactionResult & { escrowId: bigint }> {
    if (!this.keypair) {
      throw new Error('EscrowModule.createEscrow: signing keypair required');
    }

    if (params.amount <= 0n) {
      throw new Error('EscrowModule.createEscrow: amount must be greater than zero');
    }

    const currentLedger = (await this.server.getLatestLedger()).sequence;
    if (params.expiryLedger <= currentLedger) {
      throw new Error(
        'EscrowModule.createEscrow: expiryLedger must be greater than current ledger',
      );
    }

    try {
      new Address(params.beneficiary);
    } catch {
      throw new Error('EscrowModule.createEscrow: beneficiary must be a valid Stellar address');
    }

    const depositor = this.keypair.publicKey();
    const tx = await buildContractCall(
      this.server,
      new Account(depositor, '0'),
      this.config.contractId,
      'create_escrow',
      [
        addressToScVal(depositor),
        addressToScVal(params.beneficiary),
        bigintToScVal(params.amount, 'i128'),
        bigintToScVal(BigInt(params.expiryLedger), 'u64'),
        xdr.ScVal.scvVec((params.memos ?? []).map((memo) => stringToScVal(memo))),
      ],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result ? raw.result.retval : undefined;

    if (!returnValue) {
      throw new Error('EscrowModule.createEscrow: missing escrow ID in simulation result');
    }

    const escrowId = scValToBigint(returnValue);
    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    const result = await submitTransaction(this.server, assembled, this.keypair);

    return {
      ...result,
      returnValue: escrowId,
      escrowId,
    };
  }

  /**
   * Creates a ticket escrow for a scheduled event and attaches the ticket UUID.
   *
   * @param params - {@link TicketEscrowParams}
   * @returns The created escrow ID.
   */
  async createTicketEscrow(params: TicketEscrowParams): Promise<bigint> {
    const expiryLedger = params.eventLedger + (params.bufferLedgers ?? 5_000);

    const result = await this.createEscrow({
      beneficiary: params.organizer,
      amount: params.ticketPrice,
      expiryLedger,
      memos: [params.ticketRef],
    });

    return result.escrowId;
  }

  /**
   * Releases the escrowed funds to the beneficiary.
   * Must be called by the depositor or a designated resolver.
   *
   * @param id - Numeric escrow identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ESCROW_ALREADY_SETTLED` if already settled.
   */
  async releaseEscrow(id: bigint): Promise<TransactionResult> {
    return this.settleEscrow('release_escrow', id);
  }

  /**
   * Refunds the escrowed funds back to the depositor.
   * Requires that the escrow has reached its `expiryLedger`.
   *
   * @param id - Numeric escrow identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ESCROW_NOT_EXPIRED` if still within expiry.
   */
  async refundEscrow(id: bigint): Promise<TransactionResult> {
    return this.settleEscrow('refund_escrow', id);
  }

  private async getEscrowIdsByAddress(
    method: 'escrows_by_depositor' | 'escrows_by_beneficiary',
    address: string,
  ): Promise<bigint[]> {
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      [addressToScVal(address)],
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
      throw new Error(`EscrowModule.${method}: expected ScvVec result`);
    }

    return (returnValue.vec() ?? []).map((item) => scValToBigint(item));
  }

  private async settleEscrow(
    method: 'release_escrow' | 'refund_escrow',
    id: bigint,
  ): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error(
        `EscrowModule.${method === 'release_escrow' ? 'releaseEscrow' : 'refundEscrow'}: signing keypair required`,
      );
    }

    const escrow = await this.getEscrow(id);
    if (!escrow) {
      throw new VeriTixError(VeriTixErrorCode.EscrowNotFound, 'Escrow not found');
    }

    if (escrow.released || escrow.refunded) {
      throw new VeriTixError(
        VeriTixErrorCode.EscrowAlreadySettled,
        'Escrow has already been released or refunded',
      );
    }

    const caller = this.keypair.publicKey();
    const tx = await buildContractCall(
      this.server,
      new Account(caller, '0'),
      this.config.contractId,
      method,
      [bigintToScVal(id, 'u64')],
      this.config.networkPassphrase,
    );

    const raw = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(raw)) {
      throw parseSorobanError(raw.error);
    }

    const returnValue =
      SorobanRpc.Api.isSimulationSuccess(raw) && raw.result ? raw.result.retval : undefined;

    const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
    const result = await submitTransaction(this.server, assembled, this.keypair);

    return {
      ...result,
      returnValue,
    };
  }

  /**
   * Batch settles multiple escrows in chunks (max 50 per transaction).
   * Efficiently releases funds after a large event completes.
   *
   * @param escrowIds - Array of escrow IDs to settle. Will be chunked into batches of max 50.
   * @returns A {@link BatchSettlementResult} with settlement statistics.
   * @throws {Error} If no signing keypair is available.
   *
   * @example
   * ```ts
   * const result = await client.escrow.settleEvent([1n, 2n, 3n, 4n, 5n]);
   * console.log(`Settled ${result.settled}, failed: ${result.failed.length}`);
   * console.log('Transaction hashes:', result.txHashes);
   * ```
   */
  async settleEvent(escrowIds: bigint[]): Promise<BatchSettlementResult> {
    if (!this.keypair) {
      throw new Error('EscrowModule.settleEvent: signing keypair required');
    }

    const CHUNK_SIZE = 50;
    const chunks: bigint[][] = [];

    // Split escrowIds into chunks of max 50
    for (let i = 0; i < escrowIds.length; i += CHUNK_SIZE) {
      chunks.push(escrowIds.slice(i, i + CHUNK_SIZE));
    }

    const result: BatchSettlementResult = {
      settled: 0,
      failed: [],
      txHashes: [],
    };

    // Process each chunk
    for (const chunk of chunks) {
      try {
        const caller = this.keypair.publicKey();
        const sourceAccount = new Account(caller, '0');

        // Convert chunk to ScVal vector of u64 values
        const idScVals = chunk.map((id) => bigintToScVal(id, 'u64'));
        const idsVector = xdr.ScVal.scvVec(idScVals);

        const tx = await buildContractCall(
          this.server,
          sourceAccount,
          this.config.contractId,
          'settle_event',
          [idsVector],
          this.config.networkPassphrase,
        );

        const raw = await this.server.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationError(raw)) {
          throw parseSorobanError(raw.error);
        }

        const assembled = SorobanRpc.assembleTransaction(tx, raw).build();
        const txResult = await submitTransaction(this.server, assembled, this.keypair);

        result.txHashes.push(txResult.hash);

        // Parse the return value to get settled count and failed IDs
        const returnValue = txResult.returnValue;
        if (returnValue && typeof returnValue === 'object' && 'settled' in returnValue && 'failed' in returnValue) {
          const settleInfo = returnValue as { settled: number; failed: bigint[] };
          result.settled += settleInfo.settled;
          result.failed.push(...settleInfo.failed);
        }
      } catch (error) {
        // On chunk failure, try to extract failed IDs from the chunk
        result.failed.push(...chunk);
      }
    }

    return result;
  }
}
