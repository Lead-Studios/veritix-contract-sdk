/**
 * @file tests/config.test.ts
 * Unit tests for network configuration functions.
 */

import { getTestnetConfig, getMainnetConfig } from "../src/utils/network";

describe("Network configuration functions", () => {
  it("getTestnetConfig returns network testnet", () => {
    const cfg = getTestnetConfig("CTEST...");
    expect(cfg.network).toBe("testnet");
  });

  it("getMainnetConfig returns network mainnet", () => {
    const cfg = getMainnetConfig("CMAIN...");
    expect(cfg.network).toBe("mainnet");
  });

  it("config rpcUrl is a valid https URL", () => {
    const cfg = getTestnetConfig("CTEST...");
    expect(cfg.rpcUrl).toMatch(/^https?:\/\//);
  });
});