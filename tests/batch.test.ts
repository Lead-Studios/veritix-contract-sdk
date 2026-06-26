/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule.approveBatch().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixErrorCode } from "../src/utils/errors";
import type { BatchApprovalEntry } from "../src/modules/batch";

const FAKE_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const CURRENT_LEDGER = 1000;
const FUTURE_LEDGER = CURRENT_LEDGER + 5_000;

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
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: CURRENT_LEDGER }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return client;
}

function addr() { return Keypair.random().publicKey(); }
function approval(expirationLedger = FUTURE_LEDGER): BatchApprovalEntry {
  return { spender: addr(), amount: 1_000_000n, expirationLedger };
}

beforeEach(() => jest.clearAllMocks());

describe("BatchModule.approveBatch() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.approveBatch([approval()]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty approvals array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.approveBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 21 approvals", async () => {
    const client = makeClient(Keypair.random());
    const approvals: BatchApprovalEntry[] = Array.from({ length: 21 }, () => approval());
    await expect(client.batch.approveBatch(approvals))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 0n, expirationLedger: FUTURE_LEDGER }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws INVALID_AMOUNT when any amount is negative", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: -1n, expirationLedger: FUTURE_LEDGER }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws when expirationLedger equals the current ledger", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 1n, expirationLedger: CURRENT_LEDGER }]))
      .rejects.toThrow("must be in the future");
  });

  it("throws when expirationLedger is in the past", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 1n, expirationLedger: CURRENT_LEDGER - 1 }]))
      .rejects.toThrow("must be in the future");
  });

  it("accepts exactly 20 approvals without error", async () => {
    const client = makeClient(Keypair.random());
    const approvals: BatchApprovalEntry[] = Array.from({ length: 20 }, () => approval());
    const result = await client.batch.approveBatch(approvals);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.approveBatch() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.approveBatch([approval()]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'approve_batch' method", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.approveBatch([approval()]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("approve_batch");
  });

  it("fetches the current ledger to validate expiry", async () => {
    const keypair = Keypair.random();
    const client = makeClient(keypair);
    const mockServer = (client as any).server;
    await client.batch.approveBatch([approval()]);
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.approveBatch([approval()]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the caller keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const client = makeClient(keypair);
    await client.batch.approveBatch([approval()]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});