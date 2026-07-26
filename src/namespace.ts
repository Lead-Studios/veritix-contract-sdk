// VeriTixSDK namespace export for convenience
import { VeriTixClient, VeriTixError, VeriTixErrorCode, getTestnetConfig, getMainnetConfig, stroopsToXLM, xlmToStroops, DisputeStatus } from './index';

export const VeriTixSDK = {
  Client: VeriTixClient,
  Error: VeriTixError,
  ErrorCode: VeriTixErrorCode,
  getTestnetConfig,
  getMainnetConfig,
  stroopsToXLM,
  xlmToStroops,
  DisputeStatus,
} as const;
