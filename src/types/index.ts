/**
 * @module types
 * Shared TypeScript interfaces and enums that mirror the VeriTix Soroban contract structs.
 * These types are used across all SDK modules to ensure end-to-end type safety.
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * Identifies which Stellar network the SDK should connect to.
 */
export type StellarNetwork = 'testnet' | 'mainnet';

/**
 * Full configuration required to initialise a {@link VeriTixClient}.
 */
export interface NetworkConfig {
  /** "testnet" or "mainnet" */
  network: StellarNetwork;
  /** Bech32-encoded Soroban contract ID (e.g. "CXXXXXXX…") */
  contractId: string;
  /** Soroban RPC endpoint URL */
  rpcUrl: string;
  /** Stellar network passphrase used for transaction signing */
  networkPassphrase: string;
  /** Number of connect() retry attempts on transient failure (default 3) */
  retries?: number;
  /** Base delay in ms between retries — doubles each attempt (default 1000) */
  retryDelayMs?: number;
}

/**
 * Token metadata returned by {@link VeriTixClient.getContractMetadata}.
 */
export interface ContractMetadata {
  /** Human-readable token name */
  name: string;
  /** Token ticker symbol */
  symbol: string;
  /** Number of decimal places */
  decimal: number;
  /** Total token supply (in smallest denomination) */
  totalSupply: bigint;
  /** Soroban contract ID */
  contractId: string;
  /** Network the contract is deployed on */
  network: StellarNetwork;
}

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------

/**
 * On-chain record for a single escrow deposit.
 * Mirrors the `EscrowRecord` struct in the VeriTix contract.
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
 * Parameters used when creating a ticket escrow for a specific event.
 */
export interface TicketEscrowParams {
  /** Stellar account address for the event organizer / ticket beneficiary */
  organizer: string;
  /** Ticket price amount to lock in escrow (in stroops) */
  ticketPrice: bigint;
  /** Ledger sequence number when the event occurs */
  eventLedger: number;
  /** Unique ticket reference identifier attached on-chain */
  ticketRef: string;
  /** Optional number of ledger buffers beyond the event ledger */
  bufferLedgers?: number;
}

/**
 * Result of a batch escrow settlement operation via {@link EscrowModule.settleEvent}.
 */
export interface BatchSettlementResult {
  /** Number of escrows successfully settled */
  settled: number;
  /** Escrow IDs that failed to settle */
  failed: bigint[];
  /** Transaction hashes for all submitted settlement transactions */
  txHashes: string[];
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/**
 * A single recipient entry within a {@link SplitRecord}.
 * Basis points (BPS) are used so that shares sum to exactly 10 000.
 */
export interface SplitRecipient {
  /** Stellar account address of the recipient */
  address: string;
  /**
   * Share of the total amount expressed in basis points (1 bps = 0.01 %).
   * All recipients in a split must sum to exactly 10 000 bps.
   */
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

// ---------------------------------------------------------------------------
// Dispute
// ---------------------------------------------------------------------------

/**
 * Current lifecycle state of a dispute.
 */
export enum DisputeStatus {
  /** Dispute has been opened and is awaiting resolution */
  Open = 'Open',
  /** Resolver ruled in favour of the escrow beneficiary */
  ResolvedForBeneficiary = 'ResolvedForBeneficiary',
  /** Resolver ruled in favour of the escrow depositor */
  ResolvedForDepositor = 'ResolvedForDepositor',
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
  /** Current status of the dispute */
  status: DisputeStatus;
  /** Ledger sequence number when the dispute was opened */
  openedAt: number;
}

// ---------------------------------------------------------------------------
// Recurring payment
// ---------------------------------------------------------------------------

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
  /** Ledger sequence number when the most recent charge was executed */
  lastChargedLedger: number;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

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

/**
 * Result of a dry-run simulation via {@link VeriTixClient.simulate}.
 */
export interface SimulationResult {
  /** Whether the simulated call would succeed */
  success: boolean;
  /** The decoded return value from the contract (if successful) */
  returnValue: unknown;
  /** Estimated transaction fee in stroops */
  estimatedFee: string;
  /** Error message if the simulation failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

/**
 * Human-readable fee estimate returned by {@link estimateFee}.
 */
export interface FeeEstimate {
  /** Raw fee in stroops (smallest Stellar denomination) */
  feeLumens: string;
  /**
   * Fee converted to XLM (stroops ÷ 10 000 000), formatted to 7 decimal
   * places for display purposes.
   */
  feeXLM: string;
  /** The latest ledger sequence at the time of estimation */
  estimatedLedger: number;
}
