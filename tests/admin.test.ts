/**
 * @file tests/admin.test.ts
 * Unit tests for AdminModule.cancelEvent() and manualRefund().
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

beforeEach(() => jest.clearAllMocks());

describe("AdminModule.cancelEvent()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.admin.cancelEvent([1n]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty escrowIds array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.admin.cancelEvent([]))
      .rejects.toThrow("must not be empty");
  });

  it("returns a BatchSettlementResult with settled count on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.admin.cancelEvent([1n, 2n, 3n]);
    expect(result.settled).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(result.txHashes).toHaveLength(1);
    expect(result.txHashes[0]).toBe("mockhash");
  });

  it("calls buildContractCall with 'cancel_event' method", async () => {
    const client = makeClient(Keypair.random());
    await client.admin.cancelEvent([10n]);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("cancel_event");
  });

  it("processes IDs in chunks of 50 and returns combined results", async () => {
    const client = makeClient(Keypair.random());
    const ids = Array.from({ length: 75 }, (_, i) => BigInt(i + 1));
    const result = await client.admin.cancelEvent(ids);
    expect(result.settled).toBe(75);
    expect(result.txHashes).toHaveLength(2);
  });

  it("collects failures without aborting remaining chunks", async () => {
    const client = makeClient(Keypair.random());
    (txUtils.submitTransaction as jest.Mock)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ hash: "ok", ledger: 2, successful: true });
    const ids = Array.from({ length: 60 }, (_, i) => BigInt(i + 1));
    const result = await client.admin.cancelEvent(ids);
    expect(result.failed).toHaveLength(50);
    expect(result.settled).toBe(10);
  });

  it("invokes submitTransaction once per chunk", async () => {
    const client = makeClient(Keypair.random());
    const ids = Array.from({ length: 100 }, (_, i) => BigInt(i + 1));
    await client.admin.cancelEvent(ids);
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledTimes(2);
  });
});

describe("AdminModule.manualRefund()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.admin.manualRefund(1n, "reason"))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("returns a TransactionResult on success", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.admin.manualRefund(42n, "organizer no-show");
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls buildContractCall with 'force_refund_escrow' method", async () => {
    const client = makeClient(Keypair.random());
    await client.admin.manualRefund(7n, "test reason");
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("force_refund_escrow");
  });

  it("encodes both escrowId and reason as contract args", async () => {
    const client = makeClient(Keypair.random());
    await client.admin.manualRefund(99n, "refund reason");
    const buildMock = txUtils.buildContractCall as jest.Mock;
    const args = buildMock.mock.calls[0][4] as unknown[];
    expect(args).toHaveLength(2);
  });

  it("invokes simulateTransaction once", async () => {
    const client = makeClient(Keypair.random());
    await client.admin.manualRefund(1n, "reason");
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });
});