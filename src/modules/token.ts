/**
 * @module modules/token
 * Token operations exposed by the VeriTix Soroban contract.
 *
 * Covers the SEP-41 / Stellar token interface methods that the contract
 * implements: minting, burning, transferring, approving allowances, and
 * querying balances.
 */

import { SorobanRpc, Keypair, Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { Account } from '@stellar/stellar-sdk';

/**
 * Parameters for minting new tokens.
 */
export interface MintParams {
  /** Recipient Stellar account address */
  to: string;
  /** Amount to mint (in stroops / smallest denomination) */
  amount: bigint;
}

/**
 * Parameters for burning tokens.
 */
export interface BurnParams {
  /** Account whose tokens will be burned */
  from: string;
  /** Amount to burn (in stroops) */
  amount: bigint;
}

/**
 * Parameters for transferring tokens.
 */
export interface TransferParams {
  /** Sender Stellar account address */
  from: string;
  /** Recipient Stellar account address */
  to: string;
  /** Amount to transfer (in stroops) */
  amount: bigint;
}

/**
 * Parameters for approving a spender allowance.
 */
export interface ApproveParams {
  /** Account granting the allowance */
  from: string;
  /** Account being granted the allowance */
  spender: string;
  /** Maximum amount the spender may transfer on behalf of `from` */
  amount: bigint;
  /** Ledger sequence number at which the allowance expires */
  expirationLedger: number;
}

/**
 * Handles all token-level interactions with the VeriTix contract.
 *
 * Obtain an instance via {@link VeriTixClient.token} rather than
 * constructing this class directly.
 */
export class TokenModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

  /** @internal */
  constructor(config: NetworkConfig, server: SorobanRpc.Server, keypair?: Keypair) {
    this.config = config;
    this.server = server;
    this.keypair = keypair;
  }

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Returns the token balance for the given Stellar account address.
   *
   * @param address - Stellar account address to query.
   * @returns The balance in stroops (smallest denomination).
   *
   * @example
   * ```ts
   * const bal = await client.token.balance('GABC…');
   * console.log('Balance:', bal.toString());
   * ```
   */
  async balance(_address: string): Promise<bigint> {
    // TODO: implement
    // Suggested steps:
    //   1. buildContractCall(server, account, contractId, 'balance', [addressToScVal(_address)])
    //   2. simulateTransaction(server, tx)
    //   3. Parse ScVal result → bigint
    void this.config;
    void this.server;
    throw new Error('TokenModule.balance: not implemented');
  }

  /**
   * Returns the allowance granted by `owner` to `spender`.
   *
   * @param owner   - The account that granted the allowance.
   * @param spender - The account that received the allowance.
   * @returns The approved amount in stroops, or `0n` if no allowance exists.
   *
   * @example
   * ```ts
   * const amount = await client.token.allowance('GABC…', 'GXYZ…');
   * console.log('Allowance:', amount.toString());
   * ```
   */
  async allowance(owner: string, spender: string): Promise<bigint> {
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    const args = [
      nativeToScVal(Address.fromString(owner),   { type: 'address' }),
      nativeToScVal(Address.fromString(spender), { type: 'address' }),
    ];

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'allowance',
      args,
      this.config.networkPassphrase,
    );

    let retval: xdr.ScVal | undefined;
    try {
      const { transaction } = await simulateTransaction(this.server, tx);
      const raw = await this.server.simulateTransaction(transaction);
      if (SorobanRpc.Api.isSimulationSuccess(raw) && raw.result) {
        retval = raw.result.retval;
      }
    } catch {
      // No allowance entry in storage → treat as zero
      return 0n;
    }

    if (!retval) return 0n;

    try {
      // Contract returns i128; scvI128 parts are { hi: bigint, lo: bigint }
      const i128 = retval.i128();
      const hi = BigInt(i128.hi().toString());
      const lo = BigInt(i128.lo().toString());
      return (hi << 64n) | lo;
    } catch {
      return 0n;
    }
  }

  /**
   * Returns the token name.
   */
  async name(): Promise<string> {
    // TODO: implement — call contract 'name' entry point
    void this.config;
    void this.server;
    throw new Error('TokenModule.name: not implemented');
  }

  /**
   * Returns the token symbol.
   */
  async symbol(): Promise<string> {
    // TODO: implement — call contract 'symbol' entry point
    throw new Error('TokenModule.symbol: not implemented');
  }

  /**
   * Returns the number of decimal places.
   */
  async decimals(): Promise<number> {
    // TODO: implement — call contract 'decimals' entry point
    throw new Error('TokenModule.decimals: not implemented');
  }

  /**
   * Returns the total token supply.
   */
  async totalSupply(): Promise<bigint> {
    // TODO: implement — call contract 'total_supply' entry point
    throw new Error('TokenModule.totalSupply: not implemented');
  }

  /**
   * Checks whether the given Stellar account address is frozen.
   *
   * Calls the contract's `is_frozen` entry point with the address as an
   * `ScVal`.  If the address is not present in contract storage (i.e. it has
   * never been frozen), the contract returns nothing / a falsy value and this
   * method returns `false` — unfrozen by default.
   *
   * @param address - Stellar account address to check.
   * @returns `true` if the account is frozen, `false` otherwise.
   *
   * @example
   * ```ts
   * if (await client.token.isFrozen('GABC…')) {
   *   throw new Error('Recipient is frozen');
   * }
   * ```
   */
  async isFrozen(address: string): Promise<boolean> {
    // Build a throwaway source account — simulation does not require a funded account
    const dummyKeypair = Keypair.random();
    const sourceAccount = new Account(dummyKeypair.publicKey(), '0');

    // Encode the address as an ScVal Address
    const addressScVal = nativeToScVal(Address.fromString(address), { type: 'address' });

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'is_frozen',
      [addressScVal],
      this.config.networkPassphrase,
    );

    let retval: xdr.ScVal | undefined;
    try {
      const { transaction } = await simulateTransaction(this.server, tx);
      // Re-simulate to get the raw return value
      const raw = await this.server.simulateTransaction(transaction);
      if (SorobanRpc.Api.isSimulationSuccess(raw) && raw.result) {
        retval = raw.result.retval;
      }
    } catch {
      // Address not found in storage → treat as unfrozen
      return false;
    }

    if (!retval) return false;

    // The contract returns a Bool ScVal; any non-true value is treated as false
    try {
      return retval.switch().name === 'scvBool' && retval.b();
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Mints new tokens to the specified recipient address.
   * Caller must be the contract admin.
   *
   * @param params - {@link MintParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {VeriTixError} If the caller is not authorised.
   */
  async mint(_params: MintParams): Promise<TransactionResult> {
    // TODO: implement
    // Suggested steps:
    //   1. Require this.keypair
    //   2. buildContractCall → simulateTransaction → submitTransaction
    void this.keypair;
    throw new Error('TokenModule.mint: not implemented');
  }

  /**
   * Burns tokens from the specified account.
   * Caller must be the token owner or have sufficient allowance.
   *
   * @param params - {@link BurnParams}
   * @returns A {@link TransactionResult} on success.
   */
  async burn(_params: BurnParams): Promise<TransactionResult> {
    // TODO: implement
    throw new Error('TokenModule.burn: not implemented');
  }

  /**
   * Transfers tokens from the caller's account to `to`.
   *
   * The caller is derived from `this.keypair`; `params.from` is encoded as
   * the first contract argument per the SEP-41 `transfer(from, to, amount)`
   * interface.
   *
   * @param params - {@link TransferParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no keypair was provided (read-only client).
   * @throws {VeriTixError} With code `INVALID_AMOUNT` if `amount` is not > 0.
   *
   * @example
   * ```ts
   * await client.token.transfer({
   *   from: keypair.publicKey(),
   *   to: 'GXYZ…',
   *   amount: 1_000_000n,
   * });
   * ```
   */
  async transfer(params: TransferParams): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('TokenModule.transfer: a Keypair is required for write operations');
    }

    if (params.amount <= 0n) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        'Amount must be greater than zero.',
      );
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');

    const args = [
      nativeToScVal(Address.fromString(params.from), { type: 'address' }),
      nativeToScVal(Address.fromString(params.to),   { type: 'address' }),
      nativeToScVal(params.amount,                   { type: 'i128' }),
    ];

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'transfer',
      args,
      this.config.networkPassphrase,
    );

    const { transaction } = await simulateTransaction(this.server, tx);
    return submitTransaction(this.server, transaction, this.keypair);
  }

  /**
   * Approves `spender` to transfer up to `amount` tokens on behalf of the
   * caller (derived from `this.keypair`).
   *
   * The `expirationLedger` must be strictly greater than the current ledger
   * sequence; passing a value in the past throws immediately without hitting
   * the network.
   *
   * @param params - {@link ApproveParams}
   * @returns A {@link TransactionResult} on success.
   * @throws {Error} If no keypair was provided (read-only client).
   * @throws {VeriTixError} With code `UNKNOWN` if `expirationLedger` is not in the future.
   *
   * @example
   * ```ts
   * const currentLedger = await client.getCurrentLedger();
   * await client.token.approve({
   *   from: keypair.publicKey(),
   *   spender: 'GXYZ…',
   *   amount: 1_000_000n,
   *   expirationLedger: currentLedger + 17_280, // ~1 day
   * });
   * ```
   */
  async approve(params: ApproveParams): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new Error('TokenModule.approve: a Keypair is required for write operations');
    }

    // Validate expirationLedger is in the future
    const latestLedger = await this.server.getLatestLedger();
    if (params.expirationLedger <= latestLedger.sequence) {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
        `expirationLedger (${params.expirationLedger}) must be greater than the current ledger (${latestLedger.sequence})`,
      );
    }

    const sourceAccount = new Account(this.keypair.publicKey(), '0');

    const args = [
      nativeToScVal(Address.fromString(params.from),     { type: 'address' }),
      nativeToScVal(Address.fromString(params.spender),  { type: 'address' }),
      nativeToScVal(params.amount,                       { type: 'i128' }),
      nativeToScVal(params.expirationLedger,             { type: 'u32' }),
    ];

    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'approve',
      args,
      this.config.networkPassphrase,
    );

    const { transaction } = await simulateTransaction(this.server, tx);
    return submitTransaction(this.server, transaction, this.keypair);
  }
}
