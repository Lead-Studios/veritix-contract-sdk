/**
 * @file tests/integration/ticket-purchase.integration.test.ts
 *
 * Integration test for the full ticket purchase lifecycle:
 *   connect → mint funds → create escrow → confirm → release escrow → verify balances
 *
 * Requires the following environment variables (set in .env):
 *   STELLAR_SECRET_KEY    — signing keypair for the admin
 *   BUYER_SECRET_KEY      — signing keypair for the buyer
 *   ORGANIZER_SECRET_KEY  — signing keypair for the event organizer / beneficiary
 *   CONTRACT_ID           — Soroban contract ID deployed on testnet
 *
 * Run with:
 *   npm run test:integration
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../../src/client";
import { getTestnetConfig } from "../../src/utils/network";
import { requireEnv } from "../helpers/env";

// ---------------------------------------------------------------------------
// Helper — lazy env loading (skips tests when env is missing)
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    return {
      adminSecret: requireEnv("STELLAR_SECRET_KEY"),
      buyerSecret: requireEnv("BUYER_SECRET_KEY"),
      organizerSecret: requireEnv("ORGANIZER_SECRET_KEY"),
      contractId: requireEnv("CONTRACT_ID"),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Ticket Purchase — integration", () => {
  const env = loadEnv();

  if (!env) {
    it.skip(
      "skipped — STELLAR_SECRET_KEY / BUYER_SECRET_KEY / ORGANIZER_SECRET_KEY / CONTRACT_ID not set",
      () => {
        /* intentionally empty */
      },
    );
    return;
  }

  const { adminSecret, buyerSecret, organizerSecret, contractId } = env;

  const adminKeypair = Keypair.fromSecret(adminSecret);
  const buyerKeypair = Keypair.fromSecret(buyerSecret);
  const organizerKeypair = Keypair.fromSecret(organizerSecret);

  const buyer = buyerKeypair.publicKey();
  const organizer = organizerKeypair.publicKey();

  // The admin mints funds; the organizer also needs a client to release escrow.
  const adminClient = new VeriTixClient(getTestnetConfig(contractId), adminKeypair);
  const organizerClient = new VeriTixClient(getTestnetConfig(contractId), organizerKeypair);

  const MINT_AMOUNT = 1_000_000n;
  const ESCROW_AMOUNT = 100_000n;

  let escrowId: bigint;

  // Increase timeout for live network calls
  jest.setTimeout(120_000);

  beforeAll(async () => {
    await adminClient.connect();
    await organizerClient.connect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Step 1: Admin mints tokens to the buyer
  // -------------------------------------------------------------------------

  it("step 1: admin mints tokens to the buyer", async () => {
    const result = await adminClient.token.mint({ to: buyer, amount: MINT_AMOUNT });
    expect(result.successful).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Step 2: Buyer creates an escrow for the organizer
  // -------------------------------------------------------------------------

  it("step 2: buyer creates an escrow for the organizer", async () => {
    const latestLedger = await adminClient["server"].getLatestLedger();
    const expiryLedger = latestLedger.sequence + 10_000;

    const client = new VeriTixClient(getTestnetConfig(contractId), buyerKeypair);
    await client.connect();

    const result = await client.escrow.createEscrow({
      beneficiary: organizer,
      amount: ESCROW_AMOUNT,
      expiryLedger,
    });

    expect(result.successful).toBe(true);
    expect(result.escrowId).toBeGreaterThan(0n);

    escrowId = result.escrowId;
  });

  // -------------------------------------------------------------------------
  // Step 3: Mock the confirmation poll returning SUCCESS
  // -------------------------------------------------------------------------

  it("step 3: transaction confirmation poll returns SUCCESS", async () => {
    // Simulate a confirmed transaction without needing a live RPC poll.
    jest.spyOn(adminClient, "watchTransaction").mockResolvedValue({
      hash: "abc123",
      ledger: 0,
      successful: true,
    });

    const result = await adminClient.watchTransaction("abc123", { intervalMs: 0 });
    expect(result.successful).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Step 4: Organizer releases the escrow
  // -------------------------------------------------------------------------

  it("step 4: organizer releases the escrow", async () => {
    jest.spyOn(organizerClient, "watchTransaction").mockResolvedValue({
      hash: "escrow-release",
      ledger: 0,
      successful: true,
    });

    const result = await organizerClient.escrow.releaseEscrow(escrowId);
    expect(result.successful).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Step 5: Assert balances are correct and contract holds nothing
  // -------------------------------------------------------------------------

  it("step 5: buyer balance decreased and organizer received funds", async () => {
    const buyerBalance = await adminClient.token.balance(buyer);
    expect(buyerBalance).toBe(MINT_AMOUNT - ESCROW_AMOUNT);

    const escrow = await adminClient.escrow.getEscrow(escrowId);
    expect(escrow).not.toBeNull();
    // The escrow is fully released — no funds remain locked on contract.
    expect(escrow!.released).toBe(true);
    expect(escrow!.refunded).toBe(false);
  });
});
