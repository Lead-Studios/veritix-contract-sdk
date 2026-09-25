/**
 * @module modules/token
 * TokenModule — token reads against the VeriTix contract (issues #619/#620).
 *
 * The immutable metadata reads (`name()`, `symbol()`, `decimals()`) are
 * cached through {@link RequestCache} since they never change on-chain.
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

import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { DUMMY_PUBLIC_KEY } from '../utils/network';
import type { NetworkConfig } from '../utils/network';
import { RequestCache } from '../utils/requestCache';

type Signer = (tx: Transaction) => Promise<Transaction>;

export class TokenModule {
  /** Soroban RPC server; tests inject a mock on this field. */
  server: { simulateTransaction(tx: Transaction): Promise<unknown> } | null = null;

  protected readonly config: NetworkConfig;
  protected readonly keypair?: Keypair;
  private readonly cache = new RequestCache();
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

  /** Returns the token name, e.g. `"VeriTix Token"`. */
  name(): Promise<string> {
    return this.cachedRead('name', 'name') as Promise<string>;
  }

  /** Returns the token symbol, e.g. `"VTX"`. */
  symbol(): Promise<string> {
    return this.cachedRead('symbol', 'symbol') as Promise<string>;
  }

  /** Returns the number of decimals the token uses (u32). */
  decimals(): Promise<number> {
    return this.cachedRead('decimals', 'decimals') as Promise<number>;
  }

  private async cachedRead(key: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const promise = this.read(method, args);
    this.cache.set(key, promise);
    return promise;
  }

  private async read(method: string, args: xdr.ScVal[]): Promise<unknown> {
    if (!this.server) {
      throw new VeriTixError(VeriTixErrorCode.NotConnected, 'call connect() before reading from the contract');
    }
    const tx = this.buildContractCall(method, args);
    const result = (await this.server.simulateTransaction(tx)) as
      | { result?: { retval?: xdr.ScVal } }
      | undefined;
    const retval = result?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(VeriTixErrorCode.SimulationFailed, `${method} simulation returned no value`);
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
}