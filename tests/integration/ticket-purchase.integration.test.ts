/**
 * @file tests/integration/ticket-purchase.integration.test.ts
 *
 * End-to-end integration test for the full ticket purchase flow:
 *   connect client → create ticket escrow → verify escrow record → release → verify settled
 *
 * Requires the following environment variables (set in .env):
 *   STELLAR_SECRET_KEY   — signing keypair for the buyer (depositor)
 *   ORGANIZER_SECRET_KEY — signing keypair for the event organizer (beneficiary)
 *   CONTRACT_ID          — Soroban contract ID deployed on testnet
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
      buyerSecret: requireEnv("STELLAR_SECRET_KEY"),
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

describe("Ticket Purchase Flow — integration", () => {
  const env = loadEnv();

  if (!env) {
    it.skip("skipped — STELLAR_SECRET_KEY / ORGANIZER_SECRET_KEY / CONTRACT_ID not set", () => {
      /* intentionally empty */
    });
    return;
  }

  const { buyerSecret, organizerSecret, contractId } = env;

  const buyerKeypair = Keypair.fromSecret(buyerSecret);
  const organizerKeypair = Keypair.fromSecret(organizerSecret);

  const buyerClient = new VeriTixClient(getTestnetConfig(contractId), buyerKeypair);
  const organizerClient = new VeriTixClient(getTestnetConfig(contractId), organizerKeypair);

  const TICKET_PRICE = 1_000_000n;
  const ticketRef = `ticket-${Date.now()}`;

  let escrowId: bigint;
  let initialOrganizerBalance: bigint;

  // Increase timeout for live network calls
  jest.setTimeout(120_000);

  // ---------------------------------------------------------------------------
  // Connect clients
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    await buyerClient.connect();
    await organizerClient.connect();
  });

  // ---------------------------------------------------------------------------
  // Step 1: Fetch initial organizer balance
  // ---------------------------------------------------------------------------

  it("step 1: fetches initial organizer token balance", async () => {
    initialOrganizerBalance = await organizerClient.token.balance(organizerKeypair.publicKey());
    expect(typeof initialOrganizerBalance).toBe("bigint");
  });

  // ---------------------------------------------------------------------------
  // Step 2: Buyer creates a ticket escrow
  // ---------------------------------------------------------------------------

  it("step 2: buyer creates a ticket escrow for the organizer", async () => {
    const latestLedger = await buyerClient["server"].getLatestLedger();
    const eventLedger = latestLedger.sequence + 5_000;

    escrowId = await buyerClient.escrow.createTicketEscrow({
      organizer: organizerKeypair.publicKey(),
      ticketPrice: TICKET_PRICE,
      eventLedger,
      ticketRef,
    });

    expect(typeof escrowId).toBe("bigint");
    expect(escrowId).toBeGreaterThan(0n);
  });

  // ---------------------------------------------------------------------------
  // Step 3: Verify escrow record exists with correct fields
  // ---------------------------------------------------------------------------

  it("step 3: escrow record exists with correct amount and beneficiary", async () => {
    const record = await buyerClient.escrow.getEscrow(escrowId);

    expect(record).not.toBeNull();
    expect(record!.amount).toBe(TICKET_PRICE);
    expect(record!.beneficiary).toBe(organizerKeypair.publicKey());
    expect(record!.depositor).toBe(buyerKeypair.publicKey());
    expect(record!.released).toBe(false);
    expect(record!.refunded).toBe(false);
    expect(record!.memos).toContain(ticketRef);
  });

  // ---------------------------------------------------------------------------
  // Step 4: Advance past event ledger — skip if not possible
  //         In testnet we cannot fast-forward the ledger, so we release
  //         directly as the depositor (buyer) which is permitted.
  // ---------------------------------------------------------------------------

  it("step 4: organizer (beneficiary) releases the escrow", async () => {
    const result = await organizerClient.escrow.releaseEscrow(escrowId);

    expect(result.successful).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 5: Verify organizer received the funds
  // ---------------------------------------------------------------------------

  it("step 5: organizer balance increased by the ticket price", async () => {
    const finalBalance = await organizerClient.token.balance(organizerKeypair.publicKey());
    expect(finalBalance).toBe(initialOrganizerBalance + TICKET_PRICE);
  });

  // ---------------------------------------------------------------------------
  // Step 6: Verify escrow is settled
  // ---------------------------------------------------------------------------

  it("step 6: escrow isSettled returns true after release", async () => {
    const settled = await buyerClient.escrow.isSettled(escrowId);
    expect(settled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 7: Verify escrow record shows released flag
  // ---------------------------------------------------------------------------

  it("step 7: escrow record shows released flag as true", async () => {
    const record = await buyerClient.escrow.getEscrow(escrowId);
    expect(record).not.toBeNull();
    expect(record!.released).toBe(true);
    expect(record!.refunded).toBe(false);
  });
});
