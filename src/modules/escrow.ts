/**
 * @module modules/escrow
 * EscrowModule — escrow read operations against the VeriTix contract.
 *
 * Provides the single most common escrow read operation: `getEscrow`.
 * Returns `null` for an id that does not exist rather than throwing,
 * since a missing escrow is an expected outcome.
 */
import {
  Account as StellarAccount,
  Contract,
  Keypair,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import type { EscrowRecord } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { DUMMY_PUBLIC_KEY } from '../utils/network';
import type { NetworkConfig } from '../utils/network';
import { bigintToScVal } from '../utils/scval';

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

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
  }

  /**
   * Reads a single escrow by its ID.
   *
   * Returns `null` for an id that does not exist rather than throwing,
   * since a missing escrow is an expected outcome.
   *
   * @param id - The escrow ID to read.
   * @returns The escrow record, or `null` if it doesn't exist.
   */
  async getEscrow(id: bigint): Promise<EscrowRecord | null> {
    if (!this.server?.simulateTransaction) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'call connect() before reading escrow state',
      );
    }

    const result = await this.server.simulateTransaction(
      this.buildContractCall('get_escrow', [bigintToScVal(id, 'u64')]),
    );

    const retval = (result as { result?: { retval?: xdr.ScVal } } | undefined)?.result?.retval;
    if (retval === undefined) {
      return null;
    }

    const native = scValToNative(retval) as Record<string, unknown>;
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

  private buildContractCall(method: string, args: xdr.ScVal[] = []): Transaction {
    const source = new StellarAccount(DUMMY_PUBLIC_KEY, '0');
    return new TransactionBuilder(source, {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(new Contract(this.config.contractId).call(method, ...args))
      .setTimeout(30)
      .build() as Transaction;
  }
}
