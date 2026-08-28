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

import { SorobanRpc, Keypair, Contract, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import type {
  NetworkConfig,
  SimulationResult,
  ContractMetadata,
  TransactionResult,
  StellarNetwork,
  WatchOptions,
  EscrowRecord,
  UnsignedTxResult,
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
import { createSafeToJSON, createSafeInspect } from './client-security';

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
  protected readonly keypair: Keypair | undefined;
  /** Public key of the external signer (e.g. Freighter wallet) when no local Keypair is present. */
  private externalPublicKey: string | null = null;
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
    if (!config || typeof config.contractId !== 'string' || !StrKey.isValidContract(config.contractId)) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'VeriTixClient: config.contractId must be a valid Soroban contract ID',
      );
    }
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

  /** Serialises the client without exposing the secret keypair. */
  toJSON(): Record<string, unknown> {
    return createSafeToJSON(this)();
  }

  /** Redacts the keypair when the client is logged via console/util.inspect. */
  [Symbol.for('nodejs.util.inspect.custom')](): (depth: number, opts: object) => string {
    return createSafeInspect();
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
    // Guard against browser bundles: a statically-inlined secret key would
    // end up shipped to every client. Require an explicit client in browsers.
    const hasWindow =
      typeof globalThis !== 'undefined' &&
      (globalThis as unknown as { window?: unknown }).window !== undefined;
    if (hasWindow) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'VeriTixClient.fromEnvironment is not available in browser contexts; construct a VeriTixClient explicitly and never inline a secret key',
      );
    }
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

  /**
   * Creates a `VeriTixClient` backed by the Freighter browser-extension wallet.
   *
   * Freighter supplies the signing public key but never exposes its secret key,
   * so the returned client is not directly signable with a local `Keypair`.
   * Instead, write paths are overridden to request signatures from Freighter via
   * `signTransaction(xdr, { networkPassphrase })` and then submit the signed
   * transaction to the network.
   *
   * @param config - Network and contract configuration.
   * @returns A new Freighter-backed `VeriTixClient` (caller must still call
   *          `connect()`).
   * @throws {VeriTixError} With code `InvalidAddress` if Freighter is not
   *   installed or cannot provide a public key.
   *
   * @example
   * ```ts
   * const client = await VeriTixClient.createFromFreighter(getTestnetConfig(contractId));
   * await client.connect();
   * ```
   */
  static async createFromFreighter(config: NetworkConfig): Promise<VeriTixClient> {
    // Freighter is a browser extension — dynamically import it so that this
    // factory can be bundled for server-side / Node environments too, and so
    // the single "Freighter not installed" case can be detected cleanly.
    let freighter: {
      requestAccess: () => Promise<{ address: string } & { error?: unknown }>;
      getAddress: () => Promise<{ address: string } & { error?: unknown }>;
      signTransaction: (
        xdr: string,
        opts?: { networkPassphrase?: string; address?: string },
      ) => Promise<{ signedTxXdr: string; signerAddress: string } & { error?: unknown }>;
    };
    try {
      freighter = (await import('@stellar/freighter-api')) as typeof freighter;
    } catch {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'Freighter wallet not installed. Install the Freighter browser extension to use createFromFreighter().',
      );
    }

    // 1. Request access and resolve the connected account address.
    let accessResult: { address: string } & { error?: unknown };
    try {
      accessResult = await freighter.requestAccess();
    } catch {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'Freighter wallet is not available or access was denied.',
      );
    }

    let publicKey = accessResult?.address ?? '';
    if (!publicKey) {
      // Fall back to getAddress() (older Freighter API) if requestAccess()
      // resolved without an address.
      try {
        const addrResult = await freighter.getAddress();
        publicKey = addrResult?.address ?? '';
      } catch {
        publicKey = '';
      }
    }

    if (!publicKey) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'Freighter could not provide a public key for the connected account.',
      );
    }

    // 2. Build the client. No local Keypair exists — signing happens in Freighter.
    const client = new VeriTixClient(config);
    client.externalPublicKey = publicKey;

    // 3. Override write paths to sign via Freighter then submit.
    const signer = async (tx: Transaction): Promise<Transaction> => {
      const resp = await freighter.signTransaction(tx.toXDR(), {
        networkPassphrase: config.networkPassphrase,
      });
      if (!resp || resp.error || !resp.signedTxXdr) {
        throw new VeriTixError(
          VeriTixErrorCode.TransactionFailed,
          'Freighter failed to sign the transaction.',
        );
      }
      return TransactionBuilder.fromXDR(resp.signedTxXdr, config.networkPassphrase) as Transaction;
    };
    client.token.setSigner(signer);

    return client;
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
   * Performs a lightweight health check of the RPC endpoint and contract.
   *
   * @returns Whether the RPC is reachable, whether the contract was found on
   *          the network, and the measured latency of the RPC call in ms.
   *
   * @example
   * const { rpcReachable, contractFound, latencyMs } = await client.healthCheck();
   */
  async healthCheck(): Promise<{ rpcReachable: boolean; contractFound: boolean; latencyMs: number }> {
    if (!this.connected) {
      throw new VeriTixError(
        VeriTixErrorCode.ConnectionFailed,
        'VeriTixClient: call connect() before healthCheck()',
      );
    }

    const start = Date.now();
    let rpcReachable = false;
    try {
      await this.server.getLatestLedger();
      rpcReachable = true;
    } catch {
      rpcReachable = false;
    }
    const latencyMs = Date.now() - start;

    let contractFound = false;
    if (rpcReachable) {
      try {
        const contract = new Contract(this.config.contractId);
        await this.server.getContractData(contract, xdr.ScVal.scvString(''));
        contractFound = true;
      } catch {
        contractFound = false;
      }
    }

    return { rpcReachable, contractFound, latencyMs };
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

  /**
   * Returns the public key of the signing account configured for this client.
   * For clients created from a `Keypair` this is the keypair's public key; for
   * clients created via {@link createFromFreighter} it is the Freighter wallet
   * address. Returns `null` for fully read-only clients.
   */
  getPublicKey(): string | null {
    return this.keypair?.publicKey() ?? this.externalPublicKey ?? null;
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

  /**
   * Builds and simulates an unsigned `invokeHostFunction` transaction, returning
   * an assembled (fee-bumped) unsigned transaction ready to be signed by an
   * external signer (e.g. a hardware wallet or browser extension).
   *
   * The result can be handed to external signing infrastructure and the signed
   * XDR passed back to {@link submitSignedTx}.
   *
   * @param module          - Feature area name (informational; not used on-chain).
   * @param method          - Contract function name to invoke.
   * @param args            - Ordered XDR `ScVal` arguments.
   * @param sourcePublicKey - Stellar account address that will sign and pay for
   *                          the transaction.
   * @returns An {@link UnsignedTxResult} with the base64 XDR, hash, and fee.
   * @throws If not connected.
   *
   * @example
   * ```ts
   * const unsigned = await client.buildUnsignedTx(
   *   'escrow',
   *   'release_escrow',
   *   [nativeToScVal(1n, { type: 'u64' })],
   *   'GABC…',
   * );
   * // sign unsigned.xdr with an external wallet, then:
   * const result = await client.submitSignedTx(signedXdr);
   * ```
   */
  async buildUnsignedTx(
    module: string,
    method: string,
    args: xdr.ScVal[],
    sourcePublicKey: string,
  ): Promise<UnsignedTxResult> {
    void module; // informational; the method name and args define the invocation.
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before buildUnsignedTx()');
    }

    const { Account } = await import('@stellar/stellar-sdk');
    const sourceAccount = new Account(sourcePublicKey, '0');

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );

    const { transaction, simulatedFee } = await simulateTransaction(this.server, tx);

    return {
      xdr: transaction.toXDR(),
      hash: Buffer.from(transaction.hash()).toString('hex'),
      estimatedFee: simulatedFee,
    };
  }

  /**
   * Submits an externally-signed transaction XDR and waits for on-chain
   * confirmation.
   *
   * Handy companion to {@link buildUnsignedTx} — build an unsigned tx, sign it
   * with an offline / external wallet, then hand the resulting XDR back.
   *
   * @param signedXdr - Base64-encoded, signed Stellar transaction envelope XDR.
   * @returns A confirmed {@link TransactionResult}.
   * @throws If not connected or if the transaction fails.
   *
   * @example
   * ```ts
   * const result = await client.submitSignedTx(signedXdr);
   * console.log('Confirmed in ledger', result.ledger);
   * ```
   */
  async submitSignedTx(signedXdr: string): Promise<TransactionResult> {
    if (!this.connected || !this.server) {
      throw new Error('VeriTixClient: call connect() before submitSignedTx()');
    }

    const tx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase) as Transaction;

    const sendResponse = await this.server.sendTransaction(tx);
    if (sendResponse.status === 'ERROR') {
      throw new VeriTixError(
        VeriTixErrorCode.TransactionFailed,
        'Transaction submission rejected by the network.',
      );
    }

    const hash = sendResponse.hash;
    const result = await this.server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      return {
        hash,
        ledger: (result as { ledger?: number }).ledger ?? 0,
        successful: true,
      };
    }
    if (result.status === 'FAILED') {
      throw new VeriTixError(VeriTixErrorCode.TransactionFailed, 'Transaction failed on-chain.');
    }
    throw new VeriTixError(
      VeriTixErrorCode.Unknown,
      'Transaction not confirmed after submission.',
    );
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
