/// <reference types="node" />
/**
 * @module utils/transaction
 * Low-level helpers for building, simulating, signing, and submitting
 * Soroban `invokeHostFunction` transactions via the Stellar SDK.
 *
 * These are thin wrappers around `@stellar/stellar-sdk` that centralise
 * boilerplate so every module does not have to repeat it.
 */

import {
  Contract,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  Account,
  Keypair,
  xdr,
  BASE_FEE,
} from '@stellar/stellar-sdk';

import type { TransactionResult } from '../types/index';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from './errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A prepared (built, simulated, and assembled) transaction ready to be signed
 * and submitted.
 */
export interface PreparedTransaction {
  /** The assembled `Transaction` object, ready for signing */
  transaction: Transaction;
  /** Fee in stroops as returned by the simulation */
  simulatedFee: string;
}

/** Maximum number of polling attempts before throwing a TIMEOUT error. */
const MAX_POLL_ATTEMPTS = 20;
/** Milliseconds between each polling attempt. */
const POLL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Build  (#78)
// ---------------------------------------------------------------------------

/**
 * Builds an unsigned Soroban `invokeHostFunction` transaction that calls a
 * single contract method.
 *
 * @param server         - An initialised `SorobanRpc.Server` instance.
 * @param sourceAccount  - The `Account` object for the transaction source.
 * @param contractId     - Bech32-encoded Soroban contract ID.
 * @param method         - Name of the contract function to invoke.
 * @param args           - Ordered list of XDR `ScVal` arguments for the call.
 * @param networkPassphrase - Stellar network passphrase for envelope signing.
 * @returns An unsigned `Transaction` ready for simulation.
 */
export async function buildContractCall(
  server: SorobanRpc.Server,
  sourceAccount: Account,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  networkPassphrase: string,
): Promise<Transaction> {
  // server is not used at build time; the account is loaded by the caller
  void server;

  const operation = new Contract(contractId).call(method, ...args);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  return tx as Transaction;
}

// ---------------------------------------------------------------------------
// Simulate  (#79)
// ---------------------------------------------------------------------------

/**
 * Simulates a transaction against the Soroban RPC and returns the assembled
 * (fee-bumped + footprint-populated) version, ready for signing.
 *
 * @param server - An initialised `SorobanRpc.Server` instance.
 * @param tx     - An unsigned transaction built by {@link buildContractCall}.
 * @returns A {@link PreparedTransaction} containing the assembled tx and fee.
 * @throws {VeriTixError} If the simulation returns an error response.
 */
export async function simulateTransaction(
  server: SorobanRpc.Server,
  tx: Transaction,
): Promise<PreparedTransaction> {
  const result = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw parseSorobanError(result.error);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, result).build();

  return {
    transaction: assembled as Transaction,
    simulatedFee: result.minResourceFee,
  };
}

// ---------------------------------------------------------------------------
// Submit  (#80)
// ---------------------------------------------------------------------------

/**
 * Signs a prepared transaction with the given `Keypair`, submits it to the
 * Soroban RPC, and polls until it is included in a ledger.
 *
 * @param server  - An initialised `SorobanRpc.Server` instance.
 * @param tx      - A transaction that has already been through
 *                  {@link simulateTransaction} (assembled & fee-bumped).
 * @param keypair - The `Keypair` used to sign the transaction envelope.
 * @param maxAttempts - Maximum poll attempts before throwing TIMEOUT (default 20).
 * @returns A {@link TransactionResult} with the hash and final ledger.
 * @throws {VeriTixError} If submission or polling returns an error.
 */
export async function submitTransaction(
  server: SorobanRpc.Server,
  tx: Transaction,
  keypair: Keypair,
  maxAttempts: number = MAX_POLL_ATTEMPTS,
): Promise<TransactionResult> {
  // 1. Sign
  tx.sign(keypair);

  // 2. Submit
  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.status === 'ERROR') {
    throw parseSorobanError(
      sendResponse.errorResult?.toXDR('base64') ?? 'Transaction submission failed',
    );
  }

  const hash = sendResponse.hash;

  // 3. Poll until confirmed
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const response = await server.getTransaction(hash);

    if (response.status === 'NOT_FOUND') {
      continue;
    }

    if (response.status === 'FAILED') {
      throw new VeriTixError(
        VeriTixErrorCode.Unknown,
        `Transaction failed on-chain: ${hash}`,
        response.resultXdr?.toXDR('base64'),
      );
    }

    if (response.status === 'SUCCESS') {
      return {
        hash,
        ledger: response.ledger,
        successful: true,
      };
    }
  }

  throw new VeriTixError(
    VeriTixErrorCode.Unknown,
    `Transaction ${hash} not confirmed after ${maxAttempts} polling attempts (TIMEOUT)`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
