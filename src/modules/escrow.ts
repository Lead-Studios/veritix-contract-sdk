/**
 * @module modules/escrow
 * EscrowModule — escrow reads and writes against the VeriTix contract
 * (issues #456, #459, and auto-release deadline checking).
 *
 * Provides methods for listing escrows by role, querying aggregate stats,
 * transferring beneficiary rights, and triggering auto-release with deadline
 * validation.
 */
import {
  Account as StellarAccount,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import type { EscrowRecord, TransactionResult } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import {
  DUMMY_PUBLIC_KEY,
  assertValidAddress,
} from '../utils/network';
import type { NetworkConfig } from '../utils/network';
import { addressToScVal, bigintToScVal } from '../utils/scval';
import {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
} from '../utils/transaction';

/** Result of {@link EscrowModule.getEscrowStats}. */
export interface EscrowStats {
  /** Total number of escrows */
  total: number;
  /** Number of active (unreleased, unrefunded) escrows */
  active: number;
  /** Number of settled (released or refunded) escrows */
  settled: number;
  /** Total value locked across all escrows (in stroops) */
  totalValue: bigint;
}

type Signer = (tx: Transaction) => Promise<Transaction>;

export class EscrowModule {
  /** Soroban RPC server; tests inject a mock on this field. */
  server: {
    simulateTransaction(tx: Transaction): Promise<unknown>;
    getAccount?(address: string): Promise<unknown>;
    sendTransaction?(tx: Transaction): Promise<{ status: string; hash?: string }>;
    getTransaction?(hash: string): Promise<{ status: string; ledger?: number }>;
    getLatestLedger?(): Promise<{ sequence: number }>;
  } | null = null;

  protected readonly config: NetworkConfig;
  protected readonly keypair?: Keypair;
  private signer?: Signer;

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
  }

  /**
   * Overrides the write-signing path for wallet-based flows: instead of
   * signing locally with a keypair, the returned transaction of `signer` is
   * used as-is.
   */
  setSigner(signer: Signer): void {
    this.signer = signer;
  }

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Returns escrow IDs where the given address is the depositor.
   *
   * Validates the address and returns an empty array when there are no
   * escrows for that depositor.
   *
   * @param address - Stellar address to query as depositor.
   * @returns Array of escrow IDs (bigint).
   */
  async getDepositorEscrows(address: string): Promise<bigint[]> {
    assertValidAddress(address, 'depositor');
    try {
      const result = await this.read('get_depositor_escrows', [addressToScVal(address)]);
      if (!Array.isArray(result)) return [];
      return result.map((id) => (typeof id === 'bigint' ? id : BigInt(String(id))));
    } catch {
      return [];
    }
  }

  /**
   * Returns escrow IDs where the given address is the beneficiary.
   *
   * Validates the address and returns an empty array when there are no
   * escrows for that beneficiary.
   *
   * @param address - Stellar address to query as beneficiary.
   * @returns Array of escrow IDs (bigint).
   */
  async getBeneficiaryEscrows(address: string): Promise<bigint[]> {
    assertValidAddress(address, 'beneficiary');
    try {
      const result = await this.read('get_beneficiary_escrows', [addressToScVal(address)]);
      if (!Array.isArray(result)) return [];
      return result.map((id) => (typeof id === 'bigint' ? id : BigInt(String(id))));
    } catch {
      return [];
    }
  }

  /**
   * Returns aggregate statistics for all escrows.
   *
   * Provides total count, active count, settled count, and total value locked
   * without requiring pagination through individual escrows.
   *
   * @returns EscrowStats with counts and total value.
   */
  async getEscrowStats(): Promise<EscrowStats> {
    const result = await this.read('get_escrow_stats', []);
    if (typeof result !== 'object' || result === null) {
      return { total: 0, active: 0, settled: 0, totalValue: 0n };
    }

    const native = result as Record<string, unknown>;
    return {
      total: Number(native.total ?? 0),
      active: Number(native.active ?? 0),
      settled: Number(native.settled ?? 0),
      totalValue: typeof native.total_value === 'bigint' ? native.total_value : BigInt(String(native.total_value ?? '0')),
    };
  }

  /**
   * Reads a single escrow record by ID.
   *
   * @param id - Escrow ID to query.
   * @returns EscrowRecord with full escrow details.
   */
  async getEscrow(id: bigint): Promise<EscrowRecord> {
    const result = await this.read('get_escrow', [bigintToScVal(id, 'u64')]);
    const native = result as Record<string, unknown>;
    return {
      id: typeof native.id === 'bigint' ? native.id : BigInt(String(native.id ?? id)),
      depositor: String(native.depositor ?? ''),
      beneficiary: String(native.beneficiary ?? ''),
      amount: typeof native.amount === 'bigint' ? native.amount : BigInt(String(native.amount ?? '0')),
      released: Boolean(native.released),
      refunded: Boolean(native.refunded),
      expiryLedger: Number(native.expiry_ledger ?? native.expiryLedger ?? 0),
      memos: Array.isArray(native.memos) ? native.memos.map(String) : [],
    };
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Transfers the beneficiary rights of an escrow to a new address.
   *
   * Validates the new beneficiary address and surfaces a typed error when
   * the escrow is already settled (released or refunded) or disputed.
   *
   * @param id - Escrow ID to transfer.
   * @param newBeneficiary - New beneficiary Stellar address.
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `EscrowAlreadySettled` when escrow is released/refunded.
   * @throws {VeriTixError} with code `EscrowDisputed` when escrow has an open dispute.
   */
  async transferBeneficiary(id: bigint, newBeneficiary: string): Promise<TransactionResult> {
    assertValidAddress(newBeneficiary, 'newBeneficiary');
    this.assertSignerConfigured('transferBeneficiary');

    try {
      return await this.writeCall('transfer_beneficiary', [
        bigintToScVal(id, 'u64'),
        addressToScVal(newBeneficiary),
      ]);
    } catch (err: unknown) {
      const errStr = this.extractErrorString(err);

      if (errStr.includes('escrow already settled')) {
        throw new VeriTixError(
          VeriTixErrorCode.EscrowAlreadySettled,
          'Cannot transfer beneficiary: escrow has already been settled',
          errStr,
          err,
        );
      }
      if (errStr.includes('dispute')) {
        throw new VeriTixError(
          VeriTixErrorCode.DisputeAlreadyOpen,
          'Cannot transfer beneficiary: escrow has an open dispute',
          errStr,
          err,
        );
      }
      throw err;
    }
  }

  /**
   * Triggers auto-release of an escrow after its deadline has passed.
   *
   * Checks that the expiry ledger has been reached before building the
   * transaction. Throws a typed error naming how many ledgers remain when
   * the deadline has not yet passed.
   *
   * @param id - Escrow ID to auto-release.
   * @param currentLedger - Optional current ledger sequence (queried from RPC if omitted).
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `EscrowNotExpired` when deadline has not passed.
   */
  async triggerAutoRelease(id: bigint, currentLedger?: number): Promise<TransactionResult> {
    this.assertSignerConfigured('triggerAutoRelease');

    const escrow = await this.getEscrow(id);
    const ledger = currentLedger ?? await this.fetchLatestLedger();
    const ledgersRemaining = escrow.expiryLedger - ledger;

    if (ledgersRemaining > 0) {
      throw new VeriTixError(
        VeriTixErrorCode.EscrowNotExpired,
        `Auto-release not yet available: ${ledgersRemaining} ledger(s) remain until expiry`,
        String(ledgersRemaining),
      );
    }

    return await this.writeCall('auto_release', [bigintToScVal(id, 'u64')]);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private assertSignerConfigured(action: string): void {
    if (!this.keypair && !this.signer) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        `A Keypair is required for ${action}. Pass it to VeriTixClient.`,
      );
    }
  }

  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    this.assertSignerConfigured('write operations');

    if (!this.server) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'call connect() before writing to the contract',
      );
    }

    const sourcePubKey = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();
    let sourceAccount: StellarAccount;
    if (typeof this.server.getAccount === 'function') {
      const acct = await this.server.getAccount(sourcePubKey);
      sourceAccount = acct as StellarAccount;
    } else {
      sourceAccount = new StellarAccount(sourcePubKey, '0');
    }

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );

    const { transaction } = await simulateTransaction(this.server, tx);

    if (this.signer) {
      return await this.submitSigned(transaction);
    }
    return await submitTransaction(this.server, transaction, this.keypair);
  }

  private sourceForWrite(): string {
    return this.keypair?.publicKey() ?? DUMMY_PUBLIC_KEY;
  }

  private async submitSigned(tx: Transaction): Promise<TransactionResult> {
    const signed = await this.signer!(tx);
    if (!this.server?.sendTransaction || !this.server?.getTransaction) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'RPC server methods unavailable for transaction submission.',
      );
    }
    const sendResponse = await this.server.sendTransaction(signed);
    if (sendResponse.status === 'ERROR') {
      throw new VeriTixError(
        VeriTixErrorCode.TransactionFailed,
        'Transaction submission rejected by the network.',
      );
    }
    const hash = sendResponse.hash ?? Buffer.from(signed.hash()).toString('hex');
    const result = await this.server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      return {
        hash,
        ledger: result.ledger ?? 0,
        successful: true,
      };
    }
    if (result.status === 'FAILED') {
      throw new VeriTixError(VeriTixErrorCode.TransactionFailed, 'Transaction failed on-chain.');
    }
    throw new VeriTixError(
      VeriTixErrorCode.WatchTimeout,
      'Transaction not confirmed after submission.',
    );
  }

  private async fetchLatestLedger(): Promise<number> {
    if (this.server && typeof this.server.getLatestLedger === 'function') {
      try {
        const info = await this.server.getLatestLedger();
        return info.sequence;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private async read(method: string, args: xdr.ScVal[]): Promise<unknown> {
    if (!this.server) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'call connect() before reading from the contract',
      );
    }
    const tx = this.buildContractCall(method, args);
    const result = (await this.server.simulateTransaction(tx)) as
      | { result?: { retval?: xdr.ScVal } }
      | undefined;
    const retval = result?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(
        VeriTixErrorCode.SimulationFailed,
        `${method} simulation returned no value`,
      );
    }
    return scValToNative(retval);
  }

  private buildContractCall(method: string, args: xdr.ScVal[]): Transaction {
    const source = new StellarAccount(DUMMY_PUBLIC_KEY, '0');
    return new TransactionBuilder(source, {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(new Contract(this.config.contractId).call(method, ...args))
      .setTimeout(30)
      .build() as Transaction;
  }

  private extractErrorString(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
}
