/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule.clawbackBatch().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixErrorCode } from "../src/utils/errors";
import type { BatchClawbackTarget } from "../src/modules/batch";

const FAKE_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

jest.mock("../src/utils/transaction", () => {
  const actual = jest.requireActual("../src/utils/transaction");
  return {
    ...actual,
    buildContractCall: jest.fn().mockResolvedValue({}),
    simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: "100" }),
    submitTransaction: jest.fn().mockResolvedValue({ hash: "mockhash", ledger: 1, successful: true }),
  };
});

import * as txUtils from "../src/utils/transaction";

function makeClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return client;
}

function addr() { return Keypair.random().publicKey(); }

beforeEach(() => jest.clearAllMocks());

describe("BatchModule.clawbackBatch() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: 1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty targets array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.clawbackBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 targets", async () => {
    const client = makeClient(Keypair.random());
    const targets: BatchClawbackTarget[] = Array.from({ length: 51 }, () => ({ address: addr(), amount: 1n }));
    await expect(client.batch.clawbackBatch(targets))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: 0n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws INVALID_AMOUNT when any amount is negative", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: -1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws when a target address equals the contract ID", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: FAKE_CONTRACT, amount: 1_000n }]))
      .rejects.toThrow("must not be the contract address");
  });

  it("accepts exactly 50 targets without error", async () => {
    const client = makeClient(Keypair.random());
    const targets: BatchClawbackTarget[] = Array.from({ length: 50 }, () => ({ address: addr(), amount: 1_000n }));
    const result = await client.batch.clawbackBatch(targets);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.clawbackBatch() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.clawbackBatch([{ address: addr(), amount: 1_000_000n }]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'clawback_batch' method", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.clawbackBatch([{ address: addr(), amount: 500_000n }]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("clawback_batch");
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.clawbackBatch([{ address: addr(), amount: 1_000n }]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const client = makeClient(keypair);
    await client.batch.clawbackBatch([{ address: addr(), amount: 1_000n }]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});