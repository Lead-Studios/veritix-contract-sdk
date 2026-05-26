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

import { SorobanRpc, Keypair } from '@stellar/stellar-sdk';

import type { NetworkConfig } from './types/index';
import { TokenModule } from './modules/token';
import { EscrowModule } from './modules/escrow';
import { DisputeModule } from './modules/dispute';
import { SplitterModule } from './modules/splitter';
import { RecurringModule } from './modules/recurring';
import { AdminModule } from './modules/admin';
import { BatchModule } from './modules/batch';

/**
 * The primary SDK class.  One instance per contract / network pair.
 *
 * Instantiate it, call {@link connect}, then access feature modules via the
 * named properties.
 */
export class VeriTixClient {
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
  // Connection
  // -------------------------------------------------------------------------

  /**
   * Initialises the Soroban RPC server connection and verifies it is reachable
   * by fetching the current ledger sequence.
   *
   * Must be called before any write operation (read operations that use
   * simulation also require an active connection).
   *
   * @returns The current Stellar ledger sequence number.
   * @throws If the RPC endpoint is unreachable or returns an error.
   *
   * @example
   * ```ts
   * const ledger = await client.connect();
   * console.log('Connected — current ledger:', ledger);
   * ```
   */
  async connect(): Promise<number> {
    // TODO: implement
    // Suggested steps:
    //   1. new SorobanRpc.Server(this.config.rpcUrl, { allowHttp: false })
    //   2. server.getLatestLedger() to verify connectivity
    //   3. Store server reference; set this.connected = true
    //   4. Return latestLedger.sequence
    void SorobanRpc;
    this.connected = true; // placeholder so TypeScript doesn't warn
    throw new Error('VeriTixClient.connect: not implemented');
  }

  /**
   * Returns `true` if {@link connect} has been called successfully.
   */
  isConnected(): boolean {
    return this.connected;
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
    // We use a Proxy so the error is deferred until a module actually tries
    // to use the server, not at construction time.
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
