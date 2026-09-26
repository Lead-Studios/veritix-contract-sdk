/**
 * @module utils/errors
 * Typed error surface for the VeriTix client SDK.
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
  /** Client is not connected — call connect() first. */
  ClientNotConnected = 'CLIENT_NOT_CONNECTED',
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
  /** An allowance has expired on-chain. */
  ExpiredAllowance = 'EXPIRED_ALLOWANCE',
  /** Account balance is too low for the requested operation. */
  InsufficientBalance = 'INSUFFICIENT_BALANCE',
  /** Target account is frozen. */
  AccountFrozen = 'ACCOUNT_FROZEN',
  /** A write operation was attempted on a read-only (keypair-less) client. */
  ReadOnlyClient = 'READ_ONLY_CLIENT',
  /** Transfer, mint, or burn amount must be greater than zero. */
  InvalidAmount = 'INVALID_AMOUNT',
  /** A memo failed validation. */
  InvalidMemo = 'INVALID_MEMO',
  /** A memo exceeded the maximum byte length. */
  MemoTooLong = 'MEMO_TOO_LONG',
  /** The Freighter wallet extension is not installed. */
  WalletNotFound = 'WALLET_NOT_FOUND',
  /** Freighter was not found in browser. */
  FreighterNotFound = 'FREIGHTER_NOT_FOUND',
  /** The Freighter wallet refused to grant access. */
  WalletPermissionDenied = 'WALLET_PERMISSION_DENIED',
  /** The requested escrow ID does not exist in contract storage. */
  EscrowNotFound = 'ESCROW_NOT_FOUND',
  /** The escrow has already been released or refunded. */
  EscrowAlreadySettled = 'ESCROW_ALREADY_SETTLED',
  /** The escrow has not yet passed its expiry ledger. */
  EscrowNotExpired = 'ESCROW_NOT_EXPIRED',
  /** Caller is not authorised to act on this escrow. */
  EscrowUnauthorized = 'ESCROW_UNAUTHORIZED',
  /** A dispute is already open for this escrow. */
  DisputeAlreadyOpen = 'DISPUTE_ALREADY_OPEN',
  /** The requested dispute ID does not exist. */
  DisputeNotFound = 'DISPUTE_NOT_FOUND',
  /** The dispute has already been resolved. */
  DisputeAlreadyResolved = 'DISPUTE_ALREADY_RESOLVED',
  /** The dispute is not in the correct state for this operation. */
  DisputeInvalidState = 'DISPUTE_INVALID_STATE',
  /** The requested split ID does not exist. */
  SplitNotFound = 'SPLIT_NOT_FOUND',
  /** Split basis points do not sum to 10 000. */
  SplitInvalidShares = 'SPLIT_INVALID_SHARES',
  /** The split has already been distributed. */
  SplitAlreadyDistributed = 'SPLIT_ALREADY_DISTRIBUTED',
  /** The requested recurring record does not exist. */
  RecurringNotFound = 'RECURRING_NOT_FOUND',
  /** The interval has not elapsed since the last charge. */
  RecurringIntervalNotElapsed = 'RECURRING_INTERVAL_NOT_ELAPSED',
  /** The recurring payment is already paused. */
  RecurringAlreadyPaused = 'RECURRING_ALREADY_PAUSED',
  /** The recurring payment is not currently paused. */
  RecurringNotPaused = 'RECURRING_NOT_PAUSED',
  /** Caller is not the contract admin. */
  AdminUnauthorized = 'ADMIN_UNAUTHORIZED',
  /** The contract is currently paused. */
  ContractAlreadyPaused = 'CONTRACT_ALREADY_PAUSED',
  /** unpause() was called but the contract is not currently paused. */
  ContractNotPaused = 'CONTRACT_NOT_PAUSED',
  /** Expiry ledger is in the past or equals current ledger. */
  InvalidExpiryLedger = 'INVALID_EXPIRY_LEDGER',
  /** Beneficiary must not be the same as the depositor. */
  InvalidBeneficiary = 'INVALID_BENEFICIARY',
  /** Caller is not authorized. */
  Unauthorized = 'UNAUTHORIZED',
  /** Collaborator not found. */
  CollaboratorNotFound = 'COLLABORATOR_NOT_FOUND',
  /** Collaborator already exists. */
  CollaboratorAlreadyExists = 'COLLABORATOR_ALREADY_EXISTS',
  /** Max collaborators reached. */
  MaxCollaboratorsReached = 'MAX_COLLABORATORS_REACHED',
  /** Invalid input parameter. */
  InvalidInput = 'INVALID_INPUT',
  /** Host function evaluation failed. */
  HostError = 'HOST_ERROR',
  /** The Soroban VM trapped during execution. */
  TrappedVmError = 'TRAPPED_VM_ERROR',
  /** Transaction hash returned by RPC differs from signed envelope hash. */
  UnexpectedTransactionHash = 'UNEXPECTED_TRANSACTION_HASH',
  /** Feature or method is not yet implemented. */
  NotImplemented = 'NOT_IMPLEMENTED',
  /** Deprecated alias of UnknownContractError. */
  Unknown = 'UNKNOWN',
  /** Raw panic string could not be mapped to a known code. */
  UnknownContractError = 'UNKNOWN',
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
  /** Raw message or panic string if available. */
  public readonly rawMessage?: string;
  /** Alias for rawMessage for backwards-compatibility. */
  public readonly raw?: string;
  /** Wrapped cause error if available. */
  public readonly cause?: unknown;

  constructor(code: VeriTixErrorCode, message?: string, rawMessage?: string, cause?: unknown) {
    super(message ?? code);
    this.name = 'VeriTixError';
    this.code = code;
    this.rawMessage = rawMessage;
    this.raw = rawMessage;
    this.cause = cause;
    // Preserve the prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, VeriTixError.prototype);
  }
}

const PANIC_MAP: [string, VeriTixErrorCode][] = [
  ['escrow not found', VeriTixErrorCode.EscrowNotFound],
  ['escrow already settled', VeriTixErrorCode.EscrowAlreadySettled],
  ['escrow not expired', VeriTixErrorCode.EscrowNotExpired],
  ['escrow unauthorized', VeriTixErrorCode.EscrowUnauthorized],
  ['disputealreadyopen', VeriTixErrorCode.DisputeAlreadyOpen],
  ['dispute not found', VeriTixErrorCode.DisputeNotFound],
  ['dispute already resolved', VeriTixErrorCode.DisputeAlreadyResolved],
  ['dispute invalid state', VeriTixErrorCode.DisputeInvalidState],
  ['split not found', VeriTixErrorCode.SplitNotFound],
  ['split invalid shares', VeriTixErrorCode.SplitInvalidShares],
  ['split already distributed', VeriTixErrorCode.SplitAlreadyDistributed],
  ['recurring not found', VeriTixErrorCode.RecurringNotFound],
  ['recurring interval not elapsed', VeriTixErrorCode.RecurringIntervalNotElapsed],
  ['recurring already paused', VeriTixErrorCode.RecurringAlreadyPaused],
  ['recurring not paused', VeriTixErrorCode.RecurringNotPaused],
  ['admin unauthorized', VeriTixErrorCode.AdminUnauthorized],
  ['account frozen', VeriTixErrorCode.AccountFrozen],
  ['contract paused', VeriTixErrorCode.ContractAlreadyPaused],
  ['contract not paused', VeriTixErrorCode.ContractNotPaused],
  ['expired allowance', VeriTixErrorCode.ExpiredAllowance],
  ['insufficient allowance', VeriTixErrorCode.InsufficientAllowance],
  ['insufficient balance', VeriTixErrorCode.InsufficientBalance],
  ['not authorized', VeriTixErrorCode.Unauthorized],
  ['invalid amount', VeriTixErrorCode.InvalidAmount],
  ['invalid expiry ledger', VeriTixErrorCode.InvalidExpiryLedger],
  ['invalid address', VeriTixErrorCode.InvalidAddress],
  ['invalid beneficiary', VeriTixErrorCode.InvalidBeneficiary],
  ['collaborator not found', VeriTixErrorCode.CollaboratorNotFound],
  ['collaborator already exists', VeriTixErrorCode.CollaboratorAlreadyExists],
  ['max collaborators reached', VeriTixErrorCode.MaxCollaboratorsReached],
  ['invalid input', VeriTixErrorCode.InvalidInput],
  ['invalidinput', VeriTixErrorCode.InvalidInput],
  ['not implemented', VeriTixErrorCode.NotImplemented],
  ['transaction failed', VeriTixErrorCode.TransactionFailed],
  ['watch timed out', VeriTixErrorCode.WatchTimeout],
  ['connection failed', VeriTixErrorCode.ConnectionFailed],
  ['batch too large', VeriTixErrorCode.BatchTooLarge],
  ['read-only client', VeriTixErrorCode.ReadOnlyClient],
  ['freighter not found', VeriTixErrorCode.FreighterNotFound],
  ['client not connected', VeriTixErrorCode.ClientNotConnected],
  ['HostError', VeriTixErrorCode.HostError],
  ['TrappedVmError', VeriTixErrorCode.TrappedVmError],
];

/**
 * Converts a raw Soroban RPC error (panic string or Error object) into a typed VeriTixError.
 */
export function parseSorobanError(raw: unknown): VeriTixError {
  if (raw instanceof VeriTixError) return raw;

  const rawStr = extractRawString(raw);
  const normalised = rawStr.toLowerCase();
  const cause = raw instanceof Error ? raw : undefined;

  for (const [pattern, code] of PANIC_MAP) {
    if (normalised.includes(pattern.toLowerCase())) {
      return new VeriTixError(code, buildMessage(code, rawStr), rawStr, cause);
    }
  }

  return new VeriTixError(
    VeriTixErrorCode.UnknownContractError,
    `Unrecognised contract error: ${rawStr}`,
    rawStr,
    cause,
  );
}

function extractRawString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Error) return raw.message;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function buildMessage(code: VeriTixErrorCode, rawStr: string): string {
  const messages: Partial<Record<VeriTixErrorCode, string>> = {
    [VeriTixErrorCode.EscrowNotFound]: 'Escrow record not found in contract storage.',
    [VeriTixErrorCode.EscrowAlreadySettled]: 'Escrow has already been released or refunded.',
    [VeriTixErrorCode.EscrowNotExpired]: 'Escrow has not yet reached its expiry ledger.',
    [VeriTixErrorCode.EscrowUnauthorized]: 'Caller is not authorised to act on this escrow.',
    [VeriTixErrorCode.DisputeAlreadyOpen]: 'A dispute is already open for this escrow.',
    [VeriTixErrorCode.DisputeNotFound]: 'Dispute record not found in contract storage.',
    [VeriTixErrorCode.DisputeAlreadyResolved]: 'Dispute has already been resolved.',
    [VeriTixErrorCode.DisputeInvalidState]: 'Dispute is not in the correct state for this operation.',
    [VeriTixErrorCode.SplitNotFound]: 'Split record not found in contract storage.',
    [VeriTixErrorCode.SplitInvalidShares]: 'Split shares do not sum to 10 000 basis points.',
    [VeriTixErrorCode.SplitAlreadyDistributed]: 'Split amount has already been distributed.',
    [VeriTixErrorCode.RecurringNotFound]: 'Recurring payment record not found.',
    [VeriTixErrorCode.RecurringIntervalNotElapsed]: 'Charge interval has not yet elapsed.',
    [VeriTixErrorCode.RecurringAlreadyPaused]: 'Recurring payment is already paused.',
    [VeriTixErrorCode.RecurringNotPaused]: 'Recurring payment is not currently paused.',
    [VeriTixErrorCode.AdminUnauthorized]: 'Caller is not the contract administrator.',
    [VeriTixErrorCode.AccountFrozen]: 'Target account is frozen and cannot transact.',
    [VeriTixErrorCode.ContractAlreadyPaused]: 'Contract is already paused — call unpause() first.',
    [VeriTixErrorCode.ContractNotPaused]: 'Contract is not currently paused — nothing to unpause.',
    [VeriTixErrorCode.ExpiredAllowance]: 'Allowance has expired on-chain.',
    [VeriTixErrorCode.InsufficientAllowance]: 'Spender allowance is insufficient for the requested amount.',
    [VeriTixErrorCode.InsufficientBalance]: 'Account balance is insufficient for the requested operation.',
    [VeriTixErrorCode.Unauthorized]: 'Caller is not authorized to perform this operation.',
    [VeriTixErrorCode.InvalidAmount]: 'Amount must be greater than zero.',
    [VeriTixErrorCode.InvalidExpiryLedger]: 'Expiry ledger must be greater than the current ledger.',
    [VeriTixErrorCode.InvalidAddress]: 'Supplied address is not a valid Stellar address.',
    [VeriTixErrorCode.InvalidBeneficiary]: 'Beneficiary must not be the same as the depositor.',
    [VeriTixErrorCode.HostError]: 'The Soroban host function evaluation failed.',
    [VeriTixErrorCode.TrappedVmError]: 'The Soroban VM trapped during execution.',
    [VeriTixErrorCode.Unknown]: `Unrecognised contract error: ${rawStr}`,
    [VeriTixErrorCode.UnknownContractError]: `Unrecognised contract error: ${rawStr}`,
    [VeriTixErrorCode.ConnectionFailed]: 'Failed to connect to the Soroban RPC endpoint.',
    [VeriTixErrorCode.BatchTooLarge]: 'Batch request exceeded maximum allowed size.',
    [VeriTixErrorCode.ReadOnlyClient]: 'This client is read-only. Provide a Keypair to enable write operations.',
    [VeriTixErrorCode.WatchTimeout]: 'Watch timed out before the operation was confirmed.',
    [VeriTixErrorCode.TransactionFailed]: 'Transaction was rejected by the Stellar network.',
    [VeriTixErrorCode.UnexpectedTransactionHash]: 'Transaction hash returned by the RPC differs from the signed envelope hash.',
    [VeriTixErrorCode.NotImplemented]: 'This feature or method is not yet implemented.',
    [VeriTixErrorCode.CollaboratorNotFound]: 'Collaborator not found for this event.',
    [VeriTixErrorCode.CollaboratorAlreadyExists]: 'Collaborator already exists for this event.',
    [VeriTixErrorCode.MaxCollaboratorsReached]: 'Maximum number of collaborators reached for this event.',
    [VeriTixErrorCode.FreighterNotFound]: 'Freighter wallet was not found in the browser.',
    [VeriTixErrorCode.ClientNotConnected]: 'Client is not connected — call connect() first.',
    [VeriTixErrorCode.InvalidInput]: 'Invalid input parameter.',
  };
  return messages[code] ?? `Contract error: ${code} (${rawStr})`;
}