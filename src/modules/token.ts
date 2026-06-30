/**
 * @module modules/token
 * Token operations exposed by the VeriTix Soroban contract.
 */

import {
  SorobanRpc,
  Keypair,
  Address,
  StrKey,
  Account,
  xdr,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import type { NetworkConfig, TransactionResult } from '../types/index';
import {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
} from '../utils/transaction';
import { VeriTixError, VeriTixErrorCode, parseSorobanError } from '../utils/errors';
import { DUMMY_PUBLIC_KEY } from '../utils/network';

/** @internal Convert a Stellar address to ScVal. */
function addressToScVal(address: string): xdr.ScVal {
  if (StrKey.isValidEd25519PublicKey(address)) {
    return Address.account(StrKey.decodeEd25519PublicKey(address)).toScVal();
  }
  return Address.fromString(address).toScVal();
}

export interface MintParams {
  to: string;
  amount: bigint;
}

export interface TransferParams {
  from: string;
  to: string;
  amount: bigint;
}

export interface ApproveParams {
  from: string;
  spender: string;
  amount: bigint;
  expirationLedger: number;
}

export interface BurnParams {
  amount: bigint;
}

export class TokenModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

  constructor(config: NetworkConfig, server: SorobanRpc.Server, keypair?: Keypair) {
    this.config = config;
    this.server = server;
    this.keypair = keypair;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async simulateRead(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );

    const simResult = await this.server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw parseSorobanError(simResult.error);
    }

    const retval = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return retval !== undefined ? scValToNative(retval) : undefined;
  }

  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }

    const sourceAccount = await this.server.getAccount(this.keypair.publicKey());
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      method,
      args,
      this.config.networkPassphrase,
    );

    const { transaction } = await simulateTransaction(this.server, tx);
    return submitTransaction(this.server, transaction, this.keypair);
  }

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  /**
   * Returns the token balance for an address.
   *
   * @param address - Stellar account address to query.
   * @returns Balance in stroops (smallest denomination).
   *
   * @example
   * ```ts
   * const balance = await client.token.balance('GABC…');
   * console.log('Balance (stroops):', balance.toString());
   * ```
   */
  async balance(address: string): Promise<bigint> {
    const result = await this.simulateRead('balance', [addressToScVal(address)]);
    return BigInt(result as bigint);
  }

  /**
   * Returns token balances for multiple addresses in input order.
   * Throws `BATCH_TOO_LARGE` if more than 100 addresses are supplied.
   *
   * @param addresses - Array of Stellar account addresses (max 100).
   *
   * @example
   * ```ts
   * const balances = await client.token.balanceOfBatch(['GABC…', 'GXYZ…']);
   * balances.forEach((b, i) => console.log(`Address ${i}:`, b.toString()));
   * ```
   */
  async balanceOfBatch(addresses: string[]): Promise<bigint[]> {
    if (addresses.length > 100) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `balanceOfBatch: max 100 addresses allowed, got ${addresses.length}`,
      );
    }
    return Promise.all(addresses.map((addr) => this.balance(addr)));
  }

  /**
   * Returns the approved allowance the `spender` may spend on behalf of `owner`.
   *
   * @param owner   - Stellar account address of the token owner.
   * @param spender - Stellar account address of the approved spender.
   * @returns Approved amount in stroops.
   *
   * @example
   * ```ts
   * const allowed = await client.token.allowance('GABC…', 'GSPENDER…');
   * console.log('Allowance:', allowed.toString());
   * ```
   */
  async allowance(owner: string, spender: string): Promise<bigint> {
    const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

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
      return 0n;
    }

    if (!retval) return 0n;

    try {
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
   *
   * @example
   * ```ts
   * const tokenName = await client.token.name();
   * console.log('Token name:', tokenName);
   * ```
   */
  async name(): Promise<string> {
    const result = await this.simulateRead('name', []);
    const str = result as Buffer | string;
    return Buffer.isBuffer(str) ? str.toString('utf8') : str;
  }

  /**
   * Returns the token ticker symbol.
   *
   * @example
   * ```ts
   * const sym = await client.token.symbol();
   * console.log('Symbol:', sym); // e.g. "VTX"
   * ```
   */
  async symbol(): Promise<string> {
    const result = await this.simulateRead('symbol', []);
    const str = result as Buffer | string;
    return Buffer.isBuffer(str) ? str.toString('utf8') : str;
  }

  /**
   * Returns the number of decimal places used by the token.
   *
   * @example
   * ```ts
   * const dec = await client.token.decimals();
   * console.log('Decimals:', dec); // typically 7
   * ```
   */
  async decimals(): Promise<number> {
    const result = await this.simulateRead('decimals', []);
    return result as number;
  }

  /**
   * Returns the total token supply in the smallest denomination (stroops).
   *
   * @example
   * ```ts
   * const supply = await client.token.totalSupply();
   * console.log('Total supply (stroops):', supply.toString());
   * ```
   */
  async totalSupply(): Promise<bigint> {
    const result = await this.simulateRead('total_supply', []);
    return BigInt(result as bigint);
  }

  /**
   * Returns whether an account has been frozen by an admin.
   *
   * @param address - Stellar account address to check.
   * @returns `true` if the account is frozen, `false` otherwise.
   *
   * @example
   * ```ts
   * const frozen = await client.token.isFrozen('GABC…');
   * if (frozen) console.warn('Account is frozen');
   * ```
   */
  async isFrozen(address: string): Promise<boolean> {
    try {
      const result = await this.simulateRead('is_frozen', [
        nativeToScVal(Address.fromString(address), { type: 'address' }),
      ]);
      if (result === null || result === undefined) return false;
      return result === true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  /**
   * Mints new tokens to the given address. Caller must be admin.
   *
   * @param params - `{ to, amount }` where `amount` is in stroops.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.token.mint({ to: 'GABC…', amount: 10_000_000n }); // mint 1 XLM
   * ```
   */
  async mint(params: MintParams): Promise<TransactionResult> {
    return this.writeCall('mint', [
      addressToScVal(params.to),
      nativeToScVal(params.amount, { type: 'i128' }),
    ]);
  }

  /**
   * Burns tokens from the caller's own account.
   *
   * @param amount - Amount to burn in stroops. Must be > 0.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.token.burn(5_000_000n); // burn 0.5 XLM
   * ```
   */
  async burn(amount: bigint): Promise<TransactionResult> {
    if (amount <= 0n) {
      throw new VeriTixError(VeriTixErrorCode.InvalidAmount, 'burn: amount must be greater than 0');
    }
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }
    return this.writeCall('burn', [
      addressToScVal(this.keypair.publicKey()),
      nativeToScVal(amount, { type: 'i128' }),
    ]);
  }

  /**
   * Burns tokens from `from`'s account using the caller's allowance.
   *
   * @param from   - Address to burn tokens from.
   * @param amount - Amount to burn in stroops. Must be > 0.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.token.burnFrom('GABC…', 1_000_000n);
   * ```
   */
  async burnFrom(from: string, amount: bigint): Promise<TransactionResult> {
    if (amount <= 0n) {
      throw new VeriTixError(VeriTixErrorCode.InvalidAmount, 'burnFrom: amount must be greater than 0');
    }
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }
    return this.writeCall('burn_from', [
      addressToScVal(this.keypair.publicKey()),
      addressToScVal(from),
      nativeToScVal(amount, { type: 'i128' }),
    ]);
  }

  /**
   * Transfers tokens from `from` to `to`.
   *
   * @param params - `{ from, to, amount }`.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.token.transfer({ from: 'GABC…', to: 'GXYZ…', amount: 2_000_000n });
   * ```
   */
  async transfer(params: TransferParams): Promise<TransactionResult> {
    return this.writeCall('transfer', [
      addressToScVal(params.from),
      addressToScVal(params.to),
      nativeToScVal(params.amount, { type: 'i128' }),
    ]);
  }

  /**
   * Transfers tokens from the caller's account to `to` with an on-chain memo.
   * Memo must be <= 64 bytes (UTF-8 encoded).
   *
   * @param to     - Recipient Stellar account address.
   * @param amount - Amount in stroops.
   * @param memo   - On-chain memo string (<= 64 bytes UTF-8).
   */
  async transferWithMemo(to: string, amount: bigint, memo: string): Promise<TransactionResult> {
    const memoBytes = Buffer.from(memo, 'utf8');
    if (memoBytes.length > 64) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAmount,
        `transferWithMemo: memo must be <= 64 bytes, got ${memoBytes.length}`,
      );
    }
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }
    return this.writeCall('transfer_with_memo', [
      addressToScVal(this.keypair.publicKey()),
      addressToScVal(to),
      nativeToScVal(amount, { type: 'i128' }),
      xdr.ScVal.scvBytes(memoBytes),
    ]);
  }

  /**
   * Transfers tokens from `from` to `to` using the caller's allowance.
   *
   * @param from   - Token owner address.
   * @param to     - Recipient address.
   * @param amount - Amount to transfer in stroops.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * // Caller must have been approved via client.token.approve(...)
   * await client.token.transferFrom('GOWNER…', 'GRECIPIENT…', 1_000_000n);
   * ```
   */
  async transferFrom(from: string, to: string, amount: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'A Keypair is required for transferFrom. Pass it to VeriTixClient.',
      );
    }

    const spender = this.keypair.publicKey();
    const currentAllowance = await this.allowance(from, spender);
    if (currentAllowance < amount) {
      throw new VeriTixError(
        VeriTixErrorCode.InsufficientAllowance,
        `Spender allowance (${currentAllowance}) is less than requested amount (${amount}).`,
      );
    }

    return this.writeCall('transfer_from', [
      addressToScVal(spender),
      addressToScVal(from),
      addressToScVal(to),
      nativeToScVal(amount, { type: 'i128' }),
    ]);
  }

  /**
   * Approves `spender` to spend up to `amount` tokens from `from`'s account.
   *
   * @param params - `{ from, spender, amount, expirationLedger }`.
   * @returns A {@link TransactionResult} on success.
   *
   * @example
   * ```ts
   * await client.token.approve({
   *   from: 'GABC…',
   *   spender: 'GCONTRACT…',
   *   amount: 10_000_000n,
   *   expirationLedger: currentLedger + 17_280,
   * });
   * ```
   */
  async approve(params: ApproveParams): Promise<TransactionResult> {
    return this.writeCall('approve', [
      addressToScVal(params.from),
      addressToScVal(params.spender),
      nativeToScVal(params.amount, { type: 'i128' }),
      nativeToScVal(params.expirationLedger, { type: 'u32' }),
    ]);
  }
}
