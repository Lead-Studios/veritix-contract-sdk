/**
 * @module @veritix/contract-sdk
 * Public entry point: the client, modules, shared types, errors and helpers.
 */
export { VeriTixClient } from './client';
export { VeriTixClientExtended } from './client-extended';
export { TokenModule } from './modules/token';
export { EscrowModule } from './modules/escrow';
export { DisputeModule } from './modules/dispute';
export * from './types';
export { VeriTixError, VeriTixErrorCode } from './utils/errors';
export {
  getTestnetConfig,
  getMainnetConfig,
  getHorizonUrl,
  isValidStellarAddress,
  ledgersFromNow,
  ledgersFromDate,
  ledgerToApproxDate,
} from './utils/network';
export type { NetworkConfig } from './utils/network';
export { stroopsToXLM, xlmToStroops } from './utils/format';
