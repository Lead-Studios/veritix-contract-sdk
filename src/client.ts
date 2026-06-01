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

import type { NetworkConfig, SimulationResult, ContractMetadata } from './types/index';
import { buildContractCall, simulateTransaction } from './utils/transaction';
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
      const dummyKeypair = Keypair.random();
      const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

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
