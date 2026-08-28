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
export { VeriTixClientExtended } from './client-extended';
export { VeriTixClientPool } from './pool';
export { createSafeToJSON, createSafeInspect } from './client-security';
export { VeriTixSDK } from './namespace';
export { createFromFreighter } from './modules/freighter-factory';
// NOTE: WatchOptions was previously exported from './client' (deprecated).
// The canonical export is from './types/index' below.
// @deprecated importing WatchOptions from './client' — use './types/index' directly.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  StellarNetwork,
  NetworkConfig,
  ContractMetadata,
  EscrowRecord,
  TicketEscrowParams,
  BatchSettlementResult,
  AccountInfo,
  SplitRecord,
  SplitRecipient,
  DisputeRecord,
  RecurringRecord,
  RecurringExecutionEntry,
  TransactionResult,
  WatchOptions,
  VeriTixEvent,
  StreamEventOptions,
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
export { EventsService } from './modules/events-service';
export { EventDashboard } from './modules/events-dashboard';
export { EventGalleryService } from './modules/event-gallery.service';
export { RevenueAnalyticsModule } from './modules/analytics/revenue-analytics.service';
export { TicketAnalyticsModule } from './modules/analytics/ticket-analytics.service';
export { CollaboratorModule } from './modules/collaborator/collaborator.service';
export { TicketPurchaseModule } from './modules/ticket/ticket-purchase.service';

// Module param types
export type { MintParams, BurnParams, TransferParams, ApproveParams } from './modules/token';
export type { CreateEscrowParams } from './modules/escrow';
export type { OpenDisputeParams, ResolveDisputeParams } from './modules/dispute';
export type { CreateSplitParams } from './modules/splitter';
export type { SetupRecurringParams } from './modules/recurring';
export type { BatchMintEntry, BatchTransferEntry } from './modules/batch';
// New module types
export type { Event, EventFilter } from './modules/events-service';
export type { DashboardMetrics } from './modules/events-dashboard';
export type { RevenuePeriod, TicketSale } from './modules/analytics/revenue-analytics.service';
export type { TicketPeriod, ExportFormat, TicketOrder } from './modules/analytics/ticket-analytics.service';
export type { Collaborator, CollaboratorUpdate } from './modules/collaborator/collaborator.service';
export type { BillingDetails, AddressDetails, PurchaseRequest, Receipt } from './modules/ticket/ticket-purchase.service';

// Module constants
export { TRANSACTION_CHARGE_RATE } from './modules/analytics/revenue-analytics.service';
export { MAX_COLLABORATORS_PER_EVENT } from './modules/collaborator/collaborator.service';

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
// ScVal conversion helpers
// ---------------------------------------------------------------------------
export {
  addressToScVal,
  bigintToScVal,
  boolToScVal,
  stringToScVal,
  scValToString,
  scValToBigint,
  scValToBoolean,
  scValToNumber,
} from './utils/scval';

// ---------------------------------------------------------------------------
// XDR struct parsers
// ---------------------------------------------------------------------------
export {
  parseEscrowRecord,
  parseSplitRecord,
  parseDisputeRecord,
  parseRecurringRecord,
} from './utils/parsers';

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export { stroopsToXLM, xlmToStroops, formatXLM } from './utils/format';

// ---------------------------------------------------------------------------
// Transaction helpers (for advanced / custom use)
// ---------------------------------------------------------------------------
export type { PreparedTransaction, SubmitTransactionOptions } from './utils/transaction';
export {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
} from './utils/transaction';