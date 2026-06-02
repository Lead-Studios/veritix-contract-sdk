/**
 * @module modules/escrow
 * Escrow operations exposed by the VeriTix Soroban contract.
 *
 * Escrows allow a depositor to lock funds on-chain until a beneficiary
 * condition is met, a resolver adjudicates a dispute, or the escrow expires.
 */

import { SorobanRpc, Keypair, Account, xdr, Address } from '@stellar/stellar-sdk';
import type {
  EscrowRecord,
  NetworkConfig,
  TicketEscrowParams,
  TransactionResult,
} from '../types/index';
import { addressToScVal, bigintToScVal, scValToBigint, stringToScVal } from '../utils/scval';
import { buildContractCall, submitTransaction } from '../utils/transaction';
import { parseSorobanError } from '../utils/errors';
import { parseEscrowRecord } from '../utils/parsers';

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
  async releaseEscrow(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('EscrowModule.releaseEscrow: not implemented');
  }

  /**
   * Refunds the escrowed funds back to the depositor.
   * Requires that the escrow has reached its `expiryLedger`.
   *
   * @param id - Numeric escrow identifier.
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} With code `ESCROW_NOT_EXPIRED` if still within expiry.
   */
  async refundEscrow(_id: bigint): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('EscrowModule.refundEscrow: not implemented');
  }
}
