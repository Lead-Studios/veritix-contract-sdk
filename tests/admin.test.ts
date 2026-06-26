/**
 * @file tests/admin.test.ts
 * Unit tests for AdminModule.proposeAdmin(), acceptAdmin(), getPendingAdmin().
 */

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import { stringToScVal } from "../src/utils/scval";

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
    simulateTransaction: jest.fn().mockResolvedValue({
      _parsed: true,
      latestLedger: 100,
      result: { retval: stringToScVal("GNEWADMIN000000000000000000000000000000000000000000") },
    }),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return { client, mockServer };
}

beforeEach(() => jest.clearAllMocks());

describe("AdminModule.proposeAdmin()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.proposeAdmin(Keypair.random().publicKey()))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("calls buildContractCall with 'propose_admin' and the new admin address", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const newAdmin = Keypair.random().publicKey();
    await client.admin.proposeAdmin(newAdmin);
    expect(txUtils.buildContractCall as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT,
      "propose_admin",
      expect.arrayContaining([expect.objectContaining({ switch: expect.any(Function) })]),
      expect.any(String),
    );
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.proposeAdmin(Keypair.random().publicKey());
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });

  it("invokes simulateTransaction once per call", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.proposeAdmin(Keypair.random().publicKey());
    expect(txUtils.simulateTransaction as jest.Mock).toHaveBeenCalledTimes(1);
  });
});

describe("AdminModule.acceptAdmin()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.acceptAdmin())
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("calls buildContractCall with 'accept_admin' and empty args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.acceptAdmin();
    expect(txUtils.buildContractCall as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT,
      "accept_admin",
      [],
      expect.any(String),
    );
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.acceptAdmin();
    expect(result.successful).toBe(true);
  });
});

describe("AdminModule.getPendingAdmin()", () => {
  it("returns a string address when pending admin exists", async () => {
    const { client, mockServer } = makeAdminClient(Keypair.random());
    const pending = Keypair.random().publicKey();
    mockServer.simulateTransaction.mockResolvedValueOnce({
      _parsed: true,
      latestLedger: 100,
      result: { retval: stringToScVal(pending) },
    });
    const result = await client.admin.getPendingAdmin();
    expect(result).toBe(pending);
  });

  it("returns null when no pending admin rotation is outstanding", async () => {
    const { client, mockServer } = makeAdminClient(Keypair.random());
    mockServer.simulateTransaction.mockResolvedValueOnce({
      _parsed: true,
      latestLedger: 100,
      result: null,
    });
    const result = await client.admin.getPendingAdmin();
    expect(result).toBeNull();
  });

  it("throws ReadOnlyClient when no keypair provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.getPendingAdmin())
      .rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });
});
