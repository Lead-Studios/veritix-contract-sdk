/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule.freezeBatch() and unfreezeBatch().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixErrorCode } from "../src/utils/errors";

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

describe("BatchModule.freezeBatch() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.freezeBatch([addr()]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty addresses array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.freezeBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 addresses", async () => {
    const client = makeClient(Keypair.random());
    const addresses = Array.from({ length: 51 }, () => addr());
    await expect(client.batch.freezeBatch(addresses))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("accepts exactly 50 addresses without error", async () => {
    const client = makeClient(Keypair.random());
    const addresses = Array.from({ length: 50 }, () => addr());
    const result = await client.batch.freezeBatch(addresses);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.freezeBatch() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.freezeBatch([addr()]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'freeze_batch' method", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.freezeBatch([addr(), addr()]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("freeze_batch");
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.freezeBatch([addr()]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const client = makeClient(keypair);
    await client.batch.freezeBatch([addr()]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});

describe("BatchModule.unfreezeBatch() — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.unfreezeBatch([addr()]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty addresses array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.unfreezeBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE for 51 addresses", async () => {
    const client = makeClient(Keypair.random());
    const addresses = Array.from({ length: 51 }, () => addr());
    await expect(client.batch.unfreezeBatch(addresses))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("accepts exactly 50 addresses without error", async () => {
    const client = makeClient(Keypair.random());
    const addresses = Array.from({ length: 50 }, () => addr());
    const result = await client.batch.unfreezeBatch(addresses);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.unfreezeBatch() — successful call", () => {
  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.unfreezeBatch([addr()]);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'unfreeze_batch' method", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.unfreezeBatch([addr(), addr()]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("unfreeze_batch");
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.batch.unfreezeBatch([addr()]);
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("passes the admin keypair to submitTransaction", async () => {
    const keypair = Keypair.random();
    const client = makeClient(keypair);
    await client.batch.unfreezeBatch([addr()]);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), keypair,
    );
  });
});