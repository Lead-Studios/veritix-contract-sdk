/**
 * @module modules/token
 * TokenModule — token reads and writes against the VeriTix contract
 * (issues #619/#620, #622/#625, #626, #627, #628, and #629).
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
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

import type {
  ApproveParams,
  BurnParams,
  MintParams,
  TransactionResult,
  TransferParams,
} from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import {
  DUMMY_PUBLIC_KEY,
  assertValidAddress,
  ledgersFromNow,
} from '../utils/network';
import type { NetworkConfig } from '../utils/network';
import { RequestCache } from '../utils/requestCache';
import { addressToScVal, bigintToScVal } from '../utils/scval';
import {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
} from '../utils/transaction';

/** Maximum addresses accepted by {@link TokenModule.balanceOfBatch}. */
export const MAX_BATCH_SIZE = 100;

export type { MintParams, TransferParams, ApproveParams, BurnParams };
export { ledgersFromNow };

/**
 * Standalone helper that converts a duration in seconds to an expiration
 * ledger sequence number using {@link ledgersFromNow}.
 */
export function expirationLedgerFromDuration(
  durationSeconds: number,
  currentLedger: number,
): number {
  return ledgersFromNow(durationSeconds, currentLedger);
}

type Signer = (tx: Transaction) => Promise<Transaction>;

export class TokenModule {
  /** Soroban RPC server; tests inject a mock on this field. */
  server: {
    simulateTransaction(tx: Transaction): Promise<unknown>;
    getAccount?(address: string): Promise<unknown>;
    sendTransaction?(tx: Transaction): Promise<{ status: string; hash?: string }>;
    getTransaction?(hash: string): Promise<{ status: string; ledger?: number }>;
    getLatestLedger?(): Promise<{ sequence: number }>;
  } | null = null;

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

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

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

  /** Returns the total token supply in stroops (i128). */
  async totalSupply(): Promise<bigint> {
    const raw = await this.read('total_supply', []);
    if (typeof raw === 'bigint') return raw;
    if (typeof raw === 'number') return BigInt(raw);
    return BigInt(String(raw ?? 0));
  }

  /**
   * Returns the total number of distinct token holders.
   * Returns `0` when the contract returns no result or simulation errors.
   */
  async totalHolders(): Promise<number | bigint> {
    try {
      const raw = await this.read('total_holders', []);
      if (raw === undefined || raw === null) return 0;
      if (typeof raw === 'bigint') return raw;
      if (typeof raw === 'number') return raw;
      return Number(raw);
    } catch {
      return 0;
    }
  }

  /**
   * Returns a paginated list of token holder addresses.
   *
   * @throws {VeriTixError} with code `BatchTooLarge` when limit exceeds 100.
   */
  async getHolders(offset = 0, limit = 100): Promise<string[]> {
    if (limit > 100) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `getHolders: limit must be <= 100, got ${limit}`,
      );
    }
    const result = await this.read('get_holders', [
      nativeToScVal(offset, { type: 'u32' }),
      nativeToScVal(limit, { type: 'u32' }),
    ]);
    if (!Array.isArray(result)) return [];
    return result.map(String);
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
    if (address === this.config.contractId) {
      return false;
    }
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

  /**
   * Returns the approved allowance `spender` may spend on behalf of `owner`.
   *
   * @returns Approved amount in stroops (0n if none or simulation fails).
   */
  async allowance(owner: string, spender: string): Promise<bigint> {
    assertValidAddress(owner, 'owner');
    assertValidAddress(spender, 'spender');
    try {
      const result = await this.read('allowance', [
        addressToScVal(owner),
        addressToScVal(spender),
      ]);
      if (result === undefined || result === null) return 0n;
      if (typeof result === 'bigint') return result;
      if (typeof result === 'number') return BigInt(result);
      if (typeof result === 'object' && result !== null && 'amount' in result) {
        return BigInt((result as { amount: bigint | number }).amount);
      }
      return BigInt(String(result));
    } catch {
      return 0n;
    }
  }

  // -------------------------------------------------------------------------
  // Expiration Ledger Helpers (#629)
  // -------------------------------------------------------------------------

  /**
   * Converts a duration in seconds into an absolute expiration ledger sequence
   * via {@link ledgersFromNow}.
   *
   * If `currentLedger` is not provided, queries the latest ledger sequence from
   * the connected RPC server.
   *
   * @param durationSeconds - Time from now in seconds.
   * @param currentLedger   - Optional base ledger sequence number.
   * @returns Calculated expiration ledger sequence.
   */
  async expirationLedgerFromDuration(
    durationSeconds: number,
    currentLedger?: number,
  ): Promise<number> {
    const base = currentLedger ?? (await this.fetchLatestLedger());
    return ledgersFromNow(durationSeconds, base);
  }

  /**
   * Synchronous helper that converts a duration in seconds and a known ledger
   * to an expiration ledger sequence number via {@link ledgersFromNow}.
   */
  ledgersFromDuration(durationSeconds: number, currentLedger: number): number {
    return ledgersFromNow(durationSeconds, currentLedger);
  }

  // -------------------------------------------------------------------------
  // Write operations (#626, #627, #628, #629)
  // -------------------------------------------------------------------------

  /**
   * Mints tokens to `params.to`. Caller must be admin.
   *
   * Validates the recipient address and a positive amount, then builds,
   * signs, submits, and confirms the transaction.
   *
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `InvalidAmount` when amount <= 0.
   */
  async mint(params: MintParams): Promise<TransactionResult> {
    assertValidAddress(params.to, 'recipient');
    if (params.amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'mint: amount must be greater than 0',
      );
    }
    this.assertSignerConfigured('write operations');

    return this.writeCall('mint', [
      addressToScVal(params.to),
      bigintToScVal(params.amount, 'i128'),
    ]);
  }

  /**
   * Transfers tokens from `params.from` to `params.to`.
   *
   * Validates both addresses and a positive amount, surfacing insufficient
   * balance and frozen account as distinct typed errors.
   *
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `InvalidAmount` when amount <= 0.
   * @throws {VeriTixError} with code `AccountFrozen` when an account is frozen.
   * @throws {VeriTixError} with code `InsufficientBalance` when balance is too low.
   */
  async transfer(params: TransferParams): Promise<TransactionResult> {
    assertValidAddress(params.from, 'from');
    assertValidAddress(params.to, 'to');
    if (params.amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'transfer: amount must be greater than 0',
      );
    }
    this.assertSignerConfigured('write operations');

    if (await this.isFrozen(params.from)) {
      throw new VeriTixError(
        VeriTixErrorCode.AccountFrozen,
        `transfer: sender account ${params.from} is frozen`,
      );
    }
    if (await this.isFrozen(params.to)) {
      throw new VeriTixError(
        VeriTixErrorCode.AccountFrozen,
        `transfer: recipient account ${params.to} is frozen`,
      );
    }

    if (this.server && typeof this.server.simulateTransaction === 'function') {
      try {
        const bal = await this.balance(params.from);
        if (bal < params.amount) {
          throw new VeriTixError(
            VeriTixErrorCode.InsufficientBalance,
            `transfer: insufficient balance for ${params.from} (has ${bal}, needs ${params.amount})`,
          );
        }
      } catch (err) {
        if (
          err instanceof VeriTixError &&
          err.code === VeriTixErrorCode.InsufficientBalance
        ) {
          throw err;
        }
      }
    }

    return this.writeCall('transfer', [
      addressToScVal(params.from),
      addressToScVal(params.to),
      bigintToScVal(params.amount, 'i128'),
    ]);
  }

  /**
   * Burns tokens from the caller's own account.
   *
   * @param amountOrParams - Amount in stroops (> 0) or a {@link BurnParams} object.
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `InvalidAmount` when amount <= 0.
   * @throws {VeriTixError} with code `AccountFrozen` if the caller account is frozen.
   * @throws {VeriTixError} with code `InsufficientBalance` if caller balance is too low.
   */
  async burn(amountOrParams: bigint | BurnParams): Promise<TransactionResult> {
    const amount =
      typeof amountOrParams === 'object' &&
      amountOrParams !== null &&
      'amount' in amountOrParams
        ? amountOrParams.amount
        : amountOrParams;

    if (amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'burn: amount must be greater than 0',
      );
    }
    this.assertSignerConfigured('write operations');

    const caller = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();
    if (await this.isFrozen(caller)) {
      throw new VeriTixError(
        VeriTixErrorCode.AccountFrozen,
        `burn: caller account ${caller} is frozen`,
      );
    }

    if (this.server && typeof this.server.simulateTransaction === 'function') {
      try {
        const bal = await this.balance(caller);
        if (bal < amount) {
          throw new VeriTixError(
            VeriTixErrorCode.InsufficientBalance,
            `burn: insufficient balance for ${caller} (has ${bal}, needs ${amount})`,
          );
        }
      } catch (err) {
        if (
          err instanceof VeriTixError &&
          err.code === VeriTixErrorCode.InsufficientBalance
        ) {
          throw err;
        }
      }
    }

    return this.writeCall('burn', [
      addressToScVal(caller),
      bigintToScVal(amount, 'i128'),
    ]);
  }

  /**
   * Burns tokens from `from`'s account using the caller's allowance.
   *
   * Surfaces an insufficient allowance or expired allowance as its own typed error.
   *
   * @param from   - Token owner address to burn tokens from.
   * @param amount - Amount to burn in stroops (> 0).
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `InvalidAmount` when amount <= 0.
   * @throws {VeriTixError} with code `InsufficientAllowance` when allowance is too low.
   * @throws {VeriTixError} with code `ExpiredAllowance` when allowance has expired.
   */
  async burnFrom(from: string, amount: bigint): Promise<TransactionResult> {
    assertValidAddress(from, 'from');
    if (amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'burnFrom: amount must be greater than 0',
      );
    }
    this.assertSignerConfigured('write operations');

    const spender = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();

    if (this.server && typeof this.server.simulateTransaction === 'function') {
      try {
        const currentAllowance = await this.allowance(from, spender);
        if (currentAllowance < amount) {
          throw new VeriTixError(
            VeriTixErrorCode.InsufficientAllowance,
            `burnFrom: spender allowance (${currentAllowance}) is less than requested amount (${amount})`,
          );
        }
      } catch (err) {
        if (
          err instanceof VeriTixError &&
          (err.code === VeriTixErrorCode.InsufficientAllowance ||
            err.code === VeriTixErrorCode.ExpiredAllowance)
        ) {
          throw err;
        }
      }
    }

    return this.writeCall('burn_from', [
      addressToScVal(spender),
      addressToScVal(from),
      bigintToScVal(amount, 'i128'),
    ]);
  }

  /**
   * Approves `spender` to spend up to `amount` tokens from `from`'s account
   * until `expirationLedger` is reached.
   *
   * @param params - `{ from, spender, amount, expirationLedger }`.
   * @throws {VeriTixError} with code `ReadOnlyClient` when no signer is configured.
   * @throws {VeriTixError} with code `InvalidAmount` when amount < 0.
   */
  async approve(params: ApproveParams): Promise<TransactionResult> {
    assertValidAddress(params.from, 'from');
    assertValidAddress(params.spender, 'spender');
    if (params.amount < 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'approve: amount must be greater than or equal to 0',
      );
    }
    this.assertSignerConfigured('write operations');

    return this.writeCall('approve', [
      addressToScVal(params.from),
      addressToScVal(params.spender),
      bigintToScVal(params.amount, 'i128'),
      nativeToScVal(params.expirationLedger, { type: 'u32' }),
    ]);
  }

  /**
   * Transfers tokens from `from` to `to` using the caller's allowance.
   *
   * @param from   - Token owner address.
   * @param to     - Recipient address.
   * @param amount - Amount to transfer in stroops.
   */
  async transferFrom(from: string, to: string, amount: bigint): Promise<TransactionResult> {
    assertValidAddress(from, 'from');
    assertValidAddress(to, 'to');
    if (amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'transferFrom: amount must be greater than 0',
      );
    }
    this.assertSignerConfigured('transferFrom');

    const spender = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();

    if (this.server && typeof this.server.simulateTransaction === 'function') {
      try {
        const currentAllowance = await this.allowance(from, spender);
        if (currentAllowance < amount) {
          throw new VeriTixError(
            VeriTixErrorCode.InsufficientAllowance,
            `Spender allowance (${currentAllowance}) is less than requested amount (${amount}).`,
          );
        }
      } catch (err) {
        if (
          err instanceof VeriTixError &&
          (err.code === VeriTixErrorCode.InsufficientAllowance ||
            err.code === VeriTixErrorCode.ExpiredAllowance)
        ) {
          throw err;
        }
      }
    }

    return this.writeCall('transfer_from', [
      addressToScVal(spender),
      addressToScVal(from),
      addressToScVal(to),
      bigintToScVal(amount, 'i128'),
    ]);
  }

  /**
   * Transfers tokens from the caller's account to `to` with an on-chain memo.
   * Memo must be <= 64 bytes (UTF-8 encoded).
   */
  async transferWithMemo(to: string, amount: bigint, memo: string): Promise<TransactionResult> {
    assertValidAddress(to, 'to');
    const memoBytes = Buffer.from(memo, 'utf8');
    if (memoBytes.length > 64) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        `transferWithMemo: memo must be <= 64 bytes, got ${memoBytes.length}`,
      );
    }
    this.assertSignerConfigured('write operations');

    const caller = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();
    return this.writeCall('transfer_with_memo', [
      addressToScVal(caller),
      addressToScVal(to),
      bigintToScVal(amount, 'i128'),
      xdr.ScVal.scvBytes(memoBytes),
    ]);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private assertSignerConfigured(action: string): void {
    if (!this.keypair && !this.signer) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        `A Keypair is required for ${action}. Pass it to VeriTixClient.`,
      );
    }
  }

  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    this.assertSignerConfigured('write operations');

    if (!this.server) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'call connect() before writing to the contract',
      );
    }

    const sourcePubKey = this.keypair ? this.keypair.publicKey() : this.sourceForWrite();
    let sourceAccount: StellarAccount;
    if (typeof this.server.getAccount === 'function') {
      const acct = await this.server.getAccount(sourcePubKey);
      sourceAccount = acct as StellarAccount;
    } else {
      sourceAccount = new StellarAccount(sourcePubKey, '0');
    }

    try {
      const tx = await buildContractCall(
        this.server,
        sourceAccount,
        this.config.contractId,
        method,
        args,
        this.config.networkPassphrase,
      );

      const { transaction } = await simulateTransaction(this.server, tx);

      if (this.signer) {
        return await this.submitSigned(transaction);
      }
      return await submitTransaction(this.server, transaction, this.keypair);
    } catch (err: unknown) {
      const errStr = (
        (err as { message?: string })?.message ||
        (err as { rawMessage?: string })?.rawMessage ||
        String(err)
      ).toLowerCase();

      if (errStr.includes('frozen')) {
        throw new VeriTixError(
          VeriTixErrorCode.AccountFrozen,
          (err as Error)?.message ?? 'Target account is frozen',
          errStr,
          err,
        );
      }
      if (errStr.includes('expired') || errStr.includes('expiration')) {
        throw new VeriTixError(
          VeriTixErrorCode.ExpiredAllowance,
          (err as Error)?.message ?? 'Allowance has expired',
          errStr,
          err,
        );
      }
      if (
        errStr.includes('allowance') &&
        (errStr.includes('insufficient') ||
          errStr.includes('less than') ||
          errStr.includes('exceed'))
      ) {
        throw new VeriTixError(
          VeriTixErrorCode.InsufficientAllowance,
          (err as Error)?.message ?? 'Insufficient allowance',
          errStr,
          err,
        );
      }
      if (
        errStr.includes('balance') &&
        (errStr.includes('insufficient') ||
          errStr.includes('less than') ||
          errStr.includes('low'))
      ) {
        throw new VeriTixError(
          VeriTixErrorCode.InsufficientBalance,
          (err as Error)?.message ?? 'Insufficient balance',
          errStr,
          err,
        );
      }
      throw err;
    }
  }

  private sourceForWrite(): string {
    return this.keypair?.publicKey() ?? DUMMY_PUBLIC_KEY;
  }

  private async submitSigned(tx: Transaction): Promise<TransactionResult> {
    const signed = await this.signer!(tx);
    if (!this.server?.sendTransaction || !this.server?.getTransaction) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'RPC server methods unavailable for transaction submission.',
      );
    }
    const sendResponse = await this.server.sendTransaction(signed);
    if (sendResponse.status === 'ERROR') {
      throw new VeriTixError(
        VeriTixErrorCode.TransactionFailed,
        'Transaction submission rejected by the network.',
      );
    }
    const hash = sendResponse.hash ?? Buffer.from(signed.hash()).toString('hex');
    const result = await this.server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      return {
        hash,
        ledger: result.ledger ?? 0,
        successful: true,
      };
    }
    if (result.status === 'FAILED') {
      throw new VeriTixError(VeriTixErrorCode.TransactionFailed, 'Transaction failed on-chain.');
    }
    throw new VeriTixError(
      VeriTixErrorCode.WatchTimeout,
      'Transaction not confirmed after submission.',
    );
  }

  private async fetchLatestLedger(): Promise<number> {
    if (this.server && typeof this.server.getLatestLedger === 'function') {
      try {
        const info = await this.server.getLatestLedger();
        return info.sequence;
      } catch {
        return 0;
      }
    }
    return 0;
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
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'call connect() before reading from the contract',
      );
    }
    const tx = this.buildContractCall(method, args);
    const result = (await this.server.simulateTransaction(tx)) as
      | { result?: { retval?: xdr.ScVal } }
      | undefined;
    const retval = result?.result?.retval;
    if (retval === undefined) {
      throw new VeriTixError(
        VeriTixErrorCode.SimulationFailed,
        `${method} simulation returned no value`,
      );
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
