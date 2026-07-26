/**
 * @module client
 * Entry point for the VeriTix Contract SDK.
 *
 * {@link VeriTixClient} is the single object consumers interact with.
 * It owns the Soroban RPC connection and exposes namespaced module instances
 * for every contract feature area.
 *
 * @example
 * ```ts
 * import { VeriTixClient, getTestnetConfig } from '@veritix/contract-sdk';
 * import { Keypair } from '@stellar/stellar-sdk';
 *
 * const config  = getTestnetConfig('CXXXXXXX…');
 * const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
 * const client  = new VeriTixClient(config, keypair);
 *
 * await client.connect();
 *
 * const result = await client.escrow.createEscrow({
 *   beneficiary: 'GABC…',
 *   amount: 1_000_000n,
 *   expiryLedger: 1_000_000,
 * });
 * console.log('Escrow tx hash:', result.hash);
 * ```
 */

import { SorobanRpc, Keypair, xdr } from '@stellar/stellar-sdk';

import type {
  NetworkConfig,
  SimulationResult,
  ContractMetadata,
  TransactionResult,
  StellarNetwork,
  WatchOptions,
  EscrowRecord,
  HealthStatus,
  ContractSummary,
} from './types/index';
import { buildContractCall, simulateTransaction } from './utils/transaction';
import { DUMMY_PUBLIC_KEY, getMainnetConfig, getTestnetConfig } from './utils/network';
import { EventEmitter } from 'events';
import { VeriTixError, VeriTixErrorCode } from './utils/errors';
import { TokenModule } from './modules/token';
import { EscrowModule } from './modules/escrow';
import { DisputeModule } from './modules/dispute';
import { SplitterModule } from './modules/splitter';
import { RecurringModule } from './modules/recurring';
import { AdminModule } from './modules/admin';
import { BatchModule } from './modules/batch';

/** Strongly-typed event map for VeriTixClient */
export interface VeriTixClientEvents {
  connected: (data: { ledger: number }) => void;
  disconnected: () => void;
  error: (err: VeriTixError) => void;
  retry: (data: { attempt: number; delayMs: number }) => void;
}

/**
 * The primary SDK class.  One instance per contract / network pair.
 *
 * Instantiate it, call {@link connect}, then access feature modules via the
 * named properties.
 */
export class VeriTixClient extends EventEmitter {
  /** Network + contract configuration supplied at construction time */
  public readonly config: NetworkConfig;

  /** Token operations: mint, burn, transfer, approve, balance */
  public readonly token: TokenModule;

  /** Escrow operations: create, release, refund, getEscrow */
  public readonly escrow: EscrowModule;

  /** Dispute operations: open, resolve, getDispute */
  public readonly dispute: DisputeModule;

  /** Payment splitter operations: createSplit, distribute, getSplit */
  public readonly splitter: SplitterModule;

  /** Recurring payment operations: setup, execute, cancel, getRecurring */
  public readonly recurring: RecurringModule;

  /** Admin operations: setAdmin, freeze, unfreeze, clawback, pause */
  public readonly admin: AdminModule;

  /** Batch operations: mintBatch, transferBatch, freezeBatch */
  public readonly batch: BatchModule;

  private server!: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;
  private connected = false;

  /** Cache for getCurrentLedger — { sequence, fetchedAt } */
  private ledgerCache: { sequence: number; fetchedAt: number } | null = null;
  private static readonly LEDGER_CACHE_TTL_MS = 5_000;

  /**
   * Creates a new `VeriTixClient`.
   *
   * @param config  - Network and contract configuration.
   *                  Use {@link getTestnetConfig} or {@link getMainnetConfig}
   *                  to build this object conveniently.
   * @param keypair - Optional Stellar `Keypair` used to sign write transactions.
   *                  Omit for read-only usage.
   */
  constructor(config: NetworkConfig, keypair?: Keypair) {
    super();
    this.config = config;
    this.keypair = keypair;

    // Modules are created eagerly; they receive `this.server` by reference
    // after connect() sets it up.  Module methods must call connect() guard.
    const lazyServer = this.getLazyServer();

    this.token = new TokenModule(config, lazyServer, keypair);
    this.escrow = new EscrowModule(config, lazyServer, keypair);
    this.dispute = new DisputeModule(config, lazyServer, keypair);
    this.splitter = new SplitterModule(config, lazyServer, keypair);
    this.recurring = new RecurringModule(config, lazyServer, keypair);
    this.admin = new AdminModule(config, lazyServer, keypair);
    this.batch = new BatchModule(config, lazyServer, keypair);
  }

  // -------------------------------------------------------------------------
  // Static factories
  // -------------------------------------------------------------------------

  /**
   * Builds a {@link VeriTixClient} from environment variables.  Intended for
   * server-side / worker use where {@link NetworkConfig} values are loaded
   * from `process.env` rather than constructed in code.
   *
   * Recognised variables (case-sensitive, all optional except as noted):
   * - `VERITIX_CONTRACT_ID`        (required) — Soroban contract ID.
   * - `STELLAR_NETWORK`            (default `'testnet'`) — `'testnet'` | `'mainnet'`.
   * - `VERITIX_RPC_URL`            (optional) — overrides the network default.
   * - `VERITIX_NETWORK_PASSPHRASE` (optional) — overrides the network default.
   * - `VERITIX_SECRET_KEY`         (optional) — Stellar secret key.  When
   *   present the returned client can sign write transactions; otherwise it
   *   is read-only.
   *
   * Accepts an env-shaped object so callers can inject test values without
   * mutating global `process.env`.
   *
   * @param env - Optional env-like object. Defaults to `process.env`.
   * @returns A new `VeriTixClient` (caller must still call `connect()`).
   * @throws {VeriTixError} `InvalidAddress` if `VERITIX_CONTRACT_ID` is missing
   *   or if `STELLAR_NETWORK` / `VERITIX_SECRET_KEY` are present but malformed.
   *
   * @example
   * ```ts
   * // Server entry-point
   * const client = VeriTixClient.fromEnvironment();
   * await client.connect();
   * ```
   */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): VeriTixClient {
    const source: NodeJS.ProcessEnv = env ?? {};

    // VERITIX_CONTRACT_ID — required.
    const rawContractId = source.VERITIX_CONTRACT_ID;
    if (typeof rawContractId !== 'string' || rawContractId.trim().length === 0) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'VeriTixClient.fromEnvironment: VERITIX_CONTRACT_ID is required and must be a non-empty string',
      );
    }
    const contractId = rawContractId.trim();

    // STELLAR_NETWORK — default 'testnet'; must be 'testnet' or 'mainnet'.
    const networkRaw = (source.STELLAR_NETWORK ?? 'testnet').toString().trim().toLowerCase();
    if (networkRaw !== 'testnet' && networkRaw !== 'mainnet') {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        `VeriTixClient.fromEnvironment: STELLAR_NETWORK must be 'testnet' or 'mainnet', got ${JSON.stringify(
          source.STELLAR_NETWORK,
        )}`,
      );
    }
    const network: StellarNetwork = networkRaw;

    // Build base config from the network helper, then layer optional overrides.
    const baseConfig: NetworkConfig =
      network === 'mainnet' ? getMainnetConfig(contractId) : getTestnetConfig(contractId);
    const rpcOverride = source.VERITIX_RPC_URL;
    const passphraseOverride = source.VERITIX_NETWORK_PASSPHRASE;
    const config: NetworkConfig = {
      ...baseConfig,
      rpcUrl:
        typeof rpcOverride === 'string' && rpcOverride.length > 0 ? rpcOverride : baseConfig.rpcUrl,
      networkPassphrase:
        typeof passphraseOverride === 'string' && passphraseOverride.length > 0
          ? passphraseOverride
          : baseConfig.networkPassphrase,
    };

    // VERITIX_SECRET_KEY — optional; attaches a Keypair for write operations.
    let keypair: Keypair | undefined;
    const secret = source.VERITIX_SECRET_KEY;
    if (typeof secret === 'string' && secret.length > 0) {
      try {
        keypair = Keypair.fromSecret(secret);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new VeriTixError(
          VeriTixErrorCode.InvalidAddress,
          `VeriTixClient.fromEnvironment: VERITIX_SECRET_KEY is malformed: ${reason}`,
        );
      }
    }

    return new VeriTixClient(config, keypair);
  }

  // -------------------------------------------------------------------------
  // Typed event emitter overloads
  // -------------------------------------------------------------------------

  on<K extends keyof VeriTixClientEvents>(event: K, listener: VeriTixClientEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof VeriTixClientEvents>(
    event: K,
    ...args: Parameters<VeriTixClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  /**
   * Initialises the Soroban RPC server connection and verifies it is reachable
   * by fetching the current ledger sequence.
   *
   * Retries with exponential backoff up to `config.retries` times (default 3).
   *
   * @returns The current Stellar ledger sequence number.
   * @throws {VeriTixError} With code `CONNECTION_FAILED` if unreachable after all retries.
   *
   * @example
   * ```ts
   * const ledger = await client.connect();
   * console.log('Connected — current ledger:', ledger);
   * ```
   */
  async connect(): Promise<number> {
    this.server = new SorobanRpc.Server(this.config.rpcUrl, { allowHttp: false });
    const ledger = await this.server.getLatestLedger();
    this.connected = true;
    return ledger.sequence;
    const retries = this.config.retries ?? 3;
    const retryDelayMs = this.config.retryDelayMs ?? 1_000;

    this.server = new SorobanRpc.Server(this.config.rpcUrl, { allowHttp: false });

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const latestLedger = await this.server.getLatestLedger();
        this.connected = true;
        this.ledgerCache = { sequence: latestLedger.sequence, fetchedAt: Date.now() };
        this.emit('connected', { ledger: latestLedger.sequence });
        return latestLedger.sequence;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          const delayMs = retryDelayMs * Math.pow(2, attempt);
          this.emit('retry', { attempt: attempt + 1, delayMs });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    const error = new VeriTixError(
      VeriTixErrorCode.ConnectionFailed,
      `Failed to connect to RPC at ${this.config.rpcUrl}: ${String(lastError)}`,
    );
    this.emit('error', error);
    throw error;
  }

  /**
   * Releases the server connection and resets client state.
   * Emits a `disconnected` event.
   */
  disconnect(): void {
    this.connected = false;
    this.server = null as unknown as SorobanRpc.Server;
    this.ledgerCache = null;
    this.emit('disconnected');
  }

  /**
   * Returns `true` if {@link connect} has been called successfully.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Returns `true` when no `Keypair` was supplied — write operations will
   * throw `VeriTixError` with code `READ_ONLY_CLIENT`.
   */
  isReadOnly(): boolean {
    return !this.keypair;
  }

  // -------------------------------------------------------------------------
  // Simulation  (#77)
  // -------------------------------------------------------------------------

  /**
   * Dry-runs any contract method without submitting a transaction.
   * Works without a `Keypair` — no XLM is spent.
   *
   * @param method - Contract function name to invoke.
   * @param args   - Ordered XDR `ScVal` arguments.
   * @returns A {@link SimulationResult} with the return value and estimated fee.
   *
   * @example
   * ```ts
   * const result = await client.simulate('get_escrow', [nativeToScVal(1n, { type: 'u64' })]);
   * if (result.success) console.log('Return value:', result.returnValue);
   * ```
   */
  async simulate(method: string, args: xdr.ScVal[]): Promise<SimulationResult> {
    if (!this.connected) {
      throw new Error('VeriTixClient: call connect() before simulate()');
    }

    try {
      // Use a throwaway source account (simulation does not require a real funded account)
      const { Account } = await import('@stellar/stellar-sdk');
      const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

      const tx = await buildContractCall(
        this.server,
        sourceAccount,
        this.config.contractId,
        method,
        args,
        this.config.networkPassphrase,
      );

      const { transaction, simulatedFee } = await simulateTransaction(this.server, tx);

      // Extract the return value from the simulation result XDR if available
      const rawResult = await this.server.simulateTransaction(tx);
      const returnValue =
        SorobanRpc.Api.isSimulationSuccess(rawResult) && rawResult.result
          ? rawResult.result.retval
          : undefined;

      void transaction; // assembled tx not needed for simulate-only path

      return {
        success: true,
        returnValue,
        estimatedFee: simulatedFee,
      };
    } catch (err) {
      return {
        success: false,
        returnValue: undefined,
        estimatedFee: '0',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Convenience methods
  // -------------------------------------------------------------------------

  /**
   * Returns the current ledger sequence number.
   * Result is cached for 5 seconds to avoid hammering the RPC.
   *
   * @throws If not connected.
   */
  async getCurrentLedger(): Promise<number> {
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before using module methods');
    }
    const now = Date.now();
    if (
      this.ledgerCache &&
      now - this.ledgerCache.fetchedAt < VeriTixClient.LEDGER_CACHE_TTL_MS
    ) {
      return this.ledgerCache.sequence;
    }
    const latestLedger = await this.server.getLatestLedger();
    this.ledgerCache = { sequence: latestLedger.sequence, fetchedAt: now };
    return latestLedger.sequence;
  }

  /**
   * Polls the RPC until the transaction is confirmed or fails.
   *
   * @param hash    - Stellar transaction hash to watch.
   * @param options - Polling interval and timeout options.
   * @returns Resolved {@link TransactionResult} when the transaction is confirmed.
   * @throws {VeriTixError} `TRANSACTION_FAILED` if the transaction fails.
   * @throws {VeriTixError} `WATCH_TIMEOUT` after `timeoutMs` ms.
   */
  async watchTransaction(hash: string, options?: WatchOptions): Promise<TransactionResult> {
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before using module methods');
    }
    const intervalMs = options?.intervalMs ?? 2_000;
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (Date.now() >= deadline) {
          return reject(
            new VeriTixError(VeriTixErrorCode.WatchTimeout, `Transaction ${hash} timed out after ${timeoutMs}ms`),
          );
        }
        try {
          const result = await this.server.getTransaction(hash);
          if (result.status === 'SUCCESS') {
            return resolve({
              hash,
              ledger: (result as { ledger?: number }).ledger ?? 0,
              successful: true,
              returnValue: (result as { returnValue?: unknown }).returnValue,
            });
          }
          if (result.status === 'FAILED') {
            return reject(
              new VeriTixError(VeriTixErrorCode.TransactionFailed, `Transaction ${hash} failed`),
            );
          }
          // NOT_FOUND or PENDING — keep polling
          setTimeout(poll, intervalMs);
        } catch {
          setTimeout(poll, intervalMs);
        }
      };
      void poll();
    });
  }

  /**
   * Fetches token metadata: name, symbol, decimals, totalSupply, contractId, network.
   *
   * @throws If not connected.
   */
  async getContractMetadata(): Promise<ContractMetadata> {
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before using module methods');
    }
    const [name, symbol, decimal, totalSupply] = await Promise.all([
      this.token.name(),
      this.token.symbol(),
      this.token.decimals(),
      this.token.totalSupply(),
    ]);
    return {
      name,
      symbol,
      decimal,
      totalSupply,
      contractId: this.config.contractId,
      network: this.config.network,
    };
  }

  // -------------------------------------------------------------------------
  // healthCheck  (#282)
  // -------------------------------------------------------------------------

  /**
   * Verifies RPC connectivity and confirms the contract exists on-chain.
   *
   * Performs two checks in sequence:
   * 1. Calls `server.getLatestLedger()` to confirm the RPC is reachable and
   *    records the round-trip latency.
   * 2. Calls `server.getContractData(contractId, ...)` to confirm the contract
   *    is deployed.
   *
   * The method **never throws** — any failures are captured in `errors[]`.
   * This makes it safe to call during server start-up or health-endpoint
   * handlers without a try/catch.
   *
   * @returns A {@link HealthStatus} object with the results of both checks.
   *
   * @example
   * ```ts
   * const status = await client.healthCheck();
   * if (!status.rpcReachable) {
   *   console.error('RPC is down:', status.errors);
   * } else if (!status.contractFound) {
   *   console.warn('Contract not found — wrong contractId?');
   * } else {
   *   console.log(`Healthy — ledger ${status.latestLedger}, latency ${status.latencyMs}ms`);
   * }
   * ```
   */
  async healthCheck(): Promise<HealthStatus> {
    const status: HealthStatus = {
      rpcReachable: false,
      contractFound: false,
      latencyMs: 0,
      latestLedger: 0,
      errors: [],
    };

    if (!this.server) {
      status.errors.push('VeriTixClient: call connect() before healthCheck()');
      return status;
    }

    // --- Check 1: RPC reachability + latency --------------------------------
    const t0 = Date.now();
    try {
      const ledger = await this.server.getLatestLedger();
      status.latencyMs = Date.now() - t0;
      status.latestLedger = ledger.sequence;
      status.rpcReachable = true;
    } catch (err) {
      status.latencyMs = Date.now() - t0;
      status.errors.push(
        `RPC unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return status;
    }

    // --- Check 2: contract existence ----------------------------------------
    try {
      // getContractData throws / returns NOT_FOUND when the contract doesn't exist
      const { xdr: xdrNs } = await import('@stellar/stellar-sdk');
      const contractKey = xdrNs.LedgerKey.contractData(
        new xdrNs.LedgerKeyContractData({
          contract: new (await import('@stellar/stellar-sdk')).Address(
            this.config.contractId,
          ).toScAddress(),
          key: xdrNs.ScVal.scvLedgerKeyContractInstance(),
          durability: xdrNs.ContractDataDurability.persistent(),
        }),
      );
      const result = await this.server.getLedgerEntries(contractKey);
      status.contractFound = result.entries.length > 0;
      if (!status.contractFound) {
        status.errors.push(
          `Contract not found on-chain: ${this.config.contractId}`,
        );
      }
    } catch (err) {
      status.errors.push(
        `Contract lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return status;
  }

  // -------------------------------------------------------------------------
  // contractSummary  (#283)
  // -------------------------------------------------------------------------

  /**
   * Returns a single compound snapshot of all key contract state fields.
   *
   * All data is fetched in parallel using `Promise.all` to keep latency low.
   * Fields that are unavailable on the contract (e.g. version, counts) fall
   * back to safe zero-values rather than throwing, so the method is always
   * usable for dashboards even on partially-implemented contracts.
   *
   * @returns A {@link ContractSummary} with token info, counts, admin, and
   *   pause state.
   * @throws If not connected (server is not set).
   *
   * @example
   * ```ts
   * const summary = await client.contractSummary();
   * console.log(`${summary.name} (${summary.symbol})`);
   * console.log(`Total supply: ${summary.totalSupply}, holders: ${summary.totalHolders}`);
   * console.log(`Paused: ${summary.isPaused}, admin: ${summary.admin}`);
   * ```
   */
  async contractSummary(): Promise<ContractSummary> {
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before contractSummary()');
    }

    // Helper: simulate a read call, return undefined on any error
    const tryRead = async (method: string): Promise<unknown> => {
      try {
        const { Account, SorobanRpc, scValToNative } = await import('@stellar/stellar-sdk');
        const { buildContractCall: build } = await import('./utils/transaction');
        const { DUMMY_PUBLIC_KEY: dummy } = await import('./utils/network');
        const sourceAccount = new Account(dummy, '0');
        const tx = await build(
          this.server,
          sourceAccount,
          this.config.contractId,
          method,
          [],
          this.config.networkPassphrase,
        );
        const simResult = await this.server.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationError(simResult)) return undefined;
        const retval = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
        return retval !== undefined ? scValToNative(retval) : undefined;
      } catch {
        return undefined;
      }
    };

    const [
      name,
      symbol,
      decimal,
      totalSupply,
      maxSupply,
      totalHolders,
      escrowCount,
      splitCount,
      recurringCount,
      disputeCount,
      isPaused,
      admin,
      version,
    ] = await Promise.all([
      this.token.name().catch(() => ''),
      this.token.symbol().catch(() => ''),
      this.token.decimals().catch(() => 0),
      this.token.totalSupply().catch(() => 0n),
      tryRead('max_supply').then((v) => (v !== undefined ? BigInt(v as bigint) : 0n)),
      this.token.totalHolders().catch(() => 0n),
      tryRead('escrow_count').then((v) => (v !== undefined ? BigInt(v as bigint) : 0n)),
      tryRead('split_count').then((v) => (v !== undefined ? BigInt(v as bigint) : 0n)),
      tryRead('recurring_count').then((v) => (v !== undefined ? BigInt(v as bigint) : 0n)),
      tryRead('dispute_count').then((v) => (v !== undefined ? BigInt(v as bigint) : 0n)),
      tryRead('is_paused').then((v) => v === true),
      tryRead('get_admin').then((v) => (typeof v === 'string' ? v : '')),
      tryRead('version').then((v) => (typeof v === 'string' ? v : '')),
    ]);

    return {
      name,
      symbol,
      decimal,
      totalSupply,
      maxSupply,
      totalHolders,
      escrowCount,
      splitCount,
      recurringCount,
      disputeCount,
      isPaused,
      admin,
      version,
    };
  }

  // -------------------------------------------------------------------------
  // watchEscrow  (#153)
  // -------------------------------------------------------------------------

  /**
   * Polls `getEscrow(id)` at the given interval and yields the record each
   * time `released` or `refunded` flips to `true`.
   *
   * Throws a `VeriTixError` with code `WATCH_TIMEOUT` if no state change is
   * detected within `timeoutMs`.
   *
   * @param id      - Escrow ID to watch.
   * @param options - {@link WatchOptions} (intervalMs, timeoutMs).
   *
   * @example
   * ```ts
   * for await (const record of client.watchEscrow(1n)) {
   *   console.log('Escrow settled:', record);
   *   break;
   * }
   * ```
   */
  async *watchEscrow(id: bigint, options?: WatchOptions): AsyncIterableIterator<EscrowRecord> {
    const intervalMs = options?.intervalMs ?? 3_000;
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const record = await this.escrow.getEscrow(id);
      if (record && (record.released || record.refunded)) {
        yield record;
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }

    throw new VeriTixError(
      VeriTixErrorCode.WatchTimeout,
      `watchEscrow timed out after ${timeoutMs}ms waiting for escrow ${id} to settle`,
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Returns a proxy `SorobanRpc.Server` that throws a helpful error if
   * `connect()` has not been called yet.  Modules hold a reference to this
   * proxy so they surface a clear message instead of a confusing crash.
   *
   * @internal
   */
  private getLazyServer(): SorobanRpc.Server {
    return new Proxy({} as SorobanRpc.Server, {
      get: (_target, prop) => {
        if (!this.connected || !this.server) {
          throw new Error(
            `VeriTixClient: call connect() before using module methods (attempted access to server.${String(prop)})`,
          );
        }
        return (this.server as unknown as Record<string | symbol, unknown>)[prop];
      },
    });
  }
}
