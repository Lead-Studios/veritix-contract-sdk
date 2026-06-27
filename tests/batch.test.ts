/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule — mintBatch() and clawbackBatch().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import type { BatchMintEntry, BatchClawbackTarget } from "../src/modules/batch";

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

function makeConnectedClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return { client, mockServer };
}

function addr() { return Keypair.random().publicKey(); }

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

  it("throws INVALID_AMOUNT for negative amount entry", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.mintBatch([{ to: addr(), amount: -1n }]))
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

  it("accepts exactly 50 unique recipients without throwing a validation error", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const entries: BatchMintEntry[] = Array.from({ length: 50 }, () => ({ to: addr(), amount: 1_000n }));
    const result = await client.batch.mintBatch(entries);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.mintBatch -- successful call", () => {
  it("calls mint_batch and returns TransactionResult on success", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const result = await client.batch.mintBatch([
      { to: addr(), amount: 500_000n },
      { to: addr(), amount: 750_000n },
    ]);
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

  it("invokes simulateTransaction once per mintBatch call", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.mintBatch([{ to: addr(), amount: 1_000n }]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("invokes submitTransaction once per mintBatch call", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.mintBatch([{ to: addr(), amount: 1_000n }]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    await client.batch.mintBatch([{ to: addr(), amount: 1_000n }]);
    const submitMock = txUtils.submitTransaction as jest.Mock;
    expect(submitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      keypair,
    );
  });
});

describe("BatchModule.clawbackBatch() -- validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeConnectedClient();
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: 1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty targets array", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.clawbackBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 targets", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const targets: BatchClawbackTarget[] = Array.from({ length: 51 }, () => ({ address: addr(), amount: 1n }));
    await expect(client.batch.clawbackBatch(targets))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT when any amount is zero", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: 0n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws INVALID_AMOUNT when any amount is negative", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: addr(), amount: -1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws when a target address equals the contract ID", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await expect(client.batch.clawbackBatch([{ address: FAKE_CONTRACT, amount: 1_000n }]))
      .rejects.toThrow("must not be the contract address");
  });

  it("accepts exactly 50 targets without error", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const targets: BatchClawbackTarget[] = Array.from({ length: 50 }, () => ({ address: addr(), amount: 1_000n }));
    const result = await client.batch.clawbackBatch(targets);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.clawbackBatch() -- successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    const result = await client.batch.clawbackBatch([{ address: addr(), amount: 1_000_000n }]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'clawback_batch' method", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.clawbackBatch([{ address: addr(), amount: 500_000n }]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("clawback_batch");
  });

  it("invokes simulateTransaction once", async () => {
    const { client } = makeConnectedClient(Keypair.random());
    await client.batch.clawbackBatch([{ address: addr(), amount: 1_000n }]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    await client.batch.clawbackBatch([{ address: addr(), amount: 1_000n }]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});
