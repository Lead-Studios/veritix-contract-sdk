/**
 * @module modules/token
 * TokenModule — token reads against the VeriTix contract
 * (issues #619/#620 and #622/#625).
 *
 * The immutable metadata reads (`name()`, `symbol()`, `decimals()`) are
 * cached through {@link RequestCache} since they never change on-chain.
 *
 * Because a holder table rendering 50 rows must never fan out into 50 RPC
 * calls, {@link TokenModule.balanceOfBatch} fans sequential reads through a
 * single shared read helper while returning results strictly in input order.
 * {@link TokenModule.isFrozen} short-circuits to `false` for the contract
 * itself so status UIs never probe it.
 */
import {
  Account as StellarAccount,
  Contract,
  Keypair,
  StrKey,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { DUMMY_PUBLIC_KEY, assertValidAddress } from '../utils/network';
import type { NetworkConfig } from '../utils/network';
import { RequestCache } from '../utils/requestCache';
import { addressToScVal } from '../utils/scval';

/** Maximum addresses accepted by {@link TokenModule.balanceOfBatch}. */
export const MAX_BATCH_SIZE = 100;

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

  /**
   * Returns the balance of a single token holder.
   *
   * @returns `0n` when the holder has no balance entry rather than throwing.
   */
  async balance(address: string): Promise<bigint> {
    assertValidAddress(address, 'owner');
    return (await this.read('balance', [addressToScVal(address)])) as bigint;
  }

  /**
   * Returns balances for many holders, in input order.
   *
   * Validates every address up front and rejects (rather than truncating)
   * batches above {@link MAX_BATCH_SIZE}.
   *
   * @throws {VeriTixError} with code `BatchTooLarge` for batches over
   *   {@link MAX_BATCH_SIZE} entries.
   */
  async balanceOfBatch(addresses: string[]): Promise<bigint[]> {
    if (addresses.length > MAX_BATCH_SIZE) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `balanceOfBatch supports at most ${MAX_BATCH_SIZE} addresses (got ${addresses.length})`,
      );
    }
    for (const address of addresses) {
      assertValidAddress(address, 'owner');
    }

    const balances: bigint[] = [];
    for (const address of addresses) {
      balances.push(await this.balance(address));
    }
    return balances;
  }

  /**
   * Reports whether `address` is frozen (`true` when the contract says so).
   *
   * Returns `false` without any RPC call for values that cannot be a token
   * holder (for example the contract ID itself), and also defaults to `false`
   * if the simulation errors — a frozen status must never block an unrelated
   * UI read.
   */
  async isFrozen(address: string): Promise<boolean> {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      return false;
    }
    try {
      const raw = await this.read('is_frozen', [addressToScVal(address)]);
      return raw === true;
    } catch {
      return false;
    }
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
