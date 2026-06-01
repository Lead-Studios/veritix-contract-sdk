/**
 * @module utils/errors
 * Custom error class and parser for VeriTix Soroban contract panic messages.
 *
 * When a Soroban contract invocation fails it surfaces a diagnostic string
 * (e.g. `"escrow not found"` or `"DisputeAlreadyOpen"`).  This module maps
 * those raw strings to strongly-typed {@link VeriTixError} instances so
 * callers can pattern-match on {@link VeriTixErrorCode} instead of string
 * comparisons.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Canonical error codes produced by {@link parseSorobanError}.
 * Each code maps 1-to-1 to a known contract panic string.
 */
export enum VeriTixErrorCode {
  // — Escrow ----------------------------------------------------------------
  /** The requested escrow ID does not exist in contract storage */
  EscrowNotFound = 'ESCROW_NOT_FOUND',
  /** The escrow has already been released or refunded */
  EscrowAlreadySettled = 'ESCROW_ALREADY_SETTLED',
  /** The escrow has not yet passed its expiry ledger */
  EscrowNotExpired = 'ESCROW_NOT_EXPIRED',
  /** Caller is not authorised to act on this escrow */
  EscrowUnauthorized = 'ESCROW_UNAUTHORIZED',

  // — Dispute ---------------------------------------------------------------
  /** A dispute is already open for this escrow */
  DisputeAlreadyOpen = 'DISPUTE_ALREADY_OPEN',
  /** The requested dispute ID does not exist */
  DisputeNotFound = 'DISPUTE_NOT_FOUND',
  /** The dispute has already been resolved */
  DisputeAlreadyResolved = 'DISPUTE_ALREADY_RESOLVED',
  /** The dispute is not in the correct state for this operation */
  DisputeInvalidState = 'DISPUTE_INVALID_STATE',

  // — Split -----------------------------------------------------------------
  /** The requested split ID does not exist */
  SplitNotFound = 'SPLIT_NOT_FOUND',
  /** Split basis points do not sum to 10 000 */
  SplitInvalidShares = 'SPLIT_INVALID_SHARES',
  /** The split has already been distributed */
  SplitAlreadyDistributed = 'SPLIT_ALREADY_DISTRIBUTED',

  // — Recurring -------------------------------------------------------------
  /** The requested recurring record does not exist */
  RecurringNotFound = 'RECURRING_NOT_FOUND',
  /** The interval has not elapsed since the last charge */
  RecurringIntervalNotElapsed = 'RECURRING_INTERVAL_NOT_ELAPSED',

  // — Admin -----------------------------------------------------------------
  /** Caller is not the contract admin */
  AdminUnauthorized = 'ADMIN_UNAUTHORIZED',
  /** The target account has been frozen */
  AccountFrozen = 'ACCOUNT_FROZEN',
  /** The contract is currently paused */
  ContractPaused = 'CONTRACT_PAUSED',

  // — Token -----------------------------------------------------------------
  /** Transfer or mint amount must be greater than zero */
  InvalidAmount = 'INVALID_AMOUNT',

  // — Catch-all -------------------------------------------------------------
  /** Raw panic string could not be mapped to a known code */
  InsufficientAllowance = 'INSUFFICIENT_ALLOWANCE',

  Unknown = 'UNKNOWN',
  /** RPC endpoint was unreachable after all retries */
  ConnectionFailed = 'CONNECTION_FAILED',
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by all VeriTix SDK methods.
 *
 * @example
 * ```ts
 * try {
 *   await client.escrow.releaseEscrow(id);
 * } catch (err) {
 *   if (err instanceof VeriTixError && err.code === VeriTixErrorCode.EscrowAlreadySettled) {
 *     console.warn('Escrow already settled — nothing to do.');
 *   }
 * }
 * ```
 */
export class VeriTixError extends Error {
  /** Canonical SDK error code */
  public readonly code: VeriTixErrorCode;
  /** The original panic string returned by the Soroban RPC, if available */
  public readonly rawMessage: string | undefined;

  constructor(code: VeriTixErrorCode, message: string, rawMessage?: string) {
    super(message);
    this.name = 'VeriTixError';
    this.code = code;
    this.rawMessage = rawMessage;

    // Maintain correct prototype chain in environments that transpile classes
    Object.setPrototypeOf(this, VeriTixError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Mapping table
// ---------------------------------------------------------------------------

/**
 * Maps substrings found in Soroban panic strings to their {@link VeriTixErrorCode}.
 * Order matters: more specific patterns must appear before broader ones.
 *
 * Matching is **case-insensitive substring** — first match wins.
 */
const PANIC_MAP: ReadonlyArray<[pattern: string, code: VeriTixErrorCode]> = [
  // Escrow — ordered most-specific first so e.g. "escrow not expired" is
  // matched before the shorter "not expired" alias.
  ['escrow not found',        VeriTixErrorCode.EscrowNotFound],
  ['already settled',         VeriTixErrorCode.EscrowAlreadySettled],
  ['escrow not expired',      VeriTixErrorCode.EscrowNotExpired],
  ['not expired',             VeriTixErrorCode.EscrowNotExpired],
  ['escrow unauthorized',     VeriTixErrorCode.EscrowUnauthorized],

  // Dispute
  ['DisputeAlreadyOpen',      VeriTixErrorCode.DisputeAlreadyOpen],
  ['dispute not found',       VeriTixErrorCode.DisputeNotFound],
  ['dispute already resolved', VeriTixErrorCode.DisputeAlreadyResolved],
  ['dispute invalid state',   VeriTixErrorCode.DisputeInvalidState],

  // Split
  ['split not found',         VeriTixErrorCode.SplitNotFound],
  ['invalid shares',          VeriTixErrorCode.SplitInvalidShares],
  ['already distributed',     VeriTixErrorCode.SplitAlreadyDistributed],

  // Recurring
  ['recurring not found',     VeriTixErrorCode.RecurringNotFound],
  ['interval not elapsed',    VeriTixErrorCode.RecurringIntervalNotElapsed],

  // Token
  ['insufficient allowance', VeriTixErrorCode.InsufficientAllowance],

  // Admin
  ['admin unauthorized',      VeriTixErrorCode.AdminUnauthorized],
  ['account frozen',          VeriTixErrorCode.AccountFrozen],
  ['contract paused',         VeriTixErrorCode.ContractPaused],

  // Token / balance — must come after the more-specific "escrow unauthorized"
  // and "admin unauthorized" entries so those match first.
  ['insufficient balance',    VeriTixErrorCode.InsufficientBalance],
  ['not authorized',          VeriTixErrorCode.Unauthorized],
];

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Converts a raw Soroban RPC error (panic string or `Error` object) into a
 * typed {@link VeriTixError}.
 *
 * The function performs **case-insensitive substring matching** against
 * {@link PANIC_MAP}.  The first match wins, so more-specific patterns are
 * listed before broader ones.
 *
 * @param raw - The raw error value surfaced by the Soroban RPC or SDK.
 * @returns A {@link VeriTixError} with an appropriate {@link VeriTixErrorCode}.
 *
 * @example
 * ```ts
 * const sdkErr = parseSorobanError(rpcError);
 * if (sdkErr.code === VeriTixErrorCode.DisputeAlreadyOpen) { ... }
 * ```
 */
export function parseSorobanError(raw: unknown): VeriTixError {
  const rawStr = extractRawString(raw);
  const normalised = rawStr.toLowerCase();

  for (const [pattern, code] of PANIC_MAP) {
    if (normalised.includes(pattern.toLowerCase())) {
      return new VeriTixError(code, buildMessage(code, rawStr), rawStr);
    }
  }

  return new VeriTixError(
    VeriTixErrorCode.Unknown,
    `Unrecognised contract error: ${rawStr}`,
    rawStr,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts a printable string from an unknown thrown value. */
function extractRawString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Error) return raw.message;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/** Produces a human-readable message for a given error code. */
function buildMessage(code: VeriTixErrorCode, rawStr: string): string {
  const messages: Record<VeriTixErrorCode, string> = {
    [VeriTixErrorCode.EscrowNotFound]:             'Escrow record not found in contract storage.',
    [VeriTixErrorCode.EscrowAlreadySettled]:        'Escrow has already been released or refunded.',
    [VeriTixErrorCode.EscrowNotExpired]:            'Escrow has not yet reached its expiry ledger.',
    [VeriTixErrorCode.EscrowUnauthorized]:          'Caller is not authorised to act on this escrow.',
    [VeriTixErrorCode.DisputeAlreadyOpen]:          'A dispute is already open for this escrow.',
    [VeriTixErrorCode.DisputeNotFound]:             'Dispute record not found in contract storage.',
    [VeriTixErrorCode.DisputeAlreadyResolved]:      'Dispute has already been resolved.',
    [VeriTixErrorCode.DisputeInvalidState]:         'Dispute is not in the correct state for this operation.',
    [VeriTixErrorCode.SplitNotFound]:               'Split record not found in contract storage.',
    [VeriTixErrorCode.SplitInvalidShares]:          'Split shares do not sum to 10 000 basis points.',
    [VeriTixErrorCode.SplitAlreadyDistributed]:     'Split amount has already been distributed.',
    [VeriTixErrorCode.RecurringNotFound]:           'Recurring payment record not found.',
    [VeriTixErrorCode.RecurringIntervalNotElapsed]: 'Charge interval has not yet elapsed.',
    [VeriTixErrorCode.AdminUnauthorized]:           'Caller is not the contract administrator.',
    [VeriTixErrorCode.AccountFrozen]:               'Target account is frozen and cannot transact.',
    [VeriTixErrorCode.ContractPaused]:              'Contract is currently paused by the administrator.',
    [VeriTixErrorCode.InsufficientAllowance]:       'Spender allowance is insufficient for the requested transfer amount.',
    [VeriTixErrorCode.InsufficientBalance]:         'Account has insufficient token balance for this operation.',
    [VeriTixErrorCode.Unauthorized]:                'Caller is not authorised to perform this operation.',
    [VeriTixErrorCode.Unknown]:                     `Unrecognised contract error: ${rawStr}`,
    [VeriTixErrorCode.ConnectionFailed]:            'Failed to connect to the Soroban RPC endpoint.',
    [VeriTixErrorCode.AdminUnauthorized]: 'Caller is not the contract administrator.',
    [VeriTixErrorCode.AccountFrozen]: 'Target account is frozen and cannot transact.',
    [VeriTixErrorCode.ContractPaused]: 'Contract is currently paused by the administrator.',
    [VeriTixErrorCode.InvalidAmount]: 'Amount must be greater than zero.',
    [VeriTixErrorCode.Unknown]: `Unrecognised contract error: ${rawStr}`,
    [VeriTixErrorCode.ConnectionFailed]: 'Failed to connect to the Soroban RPC endpoint.',
  };
  return messages[code];
}
