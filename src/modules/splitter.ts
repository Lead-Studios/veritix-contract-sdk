/**
 * @module modules/splitter
 * Payment splitter operations exposed by the VeriTix Soroban contract.
 *
 * A split lets a sender atomically distribute a lump-sum across multiple
 * recipients according to basis-point shares (1 bps = 0.01 %, total must
 * equal 10 000 bps).
 */

import { SorobanRpc, Keypair, Account } from '@stellar/stellar-sdk';
import { addressToScVal, scValToBigint } from '../utils/scval';
import { buildContractCall, simulateTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import type {
  NetworkConfig,
  SplitRecord,
  SplitRecipient,
  TransactionResult,
  RevenueSplitParams,
  ValidationResult,
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
  /**
   * Returns all split IDs created by a given sender address.
   *
   * @param sender - Stellar account address of the split creator.
   * @returns Array of split identifiers (bigint).
   */
  /**
   * Returns all split IDs where the given address is a recipient.
   *
   * @param address - Stellar account address of the recipient.
   * @returns Array of split identifiers (bigint).
   */
  async getSplitsForRecipient(address: string): Promise<bigint[]> {
    // Build a dummy source account for simulation (no funds needed)
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    // Build contract call
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_splits_for_recipient',
      [addressToScVal(address)],
      this.config.networkPassphrase,
    );

    // Simulate transaction to retrieve return value
    const rawResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(rawResult)) {
      throw parseSorobanError(rawResult.error);
    }
    const retval = rawResult.result?.retval;
    if (!retval) return [];
    const vec = (retval as any).vec as any[];
    return vec.map((v) => scValToBigint(v));
  }

  // Write operations

  /**
   * Validates an array of split recipients on the client side.
   *
   * Rules enforced:
   *   • Total BPS must equal exactly 10 000.
   *   • No duplicate addresses (case‑insensitive).
   *   • Maximum of 20 recipients.
   *   • Each recipient's shareBps must be greater than 0.
   *
   * @param recipients List of SplitRecipient objects.
   * @returns ValidationResult indicating success and any error messages.
   */
  validateRecipients(recipients: SplitRecipient[]): ValidationResult {
    const errors: string[] = [];

    // Rule: shareBps > 0
    recipients.forEach((r, i) => {
      if (r.shareBps <= 0) {
        errors.push(`Recipient #${i + 1} (${r.address}) has non‑positive shareBps`);
      }
    });

    // Rule: duplicate addresses (case‑insensitive)
    const seen = new Set<string>();
    recipients.forEach((r) => {
      const lc = r.address.toLowerCase();
      if (seen.has(lc)) {
        errors.push(`Duplicate address found: ${r.address}`);
      }
      seen.add(lc);
    });

    // Rule: max 20 recipients
    if (recipients.length > 20) {
      errors.push(`Too many recipients: ${recipients.length} (max 20)`);
    }

    // Rule: total BPS == 10 000
    const totalBps = recipients.reduce((sum, r) => sum + r.shareBps, 0);
    if (totalBps !== 10_000) {
      errors.push(`Total basis points must equal 10 000, got ${totalBps}`);
    }

    return { valid: errors.length === 0, errors };
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
  /**
   * Creates a 3‑way revenue split (organizer, artist, platform).
   *
   * The organizer and artist shares are provided in basis points; the platform
   * receives the remaining share to ensure the total equals exactly 10 000 bps.
   *
   * @param params {@link RevenueSplitParams}
   * @returns {@link TransactionResult}
   * @throws {VeriTixError} With code `SPLIT_INVALID_SHARES` if the provided
   *   organizerBps + artistBps is greater than or equal to 10 000.
   */
  async createRevenueSplit(params: RevenueSplitParams): Promise<TransactionResult> {
    const { organizer, organizerBps, artist, artistBps, platform, totalAmount } = params;
    const totalBps = organizerBps + artistBps;
    if (totalBps >= 10000) {
      throw new VeriTixError(VeriTixErrorCode.SplitInvalidShares,
        'Organizer and artist shares must sum to less than 10 000 basis points.',
      );
    }
    const platformBps = 10000 - totalBps;
    const recipients: SplitRecipient[] = [
      { address: organizer, shareBps: organizerBps },
      { address: artist, shareBps: artistBps },
      { address: platform, shareBps: platformBps },
    ];
    // Forward to existing createSplit implementation
    return this.createSplit({ recipients, totalAmount });
  }

  /**
   * Creates a new split instruction on-chain.
   * Locks `totalAmount` tokens from the caller's balance.
*** End of ReplacementChunk ***

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
