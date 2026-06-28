/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule.transferBatch() and transferBatchWithMemo().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import type { BatchTransferRecipient, BatchTransferWithMemoRecipient } from "../src/modules/batch";

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

describe("BatchModule.transferBatch() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.transferBatch([{ address: addr(), amount: 1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty recipients array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 recipients", async () => {
    const client = makeClient(Keypair.random());
    const recipients: BatchTransferRecipient[] = Array.from({ length: 51 }, () => ({ address: addr(), amount: 1n }));
    await expect(client.batch.transferBatch(recipients))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatch([{ address: addr(), amount: 0n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws INVALID_AMOUNT when any amount is negative", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatch([{ address: addr(), amount: -5n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });
});

  it("accepts exactly 50 recipients without error", async () => {
    const client = makeClient(Keypair.random());
    const recipients: BatchTransferRecipient[] = Array.from({ length: 50 }, () => ({ address: addr(), amount: 1_000n }));
    const result = await client.batch.transferBatch(recipients);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.transferBatch() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.transferBatch([{ address: addr(), amount: 1_000n }]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'transfer_batch' method name", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.transferBatch([{ address: addr(), amount: 500_000n }]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    const callArgs = buildMock.mock.calls[0];
    expect(callArgs[2]).toBe(FAKE_CONTRACT);
    expect(callArgs[3]).toBe("transfer_batch");
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.transferBatch([{ address: addr(), amount: 1_000n }]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });
});

describe("BatchModule.transferBatchWithMemo() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.transferBatchWithMemo([{ address: addr(), amount: 1n, memo: "x" }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty recipients array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatchWithMemo([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 recipients", async () => {
    const client = makeClient(Keypair.random());
    const recipients: BatchTransferWithMemoRecipient[] = Array.from({ length: 51 }, () => ({ address: addr(), amount: 1n, memo: "x" }));
    await expect(client.batch.transferBatchWithMemo(recipients))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatchWithMemo([{ address: addr(), amount: 0n, memo: "ok" }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws when a memo exceeds 64 bytes", async () => {
    const client = makeClient(Keypair.random());
    const longMemo = "a".repeat(65);
    await expect(client.batch.transferBatchWithMemo([{ address: addr(), amount: 1_000n, memo: longMemo }]))
      .rejects.toThrow("exceeds 64 bytes");
  });

  it("accepts a memo of exactly 64 bytes", async () => {
    const client = makeClient(Keypair.random());
    const exactMemo = "b".repeat(64);
    const result = await client.batch.transferBatchWithMemo([{ address: addr(), amount: 1_000n, memo: exactMemo }]);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.transferBatchWithMemo() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.transferBatchWithMemo([{ address: addr(), amount: 1_000n, memo: "ref-001" }]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'transfer_batch_with_memo' method name", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.transferBatchWithMemo([{ address: addr(), amount: 500_000n, memo: "ref-002" }]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    const callArgs = buildMock.mock.calls[0];
    expect(callArgs[2]).toBe(FAKE_CONTRACT);
    expect(callArgs[3]).toBe("transfer_batch_with_memo");
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.transferBatchWithMemo([{ address: addr(), amount: 1_000n, memo: "x" }]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });
});
