/**
 * @module client
 * VeriTixClient — the single entry point for the VeriTix contract SDK.
 *
 * The client owns the network config, an optional signing {@link Keypair}, and
 * the connection state consumed by every module. This slice covers the
 * connection-state helpers (#608) and `healthCheck()` (#607), plus
 * `getCurrentLedger()` / `getContractMetadata()` (#612) and `getAccountInfo()`
 * (#613).
 */
import {
  Account as StellarAccount,
  Contract,
  Horizon,
  Keypair,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import { VeriTixError, VeriTixErrorCode } from './utils/errors';
import { DUMMY_PUBLIC_KEY, assertValidAddress } from './utils/network';
import type { NetworkConfig } from './utils/network';

/** TTL (ms) before the ledger cache is considered stale. */
const LEDGER_TTL_MS = 5_000;

/** Result of {@link VeriTixClient.healthCheck}. */
export interface HealthStatus {
  /** Whether the configured RPC endpoint responded. */
  rpcReachable: boolean;
  /** Whether a simulation probe against the contract succeeded. */
  contractFound: boolean;
  /** Round-trip latency of the RPC probe in milliseconds. */
  latencyMs: number;
}

/** Metadata returned by {@link VeriTixClient.getContractMetadata}. */
export interface ContractMetadata {
  name: string;
  symbol: string;
  decimals: number;
  /** Contract version when the contract exposes it; otherwise `undefined`. */
  version?: string;
}

/** Account summary returned by {@link VeriTixClient.getAccountInfo}. */
export interface AccountInfo {
  address: string;
  /** Native (XLM) balance, as a decimal string. */
  balance: string;
  /** Account sequence number, as a decimal string. */
  sequence: string;
}

type ClientListener = (...args: unknown[]) => void;

export class VeriTixClient {
  readonly config: NetworkConfig;
  connected = false;
  /** Soroban RPC server, created lazily on connect(); tests inject a mock. */
  server: {
    getLatestLedger(): Promise<{ sequence: number }>;
    getTransaction?(hash: string): Promise<unknown>;
    simulateTransaction?(tx: unknown): Promise<unknown>;
  } | null = null;
  ledgerCache: { sequence: number; fetchedAt: number } | null = null;

  private readonly keypair?: Keypair;
  private readonly listeners = new Map<string, Set<ClientListener>>();

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
  }

  /**
   * The public key of the configured keypair, or `null` when the client is
   * read-only (no keypair configured).
   */
  getPublicKey(): string | null {
    return this.keypair ? this.keypair.publicKey() : null;
  }

  /** Whether {@link connect} has succeeded and not been disconnected yet. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Whether the client lacks a signer (no keypair configured). */
  isReadOnly(): boolean {
    return !this.keypair;
  }

  /** Marks the client disconnected and emits the `disconnected` event. */
  disconnect(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Reports RPC reachability, contract presence, and latency.
   *
   * Unlike other methods this resolves (rather than throws) when the network
   * is down, so callers can render a status panel.
   *
   * @throws {VeriTixError} with code `NotConnected` when the client has not
   *   connected yet — `connect()` must have run first.
   */
  async healthCheck(): Promise<HealthStatus> {
    this.requireConnected();
    const startedAt = Date.now();

    let rpcReachable = false;
    try {
      await this.server!.getLatestLedger();
      rpcReachable = true;
    } catch {
      rpcReachable = false;
    }

    const latencyMs = Date.now() - startedAt;

    let contractFound = false;
    if (rpcReachable && this.server?.simulateTransaction) {
      try {
        const probe = await this.server.simulateTransaction(this.buildContractCall('name'));
        contractFound = Boolean((probe as { result?: unknown } | undefined)?.result);
      } catch {
        contractFound = false;
      }
    }

    return { rpcReachable, contractFound, latencyMs };
  }

  /**
   * Returns the current ledger sequence number, cached for
   * {@link LEDGER_TTL_MS} so deadline math never hammers the RPC.
   *
   * @throws {VeriTixError} with code `NotConnected` when the client has not
   *   connected yet. RPC failures propagate unchanged.
   */
  async getCurrentLedger(): Promise<number> {
    this.requireConnected();
    if (this.ledgerCache && Date.now() - this.ledgerCache.fetchedAt < LEDGER_TTL_MS) {
      return this.ledgerCache.sequence;
    }
    const info = await this.server!.getLatestLedger();
    this.ledgerCache = { sequence: info.sequence, fetchedAt: Date.now() };
    return info.sequence;
  }

  /**
   * Reads the token name, symbol, decimals, and (when exposed) contract
   * version in a single metadata call.
   */
  async getContractMetadata(): Promise<ContractMetadata> {
    this.requireConnected();
    const [name, symbol, decimals] = await Promise.all([
      this.simulateRead('name') as Promise<string>,
      this.simulateRead('symbol') as Promise<string>,
      this.simulateRead('decimals') as Promise<number>,
    ]);

    let version: string | undefined;
    try {
      const versionValue = await this.simulateRead('version');
      version = typeof versionValue === 'string' ? versionValue : String(versionValue);
    } catch {
      version = undefined;
    }

    return { name, symbol, decimals, version };
  }

  /**
   * Fetches an account's native balance and sequence from Horizon.
   *
   * @throws {VeriTixError} with code `AccountNotFound` when the account does
   *   not exist on the configured network — never a zeroed object.
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    assertValidAddress(address, 'account');
    const horizon = new Horizon.Server(this.config.horizonUrl);
    try {
      const account = await horizon.loadAccount(address);
      const native = account.balances.find((entry) => entry.asset_type === 'native');
      const balance =
        native && 'balance' in native && typeof native.balance === 'string'
          ? native.balance
          : '0.0000000';
      return { address, balance, sequence: String(account.sequence) };
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        throw new VeriTixError(
          VeriTixErrorCode.AccountNotFound,
          `Account ${address} does not exist on ${this.config.network}`,
        );
      }
      throw err;
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

  private async simulateRead(method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const server = this.server;
    if (!server?.simulateTransaction) {
      throw new VeriTixError(
        VeriTixErrorCode.SimulationFailed,
        `Simulation of ${method} is unavailable without an RPC server`,
      );
    }
    const result = await server.simulateTransaction(this.buildContractCall(method, args));
    const retval = (result as { result?: { retval?: xdr.ScVal } } | undefined)?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(VeriTixErrorCode.SimulationFailed, `Simulation of ${method} returned no value`);
    }
    return scValToNative(retval);
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
