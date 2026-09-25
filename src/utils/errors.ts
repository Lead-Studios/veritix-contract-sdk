/**
 * @module utils/errors
 * Typed error surface for the VeriTix client SDK (issues #585/#586).
 *
 * Every domain error surfaced by the SDK is a {@link VeriTixError} carrying a
 * stable machine-readable {@link VeriTixError.code} (see
 * {@link VeriTixErrorCode}) so callers can branch on failures without string
 * matching.
 */
export enum VeriTixErrorCode {
  /** An address/strkey failed validation. */
  InvalidAddress = 'INVALID_ADDRESS',
  /** A Stellar account does not exist on the network. */
  AccountNotFound = 'ACCOUNT_NOT_FOUND',
  /** The configured RPC endpoint could not be reached. */
  RpcUnreachable = 'RPC_UNREACHABLE',
  /** The configured contract ID does not exist on this network. */
  ContractNotFound = 'CONTRACT_NOT_FOUND',
  /** connect() could not establish a connection. */
  ConnectionFailed = 'CONNECTION_FAILED',
  /** An operation required connect() to have run first. */
  NotConnected = 'NOT_CONNECTED',
  /** A Soroban simulation failed or returned no value. */
  SimulationFailed = 'SIMULATION_FAILED',
  /** A submitted transaction finished in a failed state. */
  TransactionFailed = 'TRANSACTION_FAILED',
  /** A watch/poll operation timed out before reaching its terminal state. */
  WatchTimeout = 'WATCH_TIMEOUT',
  /** A batched read exceeded the documented batch-size limit. */
  BatchTooLarge = 'BATCH_TOO_LARGE',
  /** A transferFrom spent more than the current allowance. */
  InsufficientAllowance = 'INSUFFICIENT_ALLOWANCE',
  /** A write operation was attempted on a read-only (keypair-less) client. */
  ReadOnlyClient = 'READ_ONLY_CLIENT',
  /** A memo failed validation. */
  InvalidMemo = 'INVALID_MEMO',
  /** A memo exceeded the maximum byte length. */
  MemoTooLong = 'MEMO_TOO_LONG',
  /** The Freighter wallet extension is not installed. */
  WalletNotFound = 'WALLET_NOT_FOUND',
  /** The Freighter wallet refused to grant access. */
  WalletPermissionDenied = 'WALLET_PERMISSION_DENIED',
}

/**
 * Base error type for every failure surfaced by the SDK.
 *
 * @example
 * ```ts
 * throw new VeriTixError(
 *   VeriTixErrorCode.AccountNotFound,
 *   `No account ${address} on ${this.config.network}`,
 * );
 * ```
 */
export class VeriTixError extends Error {
  /** Stable machine-readable discriminator. */
  public readonly code: VeriTixErrorCode;

  constructor(code: VeriTixErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'VeriTixError';
    this.code = code;
    // Preserve the prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, VeriTixError.prototype);
  }
}