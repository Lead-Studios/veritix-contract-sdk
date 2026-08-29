/**
 * @file tests/admin.test.ts
 * Unit tests for AdminModule — proposeAdmin(), acceptAdmin(), getPendingAdmin(),
 * pause(), unpause(), setProtocolFee(), dividendDistribute(), cancelEvent(),
 * manualRefund(), forceRefundEscrow(). Issues #470 / #471.
 */

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../src/client";
import { getTestnetConfig } from "../src/utils/network";
import { VeriTixError, VeriTixErrorCode } from "../src/utils/errors";
import { scValToBigint, scValToNumber, scValToString } from "../src/utils/scval";

const FAKE_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const FAKE_ADMIN    = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const FAKE_RECIPIENT = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

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

// ---------------------------------------------------------------------------
// #470 — proposeAdmin / acceptAdmin / getPendingAdmin
// ---------------------------------------------------------------------------
describe("AdminModule.proposeAdmin()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.proposeAdmin(Keypair.random().publicKey()))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("submits with the correct new_admin arg", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const newAdmin = Keypair.random().publicKey();
    await client.admin.proposeAdmin(newAdmin);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalled();
    expect(buildMock.mock.calls[0][3]).toBe("propose_admin");
    const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
    expect(args).toHaveLength(1);
    expect(scValToString(args[0])).toBe(newAdmin);
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.proposeAdmin(Keypair.random().publicKey());
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });
});

describe("AdminModule.acceptAdmin()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.acceptAdmin())
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("submits with method 'accept_admin' and empty args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.acceptAdmin();
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("accept_admin");
    expect(buildMock.mock.calls[0][4]).toEqual([]);
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.acceptAdmin();
    expect(result.successful).toBe(true);
  });
});

describe("AdminModule.getPendingAdmin()", () => {
  it("throws READ_ONLY_CLIENT when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.getPendingAdmin())
      .rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it("returns null when no proposal is pending", async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeAdminClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: "SUCCESS",
      result: { retval: xdr.ScVal.scvVoid() },
    });
    await expect(client.admin.getPendingAdmin()).resolves.toBeNull();
  });

  it("returns the pending admin address string when a proposal exists", async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeAdminClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: "SUCCESS",
      result: { retval: xdr.ScVal.scvString(FAKE_ADMIN) },
    });
    const pending = await client.admin.getPendingAdmin();
    expect(pending).toBe(FAKE_ADMIN);
  });
});

// ---------------------------------------------------------------------------
// #471 — pause / unpause / setProtocolFee / dividendDistribute
// ---------------------------------------------------------------------------
describe("AdminModule.pause()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.pause())
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("submits a call to method 'pause' with no args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.pause();
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("pause");
    expect(buildMock.mock.calls[0][4]).toEqual([]);
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.pause();
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });
});

describe("AdminModule.unpause()", () => {
  it("throws when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.unpause()).rejects.toMatchObject({
      code: VeriTixErrorCode.AdminUnauthorized,
    });
  });

  it("submits a call to method 'unpause' with no args", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.unpause();
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("unpause");
    expect(buildMock.mock.calls[0][4]).toEqual([]);
  });
});

describe("AdminModule.setProtocolFee()", () => {
  it("submits a call to method 'set_protocol_fee' with the correct fee_bps arg", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.setProtocolFee(250);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("set_protocol_fee");
    const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
    expect(args).toHaveLength(1);
    expect(scValToNumber(args[0])).toBe(250);
  });

  it("returns a TransactionResult on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.setProtocolFee(100);
    expect(result.hash).toBe("mockhash");
    expect(result.successful).toBe(true);
  });
});

describe("AdminModule.dividendDistribute()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.dividendDistribute([FAKE_RECIPIENT], 1_000_000n))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws when totalAmount is not positive", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await expect(client.admin.dividendDistribute([FAKE_RECIPIENT], 0n))
      .rejects.toThrow("totalAmount must be greater than zero");
  });

  it("submits a call to method 'dividend_distribute' with the correct total_amount arg", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.dividendDistribute([FAKE_RECIPIENT], 10_000_000n);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("dividend_distribute");
    const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
    expect(args).toHaveLength(2);
    expect(scValToBigint(args[1])).toBe(10_000_000n);
  });
});

// ---------------------------------------------------------------------------
// Pre-existing admin tests kept for regression
// ---------------------------------------------------------------------------
describe("AdminModule.cancelEvent()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.cancelEvent([1n]))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("throws for an empty escrowIds array", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await expect(client.admin.cancelEvent([])).rejects.toThrow("must not be empty");
  });

  it("returns a BatchSettlementResult with settled count on success", async () => {
    const { client } = makeAdminClient(Keypair.random());
    const result = await client.admin.cancelEvent([1n, 2n, 3n]);
    expect(result.settled).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(result.txHashes).toHaveLength(1);
    expect(result.txHashes[0]).toBe("mockhash");
  });
});

describe("AdminModule.manualRefund()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.manualRefund(1n, "reason"))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("submits a call to method 'force_refund_escrow' with escrowId and reason", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.manualRefund(99n, "refund reason");
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("force_refund_escrow");
    const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
    expect(args).toHaveLength(2);
  });
});

describe("AdminModule.forceRefundEscrow()", () => {
  it("throws ADMIN_UNAUTHORIZED when no keypair is provided", async () => {
    const { client } = makeAdminClient();
    await expect(client.admin.forceRefundEscrow(1n))
      .rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it("submits a call to method 'force_refund_escrow'", async () => {
    const { client } = makeAdminClient(Keypair.random());
    await client.admin.forceRefundEscrow(42n);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe("force_refund_escrow");
  });
});
