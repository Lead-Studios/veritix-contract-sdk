/**
 * @module types/documentation
 * Comprehensive JSDoc reference for all VeriTix SDK types.
 * This file documents field meanings, constraints, and usage patterns.
 */

/**
 * NetworkConfig Field Reference:
 * - network: 'testnet' (slower, for development) or 'mainnet' (production)
 * - contractId: 42-character Soroban contract address starting with C
 * - rpcUrl: Soroban RPC endpoint (e.g., https://soroban-testnet.stellar.org)
 * - networkPassphrase: "Test SDF Network ; September 2015" or "Public Global Stellar Network ; September 2015"
 * - retries: Exponential backoff retries (default 3, max recommended 5)
 * - retryDelayMs: Initial delay in ms (default 1000, increases exponentially)
 */

/**
 * EscrowRecord Field Reference:
 * - id: Unique numeric identifier (u64) assigned by contract at creation
 * - depositor: Source account that locked funds (must have created the escrow)
 * - beneficiary: Recipient account that can claim released funds
 * - amount: Locked token amount in stroops (1 XLM = 10,000,000 stroops)
 * - released: True if beneficiary claimed the funds
 * - refunded: True if depositor reclaimed after expiry
 * - expiryLedger: Ledger after which depositor can refund (e.g., current + 1000)
 * - memos: Array of text notes (max 3 memos per SDK, arbitrary strings)
 *
 * Lifecycle: created → (released OR refunded) → finalized
 */

/**
 * SplitRecord Field Reference:
 * - id: Unique split identifier (u64)
 * - sender: Account that initiated the split (owns the funds initially)
 * - recipients: Ordered list with exactly 10,000 bps total
 * - totalAmount: Amount in stroops to distribute across recipients
 * - distributed: True if all transfers to recipients completed
 * - cancelled: True if split was cancelled before distribution
 *
 * Basis Points (bps): 10,000 bps = 100%, so 2,500 bps = 25%
 * All recipient shares must sum to exactly 10,000 bps
 */

/**
 * DisputeRecord Field Reference:
 * - id: Unique dispute identifier (u64)
 * - escrowId: The escrow this dispute is attached to
 * - claimant: Account that raised the dispute (either depositor or beneficiary)
 * - resolver: Arbitrator account designated to rule
 * - status: Open, ResolvedForBeneficiary, or ResolvedForDepositor
 * - openedAt: Ledger sequence when dispute was created
 *
 * Dispute Flow:
 * 1. Claimant opens dispute against escrow
 * 2. Resolver investigates and rules
 * 3. Escrow is released to winner
 * 4. Dispute transitions to resolved state
 */

/**
 * RecurringRecord Field Reference:
 * - id: Unique recurring payment identifier (u64)
 * - payer: Account charged every interval (must authorize recurring contract)
 * - payee: Account that receives funds
 * - amount: Fixed amount in stroops per interval
 * - interval: Number of ledgers between charges (approx 5s per ledger)
 * - active: True if recurring is still charging (false if cancelled)
 * - lastChargedLedger: Most recent ledger when charge was executed
 *
 * Interval Example: 1200 ledgers ≈ 100 minutes (5s × 1200)
 */

export const TypeDocumentation = {
  description: 'Comprehensive documentation for VeriTix SDK types',
  types: [
    'NetworkConfig',
    'ContractMetadata',
    'EscrowRecord',
    'SplitRecord',
    'DisputeRecord',
    'RecurringRecord',
    'TransactionResult',
    'SimulationResult',
  ],
};
