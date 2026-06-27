/**
 * @file tests/batch.test.ts
 * Unit tests for BatchModule (mintBatch, transferBatch, transferBatchWithMemo).
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import type {
  BatchMintEntry,
  BatchTransferRecipient,
  BatchTransferWithMemoRecipient,
} from "../src/modules/batch";

const FAKE_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

jest.mock("../src/utils/transaction", () => {
  const actual = jest.requireActual("../src/utils/transaction");
  return {
    ...actual,
    buildContractCall: jest.fn().mockResolvedValue({}),
    simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: "100" }),
    submitTransaction: jest.fn().mockResolvedValue({
      hash: "mockhash",
      ledger: 1,
      successful: true,
    }),
  };
});

import * as txUtils from "../src/utils/transaction";

/**
 * Unified helper (merged from both branches)
 */
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

function addr() {
  return Keypair.random().publicKey();
}

beforeEach(() => jest.clearAllMocks());

/* -------------------------------------------------------------------------- */
/*                                   mintBatch                                */
/* -------------------------------------------------------------------------- */

describe("BatchModule.mintBatch — validation", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const client = makeClient();
    await expect(client.batch.mintBatch([{ to: addr(), amount: 1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty entries array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.mintBatch([]))
      .rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE when more than 50 entries provided", async () => {
    const client = makeClient(Keypair.random());
    const entries: BatchMintEntry[] = Array.from({ length: 51 }, () => ({
      to: addr(),
      amount: 1n,
    }));
    await expect(client.batch.mintBatch(entries))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT for zero or negative amounts", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.mintBatch([{ to: addr(), amount: 0n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });

    await expect(client.batch.mintBatch([{ to: addr(), amount: -1n }]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });

  it("throws for duplicate recipients", async () => {
    const client = makeClient(Keypair.random());
    const dup = addr();

    await expect(
      client.batch.mintBatch([
        { to: dup, amount: 1n },
        { to: dup, amount: 2n },
      ])
    ).rejects.toThrow("duplicate");
  });

  it("accepts exactly 50 recipients", async () => {
    const client = makeClient(Keypair.random());
    const entries: BatchMintEntry[] = Array.from({ length: 50 }, () => ({
      to: addr(),
      amount: 1000n,
    }));

    const result = await client.batch.mintBatch(entries);
    expect(result.successful).toBe(true);
  });
});

describe("BatchModule.mintBatch — execution", () => {
  it("returns TransactionResult", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.mintBatch([
      { to: addr(), amount: 500_000n },
      { to: addr(), amount: 750_000n },
    ]);

    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("calls correct contract method", async () => {
    const client = makeClient(Keypair.random());

    await client.batch.mintBatch([{ to: addr(), amount: 1000n }]);

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
});

/* -------------------------------------------------------------------------- */
/*                                transferBatch                               */
/* -------------------------------------------------------------------------- */

describe("BatchModule.transferBatch — validation", () => {
  it("throws ADMIN_UNAUTHORIZED", async () => {
    const client = makeClient();
    await expect(
      client.batch.transferBatch([{ address: addr(), amount: 1n }])
    ).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for empty array", async () => {
    const client = makeClient(Keypair.random());
    await expect(client.batch.transferBatch([])).rejects.toThrow("must not be empty");
  });

  it("throws BATCH_TOO_LARGE", async () => {
    const client = makeClient(Keypair.random());
    const recipients: BatchTransferRecipient[] = Array.from({ length: 51 }, () => ({
      address: addr(),
      amount: 1n,
    }));

    await expect(client.batch.transferBatch(recipients))
      .rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it("throws INVALID_AMOUNT", async () => {
    const client = makeClient(Keypair.random());
    await expect(
      client.batch.transferBatch([{ address: addr(), amount: 0n }])
    ).rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });
});

describe("BatchModule.transferBatch — execution", () => {
  it("returns TransactionResult", async () => {
    const client = makeClient(Keypair.random());
    const result = await client.batch.transferBatch([
      { address: addr(), amount: 1000n },
    ]);

    expect(result.successful).toBe(true);
  });

  it("calls transfer_batch", async () => {
    const client = makeClient(Keypair.random());

    await client.batch.transferBatch([{ address: addr(), amount: 1000n }]);

    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("transfer_batch");
  });
});

/* -------------------------------------------------------------------------- */
/*                          transferBatchWithMemo                             */
/* -------------------------------------------------------------------------- */

describe("BatchModule.transferBatchWithMemo — validation", () => {
  it("throws ADMIN_UNAUTHORIZED", async () => {
    const client = makeClient();
    await expect(
      client.batch.transferBatchWithMemo([{ address: addr(), amount: 1n, memo: "x" }])
    ).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

