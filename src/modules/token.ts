/**
 * @module modules/token
 * Token operations exposed by the VeriTix Soroban contract.
 *
 * Covers the SEP-41 / Stellar token interface methods that the contract
 * implements: minting, burning, transferring, approving allowances, and
 * querying balances.
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



/** @internal Convert a Stellar address to ScVal.
 *  Handles G-addresses (Ed25519 accounts) and C-addresses (contracts).
 */
function addressToScVal(address: string): xdr.ScVal {
  if (StrKey.isValidEd25519PublicKey(address)) {
    return Address.account(StrKey.decodeEd25519PublicKey(address)).toScVal();
  }
  return Address.fromString(address).toScVal();
}


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
 * Parameters for burning tokens.
 */
export interface BurnParams {
  /** Amount to burn in stroops (smallest denomination) */
  amount: bigint;
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
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Executes a read-only contract call via simulation and returns the decoded
   * native value. No keypair is required.
   */
  private async simulateRead(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const sourceAccount = new Account(Keypair.random().publicKey(), '0');
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
    return retval !== undefined ? scValToNative(retval) : undefined;
  }

  /**
   * Executes a state-mutating contract call: builds, simulates, signs, and
   * submits the transaction. Requires `this.keypair` to be set.
   */
  private async writeCall(method: string, args: xdr.ScVal[]): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
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
  // Read operations (#86, #87)
  // -------------------------------------------------------------------------

  /**
   * Returns the token balance for the given Stellar account address.
   *
   * @param address - Stellar account address to query.
   * @returns The balance in stroops (smallest denomination).
   */
  async balance(address: string): Promise<bigint> {
    const result = await this.simulateRead('balance', [
      addressToScVal(address),
    ]);
    return BigInt(result as bigint);
  }

  /**
   * Returns the allowance granted by `from` to `spender`.
   *
   * @param from    - The account that granted the allowance.
   * @param spender - The account that received the allowance.
   * @returns The approved amount in stroops.
   */
  async allowance(from: string, spender: string): Promise<bigint> {
    const result = await this.simulateRead('allowance', [
      addressToScVal(from),
      addressToScVal(spender),
    ]);
    return BigInt(result as bigint);
  }

  /**
   * Returns the token name.
   */
  async name(): Promise<string> {
    const result = await this.simulateRead('name', []);
    const str = result as Buffer | string;
    return Buffer.isBuffer(str) ? str.toString('utf8') : str;
  }

  /**
   * Returns the token symbol.
   */
  async symbol(): Promise<string> {
    const result = await this.simulateRead('symbol', []);
    const str = result as Buffer | string;
    return Buffer.isBuffer(str) ? str.toString('utf8') : str;
  }

  /**
   * Returns the number of decimal places.
   */
  async decimals(): Promise<number> {
    const result = await this.simulateRead('decimals', []);
    return result as number;
  }

  /**
   * Returns the total token supply.
   */
  async totalSupply(): Promise<bigint> {
    const result = await this.simulateRead('total_supply', []);
    return BigInt(result as bigint);
  }

  // -------------------------------------------------------------------------
  // Write operations (#90, #91)
  // -------------------------------------------------------------------------

  /**
   * Mints new tokens to the specified recipient address.
   * Caller must be the contract admin.
   */
  async mint(params: MintParams): Promise<TransactionResult> {
    return this.writeCall('mint', [
      addressToScVal(params.to),
      nativeToScVal(params.amount, { type: 'i128' }),
    ]);
  }

  /**
   * Burns `amount` tokens from the caller's account.
   * Validates that amount > 0.
   *
   * @param amount - Amount to burn in stroops.
   */
  async burn(amount: bigint): Promise<TransactionResult> {
    if (amount <= 0n) {
      throw new VeriTixError(VeriTixErrorCode.Unknown, 'burn: amount must be greater than 0');
    }
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
        'A Keypair is required for write operations. Pass it to VeriTixClient.',
      );
    }
    return this.writeCall('burn', [
      addressToScVal(this.keypair.publicKey()),
      nativeToScVal(amount, { type: 'i128' }),
    ]);
  }

  /**
   * Burns `amount` tokens from an approved address.
   * Caller must have sufficient allowance over `from`'s tokens.
   * Validates that amount > 0.
   *
   * @param from   - Account whose tokens will be burned.
   * @param amount - Amount to burn in stroops.
   */
  async burnFrom(from: string, amount: bigint): Promise<TransactionResult> {
    if (amount <= 0n) {
      throw new VeriTixError(VeriTixErrorCode.Unknown, 'burnFrom: amount must be greater than 0');
    }
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
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
   * Transfers tokens from one account to another.
   */
  async transfer(params: TransferParams): Promise<TransactionResult> {
    return this.writeCall('transfer', [
      addressToScVal(params.from),
      addressToScVal(params.to),
      nativeToScVal(params.amount, { type: 'i128' }),
    ]);
  }

  /**
   * Transfers tokens from `from` to `to` using the caller's allowance.
   * Pre-flight check: validates allowance >= amount before submitting.
   *
   * @param from   - Account whose tokens are transferred.
   * @param to     - Recipient address.
   * @param amount - Amount to transfer in stroops.
   * @throws {VeriTixError} VeriTixErrorCode.InsufficientAllowance if check fails.
   */
  async transferFrom(from: string, to: string, amount: bigint): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
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
   * Approves a `spender` to transfer up to `amount` tokens on behalf of `from`.
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
