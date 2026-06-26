/**
 * @file tests/admin.test.ts
 * Unit tests for AdminModule.pause() and unpause().
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";

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

function makeAdminClient(keypair?: Keypair) {
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

beforeEach(() => jest.clearAllMocks());

describe("AdminModule.pause()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.pause()).rejects.toMatchObject({
      code: VeriTixErrorCode.AdminUnauthorized,
    });
  });

  it("calls buildContractCall with method 'pause' and no args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.pause();
    expect(txUtils.buildContractCall as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT,
      "pause",
      [],
      expect.any(String),
    );
  });

  it("calls simulateTransaction once", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.pause();
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it("calls submitTransaction and returns TransactionResult", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.pause();
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("propagates CONTRACT_ALREADY_PAUSED error from contract", async () => {
    const { client } = makeAdminClient(Keypair.random());
    (txUtils.simulateTransaction as jest.Mock).mockRejectedValueOnce(
      new VeriTixError(VeriTixErrorCode.ContractAlreadyPaused, "Contract is already paused"),
    );
    await expect(client.admin.pause()).rejects.toMatchObject({
      code: VeriTixErrorCode.ContractAlreadyPaused,
    });
  });
});

describe("AdminModule.unpause()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.unpause()).rejects.toMatchObject({
      code: VeriTixErrorCode.AdminUnauthorized,
    });
  });

  it("calls buildContractCall with method 'unpause' and no args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.unpause();
    expect(txUtils.buildContractCall as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT,
      "unpause",
      [],
      expect.any(String),
    );
  });

  it("calls submitTransaction and returns TransactionResult", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.unpause();
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("propagates CONTRACT_NOT_PAUSED error from contract", async () => {
    const { client } = makeAdminClient(Keypair.random());
    (txUtils.simulateTransaction as jest.Mock).mockRejectedValueOnce(
      new VeriTixError(VeriTixErrorCode.ContractNotPaused, "Contract is not paused"),
    );
    await expect(client.admin.unpause()).rejects.toMatchObject({
      code: VeriTixErrorCode.ContractNotPaused,
    });
  });

  it("invokes submitTransaction with the admin keypair", async () => {
    const keypair = Keypair.random();
    const { client } = makeAdminClient(keypair);
    await client.admin.unpause();
    expect(txUtils.submitTransaction as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      keypair,
    );
  });
});
