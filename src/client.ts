/**
 * @module client
 * VeriTixClient — the single entry point for the VeriTix contract SDK.
 *
 * This slice adds `watchTransaction()` (#614) and `watchEscrow()` (#615) on
 * top of the shared client scaffold. Both followers implement the polling
 * semantics described in issue #602 (interval + timeout) so they stop cleanly
 * when the caller breaks out of the loop.
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

import type { EscrowRecord, TransactionResult } from './types';
import { VeriTixError, VeriTixErrorCode } from './utils/errors';
import { DUMMY_PUBLIC_KEY } from './utils/network';
import type { NetworkConfig } from './utils/network';
import { bigintToScVal } from './utils/scval';

export interface WatchOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

interface WatchServer {
  getLatestLedger(): Promise<{ sequence: number }>;
  getTransaction?(hash: string): Promise<{
    status: string;
    ledger?: number;
    returnValue?: unknown;
  }>;
  simulateTransaction?(tx: unknown): Promise<unknown>;
}

type ClientListener = (...args: unknown[]) => void;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class VeriTixClient {
  readonly config: NetworkConfig;
  connected = false;
  /** Soroban RPC server; tests inject a mock. */
  server: WatchServer | null = null;
  ledgerCache: { sequence: number; fetchedAt: number } | null = null;

  private readonly keypair?: Keypair;
  private readonly listeners = new Map<string, Set<ClientListener>>();

  /** Minimal escrow read surface used by the watch helpers (issue #615). */
  readonly escrow: { getEscrow: (id: bigint) => Promise<EscrowRecord> } = {
    getEscrow: (id: bigint) => this.readEscrow(id),
  };

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
  }

  getPublicKey(): string | null {
    return this.keypair ? this.keypair.publicKey() : null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isReadOnly(): boolean {
    return !this.keypair;
  }

  disconnect(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Polls a submitted transaction hash until it confirms.
   *
   * @returns A {@link TransactionResult} once the transaction reaches
   *   `SUCCESS`.
   * @throws {VeriTixError} with code `TransactionFailed` when the chain
   *   reports the transaction failed, or `WatchTimeout` when the timeout
   *   elapses before a terminal status is seen.
   */
  async watchTransaction(hash: string, options: WatchOptions = {}): Promise<TransactionResult> {
    this.requireConnected();
    const intervalMs = options.intervalMs ?? 1_000;
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);

    for (;;) {
      const response = await this.server!.getTransaction!(hash);
      if (response.status === 'SUCCESS') {
        return {
          hash,
          ledger: response.ledger ?? 0,
          successful: true,
          returnValue: response.returnValue,
        };
      }
      if (response.status === 'FAILED') {
        throw new VeriTixError(
          VeriTixErrorCode.TransactionFailed,
          `Transaction ${hash} was included in a ledger but failed`,
        );
      }
      if (Date.now() >= deadline) {
        throw new VeriTixError(
          VeriTixErrorCode.WatchTimeout,
          `Timed out watching transaction ${hash}`,
        );
      }
      await sleep(intervalMs);
    }
  }

  /**
   * Async-iterates over escrow state, yielding only on an actual state change
   * and completing once the escrow is settled (released or refunded).
   *
   * Throws `WatchTimeout` when the deadline elapses without a settlement.
   */
  async *watchEscrow(id: bigint, options: WatchOptions = {}): AsyncIterableIterator<EscrowRecord> {
    this.requireConnected();
    const intervalMs = options.intervalMs ?? 1_000;
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    let last: EscrowRecord | undefined;

    for (;;) {
      const record = await this.escrow.getEscrow(id);
      if (record.released || record.refunded) {
        yield record;
        return;
      }
      if (last && escrowChanged(record, last)) {
        yield record;
      }
      last = record;
      if (Date.now() >= deadline) {
        throw new VeriTixError(VeriTixErrorCode.WatchTimeout, `Timed out watching escrow ${id}`);
      }
      await sleep(intervalMs);
    }
  }

  on(event: 'connected', listener: (data: { ledger: number }) => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'retry', listener: (data: { attempt: number; delayMs: number }) => void): this;
  on(event: 'error', listener: (err: VeriTixError) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(...args);
    }
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new VeriTixError(VeriTixErrorCode.NotConnected, 'call connect() before using this method');
    }
  }

  private async readEscrow(id: bigint): Promise<EscrowRecord> {
    if (!this.server?.simulateTransaction) {
      throw new VeriTixError(VeriTixErrorCode.NotConnected, 'call connect() before reading escrow state');
    }
    const result = await this.server.simulateTransaction(
      this.buildContractCall('get_escrow', [bigintToScVal(id, 'u64')]),
    );
    const retval = (result as { result?: { retval?: xdr.ScVal } } | undefined)?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(VeriTixErrorCode.SimulationFailed, `get_escrow(${id}) simulation returned no value`);
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
}

function escrowChanged(a: EscrowRecord, b: EscrowRecord): boolean {
  return (
    a.released !== b.released ||
    a.refunded !== b.refunded ||
    a.amount !== b.amount ||
    a.beneficiary !== b.beneficiary ||
    a.depositor !== b.depositor ||
    a.expiryLedger !== b.expiryLedger
  );
}