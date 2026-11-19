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
  Horizon,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import { DisputeModule } from './modules/dispute';
import { SplitterModule } from './modules/splitter';
import { RecurringModule } from './modules/recurring';
import { AdminModule } from './modules/admin';
import { TokenModule } from './modules/token';
import { EscrowModule } from './modules/escrow';
import { BatchModule } from './modules/batch';
import { PauseControlModule } from './modules/pause-control';
import { EscrowRefundModule } from './modules/escrow-refund';
import { AdminRotationModule } from './modules/admin-rotation';
import type { EscrowRecord, TransactionResult } from './types';
import { VeriTixError, VeriTixErrorCode } from './utils/errors';
import { DUMMY_PUBLIC_KEY, assertValidAddress } from './utils/network';
import type { NetworkConfig } from './utils/network';
import {
  buildContractCall as buildTransaction,
  simulateTransaction as prepareTransaction,
  submitTransaction,
} from './utils/transaction';

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

export interface WatchOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface WatchServer {
  getLatestLedger(): Promise<{ sequence: number }>;
  getTransaction?(hash: string): Promise<{
    status: string;
    ledger?: number;
    returnValue?: unknown;
  }>;
  simulateTransaction?(tx: unknown): Promise<unknown>;
}

/** Listener signatures for each event emitted by {@link VeriTixClient}. */
export interface ClientEvents {
  connected: (data: { ledger: number }) => void;
  disconnected: () => void;
  retry: (data: { attempt: number; delayMs: number }) => void;
  error: (err: VeriTixError) => void;
}

type ClientListener = (...args: unknown[]) => void;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class VeriTixClient {
  readonly config: NetworkConfig;
  private connected = false;
  /** Soroban RPC server, created on connect(); see {@link useServerForTesting}. */
  private server: WatchServer | null = null;
  private ledgerCache: { sequence: number; fetchedAt: number } | null = null;
  /** Horizon client, created lazily on first use and reused afterwards. */
  private horizon: Horizon.Server | null = null;

  readonly batch: BatchModule;
  readonly pauseControl: PauseControlModule;
  readonly escrowRefund: EscrowRefundModule;
  readonly adminRotation: AdminRotationModule;
  readonly token: TokenModule;
  readonly escrow: EscrowModule;
  readonly dispute: DisputeModule;
  readonly splitter: SplitterModule;
  readonly recurring: RecurringModule;
  readonly admin: AdminModule;
  private readonly keypair?: Keypair;
  private readonly listeners = new Map<string, Set<ClientListener>>();

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
    const invokeTx = (m: string, a: unknown[]) => this.invoke(m, a) as Promise<TransactionResult>;
    this.batch = new BatchModule({ invoke: (m, a) => this.invoke(m, a) });
    this.pauseControl = new PauseControlModule({
      invoke: invokeTx,
      simulate: (m, a) => this.simulate(m, a),
      getPublicKey: () => this.getPublicKey(),
    });
    this.escrowRefund = new EscrowRefundModule({ invoke: invokeTx });
    this.adminRotation = new AdminRotationModule({
      invoke: invokeTx,
      simulate: (m, a) => this.simulate(m, a),
    });
    this.token = new TokenModule(config, keypair);
    this.escrow = new EscrowModule(config, keypair);
    this.dispute = new DisputeModule(
      { simulateRead: (m, a) => this.simulate(m, a) },
      { simulateRead: (m, a) => this.simulate(m, a), invoke: (m, a) => this.invoke(m, a) },
    );
    this.splitter = new SplitterModule(
      { simulateRead: (m, a) => this.simulate(m, a) },
      { invoke: (m, a) => this.invoke(m, a) },
    );
    this.recurring = new RecurringModule(
      { simulateRead: (m, a) => this.simulate(m, a) },
      { invoke: (m, a) => this.invoke(m, a) },
    );
    this.admin = new AdminModule({
      simulate: (m, a) => this.simulate(m, a),
      invoke: (m, a) => this.invoke(m, a),
      getPublicKey: () => this.getPublicKey(),
    });
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

  /**
   * Test hook: injects a mock RPC server and marks the client connected,
   * without opening a network connection.
   *
   * @internal
   */
  useServerForTesting(server: WatchServer): void {
    this.server = server;
    this.connected = true;
  }

  /** Whether the client lacks a signer (no keypair configured). */
  isReadOnly(): boolean {
    return !this.keypair;
  }

  /** Marks the client disconnected and emits the `disconnected` event. */
  disconnect(): void {
    this.connected = false;
    // #787 — dropping only the flag left `server` wired into both modules, so
    // `client.token.balance(...)` still reached the network after disconnect()
    // and a reconnect inside the ledger TTL could serve a stale cached ledger.
    this.server = null;
    this.token.server = null;
    this.escrow.server = null;
    this.ledgerCache = null;
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
        const probe = await this.server.simulateTransaction(await this.buildReadCall('name'));
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
   *
   * @throws {VeriTixError} with code `SimulationFailed` when `name` or
   *   `symbol` is not a string, or `decimals` is not a non-negative safe integer.
   */
  async getContractMetadata(): Promise<ContractMetadata> {
    this.requireConnected();
    const [rawName, rawSymbol, rawDecimals] = await Promise.all([
      this.simulateRead('name'),
      this.simulateRead('symbol'),
      this.simulateRead('decimals'),
    ]);
    const name = expectString(rawName, 'name');
    const symbol = expectString(rawSymbol, 'symbol');
    const decimals = expectDecimals(rawDecimals);

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
   *   not exist on the configured network — never a zeroed object — or
   *   `ConnectionFailed` (carrying the original error as `cause`) for any other
   *   Horizon failure.
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    assertValidAddress(address, 'account');
    try {
      const account = await this.getHorizon().loadAccount(address);
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
      if (err instanceof VeriTixError) throw err;
      throw new VeriTixError(
        VeriTixErrorCode.ConnectionFailed,
        `Failed to load account ${address} from ${this.config.horizonUrl}`,
        err instanceof Error ? err.message : String(err),
        err,
      );
    }
  }

  /** Returns the shared Horizon client, creating it on first use. */
  private getHorizon(): Horizon.Server {
    if (!this.horizon) {
      this.horizon = new Horizon.Server(this.config.horizonUrl);
    }
    return this.horizon;
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
   * The first observation is only the baseline for change detection and is
   * **not** yielded, unless the escrow is already settled. Read the current
   * state with `client.escrow.getEscrow(id)` before iterating if you need it.
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
      if (!record) {
        if (Date.now() >= deadline) {
          throw new VeriTixError(VeriTixErrorCode.WatchTimeout, `Timed out watching escrow ${id}`);
        }
        await sleep(intervalMs);
        continue;
      }
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

  /**
   * Simulates a read-only contract call and returns its decoded value.
   */
  async simulate(method: string, args: unknown[] = []): Promise<unknown> {
    this.requireConnected();
    return this.simulateRead(method, args.map((a) => nativeToScVal(a)));
  }

  /**
   * Builds, simulates, signs and submits a state-changing contract call.
   *
   * @throws {VeriTixError} `ReadOnlyClient` without a keypair, `NotConnected`
   *   before `connect()`.
   */
  async invoke(method: string, args: unknown[] = []): Promise<unknown> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        `A Keypair is required to invoke ${method}. Pass it to VeriTixClient.`,
      );
    }
    this.requireConnected();
    const source = new StellarAccount(this.keypair.publicKey(), '0');
    const tx = await buildTransaction(
      source,
      this.config.contractId,
      method,
      args.map((a) => nativeToScVal(a)),
      this.config.networkPassphrase,
    );
    const { transaction } = await prepareTransaction(this.server as never, tx);
    const result = await submitTransaction(this.server as never, transaction, this.keypair);
    return result.returnValue;
  }

  /**
   * Connects to the Soroban RPC server and initializes module connections.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.server = new rpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.rpcUrl.startsWith('http://'),
    }) as unknown as WatchServer;

    try {
      await this.server.getLatestLedger();
      this.connected = true;
      this.token.server = this.escrow.server = this.server as EscrowModule['server'];
      this.emit('connected', { ledger: await this.getCurrentLedger() });
    } catch (err) {
      this.server = null;
      throw new VeriTixError(
        VeriTixErrorCode.ConnectionFailed,
        `Failed to connect to ${this.config.rpcUrl}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Subscribes `listener` to `event`.
   *
   * @returns A function that removes the subscription again, so a component can
   *   unsubscribe on unmount.
   */
  on<E extends keyof ClientEvents>(event: E, listener: ClientEvents[E]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as unknown as ClientListener);
    return () => this.off(event, listener);
  }

  /** Removes a listener previously added with {@link on}. A no-op if absent. */
  off<E extends keyof ClientEvents>(event: E, listener: ClientEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as unknown as ClientListener);
    if (set.size === 0) this.listeners.delete(event);
  }

  /**
   * Like {@link on}, but the listener is removed after its first call.
   *
   * @returns A function that cancels the subscription before it fires.
   */
  once<E extends keyof ClientEvents>(event: E, listener: ClientEvents[E]): () => void {
    const wrapper: ClientListener = (...args) => {
      this.off(event, wrapper as unknown as ClientEvents[E]);
      (listener as unknown as ClientListener)(...args);
    };
    return this.on(event, wrapper as unknown as ClientEvents[E]);
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(...args);
      } catch (err) {
        // #786 — a listener must never decide the caller's outcome. `connect()`
        // emits `connected` inside its own try block, so an unguarded throw here
        // turned a successful connect into `ConnectionFailed` and discarded the
        // server. Failures are reported on `error` instead, and the guard stops a
        // throwing `error` listener from recursing.
        if (event !== 'error') {
          this.emit(
            'error',
            err instanceof VeriTixError
              ? err
              : new VeriTixError(VeriTixErrorCode.HostError, String(err)),
          );
        }
      }
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
    const result = await server.simulateTransaction(await this.buildReadCall(method, args));
    const retval = (result as { result?: { retval?: xdr.ScVal } } | undefined)?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(VeriTixErrorCode.SimulationFailed, `Simulation of ${method} returned no value`);
    }
    return scValToNative(retval);
  }

  /** Builds an unsigned read-only call through the shared transaction helper. */
  private buildReadCall(method: string, args: xdr.ScVal[] = []): Promise<Transaction> {
    return buildTransaction(
      this.server,
      new StellarAccount(DUMMY_PUBLIC_KEY, '0'),
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );
  }
}

function toScVal(value: unknown): xdr.ScVal {
  if (value instanceof xdr.ScVal) return value;
  if (typeof value === 'string' && /^[GC][A-Z2-7]{55}$/.test(value)) return addressToScVal(value);
  return nativeToScVal(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new VeriTixError(
      VeriTixErrorCode.SimulationFailed,
      `getContractMetadata: expected \`${field}\` to be a string, got ${typeof value}`,
    );
  }
  return value;
}

/** Accepts a non-negative safe integer given as a `number` or `bigint`. */
function expectDecimals(value: unknown): number {
  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  throw new VeriTixError(
    VeriTixErrorCode.SimulationFailed,
    `getContractMetadata: expected \`decimals\` to be a non-negative integer, got ${typeof value}`,
  );
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
