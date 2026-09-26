/**
 * @module types
 * Shared record types that mirror the VeriTix Soroban contract structs.
 *
 * Every module returns these shapes. Defining them once prevents the drift
 * that split the previous codebase into parallel type definitions. On-chain
 * amounts and ids are `bigint` — never `number` — to preserve 128-bit
 * precision end-to-end.
 *
 * Enums (`EscrowStatus`, `DisputeStatus`) and `NetworkConfig` are landed in
 * separate rebuild issues (#584, #583); status fields below are therefore
 * typed as plain strings until those land.
 */
export interface EscrowRecord {
  /** Unique numeric identifier for the escrow */
  id: bigint;
  /** Stellar account address of the depositor */
  depositor: string;
  /** Stellar account address of the intended beneficiary */
  beneficiary: string;
  /** Token amount held in escrow (in stroops / smallest denomination) */
  amount: bigint;
  /** Whether the escrow has been released to the beneficiary */
  released: boolean;
  /** Whether the escrow has been refunded to the depositor */
  refunded: boolean;
  /** Ledger sequence number after which the depositor may reclaim the funds */
  expiryLedger: number;
  /** Optional free-form memo strings attached to the escrow */
  memos: string[];
}

/**
 * A single recipient entry within a {@link SplitRecord}.
 * Basis points (BPS) are used so that shares sum to exactly 10 000.
 */
export interface SplitRecipient {
  /** Stellar account address of the recipient */
  address: string;
  /** Share of the total amount in basis points (1 bps = 0.01 %) */
  shareBps: number;
}

/**
 * On-chain record for a payment split instruction.
 * Mirrors the `SplitRecord` struct in the VeriTix contract.
 */
export interface SplitRecord {
  /** Unique numeric identifier for the split */
  id: bigint;
  /** Stellar account address that initiated the split */
  sender: string;
  /** Ordered list of recipients with their basis-point shares */
  recipients: SplitRecipient[];
  /** Total amount to be distributed (in stroops) */
  totalAmount: bigint;
  /** Whether the full amount has already been distributed */
  distributed: boolean;
  /** Whether the split was cancelled before distribution */
  cancelled: boolean;
}

/**
 * On-chain record for a dispute raised against an escrow.
 * Mirrors the `DisputeRecord` struct in the VeriTix contract.
 */
export interface DisputeRecord {
  /** Unique numeric identifier for the dispute */
  id: bigint;
  /** The escrow ID that this dispute is attached to */
  escrowId: bigint;
  /** Stellar account address of the party that opened the dispute */
  claimant: string;
  /** Stellar account address of the designated resolver / arbitrator */
  resolver: string;
  /**
   * Current status of the dispute.
   * Plain string until the typed `DisputeStatus` enum lands (issue #584).
   */
  status: string;
  /** Ledger sequence number when the dispute was opened */
  openedAt: number;
}

/**
 * On-chain record for a recurring / subscription payment setup.
 * Mirrors the `RecurringRecord` struct in the VeriTix contract.
 */
export interface RecurringRecord {
  /** Unique numeric identifier for the recurring payment */
  id: bigint;
  /** Stellar account address of the payer */
  payer: string;
  /** Stellar account address of the payee */
  payee: string;
  /** Amount charged per interval (in stroops) */
  amount: bigint;
  /** Charge interval expressed in ledger count */
  interval: number;
  /** Whether this recurring payment is still active */
  active: boolean;
  /** Whether this recurring payment is currently paused */
  paused: boolean;
  /** Ledger sequence number when the most recent charge was executed */
  lastChargedLedger: number;
}

/**
 * Minimal representation of a submitted Stellar transaction result.
 */
export interface TransactionResult {
  /** Stellar transaction hash (hex-encoded) */
  hash: string;
  /** Final ledger sequence in which the transaction was included */
  ledger: number;
  /** Whether the transaction was successful */
  successful: boolean;
  /** Optional decoded return value from the contract invocation */
  returnValue?: unknown;
}

// ---------------------------------------------------------------------------
// Token module — params for token write operations
// ---------------------------------------------------------------------------

/** Parameters for {@code mint(to, amount)}. */
export interface MintParams {
  /** Stellar account address that receives the freshly minted tokens */
  to: string;
  /** Token amount to mint (in stroops / smallest denomination) */
  amount: bigint;
}

/** Parameters for {@code transfer(from, to, amount)}. */
export interface TransferParams {
  /** Stellar account address that sends the tokens */
  from: string;
  /** Stellar account address that receives the tokens */
  to: string;
  /** Token amount to transfer (in stroops) */
  amount: bigint;
}

/** Parameters for {@code approve(from, spender, amount, expirationLedger)}. */
export interface ApproveParams {
  /** Stellar account address granting the allowance */
  from: string;
  /** Stellar account address that is allowed to spend */
  spender: string;
  /** Allowance amount (in stroops) */
  amount: bigint;
  /** Ledger sequence number after which the allowance expires */
  expirationLedger: number;
}

/** Parameters for {@code burn(amount)}. */
export interface BurnParams {
  /** Token amount to destroy from the caller's own balance (in stroops) */
  amount: bigint;
}

/** Estimated fee details returned by simulation helpers. */
export interface FeeEstimate {
  /** Estimated fee in stroops */
  feeLumens: string;
  /** Formatted XLM fee string */
  feeXLM: string;
  /** Ledger sequence number when fee was estimated */
  estimatedLedger: number;
}