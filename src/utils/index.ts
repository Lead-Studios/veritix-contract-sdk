/**
 * @module utils
 * Barrel re-export for all utility helpers.
 */

// Error handling
export { VeriTixError, VeriTixErrorCode, parseSorobanError } from './errors';

// Network config
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
} from './network';

// ScVal conversion helpers
export {
  addressToScVal,
  bigintToScVal,
  boolToScVal,
  stringToScVal,
  scValToString,
  scValToBigint,
  scValToBoolean,
  scValToNumber,
} from './scval';

// XLM / stroop formatting helpers
export { stroopsToXLM, xlmToStroops, formatXLM } from './format';

// XDR struct parsers
export {
  parseEscrowRecord,
  parseSplitRecord,
  parseDisputeRecord,
  parseRecurringRecord,
} from './parsers';
