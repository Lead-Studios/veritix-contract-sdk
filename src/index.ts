/**
 * @module @veritix/contract-sdk
 * Public API barrel — re-exports everything a consumer needs.
 *
 * @example
 * ```ts
 * import {
 *   VeriTixClient,
 *   getTestnetConfig,
 *   VeriTixError,
 *   VeriTixErrorCode,
 *   DisputeStatus,
 * } from '@veritix/contract-sdk';
 * ```
 */

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export { VeriTixClient } from './client';
export type { WatchOptions } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  StellarNetwork,
  NetworkConfig,
  ContractMetadata,
  EscrowRecord,
  TicketEscrowParams,
  SplitRecord,
  SplitRecipient,
  DisputeRecord,
  RecurringRecord,
  RecurringExecutionEntry,
  TransactionResult,
  WatchOptions,
} from './types/index';

export { DisputeStatus } from './types/index';

// ---------------------------------------------------------------------------
// Module classes (for consumers who want to type-hint module references)
// ---------------------------------------------------------------------------
export { TokenModule } from './modules/token';
export { EscrowModule } from './modules/escrow';
export { DisputeModule } from './modules/dispute';
export { SplitterModule } from './modules/splitter';
export { RecurringModule } from './modules/recurring';
export { AdminModule } from './modules/admin';
export { BatchModule } from './modules/batch';

// Module param types
export type { MintParams, BurnParams, TransferParams, ApproveParams } from './modules/token';
export type { CreateEscrowParams } from './modules/escrow';
export type { OpenDisputeParams, ResolveDisputeParams } from './modules/dispute';
export type { CreateSplitParams } from './modules/splitter';
export type { SetupRecurringParams } from './modules/recurring';
export type { BatchMintEntry, BatchTransferEntry } from './modules/batch';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export { VeriTixError, VeriTixErrorCode, parseSorobanError } from './utils/errors';

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------
export {
  getTestnetConfig,
  getMainnetConfig,
  getHorizonUrl,
  ledgersFromNow,
  ledgersFromDate,
  ledgerToApproxDate,
  TESTNET_PASSPHRASE,
  MAINNET_PASSPHRASE,
  LEDGER_CLOSE_SECONDS,
  isValidStellarAddress,
  assertValidAddress,
} from './utils/network';

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export { stroopsToXLM, xlmToStroops, formatXLM } from './utils/format';

// ---------------------------------------------------------------------------
// Transaction helpers (for advanced / custom use)
// ---------------------------------------------------------------------------
export type { PreparedTransaction } from './utils/transaction';
export {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
} from './utils/transaction';
