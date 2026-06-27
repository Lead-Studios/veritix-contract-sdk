/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule — mintBatch() and approveBatch().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import type { BatchMintEntry, BatchApprovalEntry } from "../src/modules/batch";

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

function makeConnectedClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: CURRENT_LEDGER }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return { client, mockServer };
}

function addr() { return Keypair.random().publicKey(); }
function approval(expirationLedger = FUTURE_LEDGER): BatchApprovalEntry {
  return { spender: addr(), amount: 1_000_000n, expirationLedger };
}

beforeEach(() => jest.clearAllMocks());

describe("BatchModule.mintBatch -- validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeConnectedClient();
    await expect(client.batch.mintBatch([{ to: addr(), amount: 1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty entries array", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.mintBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE when more than 50 entries provided", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const entries: BatchMintEntry[] = Array.from({ length: 51 }, () => ({ to: addr(), amount: 1n }));
    await expect(client.batch.mintBatch(entries))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT for zero amount entry", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.mintBatch([{ to: addr(), amount: 0n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws for duplicate recipient addresses", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const dup = addr();
    await expect(client.batch.mintBatch([
      { to: dup, amount: 1n },
      { to: dup, amount: 2n },
    ])).rejects.toThrow("duplicate");
  });

  it("accepts exactly 50 unique recipients without error", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const entries: BatchMintEntry[] = Array.from({ length: 50 }, () => ({ to: addr(), amount: 1_000n }));
    const result = await client.batch.mintBatch(entries);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.mintBatch -- successful call", () => {
  it("calls mint_batch and returns TransactionResult", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const result = await client.batch.mintBatch([{ to: addr(), amount: 500_000n }]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("invokes buildContractCall with mint_batch method name", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.mintBatch([{ to: addr(), amount: 1_000n }]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT,
      "mint_batch",
      expect.any(Array),
      expect.any(String),
    );
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    await client.batch.mintBatch([{ to: addr(), amount: 1_000n }]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});

describe("BatchModule.approveBatch() -- validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeConnectedClient();
    await expect(client.batch.approveBatch([approval()]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty approvals array", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.approveBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 21 approvals", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const approvals: BatchApprovalEntry[] = Array.from({ length: 21 }, () => approval());
    await expect(client.batch.approveBatch(approvals))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 0n, expirationLedger: FUTURE_LEDGER }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws INVALID_AMOUNT when any amount is negative", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: -1n, expirationLedger: FUTURE_LEDGER }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws when expirationLedger equals current ledger", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 1n, expirationLedger: CURRENT_LEDGER }]))
      .rejects.toThrow("must be in the future");
  });

  it("throws when expirationLedger is in the past", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.approveBatch([{ spender: addr(), amount: 1n, expirationLedger: CURRENT_LEDGER - 1 }]))
      .rejects.toThrow("must be in the future");
  });

  it("accepts exactly 20 approvals without error", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const approvals: BatchApprovalEntry[] = Array.from({ length: 20 }, () => approval());
    const result = await client.batch.approveBatch(approvals);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.approveBatch() -- successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const result = await client.batch.approveBatch([approval()]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'approve_batch' method", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.approveBatch([approval()]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("approve_batch");
  });

  it("fetches the current ledger to validate expiry", async () => {
    const { client, mockServer } = makeConnectedClient(Keypair.random());
    await client.batch.approveBatch([approval()]);
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("invokes simulateTransaction once", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.approveBatch([approval()]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the caller keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    await client.batch.approveBatch([approval()]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});
