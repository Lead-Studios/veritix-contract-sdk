/**
 * @module client
 * VeriTixClient — the single entry point for the VeriTix contract SDK.
 *
 * This slice adds the shared client scaffold used by
 * {@link VeriTixClientExtended} (#618) and instantiates the TokenModule so
 * token metadata reads (#620) are reachable as `client.token.*`.
 */
import { Keypair } from '@stellar/stellar-sdk';

import { TokenModule } from './modules/token';
import { VeriTixError } from './utils/errors';
import type { NetworkConfig } from './utils/network';

type ClientListener = (...args: unknown[]) => void;

export class VeriTixClient {
  readonly config: NetworkConfig;
  connected = false;
  /** Soroban RPC server; tests inject a mock. */
  server: {
    getLatestLedger(): Promise<{ sequence: number }>;
    simulateTransaction?(tx: unknown): Promise<unknown>;
  } | null = null;
  ledgerCache: { sequence: number; fetchedAt: number } | null = null;

  readonly token: TokenModule;
  private readonly keypair?: Keypair;
  private readonly listeners = new Map<string, Set<ClientListener>>();

  constructor(config: NetworkConfig, keypair?: Keypair) {
    this.config = config;
    this.keypair = keypair;
    this.token = new TokenModule(config, keypair);
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
}