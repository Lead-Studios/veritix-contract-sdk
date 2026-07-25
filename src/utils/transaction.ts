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

import type { TransactionResult, FeeEstimate } from '../types/index';
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
// Fee estimation
// ---------------------------------------------------------------------------

/** Number of stroops per XLM. */
const STROOPS_PER_XLM = 10_000_000n;

/**
 * Estimates the transaction fee for a contract call without submitting it.
 *
 * Builds a throwaway transaction, runs it through the Soroban simulation
 * endpoint, and returns the `minResourceFee` as both a raw stroop count and a
 * human-readable XLM string.  No XLM is spent and no keypair is required.
 *
 * @param server            - An initialised `SorobanRpc.Server` instance.
 * @param contractId        - Bech32-encoded Soroban contract ID.
 * @param networkPassphrase - Stellar network passphrase.
 * @param method            - Contract function name to estimate.
 * @param args              - Ordered XDR `ScVal` arguments for the call.
 * @returns A {@link FeeEstimate} with `feeLumens`, `feeXLM`, and `estimatedLedger`.
 * @throws {VeriTixError} If the simulation returns an error response.
 *
 * @example
 * ```ts
 * const estimate = await estimateFee(server, contractId, passphrase, 'transfer', [fromScVal, toScVal, amountScVal]);
 * console.log(`Estimated fee: ${estimate.feeXLM} XLM`);
 * ```
 */
export async function estimateFee(
  server: SorobanRpc.Server,
  contractId: string,
  networkPassphrase: string,
  method: string,
  args: xdr.ScVal[],
): Promise<FeeEstimate> {
  // Use a throwaway source account — simulation does not require a funded account
  const sourceAccount = new Account(
    'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    '0',
  );

  const tx = await buildContractCall(
    server,
    sourceAccount,
    contractId,
    method,
    args,
    networkPassphrase,
  );

  const { simulatedFee } = await simulateTransaction(server, tx);

  const latestLedger = await server.getLatestLedger();

  const feeLumensBI = BigInt(simulatedFee);
  const whole = feeLumensBI / STROOPS_PER_XLM;
  const remainder = feeLumensBI % STROOPS_PER_XLM;
  // Format remainder as 7-digit zero-padded fractional part
  const feeXLM = `${whole}.${remainder.toString().padStart(7, '0')}`;

  return {
    feeLumens: simulatedFee,
    feeXLM,
    estimatedLedger: latestLedger.sequence,
  };
}

// ---------------------------------------------------------------------------
// Submit  (#80)
// ---------------------------------------------------------------------------

/**
 * Options for {@link submitTransaction} retry behaviour.
 */
export interface SubmitTransactionOptions {
  /**
   * Maximum number of times to retry submission on a retriable failure
   * (e.g. `RATE_LIMIT_EXCEEDED`).  Default `3`.
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds between retry attempts.  Each retry applies
   * ±20 % random jitter to spread concurrent submissions.  Default `1000`.
   */
  retryDelayMs?: number;
  /**
   * Maximum number of poll attempts before declaring a TIMEOUT.
   * Default `20`.
   */
  maxPollAttempts?: number;
}

/**
 * Signs a prepared transaction with the given `Keypair`, submits it to the
 * Soroban RPC, and polls until it is included in a ledger.
 *
 * Retries the submission on transient failures (e.g. `RATE_LIMIT_EXCEEDED`)
 * with configurable delay and ±20 % random jitter to avoid thundering-herd
 * collisions when multiple clients retry simultaneously.
 *
 * @param server  - An initialised `SorobanRpc.Server` instance.
 * @param tx      - A transaction that has already been through
 *                  {@link simulateTransaction} (assembled & fee-bumped).
 * @param keypair - The `Keypair` used to sign the transaction envelope.
 * @param options - Optional {@link SubmitTransactionOptions}: `maxRetries`
 *                  (default 3), `retryDelayMs` (default 1000), and
 *                  `maxPollAttempts` (default 20).
 *
 *                  For backwards compatibility a bare `number` is still
 *                  accepted as `maxPollAttempts`.
 * @returns A {@link TransactionResult} with the hash and final ledger.
 * @throws {VeriTixError} If submission or polling returns an error.
 *
 * @example
 * ```ts
 * const result = await submitTransaction(server, tx, keypair, {
 *   maxRetries: 5,
 *   retryDelayMs: 500,
 * });
 * ```
 */
export async function submitTransaction(
  server: SorobanRpc.Server,
  tx: Transaction,
  keypair: Keypair | undefined,
  options: SubmitTransactionOptions | number = {},
): Promise<TransactionResult> {
  if (!keypair) {
    throw new VeriTixError(
      VeriTixErrorCode.ReadOnlyClient,
      'This client is read-only. Provide a Keypair to enable write operations.',
    );
  }

  // Backwards-compat: plain number was the old `maxAttempts` parameter
  const opts: SubmitTransactionOptions =
    typeof options === 'number' ? { maxPollAttempts: options } : options;

  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1_000;
  const maxPollAttempts = opts.maxPollAttempts ?? MAX_POLL_ATTEMPTS;

  // 1. Sign
  tx.sign(keypair);

  // 2. Submit with retry + jitter on RATE_LIMIT_EXCEEDED
  let sendResponse: Awaited<ReturnType<typeof server.sendTransaction>> | undefined;
  let lastSubmitError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      sendResponse = await server.sendTransaction(tx);

      if (sendResponse.status !== 'ERROR') {
        // Submitted successfully (PENDING or duplicate)
        break;
      }

      const errXdr = sendResponse.errorResult?.toXDR('base64') ?? '';
      const isRateLimit =
        errXdr.includes('RATE_LIMIT') ||
        errXdr.toLowerCase().includes('too many requests');

      if (!isRateLimit || attempt === maxRetries) {
        throw parseSorobanError(errXdr || 'Transaction submission failed');
      }
    } catch (err) {
      lastSubmitError = err;
      if (attempt === maxRetries) throw err;
    }

    // Jitter: ±20 % of retryDelayMs
    const jitter = retryDelayMs * 0.2 * (Math.random() * 2 - 1);
    await sleep(retryDelayMs + jitter);
  }

  if (!sendResponse || sendResponse.status === 'ERROR') {
    throw lastSubmitError instanceof VeriTixError
      ? lastSubmitError
      : parseSorobanError('Transaction submission failed');
  }

  const hash = sendResponse.hash;

  // 3. Poll until confirmed
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
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
    `Transaction ${hash} not confirmed after ${maxPollAttempts} polling attempts (TIMEOUT)`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
